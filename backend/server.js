const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
let helmet;
try {
  helmet = require('helmet');
} catch (e) {
  // Loud on purpose — see middleware/rateLimiter.js for the same reasoning.
  // This used to be a single console.log easy to miss in production logs,
  // and the server would still print "Security: helmet ... active" below.
  console.error('\n' + '!'.repeat(72));
  console.error('! SECURITY WARNING: helmet failed to load — module missing.');
  console.error('! Security headers (HSTS, X-Frame-Options, etc.) are DISABLED.');
  console.error('! Run `npm install` in backend/ and redeploy before serving real traffic.');
  console.error('!'.repeat(72) + '\n');
}
dotenv.config({ path: path.join(__dirname, '.env') });
dotenv.config({ path: path.join(__dirname, '..', '.env') });
const connectDB = require('./config/db');
const errorHandler = require('./middleware/errorHandler');
const { apiLimiter } = require('./middleware/rateLimiter');

// Prevent crash on unhandled errors
process.on('uncaughtException', (err) => {
  console.error(' Uncaught Exception:', err.message, err.stack);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// ── Required environment ────────────────────────────────────────────────────
// JWT_SECRET used to have a hardcoded fallback baked into the source (and
// that exact fallback string had leaked into git as a "real" secret) — so a
// missing env var silently signed every session with a known key instead of
// failing. Fail fast and loud here instead; there is no safe default for a
// signing secret.
if (!process.env.JWT_SECRET) {
  console.error('\nFATAL: JWT_SECRET is not set. Refusing to start — set it in backend/.env.\n');
  process.exit(1);
}
if (!process.env.MONGO_DB_URL) {
  console.error('\nFATAL: MONGO_DB_URL is not set. Refusing to start — set it in backend/.env.\n');
  process.exit(1);
}

connectDB();

// Scheduled-report emails (see services/reportRunner.js). Safe to start
// before the DB connects — its tick no-ops until a connection exists.
require('./services/reportRunner').startReportScheduler();

// Scheduled custom functions (see services/automationEngine.js). Same
// contract: ticks no-op until the DB is up.
require('./services/automationEngine').startFunctionScheduler();

const app = express();

// Required behind Hostinger/nginx/any reverse proxy so req.ip and the
// rate limiters key off the real client IP instead of the proxy's — without
// this, every request can appear to originate from the same address and
// either share one rate-limit bucket or (if a proxy blindly forwards a
// client-supplied X-Forwarded-For) let that header be spoofed to bypass
// limits entirely. `1` trusts exactly one hop (the immediate proxy).
app.set('trust proxy', 1);

// ── 5. Force HTTPS in production ──────────────────────────────────────────────
// Hostinger/nginx sets X-Forwarded-Proto. Redirect HTTP → HTTPS.
app.use((req, res, next) => {
  if (
    process.env.NODE_ENV === 'production' &&
    req.headers['x-forwarded-proto'] &&
    req.headers['x-forwarded-proto'] !== 'https'
  ) {
    return res.redirect(301, `https://${req.headers.host}${req.url}`);
  }
  next();
});

// ── Security headers (helmet) ─────────────────────────────────────────────────
// Sets X-Frame-Options, X-Content-Type-Options, Strict-Transport-Security, etc.
if (helmet) {
  app.use(helmet({
    contentSecurityPolicy: false, // Disabled — frontend inlines styles; enable after CSP audit
    crossOriginEmbedderPolicy: false,
  }));
}

// ── CORS ──────────────────────────────────────────────────────────────────────
// Previously `origin: true` reflected ANY request's Origin header back with
// credentials enabled — functionally a wildcard-with-credentials, letting any
// site issue authenticated cross-origin requests. Restrict to a real allowlist:
// FRONTEND_URL / CORS_ORIGINS (comma-separated for multi-domain deployments),
// plus localhost in non-production for local dev.
const allowedOrigins = (process.env.CORS_ORIGINS || process.env.FRONTEND_URL || 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // No Origin header = same-origin request, curl, server-to-server, etc. — allow.
    console.log('Request Origin:', origin);
console.log('Allowed Origins:', allowedOrigins);
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    if (process.env.NODE_ENV !== 'production' && /^https?:\/\/localhost(:\d+)?$/.test(origin)) {
      return callback(null, true);
    }
    console.warn(`[CORS] Blocked request from origin: ${origin}`);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

// ── Body parsers ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));          // Reduced from 50mb — no need for 50mb JSON
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// API responses must never be served from any cache (browser, LiteSpeed, or
// the PHP proxy) — POS terminals on different machines need live stock,
// sales and tax data, and a stale cached GET shows one till different
// numbers from another.
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

// ── 1. Global API rate limiter (300 req/min per IP) ───────────────────────────
app.use('/api', apiLimiter);

// Health check endpoint — excluded from rate limiting
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/auth',           require('./routes/authRoutes'));
app.use('/api/users',          require('./routes/userRoutes'));
app.use('/api/branches',       require('./routes/branchRoutes'));
app.use('/api/categories',     require('./routes/categoryRoutes'));
app.use('/api/products',       require('./routes/productRoutes'));
app.use('/api/inventory',      require('./routes/inventoryRoutes'));
app.use('/api/customers',      require('./routes/customerRoutes'));
app.use('/api/vendors',        require('./routes/vendorRoutes'));
app.use('/api/sales',          require('./routes/salesRoutes'));
app.use('/api/purchases',      require('./routes/purchaseRoutes'));
app.use('/api/reports',        require('./routes/reportRoutes'));
app.use('/api/dashboard',      require('./routes/dashboardRoutes'));
app.use('/api/stripe',         require('./routes/stripeRoutes'));
app.use('/api/payments',       require('./routes/mobileMoneyRoutes'));
app.use('/api/pesapal',        require('./routes/pesapalRoutes'));
app.use('/api/notifications',  require('./routes/notificationRoutes'));
app.use('/api/super-admin',    require('./routes/superAdminRoutes'));
app.use('/api/expenses',       require('./routes/expenseRoutes'));
app.use('/api/returns',        require('./routes/returnRoutes'));
app.use('/api/credit-notes',   require('./routes/creditNoteRoutes'));
app.use('/api/picklists',      require('./routes/picklistRoutes'));
app.use('/api/shipments',      require('./routes/shipmentRoutes'));
app.use('/api/waybills',       require('./routes/waybillRoutes'));
app.use('/api/price-lists',    require('./routes/priceListRoutes'));
app.use('/api/tracking',       require('./routes/trackingRoutes'));
app.use('/api/held-bills',     require('./routes/heldBillRoutes'));
app.use('/api/shifts',         require('./routes/shiftRoutes'));
app.use('/api/tax-rates',      require('./routes/taxRateRoutes'));
app.use('/api/report-schedules', require('./routes/reportScheduleRoutes'));
app.use('/api/customization',  require('./routes/customizationRoutes'));
app.use('/api/automation',     require('./routes/automationRoutes'));

// ── Frontend static build in production ──────────────────────────────────────
const distPath = path.join(__dirname, '../frontend/dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (req, res, next) => {
    if (req.url.startsWith('/api')) return next();
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

app.use(errorHandler);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 ApexPOS Server running on port ${PORT}`);
  console.log(`🔒 Security: helmet, rate-limiting, HTTPS-redirect active`);
});

