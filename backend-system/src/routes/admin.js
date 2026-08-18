/**
 * Admin API — /api/admin/*
 * All routes require admin JWT (role='admin').
 */
const express = require('express');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { z } = require('zod');
const { query } = require('../db');
const { requireAdminJWT, signAdminSession } = require('../middleware/admin');
const { attemptDelivery } = require('../webhooks');

const router = express.Router();

// ---------- Public: admin login ----------
router.post('/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email + password required' });
  const { rows } = await query(`SELECT * FROM admins WHERE email=$1`, [String(email).toLowerCase()]);
  if (!rows[0]) return res.status(401).json({ error: 'invalid credentials' });
  const ok = await bcrypt.compare(password, rows[0].password_hash);
  if (!ok) return res.status(401).json({ error: 'invalid credentials' });
  if (rows[0].status !== 'ACTIVE') return res.status(403).json({ error: 'admin inactive' });
  const token = signAdminSession(rows[0]);
  res.json({
    admin: { id: rows[0].id, email: rows[0].email, name: rows[0].name },
    token,
  });
});

// All routes below require admin token.
router.use(requireAdminJWT);

// ---------- Merchants (list + filter helper) ----------
router.get('/merchants', async (_req, res) => {
  const { rows } = await query(
    `SELECT id, code, name, type, email, webhook_url, status, created_at,
            (SELECT COUNT(*)::INT FROM orders WHERE merchant_id = m.id) AS orders_count
     FROM merchants m ORDER BY created_at DESC`
  );
  res.json({ merchants: rows });
});

router.patch('/merchants/:id/status', async (req, res) => {
  const status = req.body?.status;
  if (!['ACTIVE', 'SUSPENDED'].includes(status)) return res.status(400).json({ error: 'invalid status' });
  const { rows } = await query(
    `UPDATE merchants SET status=$2, updated_at=NOW() WHERE id=$1
     RETURNING id, code, name, status`, [req.params.id, status]
  );
  if (!rows[0]) return res.status(404).json({ error: 'not found' });
  res.json({ merchant: rows[0] });
});

// ---------- Platform-wide stats ----------
router.get('/stats', async (_req, res) => {
  const [merchants, orders, matches, txs, wallets, admins] = await Promise.all([
    query(`SELECT COUNT(*) FILTER (WHERE type='FIAT') AS fiat,
                  COUNT(*) FILTER (WHERE type='CRYPTO') AS crypto,
                  COUNT(*) AS total FROM merchants`),
    query(`SELECT COUNT(*) FILTER (WHERE status IN ('OPEN','PARTIALLY_MATCHED','MATCHING')) AS active,
                  COUNT(*) FILTER (WHERE status='COMPLETED') AS completed,
                  COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') AS last_24h,
                  COUNT(*) AS total FROM orders`),
    query(`SELECT COUNT(*) AS total,
                  COUNT(*) FILTER (WHERE status='RELEASED') AS released,
                  COALESCE(SUM(total_crypto_amount) FILTER (WHERE status='RELEASED'),0) AS volume_crypto,
                  COALESCE(SUM(total_fiat_amount)   FILTER (WHERE status='RELEASED'),0) AS volume_fiat,
                  COALESCE(SUM(platform_fee_crypto),0) AS platform_fee
             FROM matches`),
    query(`SELECT COUNT(*) FILTER (WHERE direction='DEPOSIT') AS deposits,
                  COUNT(*) FILTER (WHERE direction='RELEASE') AS releases
             FROM transactions`),
    query(`SELECT COUNT(*) AS hot_wallets,
                  COALESCE(SUM(balance_cache),0) AS total_balance
             FROM crypto_wallets WHERE purpose='HOT_ESCROW'`),
    query(`SELECT COUNT(*)::INT AS c FROM admins`),
  ]);
  res.json({
    merchants: merchants.rows[0],
    orders: orders.rows[0],
    matches: matches.rows[0],
    transactions: txs.rows[0],
    wallets: wallets.rows[0],
    admins_count: admins.rows[0].c,
  });
});

