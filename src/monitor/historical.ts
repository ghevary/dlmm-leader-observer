import { config } from '../config.js';
import { getAllSignatures } from '../solana/signatures.js';
import { getParsedTransaction } from '../solana/transactions.js';
import { transactionParser } from '../parser/transaction-parser.js';
import { eventStore } from '../events/event-store.js';
import { EventType } from '../events/schema.js';

export interface ScanStats {
  TOTAL_TRANSACTIONS: number;
  DLMM_TRANSACTIONS: number;
  OPEN_POSITION: number;
  ADD_LIQUIDITY: number;
  REMOVE_LIQUIDITY: number;
  REBALANCE: number;
  CLOSE_POSITION: number;
  CLAIM_FEES: number;
  SWAP: number;
  UNKNOWN: number;
  ERRORS: number;
  SKIPPED_DUPLICATES: number;
}

export async function runHistoricalScan(scanLimit: number = config.SCAN_LIMIT): Promise<ScanStats> {
  console.log(`\n==================================================`);
  console.log(`🔍 DLMM LEADER OBSERVER — HISTORICAL SCANNER`);
  console.log(`==================================================`);
  console.log(`Leader Wallet : ${config.LEADER_WALLET}`);
  console.log(`RPC Endpoint  : ${config.SOLANA_RPC_URL}`);
  console.log(`Scan Limit    : ${scanLimit} transactions`);
  console.log(`Mode          : READ-ONLY\n`);

  const stats: ScanStats = {
    TOTAL_TRANSACTIONS: 0,
    DLMM_TRANSACTIONS: 0,
    OPEN_POSITION: 0,
    ADD_LIQUIDITY: 0,
    REMOVE_LIQUIDITY: 0,
    REBALANCE: 0,
    CLOSE_POSITION: 0,
    CLAIM_FEES: 0,
    SWAP: 0,
    UNKNOWN: 0,
    ERRORS: 0,
    SKIPPED_DUPLICATES: 0,
  };

  console.log(`⏳ Fetching recent signatures for leader wallet...`);
  const rawSignatures = await getAllSignatures(scanLimit);
  console.log(`✅ Found ${rawSignatures.length} signatures.\n`);

  // Process chronologically (oldest first)
  const signaturesChronological = [...rawSignatures].reverse();

  for (let i = 0; i < signaturesChronological.length; i++) {
    const sigInfo = signaturesChronological[i];
    const sig = sigInfo.signature;
    stats.TOTAL_TRANSACTIONS++;

    // Idempotent duplicate check
    if (eventStore.hasProcessed(sig)) {
      stats.SKIPPED_DUPLICATES++;
      if (config.LOG_LEVEL === 'debug') {
        console.log(`[${i + 1}/${signaturesChronological.length}] SKIP duplicate: ${sig.slice(0, 16)}...`);
      }
      continue;
    }

    try {
      const tx = await getParsedTransaction(sig);
      if (!tx) {
        stats.ERRORS++;
        console.warn(`[${i + 1}/${signaturesChronological.length}] ⚠️ Unable to fetch transaction details: ${sig}`);
        continue;
      }

      const events = transactionParser.parseTransaction(tx, config.LEADER_WALLET);

      let isDlmmTx = false;

      for (const evt of events) {
        if (evt.event_type !== 'UNKNOWN') {
          isDlmmTx = true;
        }

        // Tally statistics
        const type = evt.event_type as EventType;
        stats[type] = (stats[type] || 0) + 1;

        // Persist event
        await eventStore.appendEvent(evt);

        console.log(
          `[${i + 1}/${signaturesChronological.length}] [${evt.event_type}] sig=${evt.signature.slice(0, 12)}... conf=${evt.confidence.toFixed(2)} ${evt.pool ? `pool=${evt.pool.slice(0, 8)}...` : ''} ${evt.position ? `pos=${evt.position.slice(0, 8)}...` : ''}`
        );
      }

      if (isDlmmTx) {
        stats.DLMM_TRANSACTIONS++;
      }
    } catch (err) {
      stats.ERRORS++;
      console.error(`[${i + 1}/${signaturesChronological.length}] ❌ Error processing ${sig}:`, err);
    }
  }

  console.log(`\n==================================================`);
  console.log(`📊 HISTORICAL SCAN SUMMARY`);
  console.log(`==================================================`);
  console.table(stats);
  console.log(`Events stored in: ${config.getEventsFilePath()}`);
  console.log(`Positions stored in: ${config.getPositionsFilePath()}`);
  console.log(`==================================================\n`);

  return stats;
}
