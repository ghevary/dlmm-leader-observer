import {
  ParsedInstruction,
  PartiallyDecodedInstruction,
  ParsedTransactionWithMeta,
  TokenBalance,
} from '@solana/web3.js';
import {
  METEORA_DLMM_PROGRAM_ID,
  decodeDlmmInstructionData,
  DecodedDlmmInstruction,
  DlmmInstructionType,
} from './dlmm-idl.js';

export interface ExtractedDlmmData {
  category: DlmmInstructionType;
  instructionName: string;
  pool: string | null;
  position: string | null;
  tokenX: string | null;
  tokenY: string | null;
  lowerBin: number | null;
  upperBin: number | null;
  activeBin: number | null;
  amountX: string | null;
  amountY: string | null;
  rawDetails: Record<string, unknown>;
}

export function getProgramIdString(programId: unknown): string {
  if (!programId) return '';
  if (typeof programId === 'string') return programId;
  if (typeof (programId as { toBase58?: () => string }).toBase58 === 'function') {
    return (programId as { toBase58: () => string }).toBase58();
  }
  return String(programId);
}

/**
 * Extracts all instructions matching Meteora DLMM program ID from a transaction.
 */
export function extractDlmmInstructions(tx: ParsedTransactionWithMeta): Array<{
  instruction: PartiallyDecodedInstruction | ParsedInstruction;
  isInner: boolean;
  parentIndex?: number;
}> {
  const dlmmInstructions: Array<{
    instruction: PartiallyDecodedInstruction | ParsedInstruction;
    isInner: boolean;
    parentIndex?: number;
  }> = [];

  const topLevel = tx.transaction?.message?.instructions || [];
  topLevel.forEach((ix) => {
    if (getProgramIdString(ix.programId) === METEORA_DLMM_PROGRAM_ID) {
      dlmmInstructions.push({ instruction: ix, isInner: false });
    }
  });

  const innerIxs = tx.meta?.innerInstructions || [];
  innerIxs.forEach((innerGroup) => {
    innerGroup.instructions.forEach((ix) => {
      if (getProgramIdString(ix.programId) === METEORA_DLMM_PROGRAM_ID) {
        dlmmInstructions.push({
          instruction: ix,
          isInner: true,
          parentIndex: innerGroup.index,
        });
      }
    });
  });

  return dlmmInstructions;
}

/**
 * Analyzes token balance changes for leader wallet from preTokenBalances and postTokenBalances.
 */
export function calculateTokenBalanceDeltas(
  tx: ParsedTransactionWithMeta,
  leaderWallet: string
): Array<{
  mint: string;
  preAmount: string;
  postAmount: string;
  delta: bigint;
  decimals: number;
}> {
  const preBalances: TokenBalance[] = tx.meta?.preTokenBalances || [];
  const postBalances: TokenBalance[] = tx.meta?.postTokenBalances || [];

  const leaderPre = preBalances.filter((b) => b.owner === leaderWallet);
  const leaderPost = postBalances.filter((b) => b.owner === leaderWallet);

  const mints = new Set<string>();
  leaderPre.forEach((b) => mints.add(b.mint));
  leaderPost.forEach((b) => mints.add(b.mint));

  const deltas: Array<{
    mint: string;
    preAmount: string;
    postAmount: string;
    delta: bigint;
    decimals: number;
  }> = [];

  mints.forEach((mint) => {
    const pre = leaderPre.find((b) => b.mint === mint);
    const post = leaderPost.find((b) => b.mint === mint);

    const preRaw = pre?.uiTokenAmount.amount ?? '0';
    const postRaw = post?.uiTokenAmount.amount ?? '0';
    const decimals = post?.uiTokenAmount.decimals ?? pre?.uiTokenAmount.decimals ?? 0;

    const delta = BigInt(postRaw) - BigInt(preRaw);

    deltas.push({
      mint,
      preAmount: preRaw,
      postAmount: postRaw,
      delta,
      decimals,
    });
  });

  return deltas;
}

/**
 * Parses DLMM accounts from instruction accounts array based on instruction category.
 */
