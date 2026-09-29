import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getSession } from '../utils/api';
import {
  getUserSession,
  saveUserSession,
  removeUserSession
} from '../utils/sessionStorage';
import useSessionSocket from '../hooks/useSessionSocket';
import { stopHeartbeat } from '../utils/socket';
import { applyEvent } from '../utils/sessionDelta';
import type { SessionState, SessionUser, Updater } from '../protocol/session';
import VotingCards from '../components/VotingCards';
import UserList from '../components/UserList';
import Results from '../components/Results';
import ModeratorControls from '../components/ModeratorControls';
import UsernamePrompt from '../components/UsernamePrompt';
import SessionClosed from '../components/SessionClosed';
import SEO from '../components/SEO';
import VoteOutBanner from '../components/VoteOutBanner';

/**
 * Clipboard write with a textarea fallback for non-secure contexts, where
 * `navigator.clipboard` is unavailable (execCommand is deprecated but is the
 * only option there).
 */
const copyText = async (text: string) => {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.style.position = 'fixed';
  textArea.style.opacity = '0';
  document.body.appendChild(textArea);
  textArea.select();
  document.execCommand('copy');
  document.body.removeChild(textArea);
};

const Session = () => {
  // The route is `/session/:sessionId`, so the param is always present on
  // anything this page renders; the `?? ''` fallback only routes the
  // theoretically-possible missing-param case into the API's 404 path.
  const { sessionId: routeSessionId } = useParams<{ sessionId: string }>();
  const sessionId = routeSessionId ?? '';
  const navigate = useNavigate();

  const [session, setSession] = useState<SessionState | null>(null);
  const [currentUser, setCurrentUser] = useState<SessionUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showUsernamePrompt, setShowUsernamePrompt] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);

  // Stable updaters for the socket hook
  const handleSessionUpdate = useCallback((update: Updater<SessionState | null>) => {
    setSession(prev => typeof update === 'function' ? update(prev) : update);
  }, []);
  const handleCurrentUserUpdate = useCallback((update: Updater<SessionUser | null>) => {
    setCurrentUser(prev => typeof update === 'function' ? update(prev) : update);
  }, []);

  const { sessionClosed, sessionClosedInfo, isFlashing, socket, heartbeatRef } = useSessionSocket({
    sessionId,
    currentUser,
    onSessionUpdate: handleSessionUpdate,
    onCurrentUserUpdate: handleCurrentUserUpdate,
  });

  // Emit a socket event carrying the acting user's identity.
  const emitAsUser = useCallback((event: string, payload: Record<string, unknown> = {}) => {
    if (socket && currentUser) socket.emit(event, { sessionId, userId: currentUser.id, ...payload });
  }, [socket, currentUser, sessionId]);

  // Same, but only when the current user holds the moderator role.
  const emitAsModerator = useCallback((event: string, payload: Record<string, unknown> = {}) => {
    if (socket && currentUser?.isModerator) socket.emit(event, { sessionId, userId: currentUser.id, ...payload });
  }, [socket, currentUser, sessionId]);

  // Load session on mount
  useEffect(() => {
    const loadSession = async () => {
      try {
        const response = await getSession(sessionId);
        setSession(response.session);

        const storedUserData = getUserSession(sessionId);
        if (storedUserData) {
          const user = response.session.users[storedUserData.userId];
          if (user) {
            setCurrentUser(user);
          } else {
            removeUserSession(sessionId);
            setShowUsernamePrompt(true);
          }
        } else {
          setShowUsernamePrompt(true);
        }
      } catch {
        setError('Session not found');
      } finally {
        setIsLoading(false);
      }
    };
    loadSession();
  }, [sessionId, currentUser?.id]);

  const handleJoinSuccess = async (user: SessionUser) => {
    setCurrentUser(user);
    setShowUsernamePrompt(false);
    saveUserSession(sessionId, { userId: user.id, userName: user.name, isModerator: user.isModerator || false, joinedAt: user.joinedAt });
    try {
      const response = await getSession(sessionId);
      setSession(response.session);
    } catch (error) {
      console.error('Failed to refresh session after join:', error);
    }
    window.history.replaceState({}, '', window.location.pathname);
  };

  const handleCopyLink = async () => {
    const shareUrl = `${window.location.origin}/session/${sessionId}`;
    try {
      await copyText(shareUrl);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch {
      alert('Failed to copy link. Please copy it manually.');
    }
  };

  // Optimistic-UI bookkeeping: the snapshot taken just before an unconfirmed
  // local mutation. The confirming socket event clears it; the plain 'error'
  // reply (e.g. rejected vote, failed round start) restores the snapshot, so
  // the UI never sticks on a state the server refused. A short timeout is
  // the backstop — any authoritative broadcast reconciles afterwards anyway.
  const optimisticRef = useRef<{ snapshot: SessionState } | null>(null);

  useEffect(() => {
    if (!socket) return;
    const confirm = () => { optimisticRef.current = null; };
    const rollback = () => {
      const pending = optimisticRef.current;
      optimisticRef.current = null;
      if (pending) setSession(pending.snapshot);
    };
    // Events whose arrival means the optimistic mutation was accepted.
    const confirmEvents = ['vote-accepted', 'vote-submitted', 'voting-started', 'votes-reset'] as const;
    for (const event of confirmEvents) socket.on(event, confirm);
    socket.on('error', rollback);
    return () => {
      for (const event of confirmEvents) socket.off(event, confirm);
      socket.off('error', rollback);
    };
  }, [socket]);

  // Stage an optimistic mutation: remember the pre-mutation snapshot and
  // self-expire the pending state so a lost reply cannot wedge the UI.
  const stage = useCallback((snapshot: SessionState) => {
    optimisticRef.current = { snapshot };
    setTimeout(() => {
      if (optimisticRef.current?.snapshot === snapshot) optimisticRef.current = null;
    }, 2500);
  }, []);

  const act = useCallback((event: string, payload: Record<string, unknown>, apply: (prev: SessionState) => SessionState | null) => {
    if (!socket || !currentUser) return;
    setSession(prev => {
      if (!prev) return prev;
      const next = apply(prev);
      if (!next) return prev;
      stage(prev);
      return next;
    });
    socket.emit(event, { sessionId, userId: currentUser.id, ...payload });
  }, [socket, currentUser, sessionId, stage]);

  const handleVote = useCallback((vote: string) => {
    if (!currentUser) return;
    act('submit-vote', { vote }, prev => {
      if (!prev.isVotingOpen || prev.votingComplete) return null;
      // Render the selection before the server answers: own card value, the
      // voted marker, and — when this vote completes the round — the reveal.
      // The authoritative vote-submitted / vote-accepted delta replaces this;
      // the socket 'error' reply rolls it back.
      const userCount = Object.keys(prev.users).length;
      const alreadyVoted = (prev.votedUserIds ?? []).includes(currentUser.id);
      const votingComplete = userCount > 0
        && (prev.votedUserIds?.length ?? 0) + (alreadyVoted ? 0 : 1) >= userCount;
      const accepted = applyEvent(prev, 'vote-accepted', {
        userId: currentUser.id, vote, votingComplete: false, isVotingOpen: true,
      });
      return applyEvent(accepted, 'vote-submitted', {
        userId: currentUser.id, hasVoted: true,
        votingComplete, isVotingOpen: true,
        votes: null,
        votedUserIds: [...(prev.votedUserIds ?? []), currentUser.id],
      });
    });
  }, [act, currentUser]);

  const handleResetVotes = useCallback(() => {
    act('reset-votes', {}, prev => prev.votingComplete ? applyEvent(prev, 'votes-reset', {
      isVotingOpen: true, votingComplete: false, votes: {},
    }) : null);
  }, [act]);

  const handleStartVoting = useCallback(() => {
    act('start-voting', {}, prev => prev.isVotingOpen ? null : applyEvent(prev, 'voting-started', {
      isVotingOpen: true, votingComplete: false, votes: {},
    }));
  }, [act]);

  const handleStopRound = useCallback(() => emitAsModerator('stop-round'), [emitAsModerator]);
  const handleTestSound = useCallback(() => emitAsModerator('test-sound'), [emitAsModerator]);
  const handleUpdateCardSet = useCallback((cardSet: string[]) => emitAsModerator('update-card-set', { cardSet }), [emitAsModerator]);

  const handleTransferModerator = useCallback((targetUserId: string) => {
    if (!currentUser?.isModerator) return;
    emitAsModerator('transfer-moderator', { currentModeratorId: currentUser.id, targetUserId });
  }, [currentUser, emitAsModerator]);

  const handleCloseSession = useCallback(() => {
    if (!currentUser?.isModerator) return;
    emitAsModerator('close-session', { moderatorId: currentUser.id });
  }, [currentUser, emitAsModerator]);

  const handleRemoveParticipant = useCallback((targetUserId: string) => {
    const target = session?.users[targetUserId];
    if (!socket || !currentUser?.isModerator || !target) return;
    if (confirm(`Are you sure you want to remove ${target.name} from the session?`)) {
      socket.emit('remove-participant', { sessionId, userId: currentUser.id, targetUserId });
    }
  }, [socket, currentUser, session, sessionId]);

  const handleUpdateUserName = useCallback((newName: string) => emitAsUser('update-user-name', { newName }), [emitAsUser]);

  const handleStartVoteOut = useCallback((targetUserId: string) => emitAsUser('start-vote-out', { targetUserId }), [emitAsUser]);

  const handleCancelVoteOut = useCallback(() => emitAsUser('cancel-vote-out'), [emitAsUser]);

  const handleVoteOut = useCallback((vote: 'yes' | 'no') => {
    const targetUserId = session?.activeVoteOut?.targetUserId;
    if (targetUserId) emitAsUser('vote-out', { targetUserId, vote });
  }, [session, emitAsUser]);

  const handleGoHome = useCallback(() => {
    try { removeUserSession(sessionId); } catch { /* nothing stored */ }
    navigate('/');
  }, [sessionId, navigate]);

  const handleLeaveSession = useCallback(() => {
    if (!socket || !currentUser) return;
    if (!confirm('Are you sure you want to leave this session?')) return;

    if (heartbeatRef.current) {
      stopHeartbeat(heartbeatRef.current);
      heartbeatRef.current = null;
    }

    socket.emit('leave-session', { sessionId, userId: currentUser.id });
    removeUserSession(sessionId);

    navigate('/session-closed', {
      state: { sessionTitle: session?.title || 'Planning Poker Session', moderatorName: session?.moderator || null, userLeft: true }
    });
  }, [socket, currentUser, sessionId, session, navigate, heartbeatRef]);

  if (isLoading) {
    return (
      <div className="max-w-md mx-auto card p-5">
        <div className="text-center text-mocha-600">Loading session...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-md mx-auto card p-5">
        <h2 role="alert" className="text-xl font-semibold mb-2 text-center text-clay-600">{error}</h2>
        <p className="text-center text-mocha-500 mb-4">This session may have expired, been closed, or the link is invalid.</p>
        <div className="flex justify-center">
          <button onClick={handleGoHome} className="btn btn-secondary py-2 px-4">Go back to main screen</button>
        </div>
      </div>
    );
  }

  if (sessionClosed && sessionClosedInfo) {
    return <SessionClosed sessionTitle={sessionClosedInfo.sessionTitle} moderatorName={sessionClosedInfo.moderatorName} />;
  }

  if (!session) {
    return (
      <div className="max-w-md mx-auto card p-5">
        <h2 className="text-xl font-semibold mb-2 text-center text-mocha-800">Session not found</h2>
        <p className="text-center text-mocha-500 mb-4">This session may have expired, been closed, or the link is invalid.</p>
        <div className="flex justify-center">
          <button onClick={handleGoHome} className="btn btn-secondary py-2 px-4">Go back to main screen</button>
        </div>
      </div>
    );
  }

  if (showUsernamePrompt) {
    return <UsernamePrompt sessionId={sessionId} sessionTitle={session.title} onJoinSuccess={handleJoinSuccess} />;
  }

  return (
    <>
      <SEO title={`${session.title} - Planning Poker`} description="Active Planning Poker estimation session." noindex={true} />
      <div className="relative">
        {isFlashing && <div className="fixed inset-0 bg-sage-400 opacity-30 z-50 pointer-events-none animate-pulse" />}
        <div className="container mx-auto px-4 py-6">
          <div className="max-w-4xl mx-auto space-y-4">
            <div className="card p-4">
              <div className="flex justify-between items-start mb-2.5">
                <div><h1 className="text-lg font-bold text-mocha-800">{session.title}</h1></div>
                <div className="flex items-center gap-2.5">
                  <div className="text-xs text-mocha-500">
                    Moderator: <span className="font-medium text-mocha-700">{session.moderator}</span>
                    {currentUser?.isModerator && <span className="badge badge-honey ml-1.5">You!</span>}
                  </div>
                  <button onClick={handleLeaveSession} className="btn btn-quiet text-xs text-clay-600 border-clay-200 hover:bg-clay-50 hover:border-clay-300 px-2.5 py-1 min-h-[44px]" title="Leave this session">Leave Session</button>
                </div>
              </div>
              <div className="mt-1.5">
                <div className="flex items-center space-x-2.5 text-xs">
                  <span className="text-mocha-400 font-mono">ID: {sessionId}</span>
                  <span className="text-mocha-500">Share link:</span>
                  <div className="bg-cream-100/80 px-2 py-1 rounded-md border border-cream-300 flex-1 min-w-0">
                    <code className="text-xs text-mocha-600 truncate block">{`${window.location.origin}/session/${sessionId}`}</code>
                  </div>
                  <button onClick={handleCopyLink} className={`btn btn-quiet px-2 py-1 text-xs min-h-[44px] ${copySuccess ? '!bg-sage-100 !border-sage-300 !text-sage-700' : 'text-ember-700 hover:bg-ember-50 hover:border-ember-300'}`} title="Copy link to clipboard">
                    {copySuccess ? <span>✓ Copied!</span> : <span>📋 Copy</span>}
                  </button>
                </div>
              </div>
            </div>

            <VoteOutBanner
              activeVoteOut={session.activeVoteOut}
              currentUserId={currentUser?.id}
              onVote={handleVoteOut}
              onCancel={handleCancelVoteOut}
            />

            {currentUser?.isModerator && (
              <ModeratorControls session={session} onTestSound={handleTestSound} onUpdateCardSet={handleUpdateCardSet} onTransferModerator={handleTransferModerator} onCloseSession={handleCloseSession} />
            )}

            {session.isVotingOpen && !session.votingComplete && (
              <div role="status" className="card p-4">
                <div className="flex items-center">
                  <div className="w-2.5 h-2.5 bg-ember-500 rounded-full animate-pulse mr-2.5"></div>
                  <div><h2 className="font-semibold text-ember-800 text-sm">Voting Round Active</h2><p className="text-xs text-ember-700">Select your estimate below. Votes will be revealed when everyone has voted.</p></div>
                </div>
              </div>
            )}

            <div className="grid md:grid-cols-2 gap-4">
              <div className="card p-4">
                <h3 className="text-sm font-semibold text-mocha-800 mb-2.5">Participants</h3>
                <UserList users={session.users} votes={session.votes} votedUserIds={session.votedUserIds || []} votingComplete={session.votingComplete} isVotingOpen={session.isVotingOpen} currentUser={currentUser} onRemoveParticipant={handleRemoveParticipant} onUpdateUserName={handleUpdateUserName} activeVoteOut={session.activeVoteOut} onStartVoteOut={handleStartVoteOut} />
              </div>
              <div aria-live="polite">
                {session.votingComplete ? (
                  <div className="card p-5">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-base font-semibold text-mocha-800">Voting Results</h3>
                      {currentUser?.isModerator && (
                        <button onClick={handleResetVotes} className="btn btn-primary px-3 py-1.5 text-xs min-h-[44px]">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                          New Round
                        </button>
                      )}
                    </div>
                    <Results votes={session.votes} cardSet={session.cardSet ?? []} />
                  </div>
                ) : session.isVotingOpen ? (
                  <VotingCards cardSet={session.cardSet ?? []} onVote={handleVote} currentUserVote={currentUser ? session.votes[currentUser.id] : null} isVotingOpen={session.isVotingOpen} currentUser={currentUser} onStopRound={handleStopRound} />
                ) : (
                  <div className="card p-5">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-base font-semibold text-mocha-800">Waiting for Voting to Start</h3>
                      {currentUser?.isModerator && (
                        <button onClick={handleStartVoting} className="btn btn-primary px-3 py-1.5 text-xs min-h-[44px]">
                          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" /></svg>
                          Start Voting
                        </button>
                      )}
                    </div>
                    <p className="text-sm text-mocha-500">{currentUser?.isModerator ? "Click 'Start Voting' to begin a new voting round." : 'The moderator will start the voting round when ready.'}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default Session;