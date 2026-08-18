import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import bs58 from 'bs58';

function getAnchorDiscriminator(name: string): Buffer {
  return crypto
    .createHash('sha256')
    .update(`global:${name}`)
    .digest()
    .subarray(0, 8);
}

function encodeInitializePosition(lowerBin: number, width: number): string {
  const disc = getAnchorDiscriminator('initialize_customizable_position');
  const buf = Buffer.alloc(8 + 8);
  disc.copy(buf, 0);
  buf.writeInt32LE(lowerBin, 8);
  buf.writeInt32LE(width, 12);
  return bs58.encode(buf);
}

function encodeAddLiquidityByStrategy(
  amountX: bigint,
  amountY: bigint,
  activeId: number,
  minBin: number,
  maxBin: number
): string {
  const disc = getAnchorDiscriminator('add_liquidity_by_strategy');
  const buf = Buffer.alloc(8 + 8 + 8 + 4 + 4 + 1 + 4 + 4);
  disc.copy(buf, 0);
  buf.writeBigUInt64LE(amountX, 8);
  buf.writeBigUInt64LE(amountY, 16);
  buf.writeInt32LE(activeId, 24);
  buf.writeInt32LE(5, 28); // slippage
  buf.writeUInt8(0, 32); // strat type
  buf.writeInt32LE(minBin, 33);
  buf.writeInt32LE(maxBin, 37);
  return bs58.encode(buf);
}

function encodeRemoveLiquidity(fromBin: number, toBin: number): string {
  const disc = getAnchorDiscriminator('remove_liquidity_by_range');
  const buf = Buffer.alloc(8 + 4 + 4 + 2);
  disc.copy(buf, 0);
  buf.writeInt32LE(fromBin, 8);
  buf.writeInt32LE(toBin, 12);
  buf.writeUInt16LE(10000, 16); // 100% bps
  return bs58.encode(buf);
}

function encodeClosePosition(): string {
  const disc = getAnchorDiscriminator('close_position');
  return bs58.encode(disc);
}

function encodeClaimFee(): string {
  const disc = getAnchorDiscriminator('claim_fee');
  return bs58.encode(disc);
}

function encodeSwap(amountIn: bigint, minAmountOut: bigint): string {
  const disc = getAnchorDiscriminator('swap');
  const buf = Buffer.alloc(8 + 8 + 8);
  disc.copy(buf, 0);
  buf.writeBigUInt64LE(amountIn, 8);
  buf.writeBigUInt64LE(minAmountOut, 16);
  return bs58.encode(buf);
}

const LEADER = '9uNSXiB9wN3uummTzkhoPpQBaMD35nVLeWVW3VDR6SBR';
const DLMM_PROGRAM = 'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo';
const POOL_ADDR = 'ARwi1S4DaiTG5DX7S4M4ZsrXqpMD1MrTmbu9ue2tpmEq';
const POSITION_ADDR = '7NnzWbgvA2wE1h6m8XN7h5aMbmUu5sCdfh93wM1q9XKL';
const TOKEN_X_MINT = 'So11111111111111111111111111111111111111112';
const TOKEN_Y_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

const fixturesDir = path.resolve(process.cwd(), 'tests', 'fixtures');
if (!fs.existsSync(fixturesDir)) {
  fs.mkdirSync(fixturesDir, { recursive: true });
}

// 1. Non-DLMM
const nonDlmmTx = {
  slot: 280000001,
  blockTime: 1718000001,
  transaction: {
    signatures: ['3xY8NonDlmmSig1111111111111111111111111111111111111111111111111111111111111111111111111111111'],
    message: {
      accountKeys: [
        { pubkey: LEADER, signer: true, writable: true },
        { pubkey: '11111111111111111111111111111111', signer: false, writable: false },
      ],
      instructions: [
        {
          programId: '11111111111111111111111111111111',
          accounts: [LEADER, 'RecipientAddress1111111111111111111111111111'],
          data: '3Bxs4123456789',
        },
      ],
    },
  },
  meta: {
    err: null,
    fee: 5000,
    preBalances: [1000000000, 0],
    postBalances: [900000000, 99995000],
    preTokenBalances: [],
    postTokenBalances: [],
  },
};

