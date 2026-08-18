import fs from 'fs';
import path from 'path';
import { NormalizedEvent, NormalizedEventSchema } from './schema.js';
import { config } from '../config.js';

export interface EventStoreOptions {
  eventsFilePath?: string;
  hermesWebhookUrl?: string;
}

export class EventStore {
  private eventsFilePath: string;
  private hermesWebhookUrl?: string;
  private processedSignatures: Set<string> = new Set();

  constructor(options: EventStoreOptions = {}) {
    this.eventsFilePath = options.eventsFilePath ?? config.getEventsFilePath();
    this.hermesWebhookUrl = options.hermesWebhookUrl ?? config.HERMES_WEBHOOK_URL;
    this.init();
  }

  /**
   * Initializes store, creating data directory and loading existing signatures for idempotency.
   */
  private init(): void {
    try {
      const dir = path.dirname(this.eventsFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      if (fs.existsSync(this.eventsFilePath)) {
        const content = fs.readFileSync(this.eventsFilePath, 'utf-8');
        const lines = content.split('\n').filter((line) => line.trim().length > 0);
        for (const line of lines) {
          try {
            const parsed = JSON.parse(line);
            if (parsed.signature) {
              this.processedSignatures.add(parsed.signature);
            }
          } catch {
            // Ignore malformed individual lines during startup
          }
        }
      }
    } catch (err) {
      console.error(`[EventStore] Failed to initialize event store:`, err);
    }
  }

  /**
   * Check if a transaction signature was already processed.
   */
  public hasProcessed(signature: string): boolean {
    return this.processedSignatures.has(signature);
  }

  /**
   * Appends a normalized event to data/events.jsonl and optionally dispatches to Hermes.
   */
  public async appendEvent(event: NormalizedEvent): Promise<{ saved: boolean; dispatched: boolean }> {
    // Validate schema
    const validated = NormalizedEventSchema.parse(event);

    // Append to JSONL
    const jsonLine = JSON.stringify(validated) + '\n';
    fs.appendFileSync(this.eventsFilePath, jsonLine, 'utf-8');
    this.processedSignatures.add(validated.signature);

    let dispatched = false;
    if (this.hermesWebhookUrl) {
      dispatched = await this.dispatchToHermes(validated);
    }

    return { saved: true, dispatched };
  }

  /**
   * Dispatches normalized event to Hermes via HTTP POST.
   */
  private async dispatchToHermes(event: NormalizedEvent): Promise<boolean> {
    try {
      if (!this.hermesWebhookUrl) return false;

      const response = await fetch(this.hermesWebhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'dlmm-leader-observer/1.0',
        },
        body: JSON.stringify(event),
      });

      if (!response.ok) {
        console.warn(
          `[Hermes Dispatch] Received HTTP ${response.status} from ${this.hermesWebhookUrl}`
        );
        return false;
      }
      return true;
    } catch (err) {
      if (config.LOG_LEVEL === 'debug') {
        console.warn(`[Hermes Dispatch] Failed to send event ${event.event_id}:`, err);
      }
      return false;
    }
  }

  /**
   * Reads all events from events.jsonl.
   */
  public getAllEvents(): NormalizedEvent[] {
    if (!fs.existsSync(this.eventsFilePath)) {
      return [];
    }

    const content = fs.readFileSync(this.eventsFilePath, 'utf-8');
    const lines = content.split('\n').filter((line) => line.trim().length > 0);
    const events: NormalizedEvent[] = [];

    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        events.push(NormalizedEventSchema.parse(parsed));
      } catch (err) {
        console.error(`[EventStore] Invalid event record in ${this.eventsFilePath}:`, err);
      }
    }

    return events;
  }

  /**
   * Clears in-memory processed signatures cache (for testing).
   */
  public clear(): void {
    this.processedSignatures.clear();
  }
}

export const eventStore = new EventStore();
