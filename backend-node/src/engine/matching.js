/**
 * Bi-directional matching engine.
 * When a new order is created it tries to match against opposite-side OPEN orders
 * using price/time priority. Supports multi-matching (1-to-many & many-to-1) by
 * splitting remaining amounts through `match_items` rows.
 */
const { query, tx } = require('../db');
const { randomUUID } = require('crypto');

async function runMatchingForOrder(orderId) {
  const created = [];

  await tx(async (client) => {
    const { rows: [order] } = await client.query(
      `SELECT * FROM orders WHERE id = $1 FOR UPDATE`,
      [orderId]
    );
    if (!order) return;
    if (!['OPEN', 'PARTIALLY_MATCHED'].includes(order.status)) return;
    if (Number(order.remaining_crypto_amount) <= 0) return;

    const oppositeSide = order.side === 'TOPUP' ? 'REDEEM' : 'TOPUP';

    // Price rule:
    //   TOPUP (buyer) matches with REDEEM (seller) when buyer.price >= seller.price.
    //   Buyer wants lowest, seller wants highest — sort candidates by price ASC for TOPUP incoming, DESC for REDEEM incoming.
    const priceOp = order.side === 'TOPUP' ? '<=' : '>=';
    const sortDir = order.side === 'TOPUP' ? 'ASC' : 'DESC';

    const { rows: candidates } = await client.query(
      `SELECT * FROM orders
       WHERE side = $1
         AND status IN ('OPEN','PARTIALLY_MATCHED')
         AND remaining_crypto_amount > 0
         AND price_idr_per_usdt ${priceOp} $2
         AND merchant_id <> $3
       ORDER BY price_idr_per_usdt ${sortDir}, created_at ASC
       FOR UPDATE`,
      [oppositeSide, order.price_idr_per_usdt, order.merchant_id]
    );

    let remainingCrypto = Number(order.remaining_crypto_amount);

    for (const cand of candidates) {
      if (remainingCrypto <= 0) break;

      const takeCrypto = Math.min(remainingCrypto, Number(cand.remaining_crypto_amount));
      if (takeCrypto <= 0) continue;

      // Use the resting (existing) order's price as execution price (price-time priority).
      const executionPrice = Number(cand.price_idr_per_usdt);
      const takeFiat = +(takeCrypto * executionPrice).toFixed(2);

      const topupOrder = order.side === 'TOPUP' ? order : cand;
      const redeemOrder = order.side === 'REDEEM' ? order : cand;

      // Create a match header + item.
      const reference = 'MTC-' + Date.now().toString(36).toUpperCase() + '-' + randomUUID().slice(0, 6).toUpperCase();
      const { rows: [matchRow] } = await client.query(
        `INSERT INTO matches (reference, status, total_crypto_amount, total_fiat_amount)
         VALUES ($1, 'AWAITING_ESCROW', $2, $3) RETURNING *`,
        [reference, takeCrypto, takeFiat]
      );
      const { rows: [item] } = await client.query(
        `INSERT INTO match_items (match_id, topup_order_id, redeem_order_id, crypto_amount, fiat_amount, status)
         VALUES ($1,$2,$3,$4,$5,'PENDING') RETURNING *`,
        [matchRow.id, topupOrder.id, redeemOrder.id, takeCrypto, takeFiat]
      );

      // Update remaining on both orders.
      await client.query(
        `UPDATE orders SET
           remaining_crypto_amount = remaining_crypto_amount - $1,
           remaining_fiat_amount   = remaining_fiat_amount   - $2,
           status = CASE
              WHEN remaining_crypto_amount - $1 <= 0 THEN 'MATCHING'
              ELSE 'PARTIALLY_MATCHED'
           END,
           updated_at = NOW()
         WHERE id = $3`,
        [takeCrypto, takeFiat, topupOrder.id]
      );
      await client.query(
        `UPDATE orders SET
           remaining_crypto_amount = remaining_crypto_amount - $1,
           remaining_fiat_amount   = remaining_fiat_amount   - $2,
           status = CASE
              WHEN remaining_crypto_amount - $1 <= 0 THEN 'MATCHING'
              ELSE 'PARTIALLY_MATCHED'
           END,
           updated_at = NOW()
         WHERE id = $3`,
        [takeCrypto, takeFiat, redeemOrder.id]
      );

      remainingCrypto -= takeCrypto;
      created.push({ match: matchRow, item });
    }
  });

  return created;
}

module.exports = { runMatchingForOrder };
