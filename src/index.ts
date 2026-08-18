import fs from 'fs';
import path from 'path';
import { config } from './config.js';
import { runHistoricalScan } from './monitor/historical.js';
import { startRealtimeMonitor } from './monitor/realtime.js';
import { eventStore } from './events/event-store.js';
import { positionStateTracker } from './parser/position-state.js';
import { NormalizedEventSchema, PositionStateSchema, EventType } from './events/schema.js';
import { runAudit } from './audit/security-audit.js';

async function runReplay(): Promise<void> {
  console.log(`\n==================================================`);
  console.log(`🔁 DLMM LEADER OBSERVER — HISTORICAL REPLAY`);
  console.log(`==================================================`);
  console.log(`Source File: ${config.getEventsFilePath()}\n`);

  const eventsFilePath = config.getEventsFilePath();
  if (!fs.existsSync(eventsFilePath)) {
    console.warn(`⚠️ No events file found at ${eventsFilePath}. Run 'npm run scan' first.`);
    return;
  }

  const content = fs.readFileSync(eventsFilePath, 'utf-8');
  const lines = content.split('\n').filter((l) => l.trim().length > 0);

  const stats: Record<string, number> = {
    TOTAL_TRANSACTIONS: 0,
    DLMM_TRANSACTIONS: 0,
    OPEN_POSITION: 0,
    ADD_LIQUIDITY: 0,
    REMOVE_LIQUIDITY: 0,
    REBALANCE: 0,
    CLOSE_POSITION: 0,
    CLAIM_FEES: 0,
    SWAP: 0,
    UNKNOWN: 0,
    ERRORS: 0,
  };

  const seenSignatures = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    try {
      const parsed = JSON.parse(lines[i]);
      const validated = NormalizedEventSchema.parse(parsed);

      if (!seenSignatures.has(validated.signature)) {
        stats.TOTAL_TRANSACTIONS++;
        seenSignatures.add(validated.signature);
      }

      if (validated.event_type !== 'UNKNOWN') {
        stats.DLMM_TRANSACTIONS++;
      }

      const type = validated.event_type as EventType;
      stats[type] = (stats[type] || 0) + 1;

      console.log(
        `[#${i + 1}] [${validated.event_type}] sig=${validated.signature.slice(0, 14)}... slot=${validated.slot} conf=${validated.confidence.toFixed(2)} ${validated.position ? `pos=${validated.position.slice(0, 8)}...` : ''}`
      );
      if (validated.event_type === 'REBALANCE') {
        console.log(`    ↳ Rebalance info:`, JSON.stringify(validated.raw));
      }
    } catch (err) {
      stats.ERRORS++;
      console.error(`[#${i + 1}] ❌ Malformed event:`, err);
    }
  }

  console.log(`\n==================================================`);
  console.log(`📊 REPLAY SUMMARY STATISTICS`);
  console.log(`==================================================`);
  console.table(stats);
  console.log(`==================================================\n`);
}

async function runValidate(): Promise<void> {
  console.log(`\n==================================================`);
  console.log(`✔️ DLMM LEADER OBSERVER — SCHEMA VALIDATION`);
  console.log(`==================================================\n`);

  let hasErrors = false;

  // 1. Validate events.jsonl
  const eventsFile = config.getEventsFilePath();
  console.log(`Validating Events: ${eventsFile}`);
  if (fs.existsSync(eventsFile)) {
    const lines = fs.readFileSync(eventsFile, 'utf-8').split('\n').filter((l) => l.trim().length > 0);
    let validCount = 0;
    let invalidCount = 0;

    lines.forEach((line, idx) => {
      try {
        const parsed = JSON.parse(line);
        NormalizedEventSchema.parse(parsed);
        validCount++;
      } catch (err) {
        invalidCount++;
        hasErrors = true;
        console.error(`  ❌ Event #${idx + 1} validation failed:`, err);
      }
    });

    console.log(`  ✅ ${validCount} valid events, ⚠️ ${invalidCount} invalid events.\n`);
  } else {
    console.log(`  ℹ️ No events file yet.\n`);
  }

  // 2. Validate positions.json
  const positionsFile = config.getPositionsFilePath();
  console.log(`Validating Positions: ${positionsFile}`);
  if (fs.existsSync(positionsFile)) {
    try {
      const raw = fs.readFileSync(positionsFile, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        let validPos = 0;
        let invalidPos = 0;
        parsed.forEach((pos, idx) => {
          try {
            PositionStateSchema.parse(pos);
            validPos++;
          } catch (e) {
            invalidPos++;
            hasErrors = true;
            console.error(`  ❌ Position #${idx + 1} validation failed:`, e);
          }
        });
        console.log(`  ✅ ${validPos} valid positions, ⚠️ ${invalidPos} invalid positions.\n`);
      } else {
        hasErrors = true;
        console.error(`  ❌ positions.json is not an array.`);
      }
    } catch (err) {
      hasErrors = true;
      console.error(`  ❌ positions.json parse error:`, err);
    }
  } else {
    console.log(`  ℹ️ No positions file yet.\n`);
  }

  if (hasErrors) {
    console.error(`❌ Validation failed with errors.`);
    process.exit(1);
  } else {
    console.log(`🎉 All schemas validated successfully!`);
  }
}

async function runSecurityAudit(): Promise<void> {
  const passed = runAudit();
  if (!passed) {
    process.exit(1);
  }
}

async function main(): Promise<void> {
  const command = process.argv[2] || 'scan';

  switch (command) {
    case 'scan':
      await runHistoricalScan();
      break;

    case 'monitor':
      await startRealtimeMonitor();
      break;

    case 'replay':
      await runReplay();
      break;

    case 'validate':
      await runValidate();
      break;

    case 'audit':
      await runSecurityAudit();
      break;

    default:
      console.log(`Unknown command: ${command}`);
      console.log(`Available commands: scan, monitor, replay, validate, audit`);
      process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
