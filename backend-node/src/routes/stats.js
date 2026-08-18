const express = require('express');
const { query } = require('../db');
const { requireJWT } = require('../middleware/auth');
const env = require('../config');

const router = express.Router();
router.use(requireJWT);

// Overview stats for dashboard home.
router.get('/', async (req, res) => {
  const mId = req.merchant.id;
  const [ordersAgg, matchesAgg, txsAgg, hotWallet] = await Promise.all([
    query(
      `SELECT
         COUNT(*) FILTER (WHERE status IN ('OPEN','PARTIALLY_MATCHED','MATCHING')) AS active_orders,
         COUNT(*) FILTER (WHERE status = 'COMPLETED') AS completed_orders,
         COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') AS orders_24h
       FROM orders WHERE merchant_id = $1`,
      [mId]
    ),
    query(
      `SELECT COUNT(DISTINCT m.id) AS total_matches,
              COALESCE(SUM(mi.crypto_amount) FILTER (WHERE m.status = 'RELEASED'), 0) AS volume_crypto,
              COALESCE(SUM(mi.fiat_amount)   FILTER (WHERE m.status = 'RELEASED'), 0) AS volume_fiat,
              COALESCE(SUM(mi.crypto_amount) FILTER (WHERE m.created_at > NOW() - INTERVAL '24 hours' AND m.status = 'RELEASED'), 0) AS volume_crypto_24h
       FROM matches m
       JOIN match_items mi ON mi.match_id = m.id
       JOIN orders o1 ON o1.id = mi.topup_order_id
       JOIN orders o2 ON o2.id = mi.redeem_order_id
       WHERE o1.merchant_id = $1 OR o2.merchant_id = $1`,
      [mId]
    ),
    query(
      `SELECT COUNT(*) FILTER (WHERE t.direction = 'DEPOSIT' AND t.status = 'CONFIRMED') AS deposits,
              COUNT(*) FILTER (WHERE t.direction = 'RELEASE' AND t.status = 'CONFIRMED') AS releases
       FROM transactions t
       JOIN match_items mi ON mi.id = t.match_item_id
       JOIN orders o1 ON o1.id = mi.topup_order_id
       JOIN orders o2 ON o2.id = mi.redeem_order_id
       WHERE o1.merchant_id = $1 OR o2.merchant_id = $1`,
      [mId]
    ),
    query(`SELECT address, balance_cache FROM crypto_wallets WHERE purpose = 'HOT_ESCROW' LIMIT 1`),
  ]);

  res.json({
    orders: ordersAgg.rows[0],
    matches: matchesAgg.rows[0],
    transactions: txsAgg.rows[0],
    hot_wallet: hotWallet.rows[0] || null,
    platform: { network: env.TRON_NETWORK, contract: env.USDT_CONTRACT, fee_bps: env.PLATFORM_FEE_BPS },
  });
});

module.exports = router;
