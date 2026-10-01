/**
 * Contract test for the shared socket-protocol schema (the single source of
 * truth the client validates incoming deltas against, and that the server
 * validates its outgoing deltas against).
 *
 * A broken or unrecognized payload must be rejected at the boundary, never
 * reaching the reducer as an unknown shape.
 */
import { describe, it, expect } from 'vitest';
import { validateEvent, eventSchemas, type EventName } from '../events';

// A representative valid payload per event the reducer owns — mirrors the
// fixtures in utils/__tests__/sessionDelta.test.js so the two halves of the
// delta contract can't drift.
const VALID: Record<EventName, unknown> = {
   'vote-submitted': { userId: 'u-2', hasVoted: true, votingComplete: false, isVotingOpen: true, votes: null, votedUserIds: ['u-2'], voteCount: 1, totalUsers: 3 },
   'vote-accepted': { userId: 'u-1', vote: '8', votingComplete: false, isVotingOpen: true },
   'votes-reset': { isVotingOpen: true, votingComplete: false, votes: {} },
   'voting-started': { isVotingOpen: true, votingComplete: false, votes: {}, round: 2 },
   'round-stopped': { isVotingOpen: false, votingComplete: true, votes: { 'u-1': '3' }, round: 2, stoppedBy: 'Alice' },
   'card-set-updated': { cardSet: ['A', 'B'], isVotingOpen: false, votingComplete: false, votes: {} },
   'vote-out-started': { targetUserId: 'u-3', targetUserName: 'Charlie', initiatedByUserId: 'u-2', initiatedByName: 'Bob', eligibleVoters: ['u-1', 'u-2'], yesVotes: 0, noVotes: 0, requiredYesVotes: 1, thresholdPercent: 25 },
   'vote-out-cast': { targetUserId: 'u-3', yesVotes: 1, noVotes: 0, requiredYesVotes: 1 },
   'vote-out-ended': { targetUserId: 'u-3', removed: true, reason: 'Removed by participant vote' },
   'user-joined': { user: { id: 'u-4', name: 'Dave', isModerator: false, isOnline: true } },
   'user-status-changed': { user: { id: 'u-4', name: 'Dave', isModerator: false, isOnline: true } },
   'user-disconnected': { userId: 'u-2', user: { id: 'u-2', name: 'Bob', isModerator: false, isOnline: true } },
   'user-countdown': { userId: 'u-3', user: { id: 'u-3', name: 'Charlie', isModerator: false, isOnline: false }, remainingSeconds: 42 },
   'user-name-updated': { userId: 'u-1', oldName: 'Alice', newName: 'Alicia', user: { id: 'u-1', name: 'Alicia', isModerator: true, isOnline: true, avatar: { color: 'teal' } }, isModeratorNameUpdate: true, moderatorName: 'Alicia' },
   'user-avatar-updated': { userId: 'u-2', user: { id: 'u-2', name: 'Bob', isModerator: false, isOnline: true, avatar: { color: 'moss', glyph: '🦊' } } },
   'moderator-changed': { newModeratorId: 'u-2', newModeratorName: 'Bob', previousModeratorId: 'u-1', previousModeratorName: 'Alice', wasManualTransfer: true },
   'participant-removed': { userId: 'u-3', user: { id: 'u-3', name: 'Charlie', isModerator: false, isOnline: true }, removedBy: 'Alice' },
   'participant-auto-removed': { userId: 'u-2', user: { id: 'u-2', name: 'Bob', isModerator: false, isOnline: true }, reason: 'Removed due to inactivity' },
   'session-joined': { session: { id: 'ABC12345' } },
   'connection-conflict': { message: 'accessed elsewhere' },
   'session-closed': { sessionTitle: 'Sprint', moderatorName: 'Alice' },
   'you-were-removed': { reason: 'inactivity', removedBy: 'Moderator' },
   'session-cleanup': { message: 'Session closed' },
   'test-sound-trigger': {},
   'leave-acknowledged': {},
};

describe('protocol.validateEvent', () => {
    it('accepts a valid payload for every known event', () => {
     for (const event of Object.keys(eventSchemas) as EventName[]) {
       const parsed = validateEvent(event, VALID[event]);
      expect(parsed, event).not.toBeNull();
      expect(typeof parsed, event).toBe('object');
      }
      });

    it('rejects a malformed payload (a missing required field)', () => {
        // `vote-accepted` requires `vote` to be a string.
      expect(validateEvent('vote-accepted', { userId: 'u-1', votingComplete: false, isVotingOpen: true })).toBeNull();
        // `votes-reset` requires `votes` to be a map.
      expect(validateEvent('votes-reset', { isVotingOpen: true, votingComplete: false })).toBeNull();
        // `user-joined` requires a `user` matching the user schema.
      expect(validateEvent('user-joined', { user: { id: 'u-4' } })).toBeNull();
        // Wrong types are rejected, not coerced into state.
      expect(validateEvent('vote-out-cast', { targetUserId: 'u-3', yesVotes: 'lots' })).toBeNull();
    });

    it('rejects an unknown event name', () => {
      expect(validateEvent('no-such-event' as EventName, {})).toBeNull();
      });

    it('rejects a non-object payload', () => {
      expect(validateEvent('session-closed', null)).toBeNull();
      expect(validateEvent('session-closed', 'not-an-object')).toBeNull();
      expect(validateEvent('session-closed', 42)).toBeNull();
      });
});
