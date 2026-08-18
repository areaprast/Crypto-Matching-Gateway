-- =========================================================
-- B2B P2P Matching Gateway Schema (PostgreSQL)
-- =========================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------- MERCHANTS ----------
CREATE TABLE IF NOT EXISTS merchants (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code            VARCHAR(32) UNIQUE NOT NULL,
  name            VARCHAR(120) NOT NULL,
  type            VARCHAR(16)  NOT NULL CHECK (type IN ('FIAT','CRYPTO')),
  email           VARCHAR(160) UNIQUE NOT NULL,
  password_hash   TEXT NOT NULL,
  webhook_url     TEXT,
  webhook_secret  TEXT,
  status          VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS webhook_secret TEXT;
-- Backfill webhook_secret for any pre-existing merchants missing one.
UPDATE merchants
   SET webhook_secret = 'whsec_' || encode(gen_random_bytes(24), 'hex')
 WHERE webhook_secret IS NULL;

-- ---------- API KEYS ----------
CREATE TABLE IF NOT EXISTS merchant_apikeys (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id     UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  label           VARCHAR(60) NOT NULL,
  api_key         VARCHAR(64) UNIQUE NOT NULL,          -- public part (shown once)
  api_key_hash    TEXT NOT NULL,                        -- bcrypt of api_key
  secret_hash     TEXT NOT NULL,                        -- bcrypt of secret
  ip_whitelist    TEXT[] DEFAULT '{}',
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  last_used_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_apikeys_merchant ON merchant_apikeys(merchant_id);

-- ---------- CRYPTO WALLETS (HOT WALLETS SYSTEM-OWNED + MERCHANT PAYOUT) ----------
CREATE TABLE IF NOT EXISTS crypto_wallets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id     UUID REFERENCES merchants(id) ON DELETE SET NULL,
  network         VARCHAR(24) NOT NULL DEFAULT 'TRON-NILE',
  address         VARCHAR(64) NOT NULL,
  purpose         VARCHAR(24) NOT NULL,                 -- HOT_ESCROW | MERCHANT_PAYOUT
  encrypted_key   TEXT,                                 -- base64(ciphertext) only for HOT_ESCROW
  key_iv          TEXT,
  key_tag         TEXT,
  balance_cache   NUMERIC(24,6) DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (network, address)
);

-- ---------- ORDERS (BI-DIRECTIONAL ORDER BOOK) ----------
CREATE TABLE IF NOT EXISTS orders (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id               UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  side                      VARCHAR(16) NOT NULL CHECK (side IN ('TOPUP','REDEEM')),
  -- TOPUP: fiat merchant wants to buy USDT with IDR.
  -- REDEEM: crypto merchant wants to sell USDT for IDR.
  status                    VARCHAR(24) NOT NULL DEFAULT 'OPEN',
  -- OPEN | MATCHING | PARTIALLY_MATCHED | COMPLETED | CANCELLED | EXPIRED
  crypto_asset              VARCHAR(16) NOT NULL DEFAULT 'USDT',
  fiat_currency             VARCHAR(8)  NOT NULL DEFAULT 'IDR',
  price_idr_per_usdt        NUMERIC(18,4) NOT NULL,
  crypto_amount             NUMERIC(24,6) NOT NULL,
  fiat_amount               NUMERIC(24,2) NOT NULL,
  remaining_crypto_amount   NUMERIC(24,6) NOT NULL,
  remaining_fiat_amount     NUMERIC(24,2) NOT NULL,
  -- Bi-directional destination fields (on-the-fly)
  destination_wallet        VARCHAR(64),   -- USDT wallet to receive (for TOPUP: fiat user's wallet)
  destination_bank_name     VARCHAR(60),   -- Bank for IDR transfer (for REDEEM: crypto user's bank)
  destination_bank_account  VARCHAR(40),
  destination_bank_holder   VARCHAR(80),
  expires_at                TIMESTAMPTZ,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_orders_open ON orders(side, status, price_idr_per_usdt);
CREATE INDEX IF NOT EXISTS idx_orders_merchant ON orders(merchant_id);

-- ---------- MATCHES (HEADER SESI) ----------
CREATE TABLE IF NOT EXISTS matches (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference             VARCHAR(32) UNIQUE NOT NULL,
  status                VARCHAR(24) NOT NULL DEFAULT 'AWAITING_ESCROW',
  -- AWAITING_ESCROW | AWAITING_FIAT | RELEASED | FAILED | CANCELLED
  total_crypto_amount   NUMERIC(24,6) NOT NULL,
  total_fiat_amount     NUMERIC(24,2) NOT NULL,
  platform_fee_crypto   NUMERIC(24,6) DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------- MATCH ITEMS (M-to-M PECAHAN) ----------
CREATE TABLE IF NOT EXISTS match_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id          UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  topup_order_id    UUID NOT NULL REFERENCES orders(id),
  redeem_order_id   UUID NOT NULL REFERENCES orders(id),
  crypto_amount     NUMERIC(24,6) NOT NULL,
  fiat_amount       NUMERIC(24,2) NOT NULL,
  status            VARCHAR(24) NOT NULL DEFAULT 'PENDING',
  -- PENDING | ESCROWED | FIAT_PAID | RELEASED | CANCELLED
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_items_match ON match_items(match_id);
CREATE INDEX IF NOT EXISTS idx_items_topup ON match_items(topup_order_id);
CREATE INDEX IF NOT EXISTS idx_items_redeem ON match_items(redeem_order_id);

-- ---------- TRANSACTIONS (ON-CHAIN LEDGER) ----------
CREATE TABLE IF NOT EXISTS transactions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id        UUID REFERENCES matches(id),
  match_item_id   UUID REFERENCES match_items(id),
  direction       VARCHAR(16) NOT NULL CHECK (direction IN ('DEPOSIT','RELEASE','REFUND')),
  network         VARCHAR(24) NOT NULL DEFAULT 'TRON-NILE',
  asset           VARCHAR(16) NOT NULL DEFAULT 'USDT',
  from_address    VARCHAR(64),
  to_address      VARCHAR(64),
  amount          NUMERIC(24,6) NOT NULL,
  txid            VARCHAR(80),
  block_number    BIGINT,
  status          VARCHAR(24) NOT NULL DEFAULT 'PENDING',
  -- PENDING | CONFIRMED | FAILED
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_tx_match ON transactions(match_id);
CREATE INDEX IF NOT EXISTS idx_tx_txid ON transactions(txid);

-- ---------- WEBHOOK DELIVERIES ----------
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id     UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  event_type      VARCHAR(48) NOT NULL,
  event_id        VARCHAR(48) NOT NULL,
  target_url      TEXT NOT NULL,
  payload         JSONB NOT NULL,
  signature       TEXT NOT NULL,
  attempt         INT NOT NULL DEFAULT 0,
  max_attempts    INT NOT NULL DEFAULT 5,
  status          VARCHAR(16) NOT NULL DEFAULT 'PENDING',
  -- PENDING | SUCCESS | FAILED
  response_status INT,
  response_body   TEXT,
  next_retry_at   TIMESTAMPTZ,
  delivered_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wh_merchant ON webhook_deliveries(merchant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wh_pending ON webhook_deliveries(status, next_retry_at);

-- ---------- SETTLEMENTS (PERIODIC RECAP) ----------
CREATE TABLE IF NOT EXISTS settlements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id     UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  period_start    TIMESTAMPTZ NOT NULL,
  period_end      TIMESTAMPTZ NOT NULL,
  total_matches   INT NOT NULL DEFAULT 0,
  gross_volume_crypto NUMERIC(24,6) NOT NULL DEFAULT 0,
  gross_volume_fiat   NUMERIC(24,2) NOT NULL DEFAULT 0,
  platform_fee_crypto NUMERIC(24,6) NOT NULL DEFAULT 0,
  net_volume_crypto   NUMERIC(24,6) NOT NULL DEFAULT 0,
  status          VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
