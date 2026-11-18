const jwt = require('jsonwebtoken');

// No fallback secret — an unset JWT_SECRET must fail loudly at startup
// (see server.js), never silently sign/verify with a known, public value.
const getSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not set. Refusing to sign or verify tokens.');
  }
  return secret;
};

// tokenVersion is embedded as "tv" and checked against User.tokenVersion on
// every request (see middleware/auth.js). Bumping a user's tokenVersion —
// e.g. on password change — invalidates every token issued before that point.
const generateToken = (id, tenantId, role, tokenVersion = 0, expiresIn = '8h') =>
  jwt.sign({ id, tenantId, role, tv: tokenVersion }, getSecret(), { expiresIn });

const verifyToken = (token) => jwt.verify(token, getSecret());

module.exports = { generateToken, verifyToken, getSecret };
