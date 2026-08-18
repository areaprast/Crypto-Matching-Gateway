const express = require('express');
const crypto = require('crypto');
const { query } = require('../db');
const { requireJWT } = require('../middleware/auth');
const { attemptDelivery } = require('../webhooks');

const router = express.Router();
router.use(requireJWT);

// Fetch merchant webhook config (secret revealed only to owner).
router.get('/config', async (req, res) => {
  const { rows: [m] } = await query(
    `SELECT webhook_url, webhook_secret FROM merchants WHERE id = $1`,
    [req.merchant.id]
  );
  res.json({ webhook_url: m?.webhook_url || null, webhook_secret: m?.webhook_secret || null });
});

// Update webhook URL.
router.put('/config', async (req, res) => {
  const url = (req.body?.webhook_url || '').trim() || null;
  if (url && !/^https?:\/\//i.test(url)) return res.status(400).json({ error: 'webhook_url must be http(s)://' });
  await query(`UPDATE merchants SET webhook_url = $2, updated_at = NOW() WHERE id = $1`, [req.merchant.id, url]);
  res.json({ ok: true, webhook_url: url });
});

// Rotate webhook secret.
router.post('/rotate-secret', async (req, res) => {
  const secret = 'whsec_' + crypto.randomBytes(24).toString('hex');
  await query(`UPDATE merchants SET webhook_secret = $2, updated_at = NOW() WHERE id = $1`, [req.merchant.id, secret]);
  res.json({ webhook_secret: secret });
});

// List recent deliveries for this merchant.
router.get('/deliveries', async (req, res) => {
  const { rows } = await query(
    `SELECT id, event_type, event_id, target_url, attempt, max_attempts, status,
            response_status, response_body, next_retry_at, delivered_at, created_at,
            payload
     FROM webhook_deliveries WHERE merchant_id = $1
     ORDER BY created_at DESC LIMIT 100`,
    [req.merchant.id]
  );
  res.json({ deliveries: rows });
});

// Manual redeliver — resets attempt counter and next_retry_at to now.
router.post('/deliveries/:id/redeliver', async (req, res) => {
  const { rows: [d] } = await query(
    `SELECT id FROM webhook_deliveries WHERE id = $1 AND merchant_id = $2`,
    [req.params.id, req.merchant.id]
  );
  if (!d) return res.status(404).json({ error: 'not found' });
  await query(
    `UPDATE webhook_deliveries SET status='PENDING', attempt=0, next_retry_at=NOW(),
            response_status=NULL, response_body=NULL, delivered_at=NULL
     WHERE id = $1`,
    [req.params.id]
  );
  attemptDelivery(req.params.id).catch(() => {});
  res.json({ ok: true });
});

module.exports = router;