// 2. Swap
const swapTx = {
  slot: 280000002,
  blockTime: 1718000002,
  transaction: {
    signatures: ['4xY8SwapSig22222222222222222222222222222222222222222222222222222222222222222222222222222222222'],
    message: {
      accountKeys: [
        { pubkey: LEADER, signer: true, writable: true },
        { pubkey: DLMM_PROGRAM, signer: false, writable: false },
      ],
      instructions: [
        {
          programId: DLMM_PROGRAM,
          accounts: [
            POOL_ADDR,
            'BitmapExt1111111111111111111111111111111111',
            'ReserveX11111111111111111111111111111111111',
            'ReserveY11111111111111111111111111111111111',
            'UserTokenIn1111111111111111111111111111111',
            'UserTokenOut111111111111111111111111111111',
            TOKEN_X_MINT,
            TOKEN_Y_MINT,
          ],
          data: encodeSwap(1000000000n, 150000000n),
        },
      ],
    },
  },
  meta: {
    err: null,
    fee: 5000,
    preBalances: [1000000000],
    postBalances: [999995000],
    preTokenBalances: [
      {
        accountIndex: 0,
        mint: TOKEN_X_MINT,
        owner: LEADER,
        uiTokenAmount: { amount: '1000000000', decimals: 9, uiAmount: 1.0, uiAmountString: '1' },
      },
      {
        accountIndex: 1,
        mint: TOKEN_Y_MINT,
        owner: LEADER,
        uiTokenAmount: { amount: '0', decimals: 6, uiAmount: 0, uiAmountString: '0' },
      },
    ],
    postTokenBalances: [
      {
        accountIndex: 0,
        mint: TOKEN_X_MINT,
        owner: LEADER,
        uiTokenAmount: { amount: '0', decimals: 9, uiAmount: 0, uiAmountString: '0' },
      },
      {
        accountIndex: 1,
        mint: TOKEN_Y_MINT,
        owner: LEADER,
        uiTokenAmount: { amount: '150000000', decimals: 6, uiAmount: 150, uiAmountString: '150' },
      },
    ],
  },
};

// 3. Open Position
const openPositionTx = {
  slot: 280000003,
  blockTime: 1718000003,
  transaction: {
    signatures: ['5xY8OpenPositionSig333333333333333333333333333333333333333333333333333333333333333333333333333'],
    message: {
      accountKeys: [
        { pubkey: LEADER, signer: true, writable: true },
        { pubkey: POSITION_ADDR, signer: false, writable: true },
        { pubkey: POOL_ADDR, signer: false, writable: true },
        { pubkey: DLMM_PROGRAM, signer: false, writable: false },
      ],
      instructions: [
        {
          programId: DLMM_PROGRAM,
          accounts: [LEADER, POSITION_ADDR, POOL_ADDR, LEADER],
          data: encodeInitializePosition(120, 30),
        },
      ],
    },
  },
  meta: {
    err: null,
    fee: 5000,
    preBalances: [5000000000],
    postBalances: [4990000000],
    preTokenBalances: [],
    postTokenBalances: [],
  },
};

// 4. Add Liquidity
const addLiquidityTx = {
  slot: 280000004,
  blockTime: 1718000004,
  transaction: {
    signatures: ['6xY8AddLiquiditySig444444444444444444444444444444444444444444444444444444444444444444444444444'],
    message: {
      accountKeys: [
        { pubkey: POSITION_ADDR, signer: false, writable: true },
        { pubkey: POOL_ADDR, signer: false, writable: true },
        { pubkey: DLMM_PROGRAM, signer: false, writable: false },
      ],
      instructions: [
        {
          programId: DLMM_PROGRAM,
          accounts: [
            POSITION_ADDR,
            POOL_ADDR,
            'BitmapExt1111111111111111111111111111111111',
            'UserTokenX1111111111111111111111111111111',
            'UserTokenY1111111111111111111111111111111',
            'ReserveX11111111111111111111111111111111111',
            'ReserveY11111111111111111111111111111111111',
            TOKEN_X_MINT,
            TOKEN_Y_MINT,
          ],
          data: encodeAddLiquidityByStrategy(500000000n, 100000000n, 135, 120, 150),
        },
      ],
    },
  },
  meta: {
    err: null,
    fee: 5000,
    preBalances: [5000000000],
    postBalances: [4999995000],
    preTokenBalances: [
      {
        accountIndex: 0,
        mint: TOKEN_X_MINT,
        owner: LEADER,
        uiTokenAmount: { amount: '1000000000', decimals: 9, uiAmount: 1.0, uiAmountString: '1' },
      },
      {
        accountIndex: 1,
        mint: TOKEN_Y_MINT,
        owner: LEADER,
        uiTokenAmount: { amount: '200000000', decimals: 6, uiAmount: 200, uiAmountString: '200' },
      },
    ],
    postTokenBalances: [
      {
        accountIndex: 0,
        mint: TOKEN_X_MINT,
        owner: LEADER,
        uiTokenAmount: { amount: '500000000', decimals: 9, uiAmount: 0.5, uiAmountString: '0.5' },
      },
      {
        accountIndex: 1,
        mint: TOKEN_Y_MINT,
        owner: LEADER,
        uiTokenAmount: { amount: '100000000', decimals: 6, uiAmount: 100, uiAmountString: '100' },
      },
    ],
  },
};

