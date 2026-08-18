const jwt = require('jsonwebtoken');
const { query } = require('../db');
const env = require('../config');

/** Admin-only JWT verification. Rejects merchant tokens. */
async function requireAdminJWT(req, res, next) {
  const h = req.get('authorization');
  if (!h || !h.startsWith('Bearer ')) return res.status(401).json({ error: 'missing bearer token' });
  try {
    const payload = jwt.verify(h.slice(7), env.JWT_SECRET);
    if (payload.role !== 'admin') return res.status(403).json({ error: 'admin only' });
    req.admin = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'invalid token' });
  }
}

function signAdminSession(admin) {
  return jwt.sign(
    { id: admin.id, email: admin.email, name: admin.name, role: 'admin' },
    env.JWT_SECRET,
    { expiresIn: '12h' }
  );
}

module.exports = { requireAdminJWT, signAdminSession };