// ---------- Orders (all merchants, optional filter) ----------
router.get('/orders', async (req, res) => {
  const { merchant_id, status, side, limit = 200 } = req.query;
  const cond = ['1=1']; const p = [];
  if (merchant_id) { p.push(merchant_id); cond.push(`o.merchant_id = $${p.length}`); }
  if (status) { p.push(status); cond.push(`o.status = $${p.length}`); }
  if (side) { p.push(side); cond.push(`o.side = $${p.length}`); }
  p.push(Number(limit));
  const { rows } = await query(
    `SELECT o.*, m.name AS merchant_name, m.code AS merchant_code, m.type AS merchant_type
       FROM orders o JOIN merchants m ON m.id = o.merchant_id
      WHERE ${cond.join(' AND ')}
      ORDER BY o.created_at DESC LIMIT $${p.length}`, p
  );
  res.json({ orders: rows });
});

// ---------- Matches (with filter) ----------
router.get('/matches', async (req, res) => {
  const { merchant_id, status, limit = 200 } = req.query;
  const cond = ['1=1']; const p = [];
  if (merchant_id) { p.push(merchant_id); cond.push(`(o1.merchant_id=$${p.length} OR o2.merchant_id=$${p.length})`); }
  if (status) { p.push(status); cond.push(`m.status=$${p.length}`); }
  p.push(Number(limit));
  const { rows } = await query(
    `SELECT DISTINCT m.*,
            mf.name AS topup_merchant_name, mc.name AS redeem_merchant_name,
            mf.code AS topup_merchant_code, mc.code AS redeem_merchant_code
       FROM matches m
       JOIN match_items mi ON mi.match_id = m.id
       JOIN orders o1 ON o1.id = mi.topup_order_id
       JOIN orders o2 ON o2.id = mi.redeem_order_id
       JOIN merchants mf ON mf.id = o1.merchant_id
       JOIN merchants mc ON mc.id = o2.merchant_id
      WHERE ${cond.join(' AND ')}
      ORDER BY m.created_at DESC LIMIT $${p.length}`, p
  );
  res.json({ matches: rows });
});

router.get('/matches/:id', async (req, res) => {
  const { rows: [match] } = await query(`SELECT * FROM matches WHERE id=$1`, [req.params.id]);
  if (!match) return res.status(404).json({ error: 'not found' });
  const { rows: items } = await query(
    `SELECT mi.*,
        o1.merchant_id AS topup_merchant_id, o1.destination_wallet,
        o2.merchant_id AS redeem_merchant_id, o2.destination_bank_name, o2.destination_bank_account, o2.destination_bank_holder,
        mf.name AS topup_merchant_name, mc.name AS redeem_merchant_name,
        mf.code AS topup_merchant_code, mc.code AS redeem_merchant_code
     FROM match_items mi
     JOIN orders o1 ON o1.id = mi.topup_order_id
     JOIN orders o2 ON o2.id = mi.redeem_order_id
     JOIN merchants mf ON mf.id = o1.merchant_id
     JOIN merchants mc ON mc.id = o2.merchant_id
     WHERE mi.match_id = $1`, [match.id]
  );
  const { rows: txs } = await query(
    `SELECT * FROM transactions WHERE match_id = $1 ORDER BY created_at ASC`, [match.id]
  );
  res.json({ match, items, transactions: txs });
});

