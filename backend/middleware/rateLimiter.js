/**
 * Rate Limiter Middleware — ApexPOS Platform
 *
 * Prevents brute-force attacks on auth endpoints and general API abuse.
 * Uses express-rate-limit with hybrid IP + Email keys.
 */

let rateLimit;
let ipKeyGenerator;
try {
  ({ rateLimit, ipKeyGenerator } = require('express-rate-limit'));
} catch (e) {
  // Loud on purpose: this used to fail silently (a console.log easy to miss in
  // production logs), which meant login/OTP/register/global-API brute-force
  // protection could vanish with zero operator awareness. It's still non-fatal
  // (a missing security package shouldn't take the whole API down), but it
  // must never look like "Security: rate-limiting active" (see server.js) when
  // it isn't.
  console.error('\n' + '!'.repeat(72));
  console.error('! SECURITY WARNING: express-rate-limit failed to load — module missing.');
  console.error('! ALL rate limiting (login/OTP/register/API abuse) is DISABLED.');
  console.error('! Run `npm install` in backend/ and redeploy before serving real traffic.');
  console.error('!'.repeat(72) + '\n');
  rateLimit = () => (req, res, next) => next();
}

// ── Helper: standard JSON error response ─────────────────────────────────────
const rateLimitHandler = (req, res) => {
  res.status(429).json({
    success: false,
    message: 'Too many requests. Please wait a moment and try again.',
    retryAfter: Math.ceil(res.getHeader('Retry-After') || 60),
  });
};

// ── 1. Login rate limiter — 5 failed attempts per 15 min per IP + Email ────────
// Scoped by IP + Email so failing 5 times on Email A does NOT block Email B on the same machine.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 10,
  message: 'Too many login attempts. Please try again in 15 minutes.',
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false, default: false },
  handler: (req, res) => {
    console.warn(`[RATE LIMIT] Login blocked for IP: ${req.ip} — too many failed attempts`);
    res.status(429).json({
      success: false,
      message: 'Too many failed login attempts for this account. Please wait 15 minutes before trying again.',
    });
  },
  skipSuccessfulRequests: true,
});

// ── 2. Forgot password limiter — 10 attempts per 15 min ───────────────────────
const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false, default: false },
  handler: (req, res) => {
    console.warn(`[RATE LIMIT] Forgot password blocked for IP: ${req.ip}`);
    res.status(429).json({
      success: false,
      message: 'Too many password reset requests. Please wait 15 minutes.',
    });
  },
});

// ── 3. OTP send limiter — 3 per 10 min ───────────────────────────────────────
const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: 'Too many OTP requests. Please wait 10 minutes.',
    });
  },
});

// ── 4. Register limiter — 3 per hour per IP ──────────────────────────────────
// Prevents mass tenant registration spam.
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,  // 1 hour
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: 'Too many registration attempts from this IP. Please try again in 1 hour.',
    });
  },
});

// ── 3b. Reset-password verify limiter — per ACCOUNT, not per IP ──────────────
// A 6-digit reset code has only 1,000,000 possibilities. IP-based limiting alone
// lets a distributed/rotating attacker brute-force one victim's code within its
// 15-minute validity window. Keying by the target email closes that gap —
// every attempt against one account counts toward one limit no matter which
// IP it came from.
const resetPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  // Fall back to a properly IPv6-normalized key (not the raw address) when no
  // email is present yet — express-rate-limit validates this at startup and
  // refuses a bare req.ip fallback because raw IPv6 addresses can be trivially
  // rotated to dodge the limit.
  keyGenerator: (req) => (req.body?.email ? req.body.email.toString().trim().toLowerCase() : ipKeyGenerator(req.ip)),
  handler: (req, res) => {
    console.warn('[RATE LIMIT] Reset-password verify blocked for account:', req.body?.email);
    res.status(429).json({
      success: false,
      message: 'Too many attempts for this account. Please wait 15 minutes before trying again.',
    });
  },
});

// ── 3c. OTP verify limiter — per ACCOUNT (phone), not per IP ─────────────────
const otpVerifyLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.body?.phone ? req.body.phone.toString().trim() : ipKeyGenerator(req.ip)),
  handler: (req, res) => {
    console.warn('[RATE LIMIT] OTP verify blocked for account:', req.body?.phone);
    res.status(429).json({
      success: false,
      message: 'Too many verification attempts for this account. Please wait before trying again.',
    });
  },
});

// ── 5. General API limiter — 300 req/min per IP ──────────────────────────────
// Protects all API routes from general abuse/DDoS.
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,  // 1 minute
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
  // Skip health check endpoint
  skip: (req) => req.path === '/api/health',
});

module.exports = {
  loginLimiter, forgotPasswordLimiter, otpLimiter, registerLimiter, apiLimiter,
  resetPasswordLimiter, otpVerifyLimiter,
};
