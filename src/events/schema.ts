import { z } from 'zod';

export const EventTypeSchema = z.enum([
  'OPEN_POSITION',
  'ADD_LIQUIDITY',
  'REMOVE_LIQUIDITY',
  'REBALANCE',
  'CLOSE_POSITION',
  'CLAIM_FEES',
  'SWAP',
  'UNKNOWN',
]);

export type EventType = z.infer<typeof EventTypeSchema>;

export const PositionStatusSchema = z.enum(['OPEN', 'CLOSED', 'UNKNOWN']);
export type PositionStatus = z.infer<typeof PositionStatusSchema>;

export const RebalanceRangeSchema = z.object({
  lower_bin: z.number(),
  upper_bin: z.number(),
});
export type RebalanceRange = z.infer<typeof RebalanceRangeSchema>;

export const NormalizedEventSchema = z.object({
  event_id: z.string().min(1),
  signature: z.string().min(1),
  slot: z.number().int().nonnegative(),
  timestamp: z.number().int(),

  leader: z.string().min(1),
  protocol: z.literal('meteora_dlmm'),

  event_type: EventTypeSchema,

  pool: z.string().nullable(),
  position: z.string().nullable(),

  token_x: z.string().nullable(),
  token_y: z.string().nullable(),

  lower_bin: z.number().int().nullable(),
  upper_bin: z.number().int().nullable(),
  active_bin: z.number().int().nullable(),

  amount_x: z.string().nullable(),
  amount_y: z.string().nullable(),

  confidence: z.number().min(0.0).max(1.0),

  raw: z.record(z.unknown()),
});

export type NormalizedEvent = z.infer<typeof NormalizedEventSchema>;

export const PositionStateSchema = z.object({
  position: z.string().min(1),
  pool: z.string().min(1),
  token_x: z.string().nullable().default(null),
  token_y: z.string().nullable().default(null),
  lower_bin: z.number().int().nullable().default(null),
  upper_bin: z.number().int().nullable().default(null),
  active_bin: z.number().int().nullable().default(null),
  last_slot: z.number().int().nonnegative(),
  last_signature: z.string().min(1),
  status: PositionStatusSchema,
  updated_at: z.number().int(),
});

export type PositionState = z.infer<typeof PositionStateSchema>;
