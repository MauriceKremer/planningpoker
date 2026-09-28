const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
require('dotenv').config();
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const logger = require('./utils/logger');
const sessionRoutes = require('./routes/sessions');
const { setupSocketEvents, cleanupInactiveSessions } = require('./services/socketHandler');

const PORT = process.env.PORT || 8081;
const SWEEP_INTERVAL_MS = 60 * 1000;

const app = express();
const server = http.createServer(app);

// Trust proxy - required when behind a reverse proxy (nginx, Traefik, Caddy, ...)
app.set('trust proxy', 1);

const io = socketIo(server, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true,
  },
  transports: ['websocket', 'polling'],
  allowUpgrades: true,
  pingTimeout: 60000,
  pingInterval: 25000,
  allowEIO3: true,
  path: '/socket.io/',
  serveClient: false,
});

// Validate CLIENT_URL is set in production
if (process.env.NODE_ENV === 'production' && !process.env.CLIENT_URL) {
  console.error('FATAL: CLIENT_URL must be set in production');
  process.exit(1);
}

const allowedOrigins = process.env.NODE_ENV === 'production'
  ? [process.env.CLIENT_URL]
  : [process.env.CLIENT_URL || 'http://localhost:3000', 'http://localhost:3001'];

// Security middleware.
// CSP: strict, API-appropriate policy. WebSockets are unaffected (CSP does not
// block WS by default; the SPA page's CSP governs its own connect-src, and the
// prod nginx policy is identical — keep the two CSP strings in sync, see
// nginx/nginx.conf and client/nginx.conf).
//   - script-src 'self': the CRA build emits only external bundles (no inline
//     scripts; JSON-LD in index.html is non-executable and CSP-exempt)
//   - style-src 'unsafe-inline': React inline style attributes
//   - media-src data: the base64 round-start sound effect in useSessionSocket
//   - img-src data:: webpack-inlined assets below the inline-size limit
const CSP_DIRECTIVES = {
  defaultSrc: ["'self'"],
  scriptSrc: ["'self'"],
  styleSrc: ["'self'", "'unsafe-inline'"],
  imgSrc: ["'self'", "data:"],
  fontSrc: ["'self'"],
  mediaSrc: ["'self'", "data:"],
  connectSrc: ["'self'"],
  objectSrc: ["'none'"],
  baseUri: ["'self'"],
  frameAncestors: ["'self'"],
  formAction: ["'self'"],
};

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: CSP_DIRECTIVES,
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: false,
  hsts: process.env.NODE_ENV === 'production' ? {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  } : false,
}));

// Rate limiting for the API (window overridable for E2E stacks)
const limiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: parseInt(process.env.API_RATE_LIMIT || '100', 10),
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skipFailedRequests: false,
});
app.use('/api/', limiter);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true); // mobile apps, curl, etc.
    if (allowedOrigins.includes(origin)) return callback(null, true);
    console.warn(`Blocked CORS request from unauthorized origin: ${origin}`);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));
app.use(express.json({ limit: '10kb' }));

const API_VERSION = require('../package.json').version;
const SERVER_START_TIME = new Date().toISOString();

// Version headers for cache busting (must be registered before routes)
app.use('/api', (req, res, next) => {
  res.setHeader('X-API-Version', API_VERSION);
  res.setHeader('X-Server-Start', SERVER_START_TIME);
  next();
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.get('/api/version', (req, res) => {
  res.json({
    version: API_VERSION,
    startTime: SERVER_START_TIME,
    buildId: `${API_VERSION}-${SERVER_START_TIME}`,
  });
});

app.use('/api/sessions', sessionRoutes);

// Security: log suspicious activity and return a generic 500 response.
// Privacy: logs deliberately omit the client IP (PRIVACY.md — "no IP address
// logging"); path + error message are enough to triage incidents.
app.use((err, req, res, next) => {
  if (!err) return next();
  logger.error('Security Event:', {
    path: req.path,
    error: err.message,
  });
  if (res.headersSent) return next();
  res.status(500).json({ error: 'Internal server error' });
});

setupSocketEvents(io);

// Sweep the in-memory session store every 60 seconds for inactive users
// and stale (>24h, no active users) sessions.
const cleanupTimer = setInterval(() => cleanupInactiveSessions(io), SWEEP_INTERVAL_MS);

const gracefulShutdown = (signal) => {
  logger.info(`${signal} received - shutting down gracefully...`);
  clearInterval(cleanupTimer);
  io.close();
  server.close();
  process.exit(0);
};
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

server.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});

module.exports = { app, server, io };