// 5. Remove Liquidity
const removeLiquidityTx = {
  slot: 280000005,
  blockTime: 1718000005,
  transaction: {
    signatures: ['7xY8RemoveLiquiditySig555555555555555555555555555555555555555555555555555555555555555555555555'],
    message: {
      accountKeys: [
        { pubkey: POSITION_ADDR, signer: false, writable: true },
        { pubkey: POOL_ADDR, signer: false, writable: true },
        { pubkey: DLMM_PROGRAM, signer: false, writable: false },
      ],
      instructions: [
        {
          programId: DLMM_PROGRAM,
          accounts: [
            POSITION_ADDR,
            POOL_ADDR,
            'BitmapExt1111111111111111111111111111111111',
            'UserTokenX1111111111111111111111111111111',
            'UserTokenY1111111111111111111111111111111',
            'ReserveX11111111111111111111111111111111111',
            'ReserveY11111111111111111111111111111111111',
            TOKEN_X_MINT,
            TOKEN_Y_MINT,
          ],
          data: encodeRemoveLiquidity(120, 150),
        },
      ],
    },
  },
  meta: {
    err: null,
    fee: 5000,
    preBalances: [5000000000],
    postBalances: [4999995000],
    preTokenBalances: [
      {
        accountIndex: 0,
        mint: TOKEN_X_MINT,
        owner: LEADER,
        uiTokenAmount: { amount: '500000000', decimals: 9, uiAmount: 0.5, uiAmountString: '0.5' },
      },
      {
        accountIndex: 1,
        mint: TOKEN_Y_MINT,
        owner: LEADER,
        uiTokenAmount: { amount: '100000000', decimals: 6, uiAmount: 100, uiAmountString: '100' },
      },
    ],
    postTokenBalances: [
      {
        accountIndex: 0,
        mint: TOKEN_X_MINT,
        owner: LEADER,
        uiTokenAmount: { amount: '1000000000', decimals: 9, uiAmount: 1.0, uiAmountString: '1' },
      },
      {
        accountIndex: 1,
        mint: TOKEN_Y_MINT,
        owner: LEADER,
        uiTokenAmount: { amount: '200000000', decimals: 6, uiAmount: 200, uiAmountString: '200' },
      },
    ],
  },
};

// 6. Close Position
const closePositionTx = {
  slot: 280000006,
  blockTime: 1718000006,
  transaction: {
    signatures: ['8xY8ClosePositionSig666666666666666666666666666666666666666666666666666666666666666666666666666'],
    message: {
      accountKeys: [
        { pubkey: POSITION_ADDR, signer: false, writable: true },
        { pubkey: POOL_ADDR, signer: false, writable: true },
        { pubkey: DLMM_PROGRAM, signer: false, writable: false },
      ],
      instructions: [
        {
          programId: DLMM_PROGRAM,
          accounts: [POSITION_ADDR, POOL_ADDR, 'BinLower11111111111111111111111111111111111', 'BinUpper11111111111111111111111111111111111', LEADER, LEADER],
          data: encodeClosePosition(),
        },
      ],
    },
  },
  meta: {
    err: null,
    fee: 5000,
    preBalances: [4990000000],
    postBalances: [5000000000],
    preTokenBalances: [],
    postTokenBalances: [],
  },
};

