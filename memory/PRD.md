# B2B P2P Matching Gateway — PRD

## Original Problem Statement
B2B P2P Matching Gateway acting as a bi-directional escrow gateway between IDR
fiat merchants and USDT crypto merchants. Multi-matching (1-to-1, 1-to-many,
many-to-1) via `match_items`. Full flow: TopUp request → matching engine →
crypto escrowed to hot wallet → user fiat transfer IDR peer-to-peer → confirm
IDR received → release USDT to fiat user's wallet.

## Architecture (Aug 18, 2026)
```
                     ┌─────────────────────┐
Browser (Next.js)    │   FastAPI proxy     │ (READONLY supervisor)
      :3000  ───────▶│      :8001          │
                     └────────┬────────────┘
              ┌───────────────┴───────────────┐
              ▼                               ▼
   ┌─────────────────────┐        ┌──────────────────────┐
   │ backend-system      │        │ backend-crypto        │
   │ Express :8002       │        │ Express :8003         │
   │ • matching engine   │───────▶│ • TronWeb + Nile      │
   │ • orders / matches  │  HTTP  │ • hot wallet + vault  │
   │ • auth (merchant +  │ internal│ • send-usdt endpoint │
   │   admin), webhooks, │  token  │ • Prisma ORM only    │
   │   exports, admin    │        │  (no migrations)      │
   │ • Prisma + pg       │        │                      │
   └──────────┬──────────┘        └──────────┬───────────┘
              │                              │
              └──────────────┬───────────────┘
                             ▼
                 ┌────────────────────────┐
                 │  PostgreSQL @ :5432    │  (Prisma-managed schema)
                 │  Redis     @ :6379     │
                 └────────────────────────┘
```

## Data layer — Prisma
- **Source of truth**: `/app/backend-system/prisma/schema.prisma`.
- **Migrations**: `/app/backend-system/prisma/migrations/` — created via
  `npx prisma migrate dev --name <label>` in backend-system. To apply on a
  fresh DB: `cd /app/backend-system && npx prisma migrate deploy`.
- **backend-crypto**: has its own `prisma/schema.prisma` (subset — only
  `CryptoWallet` model) so `prisma generate` can produce a typed client.
  It does NOT own migrations — updates flow: edit system schema → migrate →
  copy relevant models into crypto schema → `prisma generate` inside crypto.
- **backend-system db.js** exposes both `prisma` (typed) and `query`/`tx`
  (pg raw SQL) so existing routes with hand-written joins keep working while
  Prisma manages the schema.
- **backend-crypto** is fully Prisma (no pg dependency).

Models: `Admin`, `Merchant`, `MerchantApiKey`, `CryptoWallet`, `Order`,
`Match`, `MatchItem`, `Transaction`, `Settlement`, `WebhookDelivery`.

## Tech Stack
- Frontend: Next.js 14.2.15 (pages router). Routes under `src/pages/`, screen
  components under `src/screens/` (merchant + `screens/admin/*`).
- backend-system: Node.js + Express (matching engine, orders, matches, JWT +
  API key + HMAC auth, webhooks, signed CSV exports, admin console).
- backend-crypto: Node.js + Express (TronWeb hot wallet vault, `/internal/tron/send-usdt`).
- Database: PostgreSQL 15 (Prisma migrations).
- Cache: Redis 7 (available for BullMQ).
- Blockchain: TRON Nile testnet via `tronweb`, broadcasts MOCKED (simulated txids).

## Features implemented
- Auth: merchant JWT + register (auto webhook_secret), admin JWT, API key + HMAC + IP whitelist.
- Order book bi-directional with side/type role enforcement.
- Matching engine (transactional, price/time priority, 1-to-many & many-to-1).
- Escrow → confirm-fiat → release (release delegated to backend-crypto).
- Webhook fan-out signed HMAC (`match.created` / `.escrowed` / `.released`), retry queue, manual redeliver.
- Signed monthly CSV export with in-file + header signature.
- Merchant dashboard: Overview, Order Book, My Orders, Matches, Ledger, Hot Wallet, Settlements, API Keys, Webhooks, Exports.
- **Admin console** (`/admin/*`): Overview, Merchants (suspend/activate), Orders/Matches/Ledger/Settlements with per-merchant filter, Hot Wallets CRUD, API Keys CRUD, Webhooks CRUD.

## Test Credentials
See `/app/memory/test_credentials.md`.

## Backlog
- P1 Real TRON Nile broadcasts (flip `simulate=false` when hot wallet funded).
- P1 TronGrid deposit poller in backend-crypto (auto-confirm on-chain deposits).
- P2 BullMQ worker for high-throughput matching.
- P2 WebSocket push (replace polling).
- P2 Webhook test-event sender.
- P3 Per-key rate limits + admin audit log.
