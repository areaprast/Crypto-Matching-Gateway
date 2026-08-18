require('dotenv').config();

const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: Number(process.env.SYSTEM_PORT || process.env.NODE_PORT || 8002),
  DATABASE_URL: process.env.DATABASE_URL,
  REDIS_URL: process.env.REDIS_URL,
  JWT_SECRET: process.env.JWT_SECRET,
  CRYPTO_SERVICE_URL: process.env.CRYPTO_SERVICE_URL || 'http://127.0.0.1:8003',
  PLATFORM_FEE_BPS: Number(process.env.PLATFORM_FEE_BPS || 25),
  INTERNAL_API_TOKEN: process.env.INTERNAL_API_TOKEN,
};

if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required');
if (!env.JWT_SECRET) throw new Error('JWT_SECRET is required');

module.exports = env;
