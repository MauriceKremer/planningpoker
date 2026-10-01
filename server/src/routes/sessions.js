const express = require('express');
const router = express.Router();
const { body, param, validationResult } = require('express-validator');
const logger = require('../utils/logger');
const {
  createSession,
  getSession,
  joinSession,
  sanitizeSession
} = require('../services/sessionService');

const validationMiddleware = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array()
    });
  }
  next();
};

// Session IDs are always 8-character codes issued by the server.
const sessionIdParam = param('sessionId')
  .isLength({ min: 8, max: 8 })
  .withMessage('Session ID must be exactly 8 characters')
  .isAlphanumeric()
  .withMessage('Session ID must contain only letters and numbers');

// Which service errors map to which client-facing status/message.
const JOIN_ERROR_RESPONSES = {
  'Username already exists in this session': { status: 409, message: 'Username already taken' },
  'Session not found': { status: 404, message: 'Session not found' },
  'Invalid avatar': { status: 400, message: 'Invalid avatar' },
};

// NOTE: no HTML escaping of user input — React escapes on render; escaping
// at the data layer mangles stored names/titles (O'Brien → O&#x27;Brien).
router.post('/create', [
  body('moderatorName')
    .trim()
    .isLength({ min: 1, max: 30 })
    .withMessage('Moderator name must be 1-30 characters'),
  body('title')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Title must not exceed 100 characters'),
  body('cardSet')
    .optional()
    .isArray({ min: 1, max: 24 })
    .withMessage('Card set must be an array of 1-24 items'),
  body('cardSet.*')
    .isString()
    .withMessage('Card values must be text')
    .trim()
    .isLength({ min: 1, max: 16 })
    .withMessage('Card values must be 1-16 characters'),
  body('avatar')
    .optional()
    .isObject()
    .withMessage('Avatar must be an object'),
  validationMiddleware
], async (req, res) => {
  try {
    const { moderatorName, title, cardSet, avatar } = req.body;

    const session = await createSession(moderatorName || 'Anonymous', title, cardSet, avatar ?? null);

    res.json({ sessionId: session.id, userId: session.moderatorId, session });
  } catch (error) {
    logger.error('Error creating session:', error);
    const mapped = JOIN_ERROR_RESPONSES[error.message];
    if (mapped) return res.status(mapped.status).json({ message: mapped.message });
    res.status(500).json({ error: 'Failed to create session' });
  }
});

router.post('/:sessionId/join', [
  sessionIdParam,
  body('userName')
    .trim()
    .isLength({ min: 1, max: 30 })
    .withMessage('Username must be 1-30 characters'),
  body('avatar')
    .optional()
    .isObject()
    .withMessage('Avatar must be an object'),
  validationMiddleware
], async (req, res) => {
  try {
    const { userName, avatar } = req.body;

    // The created user is returned explicitly — the client saves identity by
    // id, never by name matching.
    const { session, user } = await joinSession(req.params.sessionId, userName, avatar ?? null);
    res.json({ session, userId: user.id, user });
  } catch (error) {
    logger.error('Error joining session:', error);
    const mapped = JOIN_ERROR_RESPONSES[error.message];
    if (mapped) return res.status(mapped.status).json({ message: mapped.message });
    res.status(500).json({ message: 'Failed to join session' });
  }
});

router.get('/:sessionId', [
  sessionIdParam,
  validationMiddleware
], async (req, res) => {
  try {
    const session = await getSession(req.params.sessionId);
    res.json({ session: sanitizeSession(session) });
  } catch (error) {
    logger.error('Error fetching session:', error);
    res.status(404).json({ error: 'Session not found' });
  }
});

module.exports = router;