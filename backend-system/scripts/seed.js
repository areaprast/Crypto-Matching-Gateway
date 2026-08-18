/**
 * Seed default demo data:
 *  - 1 Fiat Merchant + 1 Crypto Merchant
 *  - Initial API keys per merchant
 *  - Sample orders (bi-directional)
 */
require('dotenv').config();
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { query, pool } = require('../src/db');

async function seed() {
  console.log('[SEED] starting...');

  // Ensure schema.
  const fs = require('fs');
  const path = require('path');
  const sql = fs.readFileSync(path.join(__dirname, '..', 'src', 'migrations.sql'), 'utf8');
  await pool.query(sql);

  const fiatPass = await bcrypt.hash('fiat123456', 10);
  const cryptoPass = await bcrypt.hash('crypto123456', 10);
  const adminPass = await bcrypt.hash('admin123456', 10);

  await query(
    `INSERT INTO admins (email, name, password_hash)
     VALUES ('admin@demo.com','Platform Admin',$1)
     ON CONFLICT (email) DO NOTHING`, [adminPass]
  );

  await query(
    `INSERT INTO merchants (code, name, type, email, password_hash)
     VALUES ('DEMO_FIAT','Demo Fiat Gateway','FIAT','fiat@demo.com',$1)
     ON CONFLICT (code) DO NOTHING`,
    [fiatPass]
  );
  await query(
    `INSERT INTO merchants (code, name, type, email, password_hash)
     VALUES ('DEMO_CRYPTO','Demo Crypto Desk','CRYPTO','crypto@demo.com',$1)
     ON CONFLICT (code) DO NOTHING`,
    [cryptoPass]
  );

  const { rows: [fiat] } = await query(`SELECT * FROM merchants WHERE code = 'DEMO_FIAT'`);
  const { rows: [cryptoM] } = await query(`SELECT * FROM merchants WHERE code = 'DEMO_CRYPTO'`);

  // API keys.
  for (const m of [fiat, cryptoM]) {
    const { rows: existing } = await query(`SELECT id FROM merchant_apikeys WHERE merchant_id = $1`, [m.id]);
    if (existing.length > 0) continue;
    const rawKey = 'pk_demo_' + crypto.randomBytes(12).toString('hex');
    const rawSecret = 'sk_demo_' + crypto.randomBytes(16).toString('hex');
    await query(
      `INSERT INTO merchant_apikeys (merchant_id, label, api_key, api_key_hash, secret_hash, ip_whitelist)
       VALUES ($1,'Primary Demo Key',$2,$3,$4,'{}'::text[])`,
      [m.id, rawKey, await bcrypt.hash(rawKey, 10), await bcrypt.hash(rawSecret, 10)]
    );
    console.log(`[SEED] API key for ${m.code}: ${rawKey}  secret=${rawSecret}`);
  }

  // Sample bi-directional orders (only if order book empty).
  const { rows: [{ c: orderCount }] } = await query(`SELECT COUNT(*)::INT AS c FROM orders`);
  if (Number(orderCount) === 0) {
    await query(
      `INSERT INTO orders (merchant_id, side, status, price_idr_per_usdt, crypto_amount, fiat_amount,
                           remaining_crypto_amount, remaining_fiat_amount,
                           destination_wallet, expires_at)
       VALUES ($1,'TOPUP','OPEN',16250,50,812500,50,812500,'TXYZuserFiatDemoWalletAddress0001', NOW() + INTERVAL '2 hours')`,
      [fiat.id]
    );
    await query(
      `INSERT INTO orders (merchant_id, side, status, price_idr_per_usdt, crypto_amount, fiat_amount,
                           remaining_crypto_amount, remaining_fiat_amount,
                           destination_bank_name, destination_bank_account, destination_bank_holder, expires_at)
       VALUES ($1,'REDEEM','OPEN',16200,30,486000,30,486000,'BCA','1234567890','Budi Santoso', NOW() + INTERVAL '2 hours'),
              ($1,'REDEEM','OPEN',16250,25,406250,25,406250,'Mandiri','9876543210','Ani Wijaya',   NOW() + INTERVAL '2 hours')`,
      [cryptoM.id]
    );
    console.log('[SEED] Sample orders inserted');
  }

  console.log('[SEED] done');
  process.exit(0);
}

seed().catch((e) => { console.error(e); process.exit(1); });
