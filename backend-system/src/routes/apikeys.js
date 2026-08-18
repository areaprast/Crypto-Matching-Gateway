const express = require('express');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { z } = require('zod');
const { query } = require('../db');
const { requireJWT } = require('../middleware/auth');

const router = express.Router();
router.use(requireJWT);

// List keys (secret & api_key hidden).
router.get('/', async (req, res) => {
  const { rows } = await query(
    `SELECT id, label, api_key, ip_whitelist, active, last_used_at, created_at
     FROM merchant_apikeys WHERE merchant_id = $1 ORDER BY created_at DESC`,
    [req.merchant.id]
  );
  res.json({ apikeys: rows });
});

const createSchema = z.object({
  label: z.string().min(2).max(60),
  ip_whitelist: z.array(z.string()).optional().default([]),
});

// Create key — returns raw api_key + secret exactly once.
router.post('/', async (req, res) => {
  const parse = createSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });
  const rawKey = 'pk_' + crypto.randomBytes(20).toString('hex');
  const rawSecret = 'sk_' + crypto.randomBytes(28).toString('hex');
  const keyHash = await bcrypt.hash(rawKey, 10);
  const secretHash = await bcrypt.hash(rawSecret, 10);
  const { rows } = await query(
    `INSERT INTO merchant_apikeys (merchant_id, label, api_key, api_key_hash, secret_hash, ip_whitelist)
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING id, label, api_key, ip_whitelist, active, created_at`,
    [req.merchant.id, parse.data.label, rawKey, keyHash, secretHash, parse.data.ip_whitelist]
  );
  res.status(201).json({
    apikey: rows[0],
    credentials: {
      api_key: rawKey,
      api_secret: rawSecret,
      note: 'Store the secret securely — it will not be shown again.',
    },
  });
});

router.patch('/:id', async (req, res) => {
  const { active, ip_whitelist } = req.body || {};
  await query(
    `UPDATE merchant_apikeys SET
       active = COALESCE($2, active),
       ip_whitelist = COALESCE($3, ip_whitelist)
     WHERE id = $1 AND merchant_id = $4`,
    [req.params.id, active, ip_whitelist, req.merchant.id]
  );
  res.json({ ok: true });
});

router.delete('/:id', async (req, res) => {
  await query(
    `DELETE FROM merchant_apikeys WHERE id = $1 AND merchant_id = $2`,
    [req.params.id, req.merchant.id]
  );
  res.json({ ok: true });
});

module.exports = router;
