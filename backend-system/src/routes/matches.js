const express = require('express');
const { query, tx } = require('../db');
const { requireJWT } = require('../middleware/auth');
const { sendUsdt } = require('../crypto-client');
const { fanout } = require('../webhooks');
const env = require('../config');

const router = express.Router();
router.use(requireJWT);

// List matches involving this merchant (via either topup or redeem side).
router.get('/', async (req, res) => {
  const { rows } = await query(
    `SELECT DISTINCT m.*
     FROM matches m
     JOIN match_items mi ON mi.match_id = m.id
     JOIN orders o1 ON o1.id = mi.topup_order_id
     JOIN orders o2 ON o2.id = mi.redeem_order_id
     WHERE o1.merchant_id = $1 OR o2.merchant_id = $1
     ORDER BY m.created_at DESC LIMIT 100`,
    [req.merchant.id]
  );
  res.json({ matches: rows });
});

router.get('/:id', async (req, res) => {
  const { rows: [match] } = await query(`SELECT * FROM matches WHERE id = $1`, [req.params.id]);
  if (!match) return res.status(404).json({ error: 'not found' });
  const { rows: items } = await query(
    `SELECT mi.*,
        o1.merchant_id AS topup_merchant_id, o1.destination_wallet, o1.price_idr_per_usdt AS topup_price,
        o2.merchant_id AS redeem_merchant_id, o2.destination_bank_name, o2.destination_bank_account, o2.destination_bank_holder,
        mf.name AS topup_merchant_name, mc.name AS redeem_merchant_name
     FROM match_items mi
     JOIN orders o1 ON o1.id = mi.topup_order_id
     JOIN orders o2 ON o2.id = mi.redeem_order_id
     JOIN merchants mf ON mf.id = o1.merchant_id
     JOIN merchants mc ON mc.id = o2.merchant_id
     WHERE mi.match_id = $1`,
    [match.id]
  );
  const { rows: txs } = await query(
    `SELECT * FROM transactions WHERE match_id = $1 ORDER BY created_at ASC`,
    [match.id]
  );
  res.json({ match, items, transactions: txs });
});

/**
 * Crypto Merchant confirms escrow deposit for a match item.
 * In MVP this simulates the on-chain deposit and records a transaction.
 */
router.post('/:id/escrow', async (req, res) => {
  const { item_id, from_address } = req.body || {};
  if (!item_id) return res.status(400).json({ error: 'item_id required' });

  await tx(async (client) => {
    const { rows: [item] } = await client.query(
      `SELECT mi.*, o2.merchant_id AS redeem_merchant_id
       FROM match_items mi JOIN orders o2 ON o2.id = mi.redeem_order_id
       WHERE mi.id = $1 AND mi.match_id = $2 FOR UPDATE`,
      [item_id, req.params.id]
    );
    if (!item) throw Object.assign(new Error('match item not found'), { statusCode: 404 });
    if (item.redeem_merchant_id !== req.merchant.id) {
      throw Object.assign(new Error('only the crypto merchant can escrow'), { statusCode: 403 });
    }
    if (item.status !== 'PENDING') {
      throw Object.assign(new Error(`item already ${item.status}`), { statusCode: 400 });
    }

    // Resolve hot wallet.
    const { rows: [hot] } = await client.query(
      `SELECT * FROM crypto_wallets WHERE purpose = 'HOT_ESCROW' LIMIT 1`
    );

    await client.query(`UPDATE match_items SET status = 'ESCROWED' WHERE id = $1`, [item.id]);

    // Record deposit transaction (simulated txid).
    const simulatedTxid = require('crypto').randomBytes(32).toString('hex');
    await client.query(
      `INSERT INTO transactions (match_id, match_item_id, direction, network, asset,
         from_address, to_address, amount, txid, status, confirmed_at)
       VALUES ($1,$2,'DEPOSIT','TRON-NILE','USDT',$3,$4,$5,$6,'CONFIRMED', NOW())`,
      [
        req.params.id, item.id,
        from_address || null, hot ? hot.address : null,
        item.crypto_amount, simulatedTxid,
      ]
    );

    // Update match header status if all items escrowed.
    await client.query(
      `UPDATE matches SET status = 'AWAITING_FIAT', updated_at = NOW()
       WHERE id = $1
         AND NOT EXISTS (SELECT 1 FROM match_items WHERE match_id = $1 AND status = 'PENDING')`,
      [req.params.id]
    );
  }).then(
    async () => {
      // Fire escrowed webhook to both parties.
      const { rows: [ctx] } = await query(
        `SELECT o1.merchant_id AS topup_mid, o2.merchant_id AS redeem_mid,
                mi.crypto_amount, mi.fiat_amount, mi.status, m.reference
         FROM match_items mi
         JOIN matches m ON m.id = mi.match_id
         JOIN orders o1 ON o1.id = mi.topup_order_id
         JOIN orders o2 ON o2.id = mi.redeem_order_id
         WHERE mi.id = $1`,
        [item_id]
      );
      if (ctx) {
        fanout([ctx.topup_mid, ctx.redeem_mid], 'match.escrowed', {
          match_id: req.params.id, item_id, reference: ctx.reference,
          crypto_amount: ctx.crypto_amount, fiat_amount: ctx.fiat_amount,
        }).catch(() => {});
      }
      res.json({ ok: true });
    },
    (e) => res.status(e.statusCode || 500).json({ error: e.message })
  );
});

