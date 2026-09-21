import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSocket, startHeartbeat, stopHeartbeat } from '../utils/socket';
import { removeUserSession } from '../utils/sessionStorage';
import { applyEvent } from '../utils/sessionDelta';

/**
 * Custom hook to manage socket connection lifecycle for a session.
 * Extracts the large socket event handler block from Session.js.
 */
const useSessionSocket = ({ sessionId, currentUser, session, onSessionUpdate, onCurrentUserUpdate }) => {
  const navigate = useNavigate();
  const socket = useSocket();
  const [isSocketReady, setIsSocketReady] = useState(false);
  // Ref mirror so the join effect can read readiness without re-running when
  // it flips (which used to tear down listeners and re-emit join-session).
  const isSocketReadyRef = useRef(false);
  const [sessionClosed, setSessionClosed] = useState(false);
  const [sessionClosedInfo, setSessionClosedInfo] = useState(null);
  const [isFlashing, setIsFlashing] = useState(false);
  const hasJoinedRef = useRef(false);
  const heartbeatRef = useRef(null);

  // Notify participants that voting started (sound + flash)
  const notifyVotingStarted = useCallback(() => {
    setIsFlashing(true);
    setTimeout(() => setIsFlashing(false), 800);
    try {
      const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmgfAzCB2OqzZR8ELoHM88t7KgU=');
      audio.volume = 0.3;
      audio.play().catch(() => {});
    } catch (e) {}
  }, []);

  useEffect(() => {
    if (!socket || !currentUser || !sessionId) return;
    if (hasJoinedRef.current) return;
    hasJoinedRef.current = true;
    setIsSocketReady(false);
    isSocketReadyRef.current = false;

    socket.auth = { sessionId, userId: currentUser.id };

    const readyTimeout = setTimeout(() => {
      if (!isSocketReadyRef.current && socket.connected) {
        socket.emit('join-session', { sessionId, userId: currentUser.id });
      }
    }, 5000);

    const handleConnect = () => {
      socket.emit('join-session', { sessionId, userId: currentUser.id });
    };

    const handleConnectError = (err) => {
      if (err.message === 'Session not found' || err.message === 'User not found in session') {
        removeUserSession(sessionId);

      }
    };

    socket.on('connect_error', handleConnectError);

    if (socket.connected) {
      handleConnect();
    } else {
      socket.on('connect', handleConnect);
      socket.connect();
    }

    socket.io.on('reconnect', () => {
      socket.emit('join-session', { sessionId, userId: currentUser.id });
    });

    const interval = startHeartbeat(socket, sessionId, currentUser.id);
    heartbeatRef.current = interval;

    socket.on('vote-out-started', (data) =>
      onSessionUpdate(prev => applyEvent(prev, 'vote-out-started', data)));
    socket.on('vote-out-cast', (data) =>
      onSessionUpdate(prev => applyEvent(prev, 'vote-out-cast', data)));
    socket.on('vote-out-ended', (data) => {
      onSessionUpdate(prev => applyEvent(prev, 'vote-out-ended', data));
      if (data.removed && currentUser?.id === data.targetUserId) {
        alert('You have been removed from the session by participant vote.');
        removeUserSession(sessionId);
        navigate('/');
      }
    });

    // --- Socket event handlers ---
    socket.on('error', (error) => console.error('Socket error:', error));

    socket.on('vote-submitted', (data) =>
      onSessionUpdate(prev => applyEvent(prev, 'vote-submitted', data)));

    // Server-confirmed echo of the voter's own card (targeted event).
    socket.on('vote-accepted', (data) =>
      onSessionUpdate(prev => applyEvent(prev, 'vote-accepted', data)));

    socket.on('votes-reset', (data) =>
      onSessionUpdate(prev => applyEvent(prev, 'votes-reset', data)));
    socket.on('voting-started', (data) => {
      onSessionUpdate(prev => applyEvent(prev, 'voting-started', data));
      notifyVotingStarted();
    });
    socket.on('round-stopped', (data) =>
      onSessionUpdate(prev => applyEvent(prev, 'round-stopped', data)));
    socket.on('test-sound-trigger', () => notifyVotingStarted());
    socket.on('card-set-updated', (data) =>
      onSessionUpdate(prev => applyEvent(prev, 'card-set-updated', data)));

    socket.on('user-name-updated', (data) => {
      onSessionUpdate(prev => applyEvent(prev, 'user-name-updated', data));
      if (data.userId === currentUser?.id) onCurrentUserUpdate(prev => ({ ...prev, name: data.newName }));
    });

    socket.on('user-joined', (data) =>
      onSessionUpdate(prev => applyEvent(prev, 'user-joined', data)));

    socket.on('session-joined', (data) => {
      // Initial full-state load — the only event that still ships the whole session.
      onSessionUpdate(data.session);
      setIsSocketReady(true);
      isSocketReadyRef.current = true;
      clearTimeout(readyTimeout);
    });

    socket.on('user-disconnected', (data) =>
      onSessionUpdate(prev => applyEvent(prev, 'user-disconnected', data)));

    socket.on('moderator-changed', (data) => {
      onSessionUpdate(prev => applyEvent(prev, 'moderator-changed', data));
      if (currentUser) {
        const updatedUser = currentUser.id === data.newModeratorId
          ? data.newModerator
          : (currentUser.id === data.previousModeratorId ? data.previousModerator : null);
        if (updatedUser) onCurrentUserUpdate(updatedUser);
      }
      const isNewMod = currentUser && currentUser.id === data.newModeratorId;
      const wasPrevMod = currentUser && currentUser.id === data.previousModeratorId;
      if (data.wasManualTransfer) {
        if (isNewMod) alert(`You have been made the moderator by ${data.previousModeratorName}!`);
        else if (wasPrevMod) alert(`You have transferred moderator role to ${data.newModeratorName}`);
      } else if (isNewMod) {
        alert('You are now the moderator of this session!');
      }
    });

    socket.on('participant-removed', (data) =>
      onSessionUpdate(prev => applyEvent(prev, 'participant-removed', data)));

    socket.on('connection-conflict', (data) => {
      removeUserSession(sessionId);

      alert(data.message || 'Your session has been accessed from another location.');
      navigate('/');
    });

    socket.on('session-closed', (data) => {
      setSessionClosedInfo({ sessionTitle: data.sessionTitle, moderatorName: data.moderatorName });
      try { removeUserSession(sessionId); } catch (e) {}
      setSessionClosed(true);
    });

    socket.on('you-were-removed', (data) => { alert(`${data.reason} by ${data.removedBy}`); navigate('/'); });

    socket.on('session-cleanup', (data) => {
      try { removeUserSession(sessionId); } catch (e) {}
      alert(`Session closed: ${data.message}`);
      navigate('/');
    });

    socket.on('user-status-changed', (data) =>
      onSessionUpdate(prev => applyEvent(prev, 'user-status-changed', data)));

    socket.on('user-countdown', (data) =>
      onSessionUpdate(prev => applyEvent(prev, 'user-countdown', data)));

    socket.on('participant-auto-removed', (data) =>
      onSessionUpdate(prev => applyEvent(prev, 'participant-auto-removed', data)));

    socket.on('leave-acknowledged', () => { /* handled optimistically in handleLeaveSession */ });

    return () => {
      clearTimeout(readyTimeout);
      hasJoinedRef.current = false;
      setIsSocketReady(false);
      stopHeartbeat(heartbeatRef.current);
      heartbeatRef.current = null;
      socket.off('connect', handleConnect);
      socket.off('connect_error', handleConnectError);
      socket.io.off('reconnect');
      const events = ['error','vote-submitted','vote-accepted','votes-reset','voting-started','round-stopped','test-sound-trigger',
        'card-set-updated','user-name-updated','user-joined','session-joined','user-disconnected',
        'moderator-changed','participant-removed','session-closed','you-were-removed','session-cleanup',
        'user-status-changed','user-countdown','participant-auto-removed','connection-conflict','leave-acknowledged',
        'vote-out-started','vote-out-cast','vote-out-ended'];
      events.forEach(e => socket.off(e));
    };
  }, [socket, currentUser, sessionId, navigate, notifyVotingStarted, onSessionUpdate, onCurrentUserUpdate]);

  return { isSocketReady, sessionClosed, sessionClosedInfo, isFlashing, socket, heartbeatRef };
};

export default useSessionSocket;