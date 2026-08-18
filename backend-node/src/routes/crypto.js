const express = require('express');
const { query } = require('../db');
const { requireJWT } = require('../middleware/auth');
const { generateWallet, fetchUsdtBalance } = require('../tron');
const env = require('../config');

const router = express.Router();

// Public: get system hot wallet (address only).
router.get('/hot-wallet', async (req, res) => {
  const { rows } = await query(
    `SELECT id, address, network, balance_cache, created_at
     FROM crypto_wallets WHERE purpose = 'HOT_ESCROW' LIMIT 1`
  );
  res.json({ wallet: rows[0] || null, network: env.TRON_NETWORK, contract: env.USDT_CONTRACT });
});

// Admin/JWT: refresh balance from chain.
router.post('/hot-wallet/refresh', requireJWT, async (req, res) => {
  const { rows: [hot] } = await query(
    `SELECT * FROM crypto_wallets WHERE purpose = 'HOT_ESCROW' LIMIT 1`
  );
  if (!hot) return res.status(404).json({ error: 'no hot wallet' });
  const bal = await fetchUsdtBalance(hot.address);
  if (bal !== null) {
    await query(`UPDATE crypto_wallets SET balance_cache = $2 WHERE id = $1`, [hot.id, bal]);
  }
  res.json({ address: hot.address, usdt_balance: bal, cached: bal === null });
});

// Simulate on-chain deposit — for demo without waiting confirmations.
router.post('/simulate-deposit', requireJWT, async (req, res) => {
  const { match_id, item_id, from_address } = req.body || {};
  if (!match_id || !item_id) return res.status(400).json({ error: 'match_id + item_id required' });
  // Delegates logic to /matches/:id/escrow but we allow direct simulation.
  res.json({ ok: true, note: 'Use POST /api/matches/:id/escrow to escrow this item.' });
});

// Init hot wallet (only if missing).
router.post('/hot-wallet/init', requireJWT, async (req, res) => {
  const existing = await query(`SELECT * FROM crypto_wallets WHERE purpose = 'HOT_ESCROW' LIMIT 1`);
  if (existing.rows[0]) return res.json({ wallet: existing.rows[0], created: false });
  const w = await generateWallet();
  const { rows } = await query(
    `INSERT INTO crypto_wallets (network, address, purpose, encrypted_key, key_iv, key_tag, balance_cache)
     VALUES ($1,$2,'HOT_ESCROW',$3,$4,$5,0)
     RETURNING id, address, network, balance_cache, created_at`,
    ['TRON-NILE', w.address, w.encrypted_key, w.key_iv, w.key_tag]
  );
  res.status(201).json({ wallet: rows[0], created: true });
});

module.exports = router;
