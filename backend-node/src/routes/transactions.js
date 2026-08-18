const express = require('express');
const { query } = require('../db');
const { requireJWT } = require('../middleware/auth');

const router = express.Router();
router.use(requireJWT);

router.get('/', async (req, res) => {
  const { rows } = await query(
    `SELECT t.*
     FROM transactions t
     JOIN match_items mi ON mi.id = t.match_item_id
     JOIN orders o1 ON o1.id = mi.topup_order_id
     JOIN orders o2 ON o2.id = mi.redeem_order_id
     WHERE o1.merchant_id = $1 OR o2.merchant_id = $1
     ORDER BY t.created_at DESC LIMIT 200`,
    [req.merchant.id]
  );
  res.json({ transactions: rows });
});

module.exports = router;
