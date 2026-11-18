const crypto = require('crypto');
const axios = require('axios');
const Webhook = require('../models/Webhook');

// Delivers one event to one webhook endpoint: POSTs a JSON envelope, signs
// it with the hook's secret (HMAC-SHA256 over the exact raw body, sent as
// X-ApexPOS-Signature) and appends the outcome to the hook's rolling
// delivery log. Fire-and-forget from the automation engine — a dead endpoint
// must never block or fail business operations.

// ─── SSRF guard ──────────────────────────────────────────────────────────────
// Tenants type these URLs themselves; on a shared host an unchecked URL
// would let a tenant probe the internal network / cloud metadata service.
// Block private and link-local targets outright (allowing localhost only in
// non-production so developers can test against a local receiver).
const PRIVATE_HOST_RE = /^(localhost|.*\.local|0\.0\.0\.0|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/i;

const validateWebhookUrl = (rawUrl) => {
  let url;
  try {
    url = new URL(String(rawUrl || ''));
  } catch {
    return 'Invalid URL.';
  }
  if (!/^https?:$/.test(url.protocol)) return 'URL must use http:// or https://.';
  const host = url.hostname.replace(/^\[|\]$/g, ''); // strip IPv6 brackets
  const isPrivate = PRIVATE_HOST_RE.test(host) || host === '::1' || /^f[cde]/i.test(host);
  if (isPrivate && process.env.NODE_ENV === 'production') {
    return 'URL points to a private/internal address, which is not allowed.';
  }
  return null; // ok
};

const sign = (secret, rawBody) =>
  crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');

// ─── Dispatch one event to one hook ──────────────────────────────────────────
// `webhook` may be a mongoose doc or plain object with {_id, url, secret}.
// Returns {success, statusCode?, error?} and records the delivery.
const dispatch = async (webhook, event, data) => {
  const startedAt = Date.now();
  let result;

  const urlError = validateWebhookUrl(webhook.url);
  if (urlError) {
    result = { success: false, error: urlError };
  } else {
    const envelope = JSON.stringify({
      event,
      timestamp: new Date().toISOString(),
      data,
    });
    try {
      const res = await axios.post(webhook.url, envelope, {
        headers: {
          'Content-Type': 'application/json',
          'X-ApexPOS-Event': event,
          'X-ApexPOS-Signature': sign(webhook.secret, envelope),
        },
        timeout: 10000,
        maxRedirects: 0, // a redirect could bounce the signed body to an unvetted host
        validateStatus: (s) => s >= 200 && s < 300,
      });
      result = { success: true, statusCode: res.status };
    } catch (err) {
      result = {
        success: false,
        statusCode: err.response?.status,
        error: err.response ? `HTTP ${err.response.status}` : err.message,
      };
    }
  }

  // Log the delivery (newest first, keep last 20). Best-effort — never throw.
  try {
    await Webhook.updateOne(
      { _id: webhook._id },
      {
        $push: {
          deliveries: {
            $each: [{
              event,
              at: new Date(),
              success: result.success,
              statusCode: result.statusCode,
              error: result.error,
              durationMs: Date.now() - startedAt,
            }],
            $position: 0,
            $slice: 20,
          },
        },
        $set: { lastStatus: result.success ? 'ok' : 'failed' },
        ...(result.success ? { } : { $inc: { failureCount: 1 } }),
      }
    );
  } catch (logErr) {
    console.error('[WEBHOOK] delivery log write failed:', logErr.message);
  }

  return result;
};

module.exports = { dispatch, validateWebhookUrl, sign };
