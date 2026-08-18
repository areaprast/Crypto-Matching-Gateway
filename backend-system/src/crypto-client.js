/**
 * Thin HTTP client for the backend-crypto service. All blockchain-touching
 * logic has been moved out of backend-system — we only call this module.
 */
const env = require('./config');

const H = { 'Content-Type': 'application/json', 'X-Internal-Token': env.INTERNAL_API_TOKEN };

async function sendUsdt({ toAddress, amount, simulate = true }) {
  const r = await fetch(`${env.CRYPTO_SERVICE_URL}/internal/tron/send-usdt`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ toAddress, amount, simulate }),
  });
  if (!r.ok) throw new Error(`crypto service send-usdt failed: ${r.status} ${await r.text()}`);
  return r.json();
}

async function hotWallet() {
  const r = await fetch(`${env.CRYPTO_SERVICE_URL}/api/crypto/hot-wallet`);
  return r.ok ? r.json() : null;
}

module.exports = { sendUsdt, hotWallet };
