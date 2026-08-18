require('dotenv').config();
const { Pool } = require('pg');
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { TronWeb } = require('tronweb');

const env = {
  PORT: Number(process.env.CRYPTO_PORT || 8003),
  DATABASE_URL: process.env.DATABASE_URL,
  WALLET_ENCRYPTION_KEY_HEX: process.env.WALLET_ENCRYPTION_KEY_HEX,
  TRON_NETWORK: process.env.TRON_NETWORK || 'nile',
  TRON_FULL_HOST: process.env.TRON_FULL_HOST || 'https://nile.trongrid.io',
  TRONGRID_API_KEY: process.env.TRONGRID_API_KEY || '',
  USDT_CONTRACT: process.env.USDT_CONTRACT,
  INTERNAL_API_TOKEN: process.env.INTERNAL_API_TOKEN,
};

// ---------- PostgreSQL (shared with backend-system) ----------
const pool = new Pool({ connectionString: env.DATABASE_URL, max: 10 });
pool.on('error', (e) => console.error('[crypto/pg]', e.message));
const query = (t, p) => pool.query(t, p);

// ---------- AES-256-GCM vault for private keys ----------
function getKey() {
  const k = Buffer.from(env.WALLET_ENCRYPTION_KEY_HEX, 'hex');
  if (k.length !== 32) throw new Error('WALLET_ENCRYPTION_KEY_HEX must be 32-byte hex');
  return k;
}
function encryptPk(plain) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const ct = Buffer.concat([c.update(Buffer.from(plain, 'utf8')), c.final()]);
  return { ciphertext: ct.toString('base64'), iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64') };
}
function decryptPk({ ciphertext, iv, tag }) {
  const d = crypto.createDecipheriv('aes-256-gcm', getKey(), Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(ciphertext, 'base64')), d.final()]).toString('utf8');
}

// ---------- TRON helpers ----------
const headers = env.TRONGRID_API_KEY ? { 'TRON-PRO-API-KEY': env.TRONGRID_API_KEY } : undefined;

async function generateWallet() {
  const tw = new TronWeb({ fullHost: env.TRON_FULL_HOST, headers });
  const a = await tw.createAccount();
  const e = encryptPk(a.privateKey);
  return { address: a.address.base58, encrypted_key: e.ciphertext, key_iv: e.iv, key_tag: e.tag };
}

async function fetchUsdtBalance(address) {
  try {
    const tw = new TronWeb({ fullHost: env.TRON_FULL_HOST, headers });
    tw.setAddress(address);
    const contract = await tw.contract().at(env.USDT_CONTRACT);
    const raw = await contract.balanceOf(address).call();
    return Number(raw.toString()) / 1e6;
  } catch (e) {
    console.warn('[crypto] balance fetch failed:', e.message);
    return null;
  }
}

async function sendUsdt({ wallet, toAddress, amount, simulate = true }) {
  if (simulate) {
    return { txid: crypto.randomBytes(32).toString('hex'), simulated: true };
  }
  const privateKey = decryptPk({ ciphertext: wallet.encrypted_key, iv: wallet.key_iv, tag: wallet.key_tag });
  const tw = new TronWeb({ fullHost: env.TRON_FULL_HOST, headers, privateKey });
  const contract = await tw.contract().at(env.USDT_CONTRACT);
  const atomic = String(Math.round(amount * 1e6));
  const txid = await contract.transfer(toAddress, atomic).send({ feeLimit: 100_000_000, callValue: 0 });
  return { txid, simulated: false };
}

async function ensureHotWallet() {
  const { rows } = await query(`SELECT COUNT(*)::INT AS c FROM crypto_wallets WHERE purpose = 'HOT_ESCROW'`);
  if (rows[0].c === 0) {
    const w = await generateWallet();
    await query(
      `INSERT INTO crypto_wallets (network, address, purpose, encrypted_key, key_iv, key_tag, balance_cache)
       VALUES ($1,$2,'HOT_ESCROW',$3,$4,$5,0)`,
      ['TRON-NILE', w.address, w.encrypted_key, w.key_iv, w.key_tag]
    );
    console.log('[BOOT] Hot wallet initialized:', w.address);
  }
}

// ---------- Express ----------
const app = express();
app.use(helmet());
app.use(cors());
app.use(morgan('dev'));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) =>
  res.json({ ok: true, service: 'backend-crypto', network: env.TRON_NETWORK, ts: new Date().toISOString() })
);

// PUBLIC crypto info (called by frontend via FastAPI proxy).
app.get('/api/crypto/hot-wallet', async (_req, res) => {
  const { rows } = await query(
    `SELECT id, address, network, balance_cache, created_at
     FROM crypto_wallets WHERE purpose='HOT_ESCROW' LIMIT 1`
  );
  res.json({ wallet: rows[0] || null, network: env.TRON_NETWORK, contract: env.USDT_CONTRACT });
});

app.post('/api/crypto/hot-wallet/refresh', async (_req, res) => {
  const { rows: [hot] } = await query(`SELECT * FROM crypto_wallets WHERE purpose='HOT_ESCROW' LIMIT 1`);
  if (!hot) return res.status(404).json({ error: 'no hot wallet' });
  const bal = await fetchUsdtBalance(hot.address);
  if (bal !== null) await query(`UPDATE crypto_wallets SET balance_cache=$2 WHERE id=$1`, [hot.id, bal]);
  res.json({ address: hot.address, usdt_balance: bal, cached: bal === null });
});

app.post('/api/crypto/hot-wallet/init', async (_req, res) => {
  const existing = await query(`SELECT * FROM crypto_wallets WHERE purpose='HOT_ESCROW' LIMIT 1`);
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

// INTERNAL — called only by backend-system for release step. Requires shared token.
function requireInternalToken(req, res, next) {
  const t = req.get('x-internal-token');
  if (!t || t !== env.INTERNAL_API_TOKEN) return res.status(401).json({ error: 'invalid internal token' });
  next();
}

app.post('/internal/wallet/generate', requireInternalToken, async (_req, res) => {
  res.json(await generateWallet());
});

// Send USDT — the backend-system calls this when a match is confirmed & released.
app.post('/internal/tron/send-usdt', requireInternalToken, async (req, res) => {
  const { toAddress, amount, simulate } = req.body || {};
  if (!toAddress || !amount) return res.status(400).json({ error: 'toAddress + amount required' });
  const { rows: [hot] } = await query(`SELECT * FROM crypto_wallets WHERE purpose='HOT_ESCROW' LIMIT 1`);
  if (!hot) return res.status(500).json({ error: 'no hot wallet' });
  try {
    const r = await sendUsdt({ wallet: hot, toAddress, amount: Number(amount), simulate: simulate !== false });
    res.json({ ...r, hot_address: hot.address });
  } catch (e) {
    console.error('[crypto] send failed:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'internal error' });
});

(async () => {
  try {
    await ensureHotWallet();
    app.listen(env.PORT, '127.0.0.1', () => {
      console.log(`[BOOT] Backend Crypto listening on 127.0.0.1:${env.PORT}`);
    });
  } catch (e) {
    console.error('[BOOT] failed', e);
    process.exit(1);
  }
})();
