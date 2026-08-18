const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const fs = require('fs');
const path = require('path');

const env = require('./config');
const { pool, query } = require('./db');

const app = express();
app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: '*', credentials: false }));
app.use(morgan('dev'));
app.use(express.json({ limit: '1mb', verify: (req, _res, buf) => { req.rawBody = buf.toString('utf8'); } }));
app.use(rateLimit({ windowMs: 60_000, max: 240, standardHeaders: true, legacyHeaders: false }));

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'p2p-gateway-node', ts: new Date().toISOString() }));

// Routes.
app.use('/api/auth', require('./routes/auth'));
app.use('/api/apikeys', require('./routes/apikeys'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/matches', require('./routes/matches'));
app.use('/api/transactions', require('./routes/transactions'));
app.use('/api/settlements', require('./routes/settlements'));
app.use('/api/webhooks', require('./routes/webhooks'));
app.use('/api/exports', require('./routes/exports'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/stats', require('./routes/stats'));

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'internal error' });
});

async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, 'migrations.sql'), 'utf8');
  await pool.query(sql);
  console.log('[MIGRATE] schema ready');
}

async function ensureHotWallet() {
  // Hot wallet is owned by backend-crypto. We just verify one exists.
  const { rows } = await query(`SELECT COUNT(*)::INT AS c FROM crypto_wallets WHERE purpose = 'HOT_ESCROW'`);
  if (rows[0].c === 0) {
    console.warn('[BOOT] No hot wallet yet — backend-crypto will provision one on its startup.');
  }
}

(async () => {
  try {
    await migrate();
    await ensureHotWallet();
    require('./webhooks').startRetryLoop();
    app.listen(env.PORT, '127.0.0.1', () => {
      console.log(`[BOOT] Backend System listening on 127.0.0.1:${env.PORT}`);
    });
  } catch (e) {
    console.error('[BOOT] failed', e);
    process.exit(1);
  }
})();
