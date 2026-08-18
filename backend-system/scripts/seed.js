/**
 * Seed default demo data (via Prisma).
 *  - 1 Admin
 *  - 1 Fiat Merchant + 1 Crypto Merchant (with webhook_secret)
 *  - Initial API keys per merchant
 *  - Sample bi-directional orders
 *
 * Schema is created + kept in sync by `prisma migrate deploy` (or `dev`) —
 * this script only inserts rows.
 */
require('dotenv').config();
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { prisma } = require('../src/db');

async function seed() {
  console.log('[SEED] starting...');

  const [fiatPass, cryptoPass, adminPass] = await Promise.all([
    bcrypt.hash('fiat123456', 10),
    bcrypt.hash('crypto123456', 10),
    bcrypt.hash('admin123456', 10),
  ]);

  await prisma.admin.upsert({
    where: { email: 'admin@demo.com' },
    update: {},
    create: { email: 'admin@demo.com', name: 'Platform Admin', password_hash: adminPass },
  });

  const whSecret = () => 'whsec_' + crypto.randomBytes(24).toString('hex');
  const fiat = await prisma.merchant.upsert({
    where: { code: 'DEMO_FIAT' },
    update: {},
    create: {
      code: 'DEMO_FIAT', name: 'Demo Fiat Gateway', type: 'FIAT',
      email: 'fiat@demo.com', password_hash: fiatPass, webhook_secret: whSecret(),
    },
  });
  const cryptoM = await prisma.merchant.upsert({
    where: { code: 'DEMO_CRYPTO' },
    update: {},
    create: {
      code: 'DEMO_CRYPTO', name: 'Demo Crypto Desk', type: 'CRYPTO',
      email: 'crypto@demo.com', password_hash: cryptoPass, webhook_secret: whSecret(),
    },
  });

  // API keys — one per merchant on first run.
  for (const m of [fiat, cryptoM]) {
    const existing = await prisma.merchantApiKey.count({ where: { merchant_id: m.id } });
    if (existing > 0) continue;
    const rawKey = 'pk_demo_' + crypto.randomBytes(12).toString('hex');
    const rawSecret = 'sk_demo_' + crypto.randomBytes(16).toString('hex');
    await prisma.merchantApiKey.create({
      data: {
        merchant_id: m.id,
        label: 'Primary Demo Key',
        api_key: rawKey,
        api_key_hash: await bcrypt.hash(rawKey, 10),
        secret_hash: await bcrypt.hash(rawSecret, 10),
        ip_whitelist: [],
      },
    });
    console.log(`[SEED] API key for ${m.code}: ${rawKey}  secret=${rawSecret}`);
  }

  const orderCount = await prisma.order.count();
  if (orderCount === 0) {
    const twoHours = new Date(Date.now() + 2 * 60 * 60 * 1000);
    await prisma.order.create({
      data: {
        merchant_id: fiat.id, side: 'TOPUP', status: 'OPEN',
        price_idr_per_usdt: 16250, crypto_amount: 50, fiat_amount: 812500,
        remaining_crypto_amount: 50, remaining_fiat_amount: 812500,
        destination_wallet: 'TXYZuserFiatDemoWalletAddress0001',
        expires_at: twoHours,
      },
    });
    await prisma.order.createMany({
      data: [
        {
          merchant_id: cryptoM.id, side: 'REDEEM', status: 'OPEN',
          price_idr_per_usdt: 16200, crypto_amount: 30, fiat_amount: 486000,
          remaining_crypto_amount: 30, remaining_fiat_amount: 486000,
          destination_bank_name: 'BCA', destination_bank_account: '1234567890', destination_bank_holder: 'Budi Santoso',
          expires_at: twoHours,
        },
        {
          merchant_id: cryptoM.id, side: 'REDEEM', status: 'OPEN',
          price_idr_per_usdt: 16250, crypto_amount: 25, fiat_amount: 406250,
          remaining_crypto_amount: 25, remaining_fiat_amount: 406250,
          destination_bank_name: 'Mandiri', destination_bank_account: '9876543210', destination_bank_holder: 'Ani Wijaya',
          expires_at: twoHours,
        },
      ],
    });
    console.log('[SEED] Sample orders inserted');
  }

  console.log('[SEED] done');
  process.exit(0);
}

seed().catch((e) => { console.error(e); process.exit(1); });
