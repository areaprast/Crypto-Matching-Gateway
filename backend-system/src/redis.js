const Redis = require('ioredis');
const env = require('./config');

let client = null;
try {
  client = new Redis(env.REDIS_URL, { lazyConnect: false, maxRetriesPerRequest: 2 });
  client.on('error', (e) => console.error('[Redis] error', e.message));
} catch (e) {
  console.warn('[Redis] disabled:', e.message);
}

module.exports = { redis: client };
