# B2B P2P Matching Gateway — PRD

## Original Problem Statement
B2B P2P Matching Gateway acting as a bi-directional escrow gateway between IDR
fiat merchants and USDT crypto merchants. Multi-matching (1-to-1, 1-to-many,
many-to-1) with match_items pecahan. Full flow: TopUp request → matching engine
→ crypto escrowed to hot wallet → user fiat transfer IDR peer-to-peer → confirm
IDR received → release USDT to fiat user's wallet.

## Architecture (as of Aug 18, 2026 — post-refactor)
```
                     ┌─────────────────────┐
Browser (Next.js)    │   FastAPI proxy     │ (READONLY supervisor)
      :3000  ───────▶│      :8001          │
                     └────────┬────────────┘
                              │
              ┌───────────────┴───────────────┐
              │                               │
              ▼                               ▼
   ┌─────────────────────┐        ┌──────────────────────┐
   │ backend-system      │        │ backend-crypto        │
   │ Express :8002       │        │ Express :8003         │
   │ • matching engine   │───────▶│ • TronWeb + Nile      │
   │ • orders / matches  │  HTTP  │ • hot wallet + vault  │
   │ • auth / apikeys    │ internal│ • send-usdt endpoint │
   │ • webhooks / exports│  token  │ • encrypted PK       │
   └──────────┬──────────┘        └──────────┬───────────┘
              │                              │
              └──────────────┬───────────────┘
                             ▼
                 ┌────────────────────────┐
                 │  PostgreSQL @ :5432    │  (shared)
                 │  Redis     @ :6379     │
                 └────────────────────────┘
```

## Tech Stack
- **Frontend**: **Next.js 14.2.15** (pages router) — routes under `src/pages/`, screens under `src/screens/`. `yarn start` = `next dev -p 3000 -H 0.0.0.0`.
- **Backend System**: Node.js + Express (`/app/backend-system`) — matching engine, orders, matches, auth (JWT + HMAC API keys), settlements, transactions, webhooks, signed CSV exports. Talks to backend-crypto via internal HTTP with shared `INTERNAL_API_TOKEN`.
- **Backend Crypto**: Node.js + Express (`/app/backend-crypto`) — owns TronWeb, hot wallet AES-GCM vault, `/internal/tron/send-usdt` for release, and `/api/crypto/*` public read endpoints. Provisions the hot wallet on first boot.
- **Database**: PostgreSQL 15 shared by both backends (users `p2papp`, db `p2p_gateway`).
- **Cache**: Redis 7 (ready for BullMQ; not yet used).
- **Blockchain**: TRON Nile testnet via `tronweb` v6. Broadcasts MOCKED (simulated txids) per user's MVP choice — flip `simulate=false` in `/app/backend-crypto/src/server.js` sendUsdt() when hot wallet is funded.
- **Auth**: JWT for dashboard sessions; API key + HMAC secret + IP whitelist for M2M.
- **Webhooks**: `match.created` / `match.escrowed` / `match.released` fan-out to both merchants, HMAC-SHA256 (`X-P2P-Signature: t=…,v1=…`), 5-attempt exponential retry.
- **Signed exports**: monthly CSV signed with the same `webhook_secret`.

## Request routing (via FastAPI proxy)
- `GET /api/crypto/*`                → backend-crypto :8003
- All other `/api/*`                 → backend-system :8002
- Backend-system → backend-crypto: `POST /internal/tron/send-usdt` (release flow)

## Database Schema
`merchants` (+ webhook_secret), `merchant_apikeys`, `crypto_wallets`, `orders`,
`matches`, `match_items`, `transactions`, `settlements`, `webhook_deliveries`.

## What's Implemented
- Full auth (register w/ auto webhook_secret, JWT login).
- Order book with bidirectional listing + side/type role enforcement.
- Matching engine (transactional, price/time priority, 1-to-many & many-to-1).
- Escrow → confirm-fiat → release flow (release delegated to backend-crypto).
- Webhook fan-out with signed HMAC, retry queue, manual redeliver.
- Signed monthly CSV export (headers + in-file footer).
- Dashboard (Next.js): Overview KPIs + live book, Order Book, My Orders,
  Matches master-detail (pecahan visualization + escrow/release actions),
  Ledger, Hot Wallet, Settlements, API Keys, Webhooks, Exports.

## Test Credentials
- `fiat@demo.com / fiat123456` (FIAT merchant)
- `crypto@demo.com / crypto123456` (CRYPTO merchant)

## Backlog
- **P1** Real Tron Nile broadcasts once hot wallet is funded (flip `simulate=false`).
- **P1** TronGrid deposit poller in backend-crypto so escrow auto-confirms on-chain.
- **P2** BullMQ + Redis worker for high-throughput matching.
- **P2** WebSocket push for order book (replace polling).
- **P2** Webhook test-event sender + delivery replay UI polish.
- **P3** Per-API-key rate limits + audit log for admin actions.
