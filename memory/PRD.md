# B2B P2P Matching Gateway — PRD

## Original Problem Statement
Build a B2B P2P Matching Gateway that acts as an escrow-based bi-directional matching
engine between IDR fiat merchants and USDT crypto merchants. No end-user data stored.
Bi-directional multi-matching (1-to-1, 1-to-many, many-to-1). Fiat merchant user
requests TopUp USDT → sent to matching against crypto merchant's REDEEM listings →
crypto merchant deposits USDT to system Hot Wallet → user fiat transfers IDR
peer-to-peer to crypto merchant's bank → after confirmation, system releases USDT
from hot wallet to fiat user's wallet.

## Tech Stack (as delivered)
- **Backend**: Node.js + Express (main API + Crypto Service unified) on `127.0.0.1:8002`
  (proxied via FastAPI/uvicorn on `:8001` due to READONLY supervisor config)
- **Frontend**: React 19 + react-router SPA (dark institutional Swiss-style UI) on `:3000`
  (Next.js was requested; substituted with React SPA because `craco start` is required
  by the READONLY supervisor. Same JSX + hooks — functionally equivalent for a dashboard.)
- **Database**: PostgreSQL 15 (auto-started by FastAPI startup)
- **Cache**: Redis 7 (running; available for future BullMQ)
- **Blockchain**: TRON Nile testnet via `tronweb` v6 + TronGrid public endpoint
  (Hot wallet auto-generated at boot, AES-256-GCM vault). Broadcasts are simulated
  (mock txids) — set `simulate=false` in `/app/backend-node/src/tron.js` for real Nile
  transfers.
- **Auth**: JWT for dashboard sessions; API Key + HMAC-SHA256 secret + IP whitelist
  for M2M merchant endpoints (per spec).

## Architecture
```
Browser (React SPA)
  ↓ REACT_APP_BACKEND_URL/api/*
Cloudflare/Ingress → FastAPI (:8001, uvicorn)
  ↓ HTTP proxy
Node.js Express (:8002)
  ↓
PostgreSQL (:5432)  Redis (:6379)  TronGrid (Nile)
```

## Database Schema (PostgreSQL — `/app/backend-node/src/migrations.sql`)
- `merchants` — merchant profile + auth (FIAT/CRYPTO type).
- `merchant_apikeys` — API key + bcrypt secret hash + IP whitelist array.
- `crypto_wallets` — hot wallet + merchant payout wallets. Private keys AES-GCM encrypted.
- `orders` — bi-directional book with dynamic on-the-fly destination fields, `remaining_*` for multi-match splits.
- `matches` — session header per matched batch.
- `match_items` — many-to-many pecahan rows linking topup_order_id ↔ redeem_order_id.
- `transactions` — on-chain DEPOSIT/RELEASE ledger with txid.
- `settlements` — periodic recap (gross, fee, net).

## What's Implemented (Aug 18, 2026)
### Webhook fan-out (added Aug 18)
- `merchants.webhook_secret` auto-generated at register + rotatable via `POST /api/webhooks/rotate-secret`.
- `webhook_deliveries` table stores every attempt with payload, signature, response.
- Events fired: `match.created` (on matching-engine output), `match.escrowed` (after item ESCROWED), `match.released` (after USDT release).
- Signature: `X-P2P-Signature: t=<ts>,v1=<hex(hmac_sha256(secret, "${ts}.${bodyJson}"))>` — Stripe-style.
- Retry schedule: 5s, 30s, 5m, 30m, 2h (up to 5 attempts). Background loop scans PENDING every 10s.
- Manual redeliver via `POST /api/webhooks/deliveries/:id/redeliver`.
- Frontend Webhooks page: endpoint save, secret reveal/copy/rotate, deliveries table with payload & signature inspection.

### Backend (Node.js Express)
- `POST /api/auth/register` + `POST /api/auth/login` (JWT)
- `GET/POST/PATCH/DELETE /api/apikeys` — CRUD with one-time secret reveal
- `GET /api/orders`, `POST /api/orders`, `POST /api/orders/:id/cancel`, `GET /api/orders/book`
- `GET /api/matches`, `GET /api/matches/:id`
- `POST /api/matches/:id/escrow` — Crypto merchant confirms USDT deposit (records DEPOSIT tx)
- `POST /api/matches/:id/confirm-fiat` — Crypto merchant confirms IDR received → releases USDT (records RELEASE tx, applies 25 bps fee)
- `GET /api/transactions`, `GET /api/settlements`, `POST /api/settlements/generate`
- `GET/POST /api/crypto/hot-wallet[/refresh|/init]`
- `GET /api/stats` — dashboard overview KPIs
- **Matching engine** (`src/engine/matching.js`): price/time priority, transaction-wrapped for ACID, supports 1-to-many & many-to-1 with automatic status transitions (OPEN → PARTIALLY_MATCHED → MATCHING).

### Frontend (React SPA)
- Login page (with FIAT / CRYPTO quick fill), Register page
- Dashboard: Overview (live KPI cards + dual-pane order book, auto-refresh 8s)
- Order Book: two-pane bi-directional book, live create-order dialog with side auto-detected by merchant type
- My Orders: list + cancel
- Matches: master-detail view with pecahan visualization + Escrow/Confirm Fiat action buttons
- Ledger: on-chain transactions with txid + direction chips
- Hot Wallet: address + cached/live balance + refresh from TronGrid
- Settlements: 7-day recap generation
- API Keys: create with IP whitelist, one-time secret reveal modal, delete

### Design
- Swiss/high-contrast dark theme, `IBM Plex Sans` + `JetBrains Mono`
- Institutional grid-border panels, tabular numerics right-aligned
- `data-testid` on every interactive element

## Backlog / Next Actions
- **P1** Real TRON Nile broadcasts (`simulate=false`) once hot wallet is funded with TRX+USDT
- **P1** TRC-20 deposit listener background job (poller already scaffolded in playbook)
- **P2** BullMQ + Redis worker for high-throughput matching under load
- **P2** Webhook fan-out to merchant `webhook_url` on match/release events
- **P2** Rate-limit per-API-key (currently per-IP only)
- **P3** WebSocket live push for order-book updates (replace 5-8s polling)

## Test Credentials
See `/app/memory/test_credentials.md`.