function parseAccountsForInstruction(
  instructionName: string,
  accounts: string[]
): {
  pool: string | null;
  position: string | null;
  tokenX: string | null;
  tokenY: string | null;
} {
  let pool: string | null = null;
  let position: string | null = null;
  let tokenX: string | null = null;
  let tokenY: string | null = null;

  if (accounts.length === 0) {
    return { pool, position, tokenX, tokenY };
  }

  switch (instructionName) {
    case 'initialize_position':
    case 'initialize_position_by_operator':
    case 'initialize_customizable_position': {
      // accounts: [payer, position, lbPair, owner, ...]
      if (accounts.length >= 3) {
        position = accounts[1];
        pool = accounts[2];
      }
      break;
    }

    case 'add_liquidity':
    case 'add_liquidity_by_weight':
    case 'add_liquidity_by_strategy':
    case 'add_liquidity_by_strategy_one_side':
    case 'add_liquidity_one_side':
    case 'add_liquidity_precise': {
      // accounts: [position, lbPair, (binArrayBitmapExtension), userTokenX, userTokenY, reserveX, reserveY, tokenXMint, tokenYMint, ...]
      if (accounts.length >= 2) {
        position = accounts[0];
        pool = accounts[1];
      }
      if (accounts.length >= 9) {
        tokenX = accounts[7];
        tokenY = accounts[8];
      }
      break;
    }

    case 'remove_liquidity':
    case 'remove_liquidity_by_range':
    case 'remove_all_liquidity': {
      // accounts: [position, lbPair, (binArrayBitmapExtension), userTokenX, userTokenY, reserveX, reserveY, tokenXMint, tokenYMint, ...]
      if (accounts.length >= 2) {
        position = accounts[0];
        pool = accounts[1];
      }
      if (accounts.length >= 9) {
        tokenX = accounts[7];
        tokenY = accounts[8];
      }
      break;
    }

    case 'close_position':
    case 'close_position_by_operator': {
      // accounts: [position, lbPair, binArrayLower, binArrayUpper, sender, rentReceiver, ...]
      if (accounts.length >= 2) {
        position = accounts[0];
        pool = accounts[1];
      }
      break;
    }

    case 'claim_fee':
    case 'claim_reward': {
      // accounts: [lbPair, position, ...]
      if (accounts.length >= 2) {
        pool = accounts[0];
        position = accounts[1];
      }
      break;
    }

    case 'swap':
    case 'swap_exact_out':
    case 'swap_with_price_impact': {
      // accounts: [lbPair, binArrayBitmapExtension, reserveX, reserveY, userTokenIn, userTokenOut, tokenXMint, tokenYMint, ...]
      if (accounts.length >= 1) {
        pool = accounts[0];
      }
      if (accounts.length >= 8) {
        tokenX = accounts[6];
        tokenY = accounts[7];
      }
      break;
    }

    default:
      if (accounts.length >= 2) {
        pool = accounts[0];
      }
      break;
  }

  return { pool, position, tokenX, tokenY };
}

/**
 * Parses DLMM instructions within a transaction and extracts relevant metadata.
 */
export function parseDlmmTransaction(
  tx: ParsedTransactionWithMeta,
  leaderWallet: string
): ExtractedDlmmData[] {
  const dlmmIxs = extractDlmmInstructions(tx);
  const tokenDeltas = calculateTokenBalanceDeltas(tx, leaderWallet);

  const results: ExtractedDlmmData[] = [];

  for (const item of dlmmIxs) {
    const ix = item.instruction;
    let decoded: DecodedDlmmInstruction | null = null;
    let accountKeys: string[] = [];

    if ('data' in ix && typeof ix.data === 'string') {
      decoded = decodeDlmmInstructionData(ix.data);
      if (Array.isArray(ix.accounts)) {
        accountKeys = ix.accounts.map((a: unknown) => {
          if (typeof a === 'string') return a;
          if (typeof (a as { toBase58?: () => string })?.toBase58 === 'function') {
            return (a as { toBase58: () => string }).toBase58();
          }
          return String(a);
        });
      }
    }

    if (!decoded) {
      continue;
    }

    const { pool, position, tokenX, tokenY } = parseAccountsForInstruction(
      decoded.instructionName,
      accountKeys
    );

    // Correlate token amounts from balance deltas or decoded args
    let amountX: string | null = decoded.amountX ?? null;
    let amountY: string | null = decoded.amountY ?? null;

    if ((!amountX || !amountY) && tokenDeltas.length >= 1) {
      if (tokenDeltas.length === 1) {
        const d = tokenDeltas[0];
        const absDelta = d.delta < 0n ? (-d.delta).toString() : d.delta.toString();
        amountX = absDelta;
      } else if (tokenDeltas.length >= 2) {
        amountX = (tokenDeltas[0].delta < 0n ? -tokenDeltas[0].delta : tokenDeltas[0].delta).toString();
        amountY = (tokenDeltas[1].delta < 0n ? -tokenDeltas[1].delta : tokenDeltas[1].delta).toString();
      }
    }

    // Correlate token mints if not directly in accounts
    let finalTokenX = tokenX;
    let finalTokenY = tokenY;
    if ((!finalTokenX || !finalTokenY) && tokenDeltas.length >= 2) {
      finalTokenX = tokenDeltas[0].mint;
      finalTokenY = tokenDeltas[1].mint;
    } else if (!finalTokenX && tokenDeltas.length === 1) {
      finalTokenX = tokenDeltas[0].mint;
    }

    results.push({
      category: decoded.category,
      instructionName: decoded.instructionName,
      pool,
      position,
      tokenX: finalTokenX,
      tokenY: finalTokenY,
      lowerBin: decoded.lowerBin ?? null,
      upperBin: decoded.upperBin ?? null,
      activeBin: decoded.activeBin ?? null,
      amountX,
      amountY,
      rawDetails: {
        isInner: item.isInner,
        instructionName: decoded.instructionName,
        args: decoded.rawArgs,
        accounts: accountKeys,
      },
    });
  }

  return results;
}