// ---------- Transactions ledger ----------
router.get('/transactions', async (req, res) => {
  const { merchant_id, direction, status, limit = 500 } = req.query;
  const cond = ['1=1']; const p = [];
  if (merchant_id) {
    p.push(merchant_id);
    cond.push(`(o1.merchant_id=$${p.length} OR o2.merchant_id=$${p.length})`);
  }
  if (direction) { p.push(direction); cond.push(`t.direction=$${p.length}`); }
  if (status) { p.push(status); cond.push(`t.status=$${p.length}`); }
  p.push(Number(limit));
  const { rows } = await query(
    `SELECT t.*,
            mf.name AS topup_merchant_name, mc.name AS redeem_merchant_name
       FROM transactions t
       LEFT JOIN match_items mi ON mi.id = t.match_item_id
       LEFT JOIN orders o1 ON o1.id = mi.topup_order_id
       LEFT JOIN orders o2 ON o2.id = mi.redeem_order_id
       LEFT JOIN merchants mf ON mf.id = o1.merchant_id
       LEFT JOIN merchants mc ON mc.id = o2.merchant_id
      WHERE ${cond.join(' AND ')}
      ORDER BY t.created_at DESC LIMIT $${p.length}`, p
  );
  res.json({ transactions: rows });
});

// ---------- Settlements ----------
router.get('/settlements', async (req, res) => {
  const { merchant_id, limit = 100 } = req.query;
  const cond = ['1=1']; const p = [];
  if (merchant_id) { p.push(merchant_id); cond.push(`s.merchant_id=$${p.length}`); }
  p.push(Number(limit));
  const { rows } = await query(
    `SELECT s.*, m.name AS merchant_name, m.code AS merchant_code
       FROM settlements s JOIN merchants m ON m.id = s.merchant_id
      WHERE ${cond.join(' AND ')}
      ORDER BY s.period_end DESC LIMIT $${p.length}`, p
  );
  res.json({ settlements: rows });
});

// ================================================
// CRUD: Hot Wallets
// ================================================
router.get('/wallets', async (_req, res) => {
  const { rows } = await query(
    `SELECT w.id, w.network, w.address, w.purpose, w.balance_cache, w.created_at,
            m.name AS merchant_name, m.code AS merchant_code
       FROM crypto_wallets w
       LEFT JOIN merchants m ON m.id = w.merchant_id
       ORDER BY w.created_at DESC`
  );
  res.json({ wallets: rows });
});

router.delete('/wallets/:id', async (req, res) => {
  const { rows } = await query(
    `DELETE FROM crypto_wallets WHERE id=$1 AND purpose <> 'HOT_ESCROW' RETURNING id`,
    [req.params.id]
  );
  if (!rows[0]) return res.status(400).json({ error: 'wallet not found or is protected hot escrow' });
  res.json({ ok: true });
});

router.patch('/wallets/:id/balance', async (req, res) => {
  const bal = Number(req.body?.balance_cache);
  if (Number.isNaN(bal)) return res.status(400).json({ error: 'balance_cache number required' });
  const { rows } = await query(
    `UPDATE crypto_wallets SET balance_cache=$2 WHERE id=$1 RETURNING id, address, balance_cache`,
    [req.params.id, bal]
  );
  if (!rows[0]) return res.status(404).json({ error: 'not found' });
  res.json({ wallet: rows[0] });
});

// ================================================
// CRUD: API Keys (across all merchants)
// ================================================
router.get('/apikeys', async (req, res) => {
  const { merchant_id } = req.query;
  const cond = ['1=1']; const p = [];
  if (merchant_id) { p.push(merchant_id); cond.push(`k.merchant_id=$${p.length}`); }
  const { rows } = await query(
    `SELECT k.id, k.label, k.api_key, k.ip_whitelist, k.active, k.last_used_at, k.created_at,
            m.id AS merchant_id, m.code AS merchant_code, m.name AS merchant_name
       FROM merchant_apikeys k JOIN merchants m ON m.id = k.merchant_id
      WHERE ${cond.join(' AND ')}
      ORDER BY k.created_at DESC`, p
  );
  res.json({ apikeys: rows });
});

