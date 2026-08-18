export const KNOWN_PROGRAMS = {
  METEORA_DLMM: 'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo',
  METEORA_DYNAMIC_AMM: 'Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB',
  METEORA_VAULT: '24Uqj9JCLxUeoC3hGfh5W3s9FM9uCHDS2SG3LYwBpyTi',
  SPL_TOKEN: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
  TOKEN_2022: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',
  SYSTEM_PROGRAM: '11111111111111111111111111111111',
  ASSOCIATED_TOKEN_PROGRAM: 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',
  JUPITER_V6: 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',
  ORCA_WHIRLPOOL: 'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc',
  RAYDIUM_CLMM: 'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK',
  RAYDIUM_AMM_V4: '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8',
} as const;

export interface ProgramDetectionResult {
  isMeteoraDlmm: boolean;
  programsInvoked: string[];
  hasJupiter: boolean;
  hasSplToken: boolean;
  hasToken2022: boolean;
}

/**
 * Inspects all program IDs present in transaction account keys and instructions.
 */
export function detectPrograms(programIds: string[]): ProgramDetectionResult {
  const uniquePrograms = Array.from(new Set(programIds));
  const isMeteoraDlmm = uniquePrograms.includes(KNOWN_PROGRAMS.METEORA_DLMM);
  const hasJupiter = uniquePrograms.includes(KNOWN_PROGRAMS.JUPITER_V6);
  const hasSplToken = uniquePrograms.includes(KNOWN_PROGRAMS.SPL_TOKEN);
  const hasToken2022 = uniquePrograms.includes(KNOWN_PROGRAMS.TOKEN_2022);

  return {
    isMeteoraDlmm,
    programsInvoked: uniquePrograms,
    hasJupiter,
    hasSplToken,
    hasToken2022,
  };
}
