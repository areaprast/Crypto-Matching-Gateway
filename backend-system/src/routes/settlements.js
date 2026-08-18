const express = require('express');
const { query, tx } = require('../db');
const { requireJWT } = require('../middleware/auth');

const router = express.Router();
router.use(requireJWT);

router.get('/', async (req, res) => {
  const { rows } = await query(
    `SELECT * FROM settlements WHERE merchant_id = $1 ORDER BY period_end DESC LIMIT 60`,
    [req.merchant.id]
  );
  res.json({ settlements: rows });
});

// Generate a settlement recap for a given time range (defaults to last 7 days).
router.post('/generate', async (req, res) => {
  const now = new Date();
  const start = req.body?.period_start ? new Date(req.body.period_start) : new Date(now.getTime() - 7 * 86400e3);
  const end = req.body?.period_end ? new Date(req.body.period_end) : now;

  const result = await tx(async (client) => {
    const { rows: [agg] } = await client.query(
      `SELECT COUNT(*)::INT AS total_matches,
              COALESCE(SUM(mi.crypto_amount),0) AS gross_crypto,
              COALESCE(SUM(mi.fiat_amount),0)   AS gross_fiat,
              COALESCE(SUM(mi.crypto_amount) * $4 / 10000.0, 0) AS fee_crypto
       FROM match_items mi
       JOIN matches m ON m.id = mi.match_id
       JOIN orders o1 ON o1.id = mi.topup_order_id
       JOIN orders o2 ON o2.id = mi.redeem_order_id
       WHERE (o1.merchant_id = $1 OR o2.merchant_id = $1)
         AND mi.status = 'RELEASED'
         AND m.updated_at BETWEEN $2 AND $3`,
      [req.merchant.id, start, end, Number(process.env.PLATFORM_FEE_BPS || 25)]
    );
    const gross = Number(agg.gross_crypto);
    const fee = Number(agg.fee_crypto);
    const net = +(gross - fee).toFixed(6);
    const { rows: [settlement] } = await client.query(
      `INSERT INTO settlements
        (merchant_id, period_start, period_end, total_matches,
         gross_volume_crypto, gross_volume_fiat, platform_fee_crypto, net_volume_crypto, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'DRAFT') RETURNING *`,
      [req.merchant.id, start, end, agg.total_matches, gross, agg.gross_fiat, fee, net]
    );
    return settlement;
  });
  res.status(201).json({ settlement: result });
});

module.exports = router;
