const crypto = require('crypto');

// Single-use, short-lived handoff codes for the super-admin "impersonate" flow.
// The real session token never travels in a URL — only this opaque, unguessable
// code does, and it expires in 30s and is deleted the moment it's redeemed.
//
// In-memory is safe here because ecosystem.config.js runs this app as a single
// PM2 instance; if that ever changes to a multi-instance/cluster deployment,
// this store needs to move to Mongo/Redis so all instances share it.
const TTL_MS = 30 * 1000;
const codes = new Map(); // code -> { token, user, expiresAt }

const create = (token, user) => {
  const code = crypto.randomBytes(24).toString('hex');
  codes.set(code, { token, user, expiresAt: Date.now() + TTL_MS });
  return code;
};

const consume = (code) => {
  const entry = codes.get(code);
  codes.delete(code); // single-use regardless of outcome
  if (!entry || entry.expiresAt < Date.now()) return null;
  return { token: entry.token, user: entry.user };
};

setInterval(() => {
  const now = Date.now();
  for (const [code, entry] of codes) {
    if (entry.expiresAt < now) codes.delete(code);
  }
}, 60 * 1000).unref();

module.exports = { create, consume };
