import fs from 'fs';
import path from 'path';
import { PositionState, PositionStateSchema } from '../events/schema.js';
import { config } from '../config.js';

export interface RebalanceEvaluation {
  isRebalance: boolean;
  oldRange?: { lower_bin: number; upper_bin: number };
  newRange?: { lower_bin: number; upper_bin: number };
}

export class PositionStateTracker {
  private positions: Map<string, PositionState> = new Map();
  private filePath: string;

  constructor(filePath: string = config.getPositionsFilePath()) {
    this.filePath = filePath;
    this.load();
  }

  /**
   * Loads persisted position states from data/positions.json.
   */
  public load(): void {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        if (raw.trim()) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            for (const item of parsed) {
              const res = PositionStateSchema.safeParse(item);
              if (res.success) {
                this.positions.set(res.data.position, res.data);
              }
            }
          }
        }
      }
    } catch (err) {
      if (config.LOG_LEVEL === 'debug') {
        console.warn(`[PositionStateTracker] Failed to load positions from ${this.filePath}:`, err);
      }
    }
  }

  /**
   * Persists position states to data/positions.json.
   */
  public save(): void {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const data = Array.from(this.positions.values());
      fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      console.error(`[PositionStateTracker] Failed to save positions to ${this.filePath}:`, err);
    }
  }

  /**
   * Get a position state by position address.
   */
  public getPosition(positionAddress: string): PositionState | undefined {
    return this.positions.get(positionAddress);
  }

  /**
   * Get all tracked positions.
   */
  public getAllPositions(): PositionState[] {
    return Array.from(this.positions.values());
  }

  /**
   * Check if a proposed range update constitutes a REBALANCE.
   */
  public evaluateRebalance(
    positionAddress: string,
    newLowerBin: number | null,
    newUpperBin: number | null
  ): RebalanceEvaluation {
    const existing = this.positions.get(positionAddress);
    if (!existing || existing.status === 'CLOSED') {
      return { isRebalance: false };
    }

    if (
      existing.lower_bin !== null &&
      existing.upper_bin !== null &&
      newLowerBin !== null &&
      newUpperBin !== null
    ) {
      const isDifferent =
        existing.lower_bin !== newLowerBin || existing.upper_bin !== newUpperBin;

      if (isDifferent) {
        return {
          isRebalance: true,
          oldRange: { lower_bin: existing.lower_bin, upper_bin: existing.upper_bin },
          newRange: { lower_bin: newLowerBin, upper_bin: newUpperBin },
        };
      }
    }

    return { isRebalance: false };
  }

  /**
   * Upsert a position state and persist changes.
   */
  public updatePosition(state: PositionState): void {
    const validated = PositionStateSchema.parse(state);
    this.positions.set(validated.position, validated);
    this.save();
  }

  /**
   * Marks a position as CLOSED.
   */
  public closePosition(positionAddress: string, slot: number, signature: string): void {
    const existing = this.positions.get(positionAddress);
    if (existing) {
      existing.status = 'CLOSED';
      existing.last_slot = slot;
      existing.last_signature = signature;
      existing.updated_at = Date.now();
      this.positions.set(positionAddress, existing);
      this.save();
    }
  }

  /**
   * Clears state in memory (for testing).
   */
  public clear(): void {
    this.positions.clear();
  }
}

export const positionStateTracker = new PositionStateTracker();
