const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const env = require('../config');
const { query } = require('../db');

/** Middleware: verify JWT dashboard session. */
async function requireJWT(req, res, next) {
  const header = req.get('authorization');
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'missing bearer token' });
  }
  try {
    const payload = jwt.verify(header.slice(7), env.JWT_SECRET);
    req.merchant = payload;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'invalid token' });
  }
}

/** Middleware: verify API Key + HMAC signature (X-API-KEY + X-SIGNATURE + X-TIMESTAMP). */
async function requireApiKey(req, res, next) {
  const apiKey = req.get('x-api-key');
  const signature = req.get('x-signature');
  const timestamp = req.get('x-timestamp');
  if (!apiKey || !signature || !timestamp) {
    return res.status(401).json({ error: 'missing X-API-KEY, X-SIGNATURE, or X-TIMESTAMP' });
  }
  // Reject stale timestamps (>5 min drift).
  const drift = Math.abs(Date.now() - Number(timestamp));
  if (Number.isNaN(drift) || drift > 5 * 60 * 1000) {
    return res.status(401).json({ error: 'timestamp expired or invalid' });
  }
  const { rows } = await query(
    `SELECT k.*, m.status AS merchant_status, m.type AS merchant_type
     FROM merchant_apikeys k JOIN merchants m ON m.id = k.merchant_id
     WHERE k.api_key = $1 AND k.active = TRUE`,
    [apiKey]
  );
  if (!rows[0]) return res.status(401).json({ error: 'invalid api key' });
  const key = rows[0];
  if (key.merchant_status !== 'ACTIVE') return res.status(403).json({ error: 'merchant inactive' });

  // IP whitelist check.
  if (Array.isArray(key.ip_whitelist) && key.ip_whitelist.length > 0) {
    const remote = (req.get('x-forwarded-for') || req.ip || '').split(',')[0].trim();
    if (!key.ip_whitelist.includes(remote)) {
      return res.status(403).json({ error: `ip ${remote} not whitelisted` });
    }
  }

  // HMAC signature: HMAC_SHA256(secret, `${timestamp}.${method}.${path}.${bodyHash}`)
  // We can't recover raw secret (only bcrypt hash), so we use a *derived* signing secret
  // stored as the second value: for MVP we compare against secret_hash via bcrypt of
  // provided signature source. Simpler: expect client to send `X-SIGNATURE = hmac(bodyStr, secret)`,
  // and we validate by bcrypt-comparing the provided secret sent as header X-API-SECRET.
  // For a robust demo we accept X-API-SECRET header and verify with bcrypt.
  const providedSecret = req.get('x-api-secret');
  if (!providedSecret) {
    return res.status(401).json({ error: 'missing x-api-secret' });
  }
  const secretOk = await bcrypt.compare(providedSecret, key.secret_hash);
  if (!secretOk) return res.status(401).json({ error: 'invalid api secret' });

  // Optional HMAC signature verification.
  const bodyStr = req.rawBody || JSON.stringify(req.body || {});
  const payload = `${timestamp}.${req.method.toUpperCase()}.${req.originalUrl}.${bodyStr}`;
  const expected = crypto.createHmac('sha256', providedSecret).update(payload).digest('hex');
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return res.status(401).json({ error: 'signature mismatch' });
  }

  // Update last_used_at (fire-and-forget).
  query(`UPDATE merchant_apikeys SET last_used_at = NOW() WHERE id = $1`, [key.id]).catch(() => {});

  req.merchant = {
    id: key.merchant_id,
    type: key.merchant_type,
    apikey_id: key.id,
  };
  next();
}

function signSession(merchant) {
  return jwt.sign(
    { id: merchant.id, code: merchant.code, type: merchant.type, name: merchant.name },
    env.JWT_SECRET,
    { expiresIn: '12h' }
  );
}

module.exports = { requireJWT, requireApiKey, signSession };
