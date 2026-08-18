/**
 * Database adapter — HYBRID:
 *
 *   • Schema, migrations, and typed access → Prisma (source of truth for the DB).
 *     Use `prisma.<model>.<op>()` in new code, e.g. `prisma.merchant.findFirst(...)`.
 *
 *   • Existing raw SQL in the codebase continues to use `query(sql, params)` and
 *     `tx(handler)` backed by node-postgres. This avoids rewriting every route
 *     while still letting Prisma own the schema.
 *
 * Both point at the same DATABASE_URL, so writes stay consistent.
 */
const { Pool } = require('pg');
const { PrismaClient } = require('@prisma/client');
const env = require('./config');

// ---------- Prisma (schema + typed ORM) ----------
const prisma = new PrismaClient({ log: ['error', 'warn'] });

// Safe JSON for BigInt returned by Prisma raw counts.
if (typeof BigInt.prototype.toJSON !== 'function') {
  // eslint-disable-next-line no-extend-native
  BigInt.prototype.toJSON = function () {
    const n = Number(this);
    return Number.isSafeInteger(n) ? n : this.toString();
  };
}

// ---------- pg pool (existing raw SQL) ----------
const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
});
pool.on('error', (err) => console.error('[PG] pool error', err));

async function query(text, params) {
  return pool.query(text, params);
}

async function tx(handler) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await handler(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

module.exports = { prisma, pool, query, tx };
