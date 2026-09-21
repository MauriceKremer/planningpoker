const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { body, param, validationResult } = require('express-validator');
const logger = require('../utils/logger');
const { 
  createSession, 
  getSession, 
  joinSession,
  sanitizeSession
} = require('../services/sessionService');

// Validation middleware
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

// Create a new session
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
    .isArray()
    .withMessage('Card set must be an array'),
  validationMiddleware
], async (req, res) => {
  try {
    const { moderatorName, title, cardSet } = req.body;
    
    const session = await createSession(
      moderatorName || 'Anonymous',
      title,
      cardSet
    );
    
    res.json({ sessionId: session.id, userId: session.moderatorId, session });
  } catch (error) {
    logger.error('Error creating session:', error);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

// Join a session
router.post('/:sessionId/join', [
  param('sessionId')
    .isLength({ min: 8, max: 8 })
    .withMessage('Session ID must be exactly 8 characters')
    .isAlphanumeric()
    .withMessage('Session ID must contain only letters and numbers'),
  body('userName')
    .trim()
    .isLength({ min: 1, max: 30 })
    .withMessage('Username must be 1-30 characters'),
  validationMiddleware
], async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { userName } = req.body;
    
    const { session, user } = await joinSession(sessionId, userName);
    // The created user is returned explicitly — the client saves identity by
    // id, never by name matching.
    res.json({ session, userId: user.id, user });
  } catch (error) {
    logger.error('Error joining session:', error);
    if (error.message === 'Username already exists in this session') {
      res.status(409).json({ message: 'Username already taken' });
    } else if (error.message === 'Session not found') {
      res.status(404).json({ message: 'Session not found' });
    } else {
      res.status(500).json({ message: 'Failed to join session' });
    }
  }
});

// Get session details
router.get('/:sessionId', [
  param('sessionId')
    .isLength({ min: 8, max: 8 })
    .withMessage('Session ID must be exactly 8 characters')
    .isAlphanumeric()
    .withMessage('Session ID must contain only letters and numbers'),
  validationMiddleware
], async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = await getSession(sessionId);
    res.json({ session: sanitizeSession(session) });
  } catch (error) {
    logger.error('Error fetching session:', error);
    res.status(404).json({ error: 'Session not found' });
  }
});

module.exports = router;