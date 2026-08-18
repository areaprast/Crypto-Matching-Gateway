-- CreateTable
CREATE TABLE "admins" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" VARCHAR(160) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "merchants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(32) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "type" VARCHAR(16) NOT NULL,
    "email" VARCHAR(160) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "webhook_url" TEXT,
    "webhook_secret" TEXT,
    "status" VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "merchants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "merchant_apikeys" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "merchant_id" UUID NOT NULL,
    "label" VARCHAR(60) NOT NULL,
    "api_key" VARCHAR(64) NOT NULL,
    "api_key_hash" TEXT NOT NULL,
    "secret_hash" TEXT NOT NULL,
    "ip_whitelist" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "last_used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "merchant_apikeys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crypto_wallets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "merchant_id" UUID,
    "network" VARCHAR(24) NOT NULL DEFAULT 'TRON-NILE',
    "address" VARCHAR(64) NOT NULL,
    "purpose" VARCHAR(24) NOT NULL,
    "encrypted_key" TEXT,
    "key_iv" TEXT,
    "key_tag" TEXT,
    "balance_cache" DECIMAL(24,6) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crypto_wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "merchant_id" UUID NOT NULL,
    "side" VARCHAR(16) NOT NULL,
    "status" VARCHAR(24) NOT NULL DEFAULT 'OPEN',
    "crypto_asset" VARCHAR(16) NOT NULL DEFAULT 'USDT',
    "fiat_currency" VARCHAR(8) NOT NULL DEFAULT 'IDR',
    "price_idr_per_usdt" DECIMAL(18,4) NOT NULL,
    "crypto_amount" DECIMAL(24,6) NOT NULL,
    "fiat_amount" DECIMAL(24,2) NOT NULL,
    "remaining_crypto_amount" DECIMAL(24,6) NOT NULL,
    "remaining_fiat_amount" DECIMAL(24,2) NOT NULL,
    "destination_wallet" VARCHAR(64),
    "destination_bank_name" VARCHAR(60),
    "destination_bank_account" VARCHAR(40),
    "destination_bank_holder" VARCHAR(80),
    "expires_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "matches" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "reference" VARCHAR(32) NOT NULL,
    "status" VARCHAR(24) NOT NULL DEFAULT 'AWAITING_ESCROW',
    "total_crypto_amount" DECIMAL(24,6) NOT NULL,
    "total_fiat_amount" DECIMAL(24,2) NOT NULL,
    "platform_fee_crypto" DECIMAL(24,6) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "match_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "match_id" UUID NOT NULL,
    "topup_order_id" UUID NOT NULL,
    "redeem_order_id" UUID NOT NULL,
    "crypto_amount" DECIMAL(24,6) NOT NULL,
    "fiat_amount" DECIMAL(24,2) NOT NULL,
    "status" VARCHAR(24) NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "match_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "match_id" UUID,
    "match_item_id" UUID,
    "direction" VARCHAR(16) NOT NULL,
    "network" VARCHAR(24) NOT NULL DEFAULT 'TRON-NILE',
    "asset" VARCHAR(16) NOT NULL DEFAULT 'USDT',
    "from_address" VARCHAR(64),
    "to_address" VARCHAR(64),
    "amount" DECIMAL(24,6) NOT NULL,
    "txid" VARCHAR(80),
    "block_number" BIGINT,
    "status" VARCHAR(24) NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmed_at" TIMESTAMPTZ(6),

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settlements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "merchant_id" UUID NOT NULL,
    "period_start" TIMESTAMPTZ(6) NOT NULL,
    "period_end" TIMESTAMPTZ(6) NOT NULL,
    "total_matches" INTEGER NOT NULL DEFAULT 0,
    "gross_volume_crypto" DECIMAL(24,6) NOT NULL DEFAULT 0,
    "gross_volume_fiat" DECIMAL(24,2) NOT NULL DEFAULT 0,
    "platform_fee_crypto" DECIMAL(24,6) NOT NULL DEFAULT 0,
    "net_volume_crypto" DECIMAL(24,6) NOT NULL DEFAULT 0,
    "status" VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "settlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_deliveries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "merchant_id" UUID NOT NULL,
    "event_type" VARCHAR(48) NOT NULL,
    "event_id" VARCHAR(48) NOT NULL,
    "target_url" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "signature" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 5,
    "status" VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    "response_status" INTEGER,
    "response_body" TEXT,
    "next_retry_at" TIMESTAMPTZ(6),
    "delivered_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "admins_email_key" ON "admins"("email");

-- CreateIndex
CREATE UNIQUE INDEX "merchants_code_key" ON "merchants"("code");

-- CreateIndex
CREATE UNIQUE INDEX "merchants_email_key" ON "merchants"("email");

-- CreateIndex
CREATE UNIQUE INDEX "merchant_apikeys_api_key_key" ON "merchant_apikeys"("api_key");

-- CreateIndex
CREATE INDEX "merchant_apikeys_merchant_id_idx" ON "merchant_apikeys"("merchant_id");

-- CreateIndex
CREATE UNIQUE INDEX "crypto_wallets_network_address_key" ON "crypto_wallets"("network", "address");

-- CreateIndex
CREATE INDEX "idx_orders_open" ON "orders"("side", "status", "price_idr_per_usdt");

-- CreateIndex
CREATE INDEX "idx_orders_merchant" ON "orders"("merchant_id");

-- CreateIndex
CREATE UNIQUE INDEX "matches_reference_key" ON "matches"("reference");

-- CreateIndex
CREATE INDEX "idx_items_match" ON "match_items"("match_id");

-- CreateIndex
CREATE INDEX "idx_items_topup" ON "match_items"("topup_order_id");

-- CreateIndex
CREATE INDEX "idx_items_redeem" ON "match_items"("redeem_order_id");

-- CreateIndex
CREATE INDEX "idx_tx_match" ON "transactions"("match_id");

-- CreateIndex
CREATE INDEX "idx_tx_txid" ON "transactions"("txid");

-- CreateIndex
CREATE INDEX "idx_wh_merchant" ON "webhook_deliveries"("merchant_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_wh_pending" ON "webhook_deliveries"("status", "next_retry_at");

-- AddForeignKey
ALTER TABLE "merchant_apikeys" ADD CONSTRAINT "merchant_apikeys_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crypto_wallets" ADD CONSTRAINT "crypto_wallets_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_items" ADD CONSTRAINT "match_items_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_items" ADD CONSTRAINT "match_items_topup_order_id_fkey" FOREIGN KEY ("topup_order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_items" ADD CONSTRAINT "match_items_redeem_order_id_fkey" FOREIGN KEY ("redeem_order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_match_item_id_fkey" FOREIGN KEY ("match_item_id") REFERENCES "match_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
