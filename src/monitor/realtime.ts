import { config } from '../config.js';
import { getLeaderSignatures } from '../solana/signatures.js';
import { getParsedTransaction } from '../solana/transactions.js';
import { transactionParser } from '../parser/transaction-parser.js';
import { eventStore } from '../events/event-store.js';

export async function startRealtimeMonitor(): Promise<void> {
  console.log(`\n==================================================`);
  console.log(`📡 DLMM LEADER OBSERVER — REALTIME MONITOR`);
  console.log(`==================================================`);
  console.log(`Leader Wallet : ${config.LEADER_WALLET}`);
  console.log(`RPC Endpoint  : ${config.SOLANA_RPC_URL}`);
  console.log(`Poll Interval : ${config.POLL_INTERVAL_MS} ms`);
  if (config.HERMES_WEBHOOK_URL) {
    console.log(`Hermes Webhook: ${config.HERMES_WEBHOOK_URL}`);
  }
  console.log(`Mode          : READ-ONLY`);
  console.log(`Press Ctrl+C to stop.\n`);

  let isRunning = true;
  let lastProcessedSignature: string | undefined = undefined;

  // Initial lookup for the latest known signature
  try {
    const initialSignatures = await getLeaderSignatures({ limit: 1 });
    if (initialSignatures.length > 0) {
      lastProcessedSignature = initialSignatures[0].signature;
      console.log(`📌 Starting cursor set to latest signature: ${lastProcessedSignature.slice(0, 16)}...`);
    }
  } catch (err) {
    console.warn(`⚠️ Could not fetch initial cursor, will start fresh:`, err);
  }

  const stop = () => {
    console.log(`\n🛑 Stopping Realtime Monitor gracefully...`);
    isRunning = false;
  };

  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);

  let errorConsecutiveCount = 0;

  while (isRunning) {
    try {
      if (config.LOG_LEVEL === 'debug') {
        console.log(`[Realtime] Polling for new signatures (until: ${lastProcessedSignature ? lastProcessedSignature.slice(0, 12) + '...' : 'none'})...`);
      }

      const newSignatures = await getLeaderSignatures({
        limit: 20,
        until: lastProcessedSignature,
      });

      errorConsecutiveCount = 0; // Reset error counter on successful RPC query

      if (newSignatures.length > 0) {
        console.log(`⚡ Detected ${newSignatures.length} new transaction(s) for leader.`);

        // Update latest cursor to the newest signature (first in Solana's list)
        const newestSig = newSignatures[0].signature;

        // Process in chronological order (oldest first)
        const chronological = [...newSignatures].reverse();

        for (const sigInfo of chronological) {
          const sig = sigInfo.signature;

          if (eventStore.hasProcessed(sig)) {
            continue;
          }

          const tx = await getParsedTransaction(sig);
          if (!tx) {
            console.warn(`⚠️ Could not fetch details for transaction: ${sig}`);
            continue;
          }

          const events = transactionParser.parseTransaction(tx, config.LEADER_WALLET);

          for (const evt of events) {
            const { saved, dispatched } = await eventStore.appendEvent(evt);
            console.log(
              `🔔 [EVENT] ${evt.event_type} | Conf: ${(evt.confidence * 100).toFixed(0)}% | Slot: ${evt.slot} | Sig: ${evt.signature.slice(0, 16)}... ${dispatched ? '(Dispatched to Hermes)' : ''}`
            );
            if (evt.event_type === 'REBALANCE') {
              console.log(`🔄 [REBALANCE DETECTED] Position: ${evt.position} | Details:`, JSON.stringify(evt.raw));
            }
          }
        }

        lastProcessedSignature = newestSig;
      }
    } catch (err) {
      errorConsecutiveCount++;
      const backoffMs = Math.min(config.POLL_INTERVAL_MS * Math.pow(1.5, errorConsecutiveCount), 60000);
      console.error(
        `❌ [Realtime Error] Poll cycle failed (count: ${errorConsecutiveCount}): ${err instanceof Error ? err.message : String(err)}. Retrying in ${Math.round(backoffMs / 1000)}s...`
      );
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
      continue;
    }

    // Wait configured poll interval before next cycle
    await new Promise((resolve) => setTimeout(resolve, config.POLL_INTERVAL_MS));
  }
}
