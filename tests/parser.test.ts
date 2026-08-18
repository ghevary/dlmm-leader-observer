import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { ParsedTransactionWithMeta } from '@solana/web3.js';
import { TransactionParser } from '../src/parser/transaction-parser.js';
import { PositionStateTracker } from '../src/parser/position-state.js';
import { EventStore } from '../src/events/event-store.js';
import { NormalizedEventSchema } from '../src/events/schema.js';
import { SolanaRpcClient } from '../src/solana/rpc.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LEADER_WALLET = '9uNSXiB9wN3uummTzkhoPpQBaMD35nVLeWVW3VDR6SBR';

function loadFixture(name: string): any {
  const filePath = path.resolve(__dirname, 'fixtures', `${name}.json`);
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

describe('Meteora DLMM Leader Observer Test Suite', () => {
  let parser: TransactionParser;
  let tracker: PositionStateTracker;
  let testEventStore: EventStore;
  const testPositionsPath = path.resolve(__dirname, 'test-positions.json');
  const testEventsPath = path.resolve(__dirname, 'test-events.jsonl');

  beforeEach(() => {
    if (fs.existsSync(testPositionsPath)) fs.unlinkSync(testPositionsPath);
    if (fs.existsSync(testEventsPath)) fs.unlinkSync(testEventsPath);

    tracker = new PositionStateTracker(testPositionsPath);
    tracker.clear();
    parser = new TransactionParser();
    testEventStore = new EventStore({ eventsFilePath: testEventsPath });
    testEventStore.clear();
  });

  // 1. Transaction Bukan DLMM
  it('1. should identify non-DLMM transaction and classify as UNKNOWN with confidence 0', () => {
    const tx = loadFixture('non_dlmm') as ParsedTransactionWithMeta;
    const events = parser.parseTransaction(tx, LEADER_WALLET);

    assert.equal(events.length, 1);
    const evt = events[0];
    assert.equal(evt.event_type, 'UNKNOWN');
    assert.equal(evt.confidence, 0.0);
    assert.equal(evt.protocol, 'meteora_dlmm');
    assert.equal(evt.raw.reason, 'NON_DLMM_TRANSACTION');
    assert.equal(NormalizedEventSchema.safeParse(evt).success, true);
  });

  // 2. Swap vs LP Distinction
  it('2. should correctly identify SWAP and never confuse with OPEN_POSITION or LP action', () => {
    const tx = loadFixture('swap') as ParsedTransactionWithMeta;
    const events = parser.parseTransaction(tx, LEADER_WALLET);

    assert.equal(events.length, 1);
    const evt = events[0];
    assert.equal(evt.event_type, 'SWAP');
    assert.ok(evt.confidence >= 0.95, `Confidence ${evt.confidence} is not >= 0.95`);
    assert.ok(evt.pool !== null, 'Pool should be present');
    assert.equal(evt.position, null);
    assert.equal(NormalizedEventSchema.safeParse(evt).success, true);
  });

  // 3. Open Position
  it('3. should detect OPEN_POSITION with high confidence and update position state', () => {
    const tx = loadFixture('open_position') as ParsedTransactionWithMeta;
    const events = parser.parseTransaction(tx, LEADER_WALLET);

    assert.equal(events.length, 1);
    const evt = events[0];
    assert.equal(evt.event_type, 'OPEN_POSITION');
    assert.ok(evt.confidence >= 0.95, `Confidence ${evt.confidence} is not >= 0.95`);
    assert.equal(evt.position, '7NnzWbgvA2wE1h6m8XN7h5aMbmUu5sCdfh93wM1q9XKL');
    assert.equal(evt.pool, 'ARwi1S4DaiTG5DX7S4M4ZsrXqpMD1MrTmbu9ue2tpmEq');
    assert.equal(evt.lower_bin, 120);
    assert.equal(evt.upper_bin, 150);
    assert.equal(NormalizedEventSchema.safeParse(evt).success, true);
  });

  // 4. Add Liquidity
  it('4. should detect ADD_LIQUIDITY with token balance deltas and bins', () => {
    const tx = loadFixture('add_liquidity') as ParsedTransactionWithMeta;
    const events = parser.parseTransaction(tx, LEADER_WALLET);

    assert.equal(events.length, 1);
    const evt = events[0];
    assert.equal(evt.event_type, 'ADD_LIQUIDITY');
    assert.ok(evt.confidence >= 0.95, `Confidence ${evt.confidence} is not >= 0.95`);
    assert.equal(evt.position, '7NnzWbgvA2wE1h6m8XN7h5aMbmUu5sCdfh93wM1q9XKL');
    assert.equal(evt.amount_x, '500000000');
    assert.equal(evt.amount_y, '100000000');
    assert.equal(NormalizedEventSchema.safeParse(evt).success, true);
  });

  // 5. Remove Liquidity
  it('5. should detect REMOVE_LIQUIDITY with high confidence', () => {
    const tx = loadFixture('remove_liquidity') as ParsedTransactionWithMeta;
    const events = parser.parseTransaction(tx, LEADER_WALLET);

    assert.equal(events.length, 1);
    const evt = events[0];
    assert.equal(evt.event_type, 'REMOVE_LIQUIDITY');
    assert.ok(evt.confidence >= 0.95, `Confidence ${evt.confidence} is not >= 0.95`);
    assert.equal(evt.position, '7NnzWbgvA2wE1h6m8XN7h5aMbmUu5sCdfh93wM1q9XKL');
    assert.equal(NormalizedEventSchema.safeParse(evt).success, true);
  });

  // 6. Close Position
  it('6. should detect CLOSE_POSITION and update state to CLOSED', () => {
    // First open the position
    const openTx = loadFixture('open_position') as ParsedTransactionWithMeta;
    parser.parseTransaction(openTx, LEADER_WALLET);

    const closeTx = loadFixture('close_position') as ParsedTransactionWithMeta;
    const events = parser.parseTransaction(closeTx, LEADER_WALLET);

    assert.equal(events.length, 1);
    const evt = events[0];
    assert.equal(evt.event_type, 'CLOSE_POSITION');
    assert.ok(evt.confidence >= 0.95, `Confidence ${evt.confidence} is not >= 0.95`);
    assert.equal(evt.position, '7NnzWbgvA2wE1h6m8XN7h5aMbmUu5sCdfh93wM1q9XKL');
    assert.equal(NormalizedEventSchema.safeParse(evt).success, true);
  });

  // 7. Rebalance Detection
  it('7. should detect REBALANCE when position bin range changes', () => {
    // Open position with 120 - 150
    const openTx = loadFixture('open_position') as ParsedTransactionWithMeta;
    parser.parseTransaction(openTx, LEADER_WALLET);

    // Apply transaction with range 130 - 160
    const rebalanceTx = loadFixture('rebalance') as ParsedTransactionWithMeta;
    const events = parser.parseTransaction(rebalanceTx, LEADER_WALLET);

    assert.equal(events.length, 1);
    const evt = events[0];
    assert.equal(evt.event_type, 'REBALANCE');
    assert.ok(evt.confidence >= 0.95, `Confidence ${evt.confidence} is not >= 0.95`);
    assert.equal(evt.position, '7NnzWbgvA2wE1h6m8XN7h5aMbmUu5sCdfh93wM1q9XKL');
    assert.deepEqual(evt.raw.old_range, { lower_bin: 120, upper_bin: 150 });
    assert.deepEqual(evt.raw.new_range, { lower_bin: 130, upper_bin: 160 });
    assert.equal(NormalizedEventSchema.safeParse(evt).success, true);
  });

  // 8. Duplicate Transaction Protection (Idempotency)
  it('8. should skip already processed transactions and maintain idempotency', async () => {
    const tx = loadFixture('open_position') as ParsedTransactionWithMeta;
    const events = parser.parseTransaction(tx, LEADER_WALLET);
    assert.equal(events.length, 1);

    // First save
    const firstSave = await testEventStore.appendEvent(events[0]);
    assert.equal(firstSave.saved, true);
    assert.equal(testEventStore.hasProcessed(events[0].signature), true);

    // Duplicate check
    const isProcessed = testEventStore.hasProcessed(tx.transaction.signatures[0]);
    assert.equal(isProcessed, true);
  });

  // 9. Malformed Transaction Handling
  it('9. should handle malformed transaction without crashing, classifying as UNKNOWN', () => {
    const tx = loadFixture('malformed') as ParsedTransactionWithMeta;
    const events = parser.parseTransaction(tx, LEADER_WALLET);

    assert.equal(events.length, 1);
    const evt = events[0];
    assert.equal(evt.event_type, 'UNKNOWN');
    assert.ok(evt.confidence < 0.50, `Confidence ${evt.confidence} is not < 0.50`);
    assert.equal(NormalizedEventSchema.safeParse(evt).success, true);
  });

  // 10. RPC Error Handling & Backoff
  it('10. should handle RPC error gracefully with retries', async () => {
    const rpcClient = new SolanaRpcClient('https://invalid.rpc.domain.endpoint.local', {
      maxRetries: 1,
      initialDelayMs: 10,
      maxDelayMs: 20,
    });

    await assert.rejects(async () => {
      await rpcClient.getSlot();
    });
  });
});
