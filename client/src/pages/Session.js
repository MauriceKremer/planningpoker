import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getSession } from '../utils/api';
import { 
  getUserSession, 
  saveUserSession, 
  removeUserSession
} from '../utils/sessionStorage';
import useSessionSocket from '../hooks/useSessionSocket';
import { stopHeartbeat } from '../utils/socket';
import VotingCards from '../components/VotingCards';
import UserList from '../components/UserList';
import Results from '../components/Results';
import ModeratorControls from '../components/ModeratorControls';
import UsernamePrompt from '../components/UsernamePrompt';
import SessionClosed from '../components/SessionClosed';
import SEO from '../components/SEO';
import VoteOutBanner from '../components/VoteOutBanner';

const Session = () => {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  
  const [session, setSession] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showUsernamePrompt, setShowUsernamePrompt] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);

  // Stable updaters for the hook
  const handleSessionUpdate = useCallback((update) => {
    setSession(prev => typeof update === 'function' ? update(prev) : update);
  }, []);
  const handleCurrentUserUpdate = useCallback((update) => {
    setCurrentUser(prev => typeof update === 'function' ? update(prev) : update);
  }, []);

  const { sessionClosed, sessionClosedInfo, isFlashing, socket, heartbeatRef } = useSessionSocket({
    sessionId,
    currentUser,
    session,
    onSessionUpdate: handleSessionUpdate,
    onCurrentUserUpdate: handleCurrentUserUpdate,
  });

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
      } catch (error) {
        setError('Session not found');
      } finally {
        setIsLoading(false);
      }
    };
    loadSession();
  }, [sessionId, currentUser?.id]);

  const handleJoinSuccess = async (user) => {
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
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(shareUrl);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = shareUrl;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (error) {
      alert('Failed to copy link. Please copy it manually.');
    }
  };

  const handleVote = useCallback((vote) => {
    if (socket && currentUser) {
      setSession(prev => ({ ...prev, votes: { ...prev.votes, [currentUser.id]: vote } }));
      socket.emit('submit-vote', { sessionId, userId: currentUser.id, vote });
    }
  }, [socket, currentUser, sessionId]);

  const handleResetVotes = useCallback(() => {
    if (socket) {
      socket.emit('reset-votes', { sessionId });
    }
  }, [socket, sessionId]);

  const handleStartVoting = useCallback(() => {
    if (socket && currentUser) socket.emit('start-voting', { sessionId, userId: currentUser.id });
  }, [socket, currentUser, sessionId]);

  const handleStopRound = useCallback(() => {
    if (socket && currentUser?.isModerator) socket.emit('stop-round', { sessionId, userId: currentUser.id });
  }, [socket, currentUser, sessionId]);

  const handleTestSound = useCallback(() => {
    if (socket && currentUser?.isModerator) socket.emit('test-sound', { sessionId, userId: currentUser.id });
  }, [socket, currentUser, sessionId]);

  const handleUpdateCardSet = useCallback((cardSet) => {
    if (socket && currentUser?.isModerator) socket.emit('update-card-set', { sessionId, userId: currentUser.id, cardSet });
  }, [socket, currentUser, sessionId]);

  const handleTransferModerator = useCallback((targetUserId) => {
    if (socket && currentUser?.isModerator) socket.emit('transfer-moderator', { sessionId, currentModeratorId: currentUser.id, targetUserId });
  }, [socket, currentUser, sessionId]);

  const handleCloseSession = useCallback(() => {
    if (socket && currentUser?.isModerator) socket.emit('close-session', { sessionId, moderatorId: currentUser.id });
  }, [socket, currentUser, sessionId]);

  const handleUpdateUserName = useCallback((newName) => {
    if (socket && currentUser) socket.emit('update-user-name', { sessionId, userId: currentUser.id, newName });
  }, [socket, currentUser, sessionId]);

  const handleStartVoteOut = useCallback((targetUserId) => {
    if (socket && currentUser) {
      socket.emit('start-vote-out', { sessionId, userId: currentUser.id, targetUserId });
    }
  }, [socket, currentUser, sessionId]);

  const handleVoteOut = useCallback((vote) => {
    if (socket && currentUser && session?.activeVoteOut) {
      socket.emit('vote-out', {
        sessionId,
        userId: currentUser.id,
        targetUserId: session.activeVoteOut.targetUserId,
        vote,
      });
    }
  }, [socket, currentUser, session, sessionId]);

  const handleCancelVoteOut = useCallback(() => {
    if (socket && currentUser) {
      socket.emit('cancel-vote-out', { sessionId, userId: currentUser.id });
    }
  }, [socket, currentUser, sessionId]);

  const handleRemoveParticipant = useCallback((targetUserId) => {
    if (socket && currentUser?.isModerator && session?.users[targetUserId]) {
      // eslint-disable-next-line no-restricted-globals
      if (confirm(`Are you sure you want to remove ${session.users[targetUserId].name} from the session?`)) {
        socket.emit('remove-participant', { sessionId, userId: currentUser.id, targetUserId });
      }
    }
  }, [socket, currentUser, session, sessionId]);

  const handleGoHome = useCallback(() => {
    try { removeUserSession(sessionId); } catch (e) {}
    navigate('/');
  }, [sessionId, navigate]);

  const handleLeaveSession = useCallback(() => {
    if (!socket || !currentUser) return;
    // eslint-disable-next-line no-restricted-globals
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
        <h2 className="text-xl font-semibold mb-2 text-center text-clay-600">{error}</h2>
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
      <SEO title={`${session?.title || 'Session'} - Planning Poker`} description="Active Planning Poker estimation session." noindex={true} />
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
                  <button onClick={handleLeaveSession} className="btn btn-quiet text-xs text-clay-600 border-clay-200 hover:bg-clay-50 hover:border-clay-300 px-2.5 py-1" title="Leave this session">Leave Session</button>
                </div>
              </div>
              <div className="mt-1.5">
                <div className="flex items-center space-x-2.5 text-xs">
                  <span className="text-mocha-400 font-mono">ID: {sessionId}</span>
                  <span className="text-mocha-500">Share link:</span>
                  <div className="bg-cream-100/80 px-2 py-1 rounded-md border border-cream-300 flex-1 min-w-0">
                    <code className="text-xs text-mocha-600 truncate block">{`${window.location.origin}/session/${sessionId}`}</code>
                  </div>
                  <button onClick={handleCopyLink} className={`btn btn-quiet px-2 py-1 text-xs ${copySuccess ? '!bg-sage-100 !border-sage-300 !text-sage-700' : 'text-ember-700 hover:bg-ember-50 hover:border-ember-300'}`} title="Copy link to clipboard">
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
              <ModeratorControls session={session} onStartVoting={handleStartVoting} onResetVotes={handleResetVotes} onStopRound={handleStopRound} onTestSound={handleTestSound} onUpdateCardSet={handleUpdateCardSet} onTransferModerator={handleTransferModerator} onCloseSession={handleCloseSession} />
            )}

            {session.isVotingOpen && !session.votingComplete && (
              <div className="card p-4">
                <div className="flex items-center">
                  <div className="w-2.5 h-2.5 bg-ember-500 rounded-full animate-pulse mr-2.5"></div>
                  <div><h4 className="font-semibold text-ember-800 text-sm">Voting Round Active</h4><p className="text-xs text-ember-700">Select your estimate below. Votes will be revealed when everyone has voted.</p></div>
                </div>
              </div>
            )}

            <div className="grid md:grid-cols-2 gap-4">
              <div className="card p-4">
                <h3 className="text-sm font-semibold text-mocha-800 mb-2.5">Participants</h3>
                <UserList users={session.users} votes={session.votes} votedUserIds={session.votedUserIds || []} votingComplete={session.votingComplete} isVotingOpen={session.isVotingOpen} currentUser={currentUser} onRemoveParticipant={handleRemoveParticipant} onUpdateUserName={handleUpdateUserName} activeVoteOut={session.activeVoteOut} onStartVoteOut={handleStartVoteOut} />
              </div>
              {session.votingComplete ? (
                <div className="card p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-base font-semibold text-mocha-800">Voting Results</h3>
                    {currentUser?.isModerator && (
                      <button onClick={handleResetVotes} className="btn btn-primary px-3 py-1.5 text-xs">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                        New Round
                      </button>
                    )}
                  </div>
                  <Results votes={session.votes} users={session.users} cardSet={session.cardSet} />
                </div>
              ) : session.isVotingOpen ? (
                <VotingCards cardSet={session.cardSet} onVote={handleVote} currentUserVote={currentUser ? session.votes[currentUser.id] : null} isVotingOpen={session.isVotingOpen} currentUser={currentUser} onStopRound={handleStopRound} />
              ) : (
                <div className="card p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-base font-semibold text-mocha-800">Waiting for Voting to Start</h3>
                    {currentUser?.isModerator && (
                      <button onClick={handleStartVoting} className="btn btn-primary px-3 py-1.5 text-xs">
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
    </>
  );
};

export default Session;