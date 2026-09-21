// Shared validation patterns for socket events
const SESSION_ID_PATTERN = /^[A-Z0-9]{8}$/;
const USER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Input validation helper for socket events
const validateSocketInput = (data, rules) => {
  if (!data || typeof data !== 'object') {
    return { isValid: false, error: 'Invalid data format' };
  }
  
  for (const [field, rule] of Object.entries(rules)) {
    const value = data[field];
    
    if (rule.required && (!value || (typeof value === 'string' && value.trim().length === 0))) {
      return { isValid: false, error: `${field} is required` };
    }
    
    if (value && rule.maxLength && value.toString().length > rule.maxLength) {
      return { isValid: false, error: `${field} is too long` };
    }
    
    if (value && rule.minLength && value.toString().length < rule.minLength) {
      return { isValid: false, error: `${field} is too short` };
    }
    
    if (value && rule.pattern && !rule.pattern.test(value)) {
      return { isValid: false, error: `${field} has invalid format` };
    }
  }
  
  return { isValid: true };
};

// Reusable validation rule sets
const VALIDATION_RULES = {
  sessionId: { required: true, minLength: 8, maxLength: 8, pattern: SESSION_ID_PATTERN },
  userId: { required: true, pattern: USER_ID_PATTERN },
  moderatorId: { required: true, pattern: USER_ID_PATTERN },
  currentModeratorId: { required: true, pattern: USER_ID_PATTERN },
  targetUserId: { required: true, pattern: USER_ID_PATTERN },
  vote: { required: true, maxLength: 10 },
  voteOutVote: { required: true, pattern: /^(yes|no)$/ },
  newName: { required: true, minLength: 1, maxLength: 30 },
};

module.exports = { validateSocketInput, VALIDATION_RULES, SESSION_ID_PATTERN, USER_ID_PATTERN };