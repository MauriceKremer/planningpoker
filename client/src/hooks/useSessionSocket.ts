import {
  useState,
  useEffect,
  useCallback,
  useRef,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { useSocket, startHeartbeat, stopHeartbeat } from '../utils/socket';
import { removeUserSession } from '../utils/sessionStorage';
import { applyEvent } from '../utils/sessionDelta';
import { validateEvent, type EventName } from '../protocol/events';
import type {
  SessionState,
  SessionUser,
  SessionClosedInfo,
  Updater,
} from '../protocol/session';

export interface UseSessionSocketArgs {
  sessionId: string;
  currentUser: SessionUser | null;
  onSessionUpdate: (update: Updater<SessionState | null>) => void;
  onCurrentUserUpdate: (update: Updater<SessionUser | null>) => void;
}

const useSessionSocket = ({
  sessionId,
  currentUser,
  onSessionUpdate,
  onCurrentUserUpdate,
}: UseSessionSocketArgs) => {
  const navigate = useNavigate();
  const socket = useSocket();
  const [isSocketReady, setIsSocketReady] = useState(false);
  // Ref mirror so the join effect can read readiness without re-running when
  // it flips (which used to tear down listeners and re-emit join-session).
  const isSocketReadyRef = useRef(false);
  const [sessionClosed, setSessionClosed] = useState(false);
  const [sessionClosedInfo, setSessionClosedInfo] = useState<
    SessionClosedInfo | null
  >(null);
  const [isFlashing, setIsFlashing] = useState(false);
  const hasJoinedRef = useRef(false);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Notify participants that voting started (sound + flash)
  const notifyVotingStarted = useCallback(() => {
    setIsFlashing(true);
    setTimeout(() => setIsFlashing(false), 800);
    try {
      const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmgfAzCB2OqzZR8ELoHM88t7KgU=');
      audio.volume = 0.3;
      audio.play().catch(() => { /* autoplay rejection is expected and harmless */ });
    } catch { /* audio unsupported — sound is optional */ }
  }, []);

  useEffect(() => {
    if (!socket || !currentUser || !sessionId) return;
    if (hasJoinedRef.current) return;
    hasJoinedRef.current = true;
    setIsSocketReady(false);
    isSocketReadyRef.current = false;

    // The session is gone server-side (closed, cleaned up, or a reconnected
    // socket rejected at join). Render the closed-session UI instead of
    // leaving a blank zombie page. Shared by the two paths that can learn
    // this: `connect_error` and the plain `error` reply to `join-session`.
    const showSessionClosed = (info: SessionClosedInfo) => {
      setSessionClosedInfo(info);
      try { removeUserSession(sessionId); } catch { /* nothing stored */ }
      setSessionClosed(true);
    };

    socket.auth = { sessionId, userId: currentUser.id };

    const readyTimeout = setTimeout(() => {
      if (!isSocketReadyRef.current && socket.connected) {
        socket.emit('join-session', { sessionId, userId: currentUser.id });
      }
    }, 5000);

    const handleConnect = () => {
      socket.emit('join-session', { sessionId, userId: currentUser.id });
    };

    const handleConnectError = (err: Error) => {
      if (err.message === 'Session not found' || err.message === 'User not found in session') {
        showSessionClosed({ sessionTitle: 'Planning Poker Session', moderatorName: null });
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

    // M5.2: every incoming broadcast is validated at the boundary
    // (`validateEvent`) and merged by the typed reducer (`applyEvent`).
    // A malformed delta is dropped — never silently corrupting local state.
    const patch = <E extends EventName>(event: E, data: unknown) => {
      const payload = validateEvent(event, data);
      if (!payload) return;
      onSessionUpdate((prev) =>
        prev ? applyEvent(prev, event, payload) : prev,
      );
    };

    socket.on('vote-submitted', (data) => patch('vote-submitted', data));

    // Server-confirmed echo of the voter's own card (targeted event).
    socket.on('vote-accepted', (data) => patch('vote-accepted', data));

    socket.on('votes-reset', (data) => patch('votes-reset', data));
    socket.on('voting-started', (data) => {
      notifyVotingStarted();
      patch('voting-started', data);
    });
    socket.on('round-stopped', (data) => patch('round-stopped', data));
    socket.on('test-sound-trigger', (data) => {
      notifyVotingStarted();
      patch('test-sound-trigger', data);
    });
    socket.on('card-set-updated', (data) => patch('card-set-updated', data));

    socket.on('user-name-updated', (data) => {
      const p = validateEvent('user-name-updated', data);
      if (!p) return;
      onSessionUpdate((prev) =>
        prev ? applyEvent(prev, 'user-name-updated', p) : prev,
      );
      if (p.userId === currentUser?.id) {
        onCurrentUserUpdate((user) => (user ? { ...user, name: p.newName } : user));
      }
    });

    socket.on('user-joined', (data) => patch('user-joined', data));

    socket.on('session-joined', (data) => {
      // Initial full-state load — the only event that still ships the whole session.
      const p = validateEvent('session-joined', data);
      if (!p) return;
      onSessionUpdate(p.session as SessionState | null);
      setIsSocketReady(true);
      isSocketReadyRef.current = true;
      clearTimeout(readyTimeout);
    });

    socket.on('user-disconnected', (data) => patch('user-disconnected', data));

    socket.on('moderator-changed', (data) => {
      const p = validateEvent('moderator-changed', data);
      if (!p) return;
      onSessionUpdate((prev) =>
        prev ? applyEvent(prev, 'moderator-changed', p) : prev,
      );
      if (currentUser) {
        const updatedUser = currentUser.id === p.newModeratorId
          ? p.newModerator
          : (currentUser.id === p.previousModeratorId ? p.previousModerator : null);
        if (updatedUser) onCurrentUserUpdate(updatedUser);
      }
      const isNewMod = currentUser && currentUser.id === p.newModeratorId;
      const wasPrevMod = currentUser && currentUser.id === p.previousModeratorId;
      if (p.wasManualTransfer) {
        if (isNewMod) alert(`You have been made the moderator by ${p.previousModeratorName}!`);
        else if (wasPrevMod) alert(`You have transferred moderator role to ${p.newModeratorName}`);
      } else if (isNewMod) {
        alert('You are now the moderator of this session!');
      }
    });

    socket.on('participant-removed', (data) =>
      patch('participant-removed', data));

    socket.on('connection-conflict', (data) => {
      const p = validateEvent('connection-conflict', data);
      if (!p) return;
      removeUserSession(sessionId);

      alert(p.message || 'Your session has been accessed from another location.');
      navigate('/');
    });

    socket.on('session-closed', (data) => {
      const p = validateEvent('session-closed', data);
      if (!p) return;
      showSessionClosed({ sessionTitle: p.sessionTitle, moderatorName: p.moderatorName ?? null });
    });

    socket.on('you-were-removed', (data) => {
      const p = validateEvent('you-were-removed', data);
      if (!p) return;
      alert(`${p.reason} by ${p.removedBy}`);
      navigate('/');
    });

    socket.on('session-cleanup', (data) => {
      const p = validateEvent('session-cleanup', data);
      if (!p) return;
      try { removeUserSession(sessionId); } catch { /* already gone */ }
      alert(`Session closed: ${p.message}`);
      navigate('/');
    });

    socket.on('user-countdown', (data) => patch('user-countdown', data));
    socket.on('participant-auto-removed', (data) =>
      patch('participant-auto-removed', data));

    socket.on('leave-acknowledged', (data) => patch('leave-acknowledged', data));

    socket.on('vote-out-started', (data) => patch('vote-out-started', data));
    socket.on('vote-out-cast', (data) => patch('vote-out-cast', data));
    socket.on('vote-out-ended', (data) => {
      const p = validateEvent('vote-out-ended', data);
      if (!p) return;
      onSessionUpdate((prev) =>
        prev ? applyEvent(prev, 'vote-out-ended', p) : prev,
      );
      if (p.removed && currentUser?.id === p.targetUserId) {
        alert('You have been removed from the session by participant vote.');
        removeUserSession(sessionId);
        navigate('/');
      }
    });

    socket.on('error', (error) => {
      // A reconnected socket can emit `close-session` before its follow-up
      // `join-session` lands; the session is then already deleted and the
      // server answers join-session with this plain error. Treat it the same
      // as connect_error so the user is never stranded on a stale page.
      if (error?.message === 'Session not found' || error?.message === 'User not found in session') {
        showSessionClosed({ sessionTitle: 'Planning Poker Session', moderatorName: null });
        return;
      }
      console.error('Socket error:', error);
    });

    socket.io.on('reconnect', () => {
      socket.emit('join-session', { sessionId, userId: currentUser.id });
    });

    // Clean up handlers when this effect re-runs.
    const events = [
      'error',
      'vote-submitted',
      'vote-accepted',
      'votes-reset',
      'voting-started',
      'round-stopped',
      'test-sound-trigger',
      'card-set-updated',
      'user-name-updated',
      'user-joined',
      'session-joined',
      'user-disconnected',
      'moderator-changed',
      'participant-removed',
      'session-closed',
      'you-were-removed',
      'session-cleanup',
      'user-countdown',
      'participant-auto-removed',
      'connection-conflict',
      'leave-acknowledged',
      'vote-out-started',
      'vote-out-cast',
      'vote-out-ended',
    ] as const;
    events.forEach(e => socket.off(e));
    socket.off('connect', handleConnect);
    socket.off('connect_error', handleConnectError);
    socket.io.off('reconnect');

    return () => {
      clearTimeout(readyTimeout);
      hasJoinedRef.current = false;
      setIsSocketReady(false);
      stopHeartbeat(heartbeatRef.current);
      heartbeatRef.current = null;
      events.forEach(e => socket.off(e));
      socket.off('connect', handleConnect);
      socket.off('connect_error', handleConnectError);
      socket.io.off('reconnect');
    };
  }, [socket, currentUser, sessionId, navigate, notifyVotingStarted, onSessionUpdate, onCurrentUserUpdate]);

  return { isSocketReady, sessionClosed, sessionClosedInfo, isFlashing, socket, heartbeatRef };
};

export default useSessionSocket;