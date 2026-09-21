/**
 * In-memory session store.
 *
 * SOLID — Single Responsibility: own the Map<sessionId, session> and the
 *   create/read/mutate/delete operations on it.
 * DRY    — one source of truth. No cache layer, no lock, no CAS: Node's
 *   single-threaded event loop makes synchronous mutations atomic, so the
 *   read-cache / write-lock / CAS-retry machinery that used to wrap
 *   this is gone.
 * KISS   — plain synchronous functions. Callers may still `await` the
 *   return values; awaiting a non-Promise resolves immediately.
 *
 * Contract for mutators passed to `updateSessionAtomic`: validate BEFORE
 *   mutating, so that throwing aborts without leaving partial state. Every
 *   mutator in the codebase already follows this.
 *
 * Trade-off: sessions do not survive a process restart and are not shared
 * across instances — both acceptable for a simple planning poker app.
 */
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
// Vote-out policy lives in socket/voteOut.js (pure); re-exported here so the
// existing import surface is unchanged.
const { publicVoteOutView, computeVoteOutRequired } = require('../socket/voteOut');

const DEFAULT_CARD_SET = ['0', '1', '2', '3', '5', '8', '13', '21', '34', '55', '89'];

// Card-set bounds (audit finding F3): the card set is stored on the session
// and broadcast to every participant, so both the item count and per-item
// length must be bounded — previously they were limited only by the 10 KB
// message cap. Limits are generous: the largest predefined set has 11 cards.
const MAX_CARD_SET_ITEMS = 24;
const MAX_CARD_VALUE_LENGTH = 16;

/**
 * Validate + normalize a moderator-supplied card set.
 * Throws with a user-facing message on invalid input; returns a new array
 * of trimmed strings (untrimmed/unvalidated input is never stored).
 * Shared by the REST create route and the update-card-set socket event.
 */
const sanitizeCardSet = (cardSet) => {
  if (!Array.isArray(cardSet) || cardSet.length === 0) {
    throw new Error('Invalid card set provided');
  }
  if (cardSet.length > MAX_CARD_SET_ITEMS) {
    throw new Error(`Card set is too large (max ${MAX_CARD_SET_ITEMS} cards)`);
  }
  return cardSet.map((value) => {
    if (typeof value !== 'string') throw new Error('Card values must be text');
    const trimmed = value.trim();
    if (trimmed.length === 0 || trimmed.length > MAX_CARD_VALUE_LENGTH) {
      throw new Error(`Card values must be 1-${MAX_CARD_VALUE_LENGTH} characters`);
    }
    return trimmed;
  });
};

// sessionId → session object (the single source of truth).
const store = new Map();

// ── Create ──────────────────────────────────────────────────────────────────

const createSession = (moderatorName, title = null, cardSet = null) => {
  let sessionId;
  let attempts = 0;
  const maxAttempts = 10;
  do {
    sessionId = crypto.randomBytes(4).toString('hex').toUpperCase(); // 8 hex chars
    if (++attempts > maxAttempts) throw new Error('Failed to generate unique session ID');
  } while (store.has(sessionId));

  const moderatorId = uuidv4();
  const now = new Date().toISOString();
  const sessionCardSet = (Array.isArray(cardSet) && cardSet.length > 0)
    ? sanitizeCardSet(cardSet)
    : DEFAULT_CARD_SET;

  const session = {
    id: sessionId,
    title: title || `${moderatorName}'s Planning Session`,
    moderator: moderatorName,
    moderatorId,
    users: {
      [moderatorId]: {
        id: moderatorId, name: moderatorName, isModerator: true,
        joinedAt: now, lastSeen: now, isOnline: true,
      },
    },
    votes: {},
    isVotingOpen: false,
    votingComplete: false,
    round: 0,
    cardSet: sessionCardSet,
    createdAt: now,
    lastActivity: now,
  };

  store.set(sessionId, session);
  return session;
};

// ── Read ───────────────────────────────────────────────────────────────────

const getSession = (sessionId) => {
  const session = store.get(sessionId);
  if (!session) throw new Error('Session not found');
  return session;
};

/**
 * Return a session view that does not reveal other participants' votes while
 * a voting round is still open. The requesting user's own vote is preserved so
 * their UI can show their selected card; everyone else's votes are hidden.
 * Once the round is complete the full vote map is returned.
 *
 * While the round is open the view includes `votedUserIds` (ids only, no
 * values) so joining/restoring clients can render the "✓ Voted" badge without
 * learning any card value.
 */
const sanitizeSession = (session, requestingUserId = null) => {
  const view = { ...session, votes: null, votedUserIds: null, activeVoteOut: null };
  if (session.votingComplete) {
    view.votes = { ...session.votes };
    view.votedUserIds = Object.keys(session.votes);
  } else {
    view.votedUserIds = Object.keys(session.votes);
    if (requestingUserId && session.votes[requestingUserId]) {
      view.votes = { [requestingUserId]: session.votes[requestingUserId] };
    } else {
      view.votes = {};
    }
  }
  // The stored vote-out state is internal; clients only ever get the public
  // view (tallies + names — never voter identities, never non-JSON values).
  if (session.activeVoteOut) {
    view.activeVoteOut = publicVoteOutView(session);
  } else {
    delete view.activeVoteOut;
  }
  return view;
};

/** Snapshot of all sessions as [id, session] pairs (safe to delete during iteration). */
const getAllSessions = () => Array.from(store.entries());

// ── Join ────────────────────────────────────────────────────────────────────

const joinSession = (sessionId, userName) => {
  let createdUser = null;
  const session = updateSessionAtomic(sessionId, (session) => {
    const isDuplicateName = Object.values(session.users).some(
      (u) => u.name.toLowerCase() === userName.toLowerCase()
    );
    if (isDuplicateName) throw new Error('Username already exists in this session');

    const userId = uuidv4();
    const now = new Date().toISOString();
    createdUser = {
      id: userId, name: userName, isOnline: false, lastSeen: now, joinedAt: now,
    };
    session.users[userId] = createdUser;
  });
  // Return the created user explicitly so callers never have to match by
  // name (names are display strings, not identities).
  return { session, user: createdUser };
};

// ── Atomic update ──────────────────────────────────────────────────────────

/**
 * Mutate the stored session in place.
 *
 * @param {Function} mutator — receives the session; mutate in place.
 *   Return false to skip the lastActivity bump. Throw to abort (validate
 *   before mutating so no partial state is left).
 * @param {object} [options]
 * @param {boolean} [options.updateActivity=true]
 * @returns {object} the session
 */
const updateSessionAtomic = (sessionId, mutator, options = {}) => {
  const session = store.get(sessionId);
  if (!session) throw new Error('Session not found');

  if (mutator(session) === false) return session;

  if (options.updateActivity !== false) session.lastActivity = new Date().toISOString();
  return session;
};

// ── Delete ─────────────────────────────────────────────────────────────────

const deleteSession = (sessionId) => {
  store.delete(sessionId);
};

module.exports = {
  createSession,
  getSession,
  sanitizeSession,
  joinSession,
  updateSessionAtomic,
  deleteSession,
  getAllSessions,
  sanitizeCardSet,
  MAX_CARD_SET_ITEMS,
  MAX_CARD_VALUE_LENGTH,
  computeVoteOutRequired,
  // Exposed for tests / introspection only.
  _store: store,
};