import crypto from 'crypto';
import bs58 from 'bs58';

export const METEORA_DLMM_PROGRAM_ID = 'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo';

/**
 * Calculates 8-byte Anchor discriminator for an instruction name (global:<name>).
 */
export function getAnchorInstructionDiscriminator(name: string): Buffer {
  return crypto
    .createHash('sha256')
    .update(`global:${name}`)
    .digest()
    .subarray(0, 8);
}

// Precalculated instruction discriminators
export const DLMM_INSTRUCTIONS = {
  INITIALIZE_POSITION: 'initialize_position',
  INITIALIZE_POSITION_BY_OPERATOR: 'initialize_position_by_operator',
  INITIALIZE_CUSTOMIZABLE_POSITION: 'initialize_customizable_position',
  ADD_LIQUIDITY: 'add_liquidity',
  ADD_LIQUIDITY_BY_WEIGHT: 'add_liquidity_by_weight',
  ADD_LIQUIDITY_BY_STRATEGY: 'add_liquidity_by_strategy',
  ADD_LIQUIDITY_BY_STRATEGY_ONE_SIDE: 'add_liquidity_by_strategy_one_side',
  ADD_LIQUIDITY_ONE_SIDE: 'add_liquidity_one_side',
  ADD_LIQUIDITY_PRECISE: 'add_liquidity_precise',
  REMOVE_LIQUIDITY: 'remove_liquidity',
  REMOVE_LIQUIDITY_BY_RANGE: 'remove_liquidity_by_range',
  REMOVE_ALL_LIQUIDITY: 'remove_all_liquidity',
  CLOSE_POSITION: 'close_position',
  CLOSE_POSITION_BY_OPERATOR: 'close_position_by_operator',
  CLAIM_FEE: 'claim_fee',
  CLAIM_REWARD: 'claim_reward',
  SWAP: 'swap',
  SWAP_EXACT_OUT: 'swap_exact_out',
  SWAP_WITH_PRICE_IMPACT: 'swap_with_price_impact',
} as const;

export type DlmmInstructionType =
  | 'OPEN_POSITION'
  | 'ADD_LIQUIDITY'
  | 'REMOVE_LIQUIDITY'
  | 'CLOSE_POSITION'
  | 'CLAIM_FEES'
  | 'SWAP'
  | 'UNKNOWN';

export interface DecodedDlmmInstruction {
  instructionName: string;
  category: DlmmInstructionType;
  lowerBin?: number;
  upperBin?: number;
  activeBin?: number;
  amountX?: string;
  amountY?: string;
  rawArgs?: Record<string, unknown>;
}

// Discriminator hex mapping to instruction metadata
const DISCRIMINATOR_MAP = new Map<string, { name: string; category: DlmmInstructionType }>();

function registerInstruction(name: string, category: DlmmInstructionType) {
  const disc = getAnchorInstructionDiscriminator(name).toString('hex');
  DISCRIMINATOR_MAP.set(disc, { name, category });
}

// Register all DLMM instructions
registerInstruction('initialize_position', 'OPEN_POSITION');
registerInstruction('initialize_position_by_operator', 'OPEN_POSITION');
registerInstruction('initialize_customizable_position', 'OPEN_POSITION');

registerInstruction('add_liquidity', 'ADD_LIQUIDITY');
registerInstruction('add_liquidity_by_weight', 'ADD_LIQUIDITY');
registerInstruction('add_liquidity_by_strategy', 'ADD_LIQUIDITY');
registerInstruction('add_liquidity_by_strategy_one_side', 'ADD_LIQUIDITY');
registerInstruction('add_liquidity_one_side', 'ADD_LIQUIDITY');
registerInstruction('add_liquidity_precise', 'ADD_LIQUIDITY');

registerInstruction('remove_liquidity', 'REMOVE_LIQUIDITY');
registerInstruction('remove_liquidity_by_range', 'REMOVE_LIQUIDITY');
registerInstruction('remove_all_liquidity', 'REMOVE_LIQUIDITY');

registerInstruction('close_position', 'CLOSE_POSITION');
registerInstruction('close_position_by_operator', 'CLOSE_POSITION');

registerInstruction('claim_fee', 'CLAIM_FEES');
registerInstruction('claim_reward', 'CLAIM_FEES');

registerInstruction('swap', 'SWAP');
registerInstruction('swap_exact_out', 'SWAP');
registerInstruction('swap_with_price_impact', 'SWAP');

