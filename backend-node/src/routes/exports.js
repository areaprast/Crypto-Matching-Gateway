/**
 * Signed monthly ledger export.
 *   GET /api/exports/ledger?year=YYYY&month=MM  (default = current month)
 * Returns text/csv with a signed footer:
 *   # digest_sha256=<hex>
 *   # signature=t=<unix>,v1=<hex(hmac_sha256(webhook_secret, digest_sha256 + "." + t))>
 * Same secret as webhooks, so an auditor can reuse existing verification code.
 */
const express = require('express');
const crypto = require('crypto');
const { query } = require('../db');
const { requireJWT } = require('../middleware/auth');

const router = express.Router();
router.use(requireJWT);

function csvCell(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsvRow(cols) {
  return cols.map(csvCell).join(',');
}

router.get('/ledger', async (req, res) => {
  const now = new Date();
  const year = Number(req.query.year || now.getUTCFullYear());
  const month = Number(req.query.month || now.getUTCMonth() + 1);
  if (!Number.isInteger(year) || year < 2020 || year > 2100)
    return res.status(400).json({ error: 'invalid year' });
  if (!Number.isInteger(month) || month < 1 || month > 12)
    return res.status(400).json({ error: 'invalid month' });

  const periodStart = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
  const periodEnd = new Date(Date.UTC(year, month, 1, 0, 0, 0));

  // Rows are match_item + linked release/deposit tx snapshots for THIS merchant only.
  const { rows } = await query(
    `SELECT
        m.reference, m.status AS match_status,
        mi.id AS item_id, mi.status AS item_status,
        mi.crypto_amount, mi.fiat_amount,
        o1.merchant_id AS topup_mid, o1.destination_wallet,
        o2.merchant_id AS redeem_mid, o2.destination_bank_name, o2.destination_bank_account,
        o1.price_idr_per_usdt AS topup_price,
        m.platform_fee_crypto,
        (SELECT txid FROM transactions
            WHERE match_item_id = mi.id AND direction='DEPOSIT' AND status='CONFIRMED'
            ORDER BY confirmed_at DESC LIMIT 1) AS deposit_txid,
        (SELECT txid FROM transactions
            WHERE match_item_id = mi.id AND direction='RELEASE' AND status='CONFIRMED'
            ORDER BY confirmed_at DESC LIMIT 1) AS release_txid,
        (SELECT amount FROM transactions
            WHERE match_item_id = mi.id AND direction='RELEASE' AND status='CONFIRMED'
            ORDER BY confirmed_at DESC LIMIT 1) AS released_amount,
        m.updated_at AS match_updated_at,
        mi.created_at
     FROM match_items mi
     JOIN matches m ON m.id = mi.match_id
     JOIN orders o1 ON o1.id = mi.topup_order_id
     JOIN orders o2 ON o2.id = mi.redeem_order_id
     WHERE (o1.merchant_id = $1 OR o2.merchant_id = $1)
       AND mi.created_at >= $2 AND mi.created_at < $3
     ORDER BY mi.created_at ASC`,
    [req.merchant.id, periodStart.toISOString(), periodEnd.toISOString()]
  );

  const { rows: [mrow] } = await query(
    `SELECT code, name, type, webhook_secret FROM merchants WHERE id = $1`,
    [req.merchant.id]
  );

  const header = [
    'match_reference', 'match_status',
    'item_id', 'item_status',
    'side_for_merchant',
    'crypto_amount_usdt', 'fiat_amount_idr', 'price_idr_per_usdt',
    'destination_wallet', 'destination_bank_name', 'destination_bank_account',
    'platform_fee_crypto', 'released_amount_usdt',
    'deposit_txid', 'release_txid',
    'item_created_at', 'match_updated_at',
  ];

  const lines = [];
  lines.push(`# P2P Gateway Ledger Export`);
  lines.push(`# merchant_code=${mrow.code}`);
  lines.push(`# merchant_type=${mrow.type}`);
  lines.push(`# period_start=${periodStart.toISOString()}`);
  lines.push(`# period_end=${periodEnd.toISOString()}`);
  lines.push(`# row_count=${rows.length}`);
  lines.push(toCsvRow(header));
  for (const r of rows) {
    const side = r.topup_mid === req.merchant.id ? 'TOPUP' : 'REDEEM';
    lines.push(toCsvRow([
      r.reference, r.match_status, r.item_id, r.item_status, side,
      r.crypto_amount, r.fiat_amount, r.topup_price,
      side === 'TOPUP' ? r.destination_wallet : '',
      side === 'REDEEM' ? r.destination_bank_name : '',
      side === 'REDEEM' ? r.destination_bank_account : '',
      r.platform_fee_crypto ?? '',
      r.released_amount ?? '',
      r.deposit_txid || '',
      r.release_txid || '',
      new Date(r.created_at).toISOString(),
      new Date(r.match_updated_at).toISOString(),
    ]));
  }

  const body = lines.join('\n') + '\n';
  const digest = crypto.createHash('sha256').update(body).digest('hex');
  const ts = Math.floor(Date.now() / 1000);
  const secret = mrow.webhook_secret || '';
  const v1 = crypto.createHmac('sha256', secret).update(`${digest}.${ts}`).digest('hex');
  const footer = `# digest_sha256=${digest}\n# signature=t=${ts},v1=${v1}\n`;

  const filename = `p2p-ledger-${mrow.code}-${year}-${String(month).padStart(2, '0')}.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('X-Export-Digest', digest);
  res.setHeader('X-Export-Signature', `t=${ts},v1=${v1}`);
  res.setHeader('X-Export-Row-Count', String(rows.length));
  res.send(body + footer);
});

// Preview endpoint — returns metadata + first N rows as JSON so the UI can display before download.
router.get('/ledger/preview', async (req, res) => {
  const now = new Date();
  const year = Number(req.query.year || now.getUTCFullYear());
  const month = Number(req.query.month || now.getUTCMonth() + 1);
  const periodStart = new Date(Date.UTC(year, month - 1, 1));
  const periodEnd = new Date(Date.UTC(year, month, 1));
  const { rows } = await query(
    `SELECT COUNT(*)::INT AS c,
            COALESCE(SUM(mi.crypto_amount),0) AS crypto_total,
            COALESCE(SUM(mi.fiat_amount),0)   AS fiat_total
     FROM match_items mi
     JOIN orders o1 ON o1.id = mi.topup_order_id
     JOIN orders o2 ON o2.id = mi.redeem_order_id
     WHERE (o1.merchant_id = $1 OR o2.merchant_id = $1)
       AND mi.created_at >= $2 AND mi.created_at < $3`,
    [req.merchant.id, periodStart.toISOString(), periodEnd.toISOString()]
  );
  res.json({
    year, month,
    period_start: periodStart.toISOString(),
    period_end: periodEnd.toISOString(),
    row_count: rows[0].c,
    crypto_total: rows[0].crypto_total,
    fiat_total: rows[0].fiat_total,
  });
});

module.exports = router;
