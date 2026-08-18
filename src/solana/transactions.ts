import { ParsedTransactionWithMeta } from '@solana/web3.js';
import { rpcClient } from './rpc.js';
import { config } from '../config.js';

/**
 * Fetch parsed transaction for a given signature.
 */
export async function getParsedTransaction(
  signature: string
): Promise<ParsedTransactionWithMeta | null> {
  try {
    return await rpcClient.getParsedTransaction(signature);
  } catch (error) {
    if (config.LOG_LEVEL === 'debug') {
      console.error(`Failed to fetch parsed transaction for signature ${signature}:`, error);
    }
    return null;
  }
}

/**
 * Fetch multiple parsed transactions with concurrency control.
 */
export async function getParsedTransactionsBatch(
  signatures: string[],
  concurrency: number = 5
): Promise<Map<string, ParsedTransactionWithMeta | null>> {
  const results = new Map<string, ParsedTransactionWithMeta | null>();

  for (let i = 0; i < signatures.length; i += concurrency) {
    const batch = signatures.slice(i, i + concurrency);
    const promises = batch.map(async (sig) => {
      const tx = await getParsedTransaction(sig);
      return { sig, tx };
    });

    const settled = await Promise.allSettled(promises);
    for (const res of settled) {
      if (res.status === 'fulfilled') {
        results.set(res.value.sig, res.value.tx);
      }
    }
  }

  return results;
}
