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

const PORT = process.env.PORT || 8081;

// Validate CLIENT_URL is set in production
if (process.env.NODE_ENV === 'production' && !process.env.CLIENT_URL) {
  console.error('FATAL: CLIENT_URL must be set in production');
  process.exit(1);
}

const allowedOrigins = process.env.NODE_ENV === 'production'
  ? [process.env.CLIENT_URL]
  : [process.env.CLIENT_URL || 'http://localhost:3000', 'http://localhost:3001'];

// Security middleware - configured for WebSocket compatibility
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: false,
  hsts: process.env.NODE_ENV === 'production' ? {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  } : false,
}));

// Rate limiting for the API
const limiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 100,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skipFailedRequests: false,
});
app.use('/api/', limiter);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true); // mobile apps, curl, etc.
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.warn(`Blocked CORS request from unauthorized origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));
app.use(express.json({ limit: '10kb' }));

// API version endpoint for cache busting
const API_VERSION = require('../package.json').version;
const SERVER_START_TIME = new Date().toISOString();

// Set API version headers for all /api responses (must be before routes)
app.use('/api', (req, res, next) => {
  res.setHeader('X-API-Version', API_VERSION);
  res.setHeader('X-Server-Start', SERVER_START_TIME);
  next();
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// API version endpoint for cache busting
app.get('/api/version', (req, res) => {
  res.json({
    version: API_VERSION,
    startTime: SERVER_START_TIME,
    buildId: `${API_VERSION}-${SERVER_START_TIME}`,
  });
});

// Routes
app.use('/api/sessions', sessionRoutes);

// Security: Log suspicious activity and return generic 400/500 responses
app.use((err, req, res, next) => {
  if (err) {
    logger.error('Security Event:', {
      ip: req.ip,
      path: req.path,
      error: err.message,
    });
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Internal server error' });
    }
  }
  next();
});

(async () => {
  // Setup Socket.IO event handlers
  setupSocketEvents(io);

  // Sweep the in-memory session store every 60 seconds for inactive users
  // and stale (>24h, no active users) sessions.
  const cleanupTimer = setInterval(() => {
    cleanupInactiveSessions(io);
  }, 60 * 1000);

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
})();

module.exports = { app, server, io };