/**
 * Crypto Merchant confirms IDR received (mock).
 * When confirmed → release crypto from Hot Wallet to Fiat Merchant's user wallet.
 */
router.post('/:id/confirm-fiat', async (req, res) => {
  const { item_id } = req.body || {};
  if (!item_id) return res.status(400).json({ error: 'item_id required' });

  try {
    const release = await tx(async (client) => {
      const { rows: [item] } = await client.query(
        `SELECT mi.*,
            o1.destination_wallet AS topup_wallet,
            o2.merchant_id AS redeem_merchant_id
         FROM match_items mi
         JOIN orders o1 ON o1.id = mi.topup_order_id
         JOIN orders o2 ON o2.id = mi.redeem_order_id
         WHERE mi.id = $1 AND mi.match_id = $2 FOR UPDATE`,
        [item_id, req.params.id]
      );
      if (!item) throw Object.assign(new Error('match item not found'), { statusCode: 404 });
      if (item.redeem_merchant_id !== req.merchant.id) {
        throw Object.assign(new Error('only the crypto merchant confirms IDR'), { statusCode: 403 });
      }
      if (item.status !== 'ESCROWED') {
        throw Object.assign(new Error(`item is ${item.status}, expected ESCROWED`), { statusCode: 400 });
      }
      const { rows: [hot] } = await client.query(
        `SELECT * FROM crypto_wallets WHERE purpose = 'HOT_ESCROW' LIMIT 1`
      );
      if (!hot) throw Object.assign(new Error('hot wallet not configured'), { statusCode: 500 });

      // Compute platform fee.
      const feeBps = env.PLATFORM_FEE_BPS;
      const gross = Number(item.crypto_amount);
      const fee = +(gross * feeBps / 10000).toFixed(6);
      const net = +(gross - fee).toFixed(6);

      await client.query(`UPDATE match_items SET status = 'FIAT_PAID' WHERE id = $1`, [item.id]);
      return { item, hot, net, fee, topupWallet: item.topup_wallet };
    });

    // Release USDT via backend-crypto service.
    const send = await sendUsdt({
      toAddress: release.topupWallet,
      amount: release.net,
      simulate: true,
    });

    await tx(async (client) => {
      await client.query(
        `INSERT INTO transactions (match_id, match_item_id, direction, network, asset,
           from_address, to_address, amount, txid, status, confirmed_at)
         VALUES ($1,$2,'RELEASE','TRON-NILE','USDT',$3,$4,$5,$6,'CONFIRMED', NOW())`,
        [
          req.params.id, release.item.id, release.hot.address,
          release.topupWallet, release.net, send.txid,
        ]
      );
      await client.query(
        `UPDATE match_items SET status = 'RELEASED' WHERE id = $1`,
        [release.item.id]
      );
      await client.query(
        `UPDATE matches SET
           platform_fee_crypto = COALESCE(platform_fee_crypto,0) + $2,
           status = CASE WHEN NOT EXISTS (
             SELECT 1 FROM match_items WHERE match_id = $1 AND status <> 'RELEASED'
           ) THEN 'RELEASED' ELSE status END,
           updated_at = NOW()
         WHERE id = $1`,
        [req.params.id, release.fee]
      );
      // Mark orders complete if all remaining_crypto_amount = 0.
      await client.query(
        `UPDATE orders SET status = 'COMPLETED'
         WHERE id IN ($1,$2) AND remaining_crypto_amount <= 0`,
        [release.item.topup_order_id, release.item.redeem_order_id]
      );
    });

    res.json({ ok: true, txid: send.txid, released_amount: release.net, platform_fee: release.fee });

    // Fire released webhook to both parties.
    const { rows: [ctx] } = await query(
      `SELECT o1.merchant_id AS topup_mid, o2.merchant_id AS redeem_mid, m.reference
       FROM match_items mi
       JOIN matches m ON m.id = mi.match_id
       JOIN orders o1 ON o1.id = mi.topup_order_id
       JOIN orders o2 ON o2.id = mi.redeem_order_id
       WHERE mi.id = $1`,
      [item_id]
    );
    if (ctx) {
      fanout([ctx.topup_mid, ctx.redeem_mid], 'match.released', {
        match_id: req.params.id, item_id, reference: ctx.reference,
        released_amount: release.net, platform_fee: release.fee, txid: send.txid,
        destination_wallet: release.topupWallet,
      }).catch(() => {});
    }
  } catch (e) {
    res.status(e.statusCode || 500).json({ error: e.message });
  }
});

module.exports = router;
