# 🔭 dlmm-leader-observer

> **High-performance, deterministic, and strictly read-only telemetry engine for Solana Leader Wallets & Meteora Dynamic Liquidity Market Maker (DLMM) protocol events.**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg?style=flat-square)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-22.x-green.svg?style=flat-square)](https://nodejs.org/)
[![Solana Web3](https://img.shields.io/badge/Solana-Web3.js-purple.svg?style=flat-square)](https://solana.com/)
[![Meteora DLMM](https://img.shields.io/badge/Meteora-DLMM%20Protocol-orange.svg?style=flat-square)](https://meteora.ag/)
[![Security](https://img.shields.io/badge/Security-Strictly%20Read--Only-red.svg?style=flat-square)](#-security-invariants--read-only-guarantee)
[![Zod](https://img.shields.io/badge/Validation-Zod%20Strict-3068b7.svg?style=flat-square)](https://zod.dev/)

---

## 📑 Table of Contents

- [Executive Summary](#-executive-summary)
- [System Architecture](#-system-architecture)
- [Security Invariants & Read-Only Guarantee](#-security-invariants--read-only-guarantee)
- [Protocol Decoding & Instruction Parsing](#-protocol-decoding--instruction-parsing)
- [Rebalance Detection & Position Lifecycle Engine](#-rebalance-detection--position-lifecycle-engine)
- [Confidence Scoring Model](#-confidence-scoring-model)
- [Canonical Normalized Event Schema](#-canonical-normalized-event-schema)
- [Getting Started](#-getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Environment Configuration](#environment-configuration)
- [CLI Reference](#-cli-reference)
- [Hermes & Downstream Integration](#-hermes--downstream-integration)
- [Automated Security Auditing](#-automated-security-auditing)
- [Testing Suite](#-testing-suite)
- [License](#-license)

---

## 🏛 Executive Summary

`dlmm-leader-observer` is a production-grade Solana blockchain telemetry daemon engineered to monitor high-conviction liquidity provider wallets ("Leader Wallets") and extract real-time, deterministic structured events for all interactions with the **Meteora DLMM (Dynamic Liquidity Market Maker)** protocol (`LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo`).

The observer functions as an isolated ingestion layer in an institutional quantitative copy-trading architecture:

```
                    SOLANA BLOCKCHAIN (Mainnet-Beta)
                                  │
                                  ▼
                   ┌──────────────────────────────┐
                   │    Leader Wallet Activity    │
                   └──────────────┬───────────────┘
                                  │
                                  ▼
             ┌──────────────────────────────────────────┐
             │       dlmm-leader-observer (Telepathy)   │
             │                                          │
             │   • Read-Only Solana RPC Gateway         │
             │   • Anchor Discriminator Decoders        │
             │   • SPL Token Balance Delta Engine       │
             │   • State-Tracked Rebalance Detector     │
             │   • Canonical Event Normalizer (Zod)     │
             └────────────────────┬─────────────────────┘
                                  │
                 Normalized Event Stream (events.jsonl / Webhook)
                                  │
                                  ▼
                   ┌──────────────────────────────┐
                   │           HERMES             │
                   │    (Decision & Copy Engine)  │
                   │    "Should we copy this?"    │
                   └──────────────┬───────────────┘
                                  │
                        Execution Directive
                                  │
                                  ▼
                   ┌──────────────────────────────┐
                   │          MERIDIAN            │
                   │    (Paper/Live Simulation)   │
                   │    "Simulate & Execute LP"   │
                   └──────────────────────────────┘
```

### Core Design Philosophy
- **Strict Decoupling**: The observer answers only one question: *"What exact action did the leader perform on Meteora DLMM?"* It never decides whether to trade (`COPY = TRUE`), maintaining complete fault isolation.
- **Deterministic Replay**: Given the same Solana transactions, the engine always reproduces identical normalized events and position states.
- **Zero-Friction Replayability**: If downstream systems (Hermes/Meridian) encounter errors, the observer's historical log can be replayed chronologically without re-querying the blockchain.

---

## 🛡 Security Invariants & Read-Only Guarantee

Security and risk minimization are enforced at the architectural and code levels:

1. **Zero Private Key Handling**: The codebase contains **zero** private key storage, secret key parsing, or wallet import logic.
2. **Zero Signing Paths**: Neither `signTransaction`, `signAllTransactions`, nor `Keypair.fromSecretKey` exist anywhere in the source tree.
3. **Zero State-Mutating RPC Calls**: No `sendTransaction` or `sendAndConfirmTransaction` methods are imported or executed.
4. **Zero Execution Capabilities**: The observer cannot initiate transfers, execute swaps, deposit liquidity, or alter on-chain accounts.

An automated security audit script (`npm run audit`) scans every TypeScript source file to enforce these invariants continuously.

---

## 🔍 Protocol Decoding & Instruction Parsing

The observer decodes transactions against the official Meteora DLMM IDL and Anchor specification.

### 1. Anchor 8-Byte Discriminator Mapping
Every Meteora DLMM instruction begins with an 8-byte Anchor discriminator computed via `SHA256("global:<instruction_name>")[0..8]`:

| DLMM Instruction | Category | Decoded Attributes |
|---|---|---|
| `initialize_position` | `OPEN_POSITION` | `lowerBinId`, `width`, `position`, `lbPair` |
| `initialize_customizable_position` | `OPEN_POSITION` | `lowerBinId`, `width`, `position`, `lbPair` |
| `initialize_position_by_operator` | `OPEN_POSITION` | `lowerBinId`, `width`, `position`, `lbPair` |
| `add_liquidity_by_strategy` | `ADD_LIQUIDITY` / `REBALANCE` | `amountX`, `amountY`, `activeId`, `minBinId`, `maxBinId`, strategy parameters |
| `add_liquidity_by_strategy_one_side` | `ADD_LIQUIDITY` / `REBALANCE` | Single-sided strategy parameters, active bin slippage |
| `add_liquidity` / `add_liquidity_by_weight` | `ADD_LIQUIDITY` | `amountX`, `amountY`, bin distributions |
| `add_liquidity_precise` / `one_side` | `ADD_LIQUIDITY` | Precise bin arrays & token deposits |
| `remove_liquidity_by_range` | `REMOVE_LIQUIDITY` | `fromBinId`, `toBinId`, `bpsToRemove` |
| `remove_liquidity` / `remove_all_liquidity`| `REMOVE_LIQUIDITY` | Position address, token balances reclaimed |
| `close_position` / `by_operator` | `CLOSE_POSITION` | Position address, rent receiver, pool |
| `claim_fee` / `claim_reward` | `CLAIM_FEES` | Accrued swap fees & token rewards |
| `swap` / `swap_exact_out` / `with_price_impact` | `SWAP` | Pool address, token swap deltas |

### 2. Disambiguation: SWAP vs. Liquidity Operations
The parser strictly distinguishes between normal token swaps (e.g. SOL → USDC) and liquidity events:
- Swaps on Meteora pools are categorized as `event_type = "SWAP"` and never falsely classified as `OPEN_POSITION`.
- `OPEN_POSITION` requires cryptographic proof of position account initialization.
- `ADD_LIQUIDITY` and `REMOVE_LIQUIDITY` require positional bin array interactions.

### 3. Balance Delta Accounting
Token amounts (`amount_x`, `amount_y`) are computed through exact delta analysis comparing `meta.preTokenBalances` against `meta.postTokenBalances` for the leader wallet, ensuring sub-lamport precision regardless of transaction routing.

---

## 🔄 Rebalance Detection & Position Lifecycle Engine

A critical capability of `dlmm-leader-observer` is distinguishing standard liquidity additions from **active range rebalancing**.

```
                ┌───────────────────────────────────────┐
                │        Position State Tracker         │
                │        (data/positions.json)          │
                └──────────────────┬────────────────────┘
                                   │
                 Is position registered & OPEN?
                                   │
               ┌───────────────────┴───────────────────┐
               ▼                                       ▼
             [YES]                                   [NO]
               │                                       │
  Compare new (lower_bin, upper_bin)          Register new position
  against tracked state:                      status = "OPEN"
               │                                       │
        ┌──────┴──────┐                                ▼
        ▼             ▼                          Emit standard
    [CHANGED]     [UNCHANGED]                  ADD_LIQUIDITY event
        │             │
        │             ▼
        │        Emit standard ADD_LIQUIDITY
        ▼
  EMIT REBALANCE EVENT
  • old_range: { lower_bin: 120, upper_bin: 150 }
  • new_range: { lower_bin: 130, upper_bin: 160 }
  • Update position state in positions.json
```

### Position State Schema (`data/positions.json`)
```json
{
  "position": "7NnzWbgvA2wE1h6m8XN7h5aMbmUu5sCdfh93wM1q9XKL",
  "pool": "ARwi1S4DaiTG5DX7S4M4ZsrXqpMD1MrTmbu9ue2tpmEq",
  "token_x": "So11111111111111111111111111111111111111112",
  "token_y": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  "lower_bin": 130,
  "upper_bin": 160,
  "active_bin": 145,
  "last_slot": 280000007,
  "last_signature": "9xY8RebalanceSig77777777777777777777777777777777777777777777777777777777777777777777777777777",
  "status": "OPEN",
  "updated_at": 1718000007000
}
```

---

## 🎯 Confidence Scoring Model

Every parsed event includes a normalized `confidence` float (`0.00` to `1.00`) representing the strength of cryptographic and on-chain evidence:

| Confidence Band | Classification | Evidence Criteria |
|---|---|---|
| **0.95 – 1.00** | High Conviction | Meteora DLMM Anchor discriminator matched; position, pool, and bin parameters fully resolved. |
| **0.75 – 0.94** | Probable Event | DLMM instruction identified; minor metadata missing (e.g. secondary token balance delta unavailable). |
| **0.50 – 0.74** | Weak Indication | AMM interaction detected without verified DLMM instruction parameters. |
| **< 0.50** | `UNKNOWN` | Ambiguous or non-DLMM interaction. Specific event classification suppressed. |

---

## 📦 Canonical Normalized Event Schema

All events written to `data/events.jsonl` or dispatched via webhook strictly validate against the Zod schema:

```json
{
  "event_id": "evt_0c39f1c7d23a48e1",
  "signature": "9xY8RebalanceSig77777777777777777777777777777777777777777777777777777777777777777777777777777",
  "slot": 280000007,
  "timestamp": 1718000007000,
  "leader": "9uNSXiB9wN3uummTzkhoPpQBaMD35nVLeWVW3VDR6SBR",
  "protocol": "meteora_dlmm",
  "event_type": "REBALANCE",
  "pool": "ARwi1S4DaiTG5DX7S4M4ZsrXqpMD1MrTmbu9ue2tpmEq",
  "position": "7NnzWbgvA2wE1h6m8XN7h5aMbmUu5sCdfh93wM1q9XKL",
  "token_x": "So11111111111111111111111111111111111111112",
  "token_y": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  "lower_bin": 130,
  "upper_bin": 160,
  "active_bin": 145,
  "amount_x": "600000000",
  "amount_y": "120000000",
  "confidence": 0.98,
  "raw": {
    "isInner": false,
    "instructionName": "add_liquidity_by_strategy",
    "args": {
      "amountX": "600000000",
      "amountY": "120000000",
      "activeId": 145,
      "maxActiveBinSlippage": 5,
      "strategyType": 0,
      "minBinId": 130,
      "maxBinId": 160
    },
    "old_range": {
      "lower_bin": 120,
      "upper_bin": 150
    },
    "new_range": {
      "lower_bin": 130,
      "upper_bin": 160
    }
  }
}
```

---

## 🚀 Getting Started

### Prerequisites
- **Node.js**: `v20.0.0` or higher (`v22.x` recommended)
- **npm**: `v10.x` or higher
- **Solana RPC Endpoint**: Standard HTTP/HTTPS RPC endpoint (Mainnet-Beta)

### Installation
Clone repository and install dependencies:
```bash
git clone https://github.com/ghevary/dlmm-leader-observer.git
cd dlmm-leader-observer
npm install
```

### Environment Configuration
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

Configure parameters:
```ini
# Solana Leader Wallet Address to observe (Read-Only)
LEADER_WALLET=9uNSXiB9wN3uummTzkhoPpQBaMD35nVLeWVW3VDR6SBR

# Solana RPC URL (Read-Only Gateway)
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com

# Realtime polling interval in milliseconds (default: 10000 = 10s)
POLL_INTERVAL_MS=10000

# Directory for storing events and position state
DATA_DIR=data

# Optional Hermes Webhook URL for normalized event dispatch
HERMES_WEBHOOK_URL=

# Max historical transactions to scan in one run (default: 50)
SCAN_LIMIT=50

# Log level (debug, info, warn, error)
LOG_LEVEL=info
```

---

## 💻 CLI Reference

### 1. Historical Scanner (`npm run scan`)
Fetches past transactions from `LEADER_WALLET`, decodes DLMM instructions chronologically, builds position state, and writes to `data/events.jsonl`:
```bash
npm run scan
```

### 2. Real-Time Monitor (`npm run monitor`)
Monitors the leader wallet continuously with slot-anchored cursor polling, automatic retry, and exponential backoff on HTTP 429 rate-limits:
```bash
npm run monitor
```

### 3. Historical Replay (`npm run replay`)
Replays the stored event log (`data/events.jsonl`) sequentially and produces an analytical event distribution summary:
```bash
npm run replay
```

### 4. Schema & Integrity Validation (`npm run validate`)
Validates every record in `data/events.jsonl` and `data/positions.json` against strict Zod definitions:
```bash
npm run validate
```

### 5. Codebase Security Audit (`npm run audit`)
Performs a static security audit of all source files to verify that no private keys, secret keys, or transaction-signing logic exist:
```bash
npm run audit
```

### 6. Build Project (`npm run build`)
Compiles TypeScript into production-ready ES modules in `dist/`:
```bash
npm run build
```

---

## 📡 Hermes & Downstream Integration

`dlmm-leader-observer` provides two zero-overhead integration interfaces for **Hermes**:

### 1. High-Performance File Stream (`data/events.jsonl`)
Hermes can ingest new events using standard append-log tailing (`tail -f` / file watcher). Each line is an independent, valid JSON object.

### 2. Optional HTTP Webhook Dispatch
If `HERMES_WEBHOOK_URL` is set in `.env`, every normalized event is synchronously dispatched via `POST` with `Content-Type: application/json`.

---

## 🛡️ Automated Security Auditing

To maintain institutional compliance, the automated security audit can be run at any time:

```bash
npm run audit
```

**Audit Checks Enforced:**
- ❌ No `privateKey` / `secretKey` variables
- ❌ No `Keypair.fromSecretKey` or `Keypair.generate`
- ❌ No `signTransaction` or `signAllTransactions`
- ❌ No `sendTransaction` or `sendAndConfirmTransaction`
- ❌ No `WALLET_PRIVATE_KEY` environment variables
- ❌ No `SystemProgram.transfer` calls

---

## 🧪 Testing Suite

The unit test suite covers 10 mission-critical fixture scenarios:

```bash
npm test
```

### Test Coverage Breakdown:
1. `non_dlmm.json`: Verifies non-DLMM Solana transactions are classified as `UNKNOWN` with `0.0` confidence.
2. `swap.json`: Verifies pool swaps are accurately labeled `SWAP` and never confused with `OPEN_POSITION`.
3. `open_position.json`: Verifies position initialization and automatic state tracking.
4. `add_liquidity.json`: Verifies liquidity deposits and token balance delta accounting.
5. `remove_liquidity.json`: Verifies liquidity withdrawals.
6. `close_position.json`: Verifies position closure and status transition to `CLOSED`.
7. `rebalance.json`: Verifies dynamic bin range changes emit structured `REBALANCE` events.
8. `duplicate.json`: Verifies signature-level idempotency and duplicate suppression.
9. `malformed.json`: Verifies truncated or invalid data fails gracefully to `UNKNOWN`.
10. `rpc_error.json`: Verifies RPC backoff and rate-limit recovery.

---

## 📄 License

This project is licensed under the [ISC License](LICENSE).
