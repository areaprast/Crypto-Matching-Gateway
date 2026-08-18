/**
 * Webhook fan-out with HMAC-SHA256 signatures + retry queue.
 *
 * Signature: X-P2P-Signature = t=<ts>,v1=<hex(hmac_sha256(secret, `${ts}.${bodyJson}`))>
 * Retry schedule: 5s, 30s, 5m, 30m, 2h (up to 5 attempts).
 */
const crypto = require('crypto');
const { query } = require('./db');

const RETRY_DELAYS_MS = [5_000, 30_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000];

function sign(secret, bodyJson) {
  const ts = Math.floor(Date.now() / 1000);
  const v1 = crypto
    .createHmac('sha256', secret)
    .update(`${ts}.${bodyJson}`)
    .digest('hex');
  return { header: `t=${ts},v1=${v1}`, timestamp: ts, v1 };
}

/**
 * Enqueue a webhook delivery for one merchant. Fires immediately (best-effort)
 * and stores state so the retry loop can pick it up on failure.
 */
async function enqueue({ merchantId, eventType, eventId, payload }) {
  const { rows: [m] } = await query(
    `SELECT webhook_url, webhook_secret FROM merchants WHERE id = $1`,
    [merchantId]
  );
  if (!m || !m.webhook_url || !m.webhook_secret) return null; // no webhook configured

  const bodyJson = JSON.stringify({ id: eventId, type: eventType, created_at: new Date().toISOString(), data: payload });
  const { header } = sign(m.webhook_secret, bodyJson);

  const { rows: [row] } = await query(
    `INSERT INTO webhook_deliveries
       (merchant_id, event_type, event_id, target_url, payload, signature, status, next_retry_at)
     VALUES ($1,$2,$3,$4,$5::jsonb,$6,'PENDING', NOW())
     RETURNING *`,
    [merchantId, eventType, eventId, m.webhook_url, bodyJson, header]
  );

  // Fire immediately (fire-and-forget); retry loop handles failures.
  attemptDelivery(row.id).catch((e) => console.error('[wh] delivery error:', e.message));
  return row;
}

async function attemptDelivery(deliveryId) {
  const { rows: [d] } = await query(`SELECT * FROM webhook_deliveries WHERE id = $1`, [deliveryId]);
  if (!d || d.status !== 'PENDING') return;

  const attempt = d.attempt + 1;
  const bodyJson = typeof d.payload === 'string' ? d.payload : JSON.stringify(d.payload);

  let respStatus = 0;
  let respBody = '';
  let ok = false;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    const r = await fetch(d.target_url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-P2P-Signature': d.signature,
        'X-P2P-Event': d.event_type,
        'X-P2P-Event-Id': d.event_id,
        'X-P2P-Attempt': String(attempt),
        'User-Agent': 'p2p-gateway-webhook/1.0',
      },
      body: bodyJson,
      signal: controller.signal,
    });
    clearTimeout(timer);
    respStatus = r.status;
    respBody = (await r.text()).slice(0, 500);
    ok = r.status >= 200 && r.status < 300;
  } catch (e) {
    respBody = `network: ${e.message}`;
  }

  if (ok) {
    await query(
      `UPDATE webhook_deliveries SET
         status='SUCCESS', attempt=$2, response_status=$3, response_body=$4,
         delivered_at=NOW(), next_retry_at=NULL
       WHERE id=$1`,
      [d.id, attempt, respStatus, respBody]
    );
    return;
  }

  if (attempt >= d.max_attempts) {
    await query(
      `UPDATE webhook_deliveries SET
         status='FAILED', attempt=$2, response_status=$3, response_body=$4, next_retry_at=NULL
       WHERE id=$1`,
      [d.id, attempt, respStatus, respBody]
    );
    return;
  }

  const delay = RETRY_DELAYS_MS[Math.min(attempt - 1, RETRY_DELAYS_MS.length - 1)];
  await query(
    `UPDATE webhook_deliveries SET
       attempt=$2, response_status=$3, response_body=$4,
       next_retry_at=NOW() + ($5 || ' milliseconds')::interval
     WHERE id=$1`,
    [d.id, attempt, respStatus, respBody, String(delay)]
  );
}

/** Background retry loop — pulls due PENDING deliveries and retries them. */
function startRetryLoop() {
  setInterval(async () => {
    try {
      const { rows } = await query(
        `SELECT id FROM webhook_deliveries
         WHERE status='PENDING' AND next_retry_at IS NOT NULL AND next_retry_at <= NOW()
         ORDER BY next_retry_at ASC LIMIT 25`
      );
      for (const r of rows) {
        attemptDelivery(r.id).catch(() => {});
      }
    } catch (e) {
      console.error('[wh] retry loop err:', e.message);
    }
  }, 10_000).unref();
}

/**
 * Fan-out helper: send the same event to a list of merchant ids (unique).
 */
async function fanout(merchantIds, eventType, payload) {
  const eventId = 'evt_' + crypto.randomBytes(8).toString('hex');
  const unique = [...new Set(merchantIds.filter(Boolean))];
  return Promise.all(
    unique.map((mid) => enqueue({ merchantId: mid, eventType, eventId, payload }).catch((e) => {
      console.error('[wh] enqueue err:', e.message);
      return null;
    }))
  );
}

module.exports = { enqueue, fanout, attemptDelivery, startRetryLoop, sign };
