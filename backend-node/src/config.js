require('dotenv').config();

const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: Number(process.env.NODE_PORT || 8002),
  DATABASE_URL: process.env.DATABASE_URL,
  REDIS_URL: process.env.REDIS_URL,
  JWT_SECRET: process.env.JWT_SECRET,
  WALLET_ENCRYPTION_KEY_HEX: process.env.WALLET_ENCRYPTION_KEY_HEX,
  TRON_NETWORK: process.env.TRON_NETWORK || 'nile',
  TRON_FULL_HOST: process.env.TRON_FULL_HOST || 'https://nile.trongrid.io',
  TRONGRID_API_KEY: process.env.TRONGRID_API_KEY || '',
  USDT_CONTRACT: process.env.USDT_CONTRACT,
  CONFIRMATIONS: Number(process.env.CONFIRMATIONS || 1),
  POLL_MS: Number(process.env.POLL_MS || 30000),
  PLATFORM_FEE_BPS: Number(process.env.PLATFORM_FEE_BPS || 25),
  INTERNAL_API_TOKEN: process.env.INTERNAL_API_TOKEN,
};

if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required');
if (!env.JWT_SECRET) throw new Error('JWT_SECRET is required');

module.exports = env;
