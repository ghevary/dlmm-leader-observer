import { ParsedTransactionWithMeta } from '@solana/web3.js';
import { NormalizedEvent, EventType } from '../events/schema.js';
import { createNormalizedEvent } from '../events/normalizer.js';
import { detectPrograms } from './program-detector.js';
import { parseDlmmTransaction, getProgramIdString, ExtractedDlmmData } from './dlmm-parser.js';
import { positionStateTracker } from './position-state.js';

export interface ParseTransactionOptions {
  leaderWallet?: string;
}

export class TransactionParser {
  /**
   * Parses a Solana transaction and extracts normalized DLMM events.
   */
  public parseTransaction(
    tx: ParsedTransactionWithMeta,
    leaderWallet: string
  ): NormalizedEvent[] {
    if (!tx || !tx.transaction || !tx.transaction.signatures || tx.transaction.signatures.length === 0) {
      return [];
    }

    const signature = tx.transaction.signatures[0];
    const slot = tx.slot;
    const timestamp = tx.blockTime ? tx.blockTime * 1000 : Date.now();

    // Check transaction error status
    if (tx.meta?.err) {
      return [
        createNormalizedEvent({
          signature,
          slot,
          timestamp,
          leader: leaderWallet,
          eventType: 'UNKNOWN',
          confidence: 0.0,
          raw: { error: tx.meta.err, status: 'FAILED_TRANSACTION' },
        }),
      ];
    }

    // Extract all program IDs from top-level and inner instructions
    const programIds: string[] = [];
    const topLevel = tx.transaction.message?.instructions || [];
    topLevel.forEach((ix) => {
      const pid = getProgramIdString(ix.programId);
      if (pid) programIds.push(pid);
    });

    const innerList = tx.meta?.innerInstructions || [];
    innerList.forEach((inner) => {
      inner.instructions.forEach((ix) => {
        const pid = getProgramIdString(ix.programId);
        if (pid) programIds.push(pid);
      });
    });

    const programDetection = detectPrograms(programIds);

    // If transaction does NOT interact with Meteora DLMM program
    if (!programDetection.isMeteoraDlmm) {
      return [
        createNormalizedEvent({
          signature,
          slot,
          timestamp,
          leader: leaderWallet,
          eventType: 'UNKNOWN',
          confidence: 0.0,
          raw: {
            reason: 'NON_DLMM_TRANSACTION',
            programsInvoked: programDetection.programsInvoked,
          },
        }),
      ];
    }

    // Extract and parse DLMM instructions
    const dlmmDataList: ExtractedDlmmData[] = parseDlmmTransaction(tx, leaderWallet);

    if (dlmmDataList.length === 0) {
      return [
        createNormalizedEvent({
          signature,
          slot,
          timestamp,
          leader: leaderWallet,
          eventType: 'UNKNOWN',
          confidence: 0.40,
          raw: {
            reason: 'DLMM_PROGRAM_PRESENT_BUT_NO_KNOWN_INSTRUCTIONS_DECODED',
            programsInvoked: programDetection.programsInvoked,
          },
        }),
      ];
    }

    const events: NormalizedEvent[] = [];

    for (const item of dlmmDataList) {
      let eventType: EventType = item.category;
      let confidence = 0.95;
      const rawPayload: Record<string, unknown> = { ...item.rawDetails };

      switch (item.category) {
        case 'OPEN_POSITION': {
          if (item.position && item.pool) {
            confidence = 0.98;
            // Record new position in state tracker
            positionStateTracker.updatePosition({
              position: item.position,
              pool: item.pool,
              token_x: item.tokenX,
              token_y: item.tokenY,
              lower_bin: item.lowerBin,
              upper_bin: item.upperBin,
              active_bin: item.activeBin,
              last_slot: slot,
              last_signature: signature,
              status: 'OPEN',
              updated_at: timestamp,
            });
          } else if (item.position) {
            confidence = 0.85;
          } else {
            confidence = 0.70;
          }
          break;
        }

        case 'ADD_LIQUIDITY': {
          // Rebalance Evaluation: Check if range differs from previously known state for this position
          if (item.position && item.lowerBin !== null && item.upperBin !== null) {
            const rebal = positionStateTracker.evaluateRebalance(
              item.position,
              item.lowerBin,
              item.upperBin
            );

            if (rebal.isRebalance) {
              eventType = 'REBALANCE';
              confidence = 0.98;
              rawPayload.old_range = rebal.oldRange;
              rawPayload.new_range = rebal.newRange;

              // Update position state with new range
              const existing = positionStateTracker.getPosition(item.position);
              if (existing) {
                positionStateTracker.updatePosition({
                  ...existing,
                  lower_bin: item.lowerBin,
                  upper_bin: item.upperBin,
                  active_bin: item.activeBin ?? existing.active_bin,
                  last_slot: slot,
                  last_signature: signature,
                  updated_at: timestamp,
                });
              }
              break;
            }
          }

          // Standard ADD_LIQUIDITY
          if (item.position && (item.amountX || item.amountY)) {
            confidence = 0.98;
          } else if (item.position) {
            confidence = 0.90;
          } else {
            confidence = 0.70;
          }

          // Update position state if position exists
          if (item.position) {
            const existing = positionStateTracker.getPosition(item.position);
            if (existing) {
              positionStateTracker.updatePosition({
                ...existing,
                lower_bin: item.lowerBin ?? existing.lower_bin,
                upper_bin: item.upperBin ?? existing.upper_bin,
                active_bin: item.activeBin ?? existing.active_bin,
                last_slot: slot,
                last_signature: signature,
                updated_at: timestamp,
              });
            } else if (item.pool) {
              // Create tracking entry
              positionStateTracker.updatePosition({
                position: item.position,
                pool: item.pool,
                token_x: item.tokenX,
                token_y: item.tokenY,
                lower_bin: item.lowerBin,
                upper_bin: item.upperBin,
                active_bin: item.activeBin,
                last_slot: slot,
                last_signature: signature,
                status: 'OPEN',
                updated_at: timestamp,
              });
            }
          }
          break;
        }

        case 'REMOVE_LIQUIDITY': {
          if (item.position) {
            confidence = 0.98;
            const existing = positionStateTracker.getPosition(item.position);
            if (existing) {
              positionStateTracker.updatePosition({
                ...existing,
                last_slot: slot,
                last_signature: signature,
                updated_at: timestamp,
              });
            }
          } else {
            confidence = 0.75;
          }
          break;
        }

        case 'CLOSE_POSITION': {
          if (item.position) {
            confidence = 0.98;
            positionStateTracker.closePosition(item.position, slot, signature);
          } else {
            confidence = 0.75;
          }
          break;
        }

        case 'CLAIM_FEES': {
          confidence = 0.98;
          break;
        }

        case 'SWAP': {
          if (item.pool) {
            confidence = 0.98;
          } else {
            confidence = 0.80;
          }
          break;
        }

        default:
          eventType = 'UNKNOWN';
          confidence = 0.40;
          break;
      }

      const event = createNormalizedEvent({
        signature,
        slot,
        timestamp,
        leader: leaderWallet,
        eventType,
        pool: item.pool,
        position: item.position,
        tokenX: item.tokenX,
        tokenY: item.tokenY,
        lowerBin: item.lowerBin,
        upperBin: item.upperBin,
        activeBin: item.activeBin,
        amountX: item.amountX,
        amountY: item.amountY,
        confidence,
        raw: rawPayload,
      });

      events.push(event);
    }

    return events;
  }
}

export const transactionParser = new TransactionParser();