// 7. Rebalance (Add Liquidity with range shift from 120-150 to 130-160)
const rebalanceTx = {
  slot: 280000007,
  blockTime: 1718000007,
  transaction: {
    signatures: ['9xY8RebalanceSig77777777777777777777777777777777777777777777777777777777777777777777777777777'],
    message: {
      accountKeys: [
        { pubkey: POSITION_ADDR, signer: false, writable: true },
        { pubkey: POOL_ADDR, signer: false, writable: true },
        { pubkey: DLMM_PROGRAM, signer: false, writable: false },
      ],
      instructions: [
        {
          programId: DLMM_PROGRAM,
          accounts: [
            POSITION_ADDR,
            POOL_ADDR,
            'BitmapExt1111111111111111111111111111111111',
            'UserTokenX1111111111111111111111111111111',
            'UserTokenY1111111111111111111111111111111',
            'ReserveX11111111111111111111111111111111111',
            'ReserveY11111111111111111111111111111111111',
            TOKEN_X_MINT,
            TOKEN_Y_MINT,
          ],
          data: encodeAddLiquidityByStrategy(600000000n, 120000000n, 145, 130, 160),
        },
      ],
    },
  },
  meta: {
    err: null,
    fee: 5000,
    preBalances: [5000000000],
    postBalances: [4999995000],
    preTokenBalances: [
      {
        accountIndex: 0,
        mint: TOKEN_X_MINT,
        owner: LEADER,
        uiTokenAmount: { amount: '1000000000', decimals: 9, uiAmount: 1.0, uiAmountString: '1' },
      },
      {
        accountIndex: 1,
        mint: TOKEN_Y_MINT,
        owner: LEADER,
        uiTokenAmount: { amount: '200000000', decimals: 6, uiAmount: 200, uiAmountString: '200' },
      },
    ],
    postTokenBalances: [
      {
        accountIndex: 0,
        mint: TOKEN_X_MINT,
        owner: LEADER,
        uiTokenAmount: { amount: '400000000', decimals: 9, uiAmount: 0.4, uiAmountString: '0.4' },
      },
      {
        accountIndex: 1,
        mint: TOKEN_Y_MINT,
        owner: LEADER,
        uiTokenAmount: { amount: '80000000', decimals: 6, uiAmount: 80, uiAmountString: '80' },
      },
    ],
  },
};

// 8. Duplicate (Same signature as Open Position)
const duplicateTx = { ...openPositionTx };

// 9. Malformed (corrupted data)
const malformedTx = {
  slot: 280000009,
  blockTime: 1718000009,
  transaction: {
    signatures: ['MalformedSig999999999999999999999999999999999999999999999999999999999999999999999999999999999'],
    message: {
      accountKeys: [
        { pubkey: LEADER, signer: true, writable: true },
        { pubkey: DLMM_PROGRAM, signer: false, writable: false },
      ],
      instructions: [
        {
          programId: DLMM_PROGRAM,
          accounts: [LEADER],
          data: 'corrupted_short_data',
        },
      ],
    },
  },
  meta: {
    err: null,
    fee: 5000,
    preBalances: [1000000000],
    postBalances: [999995000],
    preTokenBalances: [],
    postTokenBalances: [],
  },
};

// 10. RPC Error Response Mock
const rpcErrorMock = {
  code: -32005,
  message: 'Node is behind, try again later or 429 Too Many Requests',
};

fs.writeFileSync(path.join(fixturesDir, 'non_dlmm.json'), JSON.stringify(nonDlmmTx, null, 2));
fs.writeFileSync(path.join(fixturesDir, 'swap.json'), JSON.stringify(swapTx, null, 2));
fs.writeFileSync(path.join(fixturesDir, 'open_position.json'), JSON.stringify(openPositionTx, null, 2));
fs.writeFileSync(path.join(fixturesDir, 'add_liquidity.json'), JSON.stringify(addLiquidityTx, null, 2));
fs.writeFileSync(path.join(fixturesDir, 'remove_liquidity.json'), JSON.stringify(removeLiquidityTx, null, 2));
fs.writeFileSync(path.join(fixturesDir, 'close_position.json'), JSON.stringify(closePositionTx, null, 2));
fs.writeFileSync(path.join(fixturesDir, 'rebalance.json'), JSON.stringify(rebalanceTx, null, 2));
fs.writeFileSync(path.join(fixturesDir, 'duplicate.json'), JSON.stringify(duplicateTx, null, 2));
fs.writeFileSync(path.join(fixturesDir, 'malformed.json'), JSON.stringify(malformedTx, null, 2));
fs.writeFileSync(path.join(fixturesDir, 'rpc_error.json'), JSON.stringify(rpcErrorMock, null, 2));

console.log('✅ Generated 10 fixtures in tests/fixtures/');
