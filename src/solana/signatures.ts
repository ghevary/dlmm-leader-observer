import { PublicKey, ConfirmedSignatureInfo } from '@solana/web3.js';
import { rpcClient } from './rpc.js';
import { config } from '../config.js';

export interface FetchSignaturesOptions {
  limit?: number;
  before?: string;
  until?: string;
}

/**
 * Fetches recent transaction signatures for the leader wallet.
 */
export async function getLeaderSignatures(
  options: FetchSignaturesOptions = {}
): Promise<ConfirmedSignatureInfo[]> {
  const leaderPubkey = new PublicKey(config.LEADER_WALLET);
  const limit = options.limit ?? config.SCAN_LIMIT;

  return await rpcClient.getSignaturesForAddress(leaderPubkey, {
    limit,
    before: options.before,
    until: options.until,
  });
}

/**
 * Paginate all signatures between until and before or up to totalMax limit.
 */
export async function getAllSignatures(
  totalMax: number = 100,
  until?: string
): Promise<ConfirmedSignatureInfo[]> {
  const allSignatures: ConfirmedSignatureInfo[] = [];
  let before: string | undefined = undefined;

  while (allSignatures.length < totalMax) {
    const fetchLimit = Math.min(50, totalMax - allSignatures.length);
    const signatures = await getLeaderSignatures({
      limit: fetchLimit,
      before,
      until,
    });

    if (signatures.length === 0) {
      break;
    }

    allSignatures.push(...signatures);
    before = signatures[signatures.length - 1].signature;

    if (signatures.length < fetchLimit) {
      break;
    }
  }

  return allSignatures;
}
