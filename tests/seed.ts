import fs from 'fs';
import path from 'path';
import { TransactionParser } from '../src/parser/transaction-parser.js';
import { eventStore } from '../src/events/event-store.js';

async function seed() {
  const parser = new TransactionParser();
  const fixtures = [
    'open_position',
    'add_liquidity',
    'swap',
    'rebalance',
    'remove_liquidity',
    'close_position',
    'non_dlmm',
  ];

  for (const f of fixtures) {
    const filePath = path.resolve(process.cwd(), 'tests', 'fixtures', `${f}.json`);
    const tx = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const events = parser.parseTransaction(tx, '9uNSXiB9wN3uummTzkhoPpQBaMD35nVLeWVW3VDR6SBR');
    for (const e of events) {
      await eventStore.appendEvent(e);
    }
  }

  console.log('✅ Successfully seeded sample events into data/events.jsonl');
}

seed().catch(console.error);