const apikeyCreateSchema = z.object({
  merchant_id: z.string().uuid(),
  label: z.string().min(2).max(60),
  ip_whitelist: z.array(z.string()).optional().default([]),
});
router.post('/apikeys', async (req, res) => {
  const parse = apikeyCreateSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });
  const { merchant_id, label, ip_whitelist } = parse.data;
  const rawKey = 'pk_' + crypto.randomBytes(20).toString('hex');
  const rawSecret = 'sk_' + crypto.randomBytes(28).toString('hex');
  const { rows } = await query(
    `INSERT INTO merchant_apikeys (merchant_id, label, api_key, api_key_hash, secret_hash, ip_whitelist)
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING id, label, api_key, ip_whitelist, active, created_at`,
    [merchant_id, label, rawKey, await bcrypt.hash(rawKey, 10), await bcrypt.hash(rawSecret, 10), ip_whitelist]
  );
  res.status(201).json({
    apikey: rows[0],
    credentials: { api_key: rawKey, api_secret: rawSecret, note: 'Save the secret now — it will not be shown again.' },
  });
});

router.patch('/apikeys/:id', async (req, res) => {
  const { active, ip_whitelist } = req.body || {};
  const { rows } = await query(
    `UPDATE merchant_apikeys SET
        active = COALESCE($2, active),
        ip_whitelist = COALESCE($3, ip_whitelist)
     WHERE id=$1
     RETURNING id, label, active, ip_whitelist`,
    [req.params.id, active, ip_whitelist]
  );
  if (!rows[0]) return res.status(404).json({ error: 'not found' });
  res.json({ apikey: rows[0] });
});

router.delete('/apikeys/:id', async (req, res) => {
  const { rows } = await query(`DELETE FROM merchant_apikeys WHERE id=$1 RETURNING id`, [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'not found' });
  res.json({ ok: true });
});

// ================================================
// CRUD: Webhooks (per merchant)
// ================================================
router.get('/webhooks', async (_req, res) => {
  const { rows } = await query(
    `SELECT id, code, name, type, webhook_url,
            (webhook_secret IS NOT NULL) AS has_secret
       FROM merchants ORDER BY code`
  );
  res.json({ merchants: rows });
});

router.put('/webhooks/:merchant_id', async (req, res) => {
  const url = (req.body?.webhook_url || '').trim() || null;
  if (url && !/^https?:\/\//i.test(url)) return res.status(400).json({ error: 'webhook_url must be http(s)' });
  const { rows } = await query(
    `UPDATE merchants SET webhook_url=$2, updated_at=NOW() WHERE id=$1
     RETURNING id, code, webhook_url`,
    [req.params.merchant_id, url]
  );
  if (!rows[0]) return res.status(404).json({ error: 'merchant not found' });
  res.json({ merchant: rows[0] });
});

router.post('/webhooks/:merchant_id/rotate-secret', async (req, res) => {
  const secret = 'whsec_' + crypto.randomBytes(24).toString('hex');
  const { rows } = await query(
    `UPDATE merchants SET webhook_secret=$2, updated_at=NOW() WHERE id=$1
     RETURNING id, code`,
    [req.params.merchant_id, secret]
  );
  if (!rows[0]) return res.status(404).json({ error: 'merchant not found' });
  res.json({ webhook_secret: secret, merchant: rows[0] });
});

router.get('/webhooks/:merchant_id/deliveries', async (req, res) => {
  const { rows } = await query(
    `SELECT id, event_type, event_id, target_url, attempt, max_attempts, status,
            response_status, next_retry_at, delivered_at, created_at, payload
       FROM webhook_deliveries WHERE merchant_id=$1
       ORDER BY created_at DESC LIMIT 200`, [req.params.merchant_id]
  );
  res.json({ deliveries: rows });
});

router.post('/webhooks/deliveries/:id/redeliver', async (req, res) => {
  const { rows: [d] } = await query(`SELECT id FROM webhook_deliveries WHERE id=$1`, [req.params.id]);
  if (!d) return res.status(404).json({ error: 'not found' });
  await query(
    `UPDATE webhook_deliveries SET status='PENDING', attempt=0, next_retry_at=NOW(),
            response_status=NULL, response_body=NULL, delivered_at=NULL
     WHERE id=$1`, [req.params.id]
  );
  attemptDelivery(req.params.id).catch(() => {});
  res.json({ ok: true });
});

module.exports = router;
