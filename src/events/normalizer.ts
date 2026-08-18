import crypto from 'crypto';
import { NormalizedEvent, NormalizedEventSchema, EventType } from './schema.js';

export interface RawEventInput {
  signature: string;
  slot: number;
  timestamp: number;
  leader: string;
  eventType: EventType;
  pool?: string | null;
  position?: string | null;
  tokenX?: string | null;
  tokenY?: string | null;
  lowerBin?: number | null;
  upperBin?: number | null;
  activeBin?: number | null;
  amountX?: string | null;
  amountY?: string | null;
  confidence: number;
  raw?: Record<string, unknown>;
}

/**
 * Creates deterministic event_id from signature, slot, and eventType.
 */
export function generateEventId(signature: string, slot: number, eventType: string): string {
  const hash = crypto
    .createHash('sha256')
    .update(`${signature}:${slot}:${eventType}`)
    .digest('hex');
  return `evt_${hash.substring(0, 16)}`;
}

/**
 * Normalizes and validates raw event data into canonical NormalizedEvent.
 */
export function createNormalizedEvent(input: RawEventInput): NormalizedEvent {
  // Confidence guardrail: If confidence < 0.50, force UNKNOWN
  let finalEventType = input.eventType;
  let finalConfidence = Math.max(0.0, Math.min(1.0, input.confidence));

  if (finalConfidence < 0.50 && finalEventType !== 'UNKNOWN') {
    finalEventType = 'UNKNOWN';
  }

  const eventId = generateEventId(input.signature, input.slot, finalEventType);

  const rawEvent: NormalizedEvent = {
    event_id: eventId,
    signature: input.signature,
    slot: input.slot,
    timestamp: input.timestamp,
    leader: input.leader,
    protocol: 'meteora_dlmm',
    event_type: finalEventType,
    pool: input.pool ?? null,
    position: input.position ?? null,
    token_x: input.tokenX ?? null,
    token_y: input.tokenY ?? null,
    lower_bin: input.lowerBin ?? null,
    upper_bin: input.upperBin ?? null,
    active_bin: input.activeBin ?? null,
    amount_x: input.amountX ?? null,
    amount_y: input.amountY ?? null,
    confidence: Number(finalConfidence.toFixed(4)),
    raw: input.raw ?? {},
  };

  return NormalizedEventSchema.parse(rawEvent);
}
