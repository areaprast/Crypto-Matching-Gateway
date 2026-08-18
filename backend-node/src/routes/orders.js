const express = require('express');
const { z } = require('zod');
const { query, tx } = require('../db');
const { requireJWT } = require('../middleware/auth');
const { runMatchingForOrder } = require('../engine/matching');

const router = express.Router();
router.use(requireJWT);

const createSchema = z.object({
  side: z.enum(['TOPUP', 'REDEEM']),
  price_idr_per_usdt: z.coerce.number().positive(),
  crypto_amount: z.coerce.number().positive(),
  destination_wallet: z.string().optional().nullable(),
  destination_bank_name: z.string().optional().nullable(),
  destination_bank_account: z.string().optional().nullable(),
  destination_bank_holder: z.string().optional().nullable(),
  expires_minutes: z.coerce.number().int().positive().optional().default(60),
});

// Public order-book snapshot (both sides) — for dashboard view.
router.get('/book', async (req, res) => {
  const { rows: topup } = await query(
    `SELECT o.*, m.name AS merchant_name, m.code AS merchant_code
     FROM orders o JOIN merchants m ON m.id = o.merchant_id
     WHERE o.side = 'TOPUP' AND o.status IN ('OPEN','PARTIALLY_MATCHED','MATCHING')
     ORDER BY o.price_idr_per_usdt DESC, o.created_at ASC LIMIT 100`
  );
  const { rows: redeem } = await query(
    `SELECT o.*, m.name AS merchant_name, m.code AS merchant_code
     FROM orders o JOIN merchants m ON m.id = o.merchant_id
     WHERE o.side = 'REDEEM' AND o.status IN ('OPEN','PARTIALLY_MATCHED','MATCHING')
     ORDER BY o.price_idr_per_usdt ASC, o.created_at ASC LIMIT 100`
  );
  res.json({ topup, redeem });
});

// List merchant's own orders.
router.get('/', async (req, res) => {
  const { status, side, limit = 50 } = req.query;
  const conditions = ['merchant_id = $1'];
  const params = [req.merchant.id];
  if (status) { params.push(status); conditions.push(`status = $${params.length}`); }
  if (side)   { params.push(side);   conditions.push(`side = $${params.length}`); }
  params.push(Number(limit));
  const { rows } = await query(
    `SELECT * FROM orders WHERE ${conditions.join(' AND ')}
     ORDER BY created_at DESC LIMIT $${params.length}`,
    params
  );
  res.json({ orders: rows });
});

router.get('/:id', async (req, res) => {
  const { rows } = await query(
    `SELECT * FROM orders WHERE id = $1 AND merchant_id = $2`,
    [req.params.id, req.merchant.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'not found' });
  res.json({ order: rows[0] });
});

// Create order.
router.post('/', async (req, res) => {
  const parse = createSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });
  const d = parse.data;

  // Enforce side ↔ merchant type rules.
  if (d.side === 'TOPUP' && req.merchant.type !== 'FIAT') {
    return res.status(403).json({ error: 'only FIAT merchants can create TOPUP orders' });
  }
  if (d.side === 'REDEEM' && req.merchant.type !== 'CRYPTO') {
    return res.status(403).json({ error: 'only CRYPTO merchants can create REDEEM orders' });
  }
  if (d.side === 'TOPUP' && !d.destination_wallet) {
    return res.status(400).json({ error: 'destination_wallet required for TOPUP' });
  }
  if (d.side === 'REDEEM' && (!d.destination_bank_name || !d.destination_bank_account || !d.destination_bank_holder)) {
    return res.status(400).json({ error: 'destination_bank_* required for REDEEM' });
  }

  const fiatAmount = +(d.crypto_amount * d.price_idr_per_usdt).toFixed(2);

  const { rows } = await query(
    `INSERT INTO orders
      (merchant_id, side, status, price_idr_per_usdt, crypto_amount, fiat_amount,
       remaining_crypto_amount, remaining_fiat_amount,
       destination_wallet, destination_bank_name, destination_bank_account, destination_bank_holder,
       expires_at)
     VALUES ($1,$2,'OPEN',$3,$4,$5,$4,$5,$6,$7,$8,$9, NOW() + ($10 || ' minutes')::interval)
     RETURNING *`,
    [
      req.merchant.id, d.side, d.price_idr_per_usdt, d.crypto_amount, fiatAmount,
      d.destination_wallet || null, d.destination_bank_name || null,
      d.destination_bank_account || null, d.destination_bank_holder || null,
      String(d.expires_minutes),
    ]
  );
  const order = rows[0];

  // Trigger matching engine.
  const matches = await runMatchingForOrder(order.id);

  // Reload updated order.
  const { rows: [updated] } = await query(`SELECT * FROM orders WHERE id = $1`, [order.id]);
  res.status(201).json({ order: updated, matches: matches.map((m) => m.match) });
});

router.post('/:id/cancel', async (req, res) => {
  const { rows } = await query(
    `UPDATE orders SET status = 'CANCELLED', updated_at = NOW()
     WHERE id = $1 AND merchant_id = $2 AND status IN ('OPEN','PARTIALLY_MATCHED')
     RETURNING *`,
    [req.params.id, req.merchant.id]
  );
  if (!rows[0]) return res.status(400).json({ error: 'order cannot be cancelled' });
  res.json({ order: rows[0] });
});

module.exports = router;