/**
 * Decode DLMM instruction from raw base58 or Buffer data.
 */
export function decodeDlmmInstructionData(data: Buffer | string): DecodedDlmmInstruction | null {
  let buffer: Buffer;
  try {
    buffer = typeof data === 'string' ? Buffer.from(bs58.decode(data)) : data;
  } catch {
    return null;
  }

  if (!buffer || buffer.length < 8) {
    return null;
  }

  const discriminatorHex = buffer.subarray(0, 8).toString('hex');
  const matched = DISCRIMINATOR_MAP.get(discriminatorHex);

  if (!matched) {
    return null;
  }

  const result: DecodedDlmmInstruction = {
    instructionName: matched.name,
    category: matched.category,
    rawArgs: {},
  };

  const payload = buffer.subarray(8);

  try {
    switch (matched.name) {
      case 'initialize_position':
      case 'initialize_position_by_operator':
      case 'initialize_customizable_position': {
        if (payload.length >= 8) {
          const lowerBinId = payload.readInt32LE(0);
          const width = payload.readInt32LE(4);
          result.lowerBin = lowerBinId;
          result.upperBin = lowerBinId + width;
          result.rawArgs = { lowerBinId, width };
        }
        break;
      }

      case 'add_liquidity_by_strategy':
      case 'add_liquidity_by_strategy_one_side': {
        // Strategy param layouts often start with liquidity distribution params or amount_x (u64), amount_y (u64), active_id (i32), max_active_bin_slippage (i32)
        if (payload.length >= 24) {
          const amountX = payload.readBigUInt64LE(0).toString();
          const amountY = payload.readBigUInt64LE(8).toString();
          const activeId = payload.readInt32LE(16);
          const maxActiveBinSlippage = payload.readInt32LE(20);
          result.amountX = amountX;
          result.amountY = amountY;
          result.activeBin = activeId;
          result.rawArgs = { amountX, amountY, activeId, maxActiveBinSlippage };

          // Strategy parameters follow: strategy_type (u8), min_bin_id (i32), max_bin_id (i32)
          if (payload.length >= 33) {
            const strategyType = payload.readUInt8(24);
            const minBinId = payload.readInt32LE(25);
            const maxBinId = payload.readInt32LE(29);
            result.lowerBin = minBinId;
            result.upperBin = maxBinId;
            result.rawArgs = { ...result.rawArgs, strategyType, minBinId, maxBinId };
          }
        }
        break;
      }

      case 'add_liquidity':
      case 'add_liquidity_by_weight':
      case 'add_liquidity_one_side':
      case 'add_liquidity_precise': {
        if (payload.length >= 16) {
          const amountX = payload.readBigUInt64LE(0).toString();
          const amountY = payload.readBigUInt64LE(8).toString();
          result.amountX = amountX;
          result.amountY = amountY;
          result.rawArgs = { amountX, amountY };

          if (payload.length >= 20) {
            const activeId = payload.readInt32LE(16);
            result.activeBin = activeId;
            result.rawArgs.activeId = activeId;
          }
        }
        break;
      }

      case 'remove_liquidity_by_range': {
        if (payload.length >= 8) {
          const fromBinId = payload.readInt32LE(0);
          const toBinId = payload.readInt32LE(4);
          result.lowerBin = fromBinId;
          result.upperBin = toBinId;
          result.rawArgs = { fromBinId, toBinId };
          if (payload.length >= 10) {
            const bps = payload.readUInt16LE(8);
            result.rawArgs.bpsToRemove = bps;
          }
        }
        break;
      }

      case 'remove_liquidity':
      case 'remove_all_liquidity': {
        if (payload.length >= 8) {
          // Sometimes contains amount or bps
          const val = payload.readBigUInt64LE(0).toString();
          result.rawArgs = { amountOrBps: val };
        }
        break;
      }

      case 'swap':
      case 'swap_exact_out':
      case 'swap_with_price_impact': {
        if (payload.length >= 16) {
          const amountIn = payload.readBigUInt64LE(0).toString();
          const minAmountOut = payload.readBigUInt64LE(8).toString();
          result.rawArgs = { amountIn, minAmountOut };
        }
        break;
      }

      default:
        break;
    }
  } catch (err) {
    // If decoding args fails due to dynamic array length, return basic instruction match
    result.rawArgs = { decodeError: (err as Error).message };
  }

  return result;
}
