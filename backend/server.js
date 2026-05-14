require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const { testConnection } = require('./config/database');
const routes = require('./routes/index');
const { errorHandler, notFound } = require('./middleware/errorHandler');
const { cleanupOrphanedFiles } = require('./controllers/pdfController');
const logger = require('./utils/logger');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Trust Proxy (required for Render / any reverse-proxy host) ────────────────
// Tells Express to trust the X-Forwarded-For header set by Render's load balancer.
// Without this, express-rate-limit throws ERR_ERL_UNEXPECTED_X_FORWARDED_FOR.
app.set('trust proxy', 1);

// ── Security Headers ─────────────────────────────────────────────────────────
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'"],
      frameSrc: ["'self'", "blob:"],
      workerSrc: ["'self'", "blob:", "https://cdnjs.cloudflare.com"],
      objectSrc: ["'self'", "blob:"],
    }
  }
}));

// ── CORS ─────────────────────────────────────────────────────────────────────
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : ['http://localhost:3000'];

app.use(cors({
  origin: process.env.NODE_ENV === 'development' ? true : allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// ── Rate Limiting ─────────────────────────────────────────────────────────────
const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  message: { success: false, error: 'Too many requests, please try again later' }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, error: 'Too many login attempts, please try again later' }
});

// Auth routes get strict limiter only — not counted against general quota
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// All other API routes get the lenient limiter
app.use('/api/', (req, res, next) => {
  if (req.path.startsWith('/auth/')) return next();
  return generalLimiter(req, res, next);
});

// ── Body Parsing ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── Logging ───────────────────────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan(process.env.NODE_ENV === 'development' ? 'dev' : 'combined'));
}

// ── Static Frontend ───────────────────────────────────────────────────────────
// In production: serve from dist/ (Vite build output)
// In development: serve from frontend/ (raw source — used when running backend only)
const distDir     = path.join(__dirname, '../dist');
const frontendDir = path.join(__dirname, '../frontend');
const fs          = require('fs');
const staticDir   = (process.env.NODE_ENV === 'production' && fs.existsSync(distDir))
  ? distDir
  : frontendDir;

app.use(express.static(staticDir, {
  maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0
}));

// ── API Routes ────────────────────────────────────────────────────────────────
app.use('/api', routes);

// ── Frontend Routing (SPA fallback) ───────────────────────────────────────────
app.get('*', (req, res) => {
  // Don't catch API routes
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ success: false, error: 'API route not found' });
  }
  res.sendFile(path.join(staticDir, 'index.html'));
});

// ── Error Handling ────────────────────────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);


// ── Periodic Reconciliation Scheduler ─────────────────────────────────────────
// Runs the same self-healing cleanup on a timer so long-running servers
// (weeks/months uptime) don't accumulate orphaned files or stale DB records.
let cleanupTimer = null;

const startPeriodicCleanup = (uploadDir) => {
  const intervalHours = parseInt(process.env.CLEANUP_INTERVAL_HOURS, 10) || 6;
  const intervalMs = intervalHours * 60 * 60 * 1000;

  logger.info(`[Scheduler] Periodic reconciliation set to every ${intervalHours}h`);

  cleanupTimer = setInterval(async () => {
    logger.info(`[Scheduler] Running periodic reconciliation (every ${intervalHours}h)...`);
    await cleanupOrphanedFiles(uploadDir);
  }, intervalMs);

  // Don't let the timer keep Node alive if everything else shuts down
  if (cleanupTimer.unref) cleanupTimer.unref();
};

// ── Graceful Shutdown ─────────────────────────────────────────────────────────
const gracefulShutdown = (signal) => {
  logger.info(`[Shutdown] Received ${signal}, cleaning up...`);
  if (cleanupTimer) clearInterval(cleanupTimer);
  process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT',  () => gracefulShutdown('SIGINT'));

// ── Process-level Error Guards ────────────────────────────────────────────────
// Prevent background tasks (e.g. PDF text extraction) from crashing the server.
// Uncaught exceptions from fire-and-forget async work (like unpdf/pdfjs) are
// caught here and logged instead of killing the process.
process.on('uncaughtException', (err) => {
  logger.error('[Process] Uncaught exception (non-fatal):', { error: err.message, stack: err.stack });
});

process.on('unhandledRejection', (reason) => {
  logger.error('[Process] Unhandled promise rejection (non-fatal):', { reason });
});

// ── Startup ───────────────────────────────────────────────────────────────────
const start = async () => {
  logger.info('Starting Study-Hub...');

  const dbOk = await testConnection();
  if (!dbOk) {
    logger.error('Cannot start without database. Check your .env configuration.');
    process.exit(1);
  }

  // Auto-run schema on every boot (CREATE TABLE IF NOT EXISTS — safe to re-run)
  try {
    const fs   = require('fs');
    const path = require('path');
    const { pool } = require('./config/database');
    const schema = fs.readFileSync(path.join(__dirname, './config/schema.sql'), 'utf-8');
    await pool.query(schema);
    logger.info('Schema applied successfully');
  } catch (err) {
    logger.error('Schema apply failed:', { error: err.message });
    process.exit(1);
  }

  // Clean up orphaned files and stale DB records (startup)
  const uploadDir = path.resolve(process.env.UPLOAD_DIR || './uploads/pdfs');
  await cleanupOrphanedFiles(uploadDir);

  // Schedule periodic reconciliation while server is running
  startPeriodicCleanup(uploadDir);

  app.listen(PORT, () => {
    logger.info(`SUCCESS: Study-Hub running at http://localhost:${PORT}`);
    logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
    logger.info(`API Base: http://localhost:${PORT}/api`);
  });
};

start().catch(err => {
  logger.error('Fatal startup error:', { error: err });
  process.exit(1);
});

module.exports = app;
