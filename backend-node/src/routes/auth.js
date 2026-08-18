const express = require('express');
const bcrypt = require('bcrypt');
const { z } = require('zod');
const { query } = require('../db');
const { signSession } = require('../middleware/auth');

const router = express.Router();

const registerSchema = z.object({
  code: z.string().min(3).max(32).regex(/^[A-Z0-9_-]+$/i),
  name: z.string().min(2).max(120),
  type: z.enum(['FIAT', 'CRYPTO']),
  email: z.string().email(),
  password: z.string().min(6),
  webhook_url: z.string().url().optional().or(z.literal('').transform(() => undefined)),
});

router.post('/register', async (req, res) => {
  const parse = registerSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });
  const { code, name, type, email, password, webhook_url } = parse.data;
  const hash = await bcrypt.hash(password, 10);
  try {
    const { rows } = await query(
      `INSERT INTO merchants (code, name, type, email, password_hash, webhook_url)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING id, code, name, type, email, webhook_url, status, created_at`,
      [code.toUpperCase(), name, type, email.toLowerCase(), hash, webhook_url || null]
    );
    const token = signSession(rows[0]);
    res.status(201).json({ merchant: rows[0], token });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'code or email already registered' });
    console.error(e);
    res.status(500).json({ error: 'internal error' });
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });
  const { rows } = await query(
    `SELECT * FROM merchants WHERE email = $1`,
    [String(email).toLowerCase()]
  );
  if (!rows[0]) return res.status(401).json({ error: 'invalid credentials' });
  const merchant = rows[0];
  const ok = await bcrypt.compare(password, merchant.password_hash);
  if (!ok) return res.status(401).json({ error: 'invalid credentials' });
  if (merchant.status !== 'ACTIVE') return res.status(403).json({ error: 'merchant inactive' });
  const token = signSession(merchant);
  res.json({
    merchant: {
      id: merchant.id, code: merchant.code, name: merchant.name,
      type: merchant.type, email: merchant.email, webhook_url: merchant.webhook_url,
    },
    token,
  });
});

module.exports = router;
