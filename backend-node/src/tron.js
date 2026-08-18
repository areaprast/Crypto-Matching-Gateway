const { TronWeb } = require('tronweb');
const env = require('./config');
const { encrypt, decrypt } = require('./crypto-vault');

const headers = env.TRONGRID_API_KEY ? { 'TRON-PRO-API-KEY': env.TRONGRID_API_KEY } : undefined;

/** Generate a new TRON wallet (address + encrypted private key). */
async function generateWallet() {
  const tw = new TronWeb({ fullHost: env.TRON_FULL_HOST, headers });
  const acct = await tw.createAccount();
  const enc = encrypt(acct.privateKey);
  return {
    address: acct.address.base58,
    encrypted_key: enc.ciphertext,
    key_iv: enc.iv,
    key_tag: enc.tag,
  };
}

/** Build a TronWeb instance signed with the hot wallet's private key. */
function tronWebFor(wallet) {
  const privateKey = decrypt({
    ciphertext: wallet.encrypted_key,
    iv: wallet.key_iv,
    tag: wallet.key_tag,
  });
  return new TronWeb({ fullHost: env.TRON_FULL_HOST, headers, privateKey });
}

/** Read USDT balance via TronGrid (public read; falls back to cached value on failure). */
async function fetchUsdtBalance(address) {
  try {
    const tw = new TronWeb({ fullHost: env.TRON_FULL_HOST, headers });
    tw.setAddress(address);
    const contract = await tw.contract().at(env.USDT_CONTRACT);
    const raw = await contract.balanceOf(address).call();
    const decimals = 6;
    return Number(raw.toString()) / 10 ** decimals;
  } catch (e) {
    console.warn('[TRON] balance fetch failed:', e.message);
    return null;
  }
}

/**
 * Send USDT. Only used when hot wallet has real funds. In MVP we simulate a txid.
 * Set `simulate=true` to skip broadcasting and generate a mock txid instead.
 */
async function sendUsdt({ wallet, toAddress, amount, simulate = true }) {
  if (simulate) {
    // Mock transaction — returns a synthetic txid for demo purposes.
    const fakeTxid = require('crypto').randomBytes(32).toString('hex');
    return { txid: fakeTxid, simulated: true };
  }
  const tw = tronWebFor(wallet);
  const contract = await tw.contract().at(env.USDT_CONTRACT);
  const atomic = String(Math.round(amount * 1e6));
  const txid = await contract.transfer(toAddress, atomic).send({ feeLimit: 100_000_000, callValue: 0 });
  return { txid, simulated: false };
}

module.exports = { generateWallet, tronWebFor, fetchUsdtBalance, sendUsdt };
