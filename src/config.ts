import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

// Load .env if present
dotenv.config();

const EnvSchema = z.object({
  LEADER_WALLET: z
    .string()
    .min(32, 'Invalid Solana wallet address')
    .default('9uNSXiB9wN3uummTzkhoPpQBaMD35nVLeWVW3VDR6SBR'),
  SOLANA_RPC_URL: z
    .string()
    .url('Invalid Solana RPC URL')
    .default('https://api.mainnet-beta.solana.com'),
  POLL_INTERVAL_MS: z
    .string()
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().positive())
    .default('10000'),
  DATA_DIR: z.string().default('data'),
  HERMES_WEBHOOK_URL: z
    .string()
    .url()
    .optional()
    .or(z.literal(''))
    .transform((val) => (val === '' ? undefined : val)),
  SCAN_LIMIT: z
    .string()
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().positive())
    .default('50'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

const rawEnv = {
  LEADER_WALLET: process.env.LEADER_WALLET,
  SOLANA_RPC_URL: process.env.SOLANA_RPC_URL,
  POLL_INTERVAL_MS: process.env.POLL_INTERVAL_MS,
  DATA_DIR: process.env.DATA_DIR,
  HERMES_WEBHOOK_URL: process.env.HERMES_WEBHOOK_URL,
  SCAN_LIMIT: process.env.SCAN_LIMIT,
  LOG_LEVEL: process.env.LOG_LEVEL,
};

const parsed = EnvSchema.safeParse(rawEnv);

if (!parsed.success) {
  console.error('❌ Invalid Configuration in environment variables:');
  console.error(JSON.stringify(parsed.error.format(), null, 2));
  process.exit(1);
}

export const config = {
  ...parsed.data,
  getEventsFilePath: () => path.resolve(process.cwd(), parsed.data.DATA_DIR, 'events.jsonl'),
  getPositionsFilePath: () => path.resolve(process.cwd(), parsed.data.DATA_DIR, 'positions.json'),
};

export type Config = typeof config;
