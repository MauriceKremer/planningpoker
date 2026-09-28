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

/**
 * Socket lifecycle for the session page, in two cooperating effects:
 *
 * 1. CONNECTION effect — keyed on primitives (`sessionId`, `currentUser.id`).
 *    Sets auth, emits `join-session` on every `connect` (socket.io re-fires
 *    `connect` after every reconnect, so no separate `manager.on('reconnect')`
 *    is needed), starts the heartbeat, and shows the closed-session UI when
 *    the server rejects the join.
 *
 * 2. HANDLER effect — keyed on the socket instance only. Registers every
 *    incoming-event handler exactly once per socket. All values that change
 *    across renders (currentUser object, navigate, parent callbacks) are read
 *    through refs, so the handler set is never torn down and re-attached by a
 *    render — that tear-down/re-attach cycle was a source of dropped events
 *    (handlers stripped while a delta was in flight) before M6.
 *
 * The split matters: the previous single effect included the `currentUser`
 * OBJECT in its deps and stripped/re-registered all handlers on every identity
 * change, while a `hasJoinedRef` guard then made some re-runs skip
 * re-registration — leaving the page live but deaf.
 */
const useSessionSocket = ({
  sessionId,
  currentUser,
  onSessionUpdate,
  onCurrentUserUpdate,
}: UseSessionSocketArgs) => {
  const socket = useSocket();
  const navigate = useNavigate();
  const [isSocketReady, setIsSocketReady] = useState(false);
  // Ref mirror so the join fallback can read readiness without re-running.
  const isSocketReadyRef = useRef(false);
  const [sessionClosed, setSessionClosed] = useState(false);
  const [sessionClosedInfo, setSessionClosedInfo] = useState<
    SessionClosedInfo | null
  >(null);
  const [isFlashing, setIsFlashing] = useState(false);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Latest-value refs: the handler effect reads these instead of closing over
  // render-scoped values, keeping its registration stable.
  const currentUserRef = useRef(currentUser);
  const sessionIdRef = useRef(sessionId);
  const navigateRef = useRef(navigate);
  const onSessionUpdateRef = useRef(onSessionUpdate);
  const onCurrentUserUpdateRef = useRef(onCurrentUserUpdate);

  useEffect(() => {
    currentUserRef.current = currentUser;
    sessionIdRef.current = sessionId;
    navigateRef.current = navigate;
    onSessionUpdateRef.current = onSessionUpdate;
    onCurrentUserUpdateRef.current = onCurrentUserUpdate;
  }, [currentUser, sessionId, navigate, onSessionUpdate, onCurrentUserUpdate]);

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
  const notifyVotingStartedRef = useRef(notifyVotingStarted);

  useEffect(() => {
    notifyVotingStartedRef.current = notifyVotingStarted;
  }, [notifyVotingStarted]);

  // Shared state for the join fallback below: session-joined clears the timer
  // via this ref so the two effects can cooperate without re-running.
  const readyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The session is gone server-side (closed, cleaned up, or a reconnected
  // socket rejected at join). Render the closed-session UI instead of
  // leaving a blank zombie page. Shared by the two paths that can learn
  // this: `connect_error` and the plain `error` reply to `join-session`.
  const showSessionClosed = useCallback((info: SessionClosedInfo) => {
    setSessionClosedInfo(info);
    const sid = sessionIdRef.current;
    try { if (sid) removeUserSession(sid); } catch { /* nothing stored */ }
    setSessionClosed(true);
  }, []);

  // ── Effect 1: connection + join ────────────────────────────────────────────
  const userId = currentUser?.id;

  useEffect(() => {
    if (!socket || !sessionId || !userId) return;

    socket.auth = { sessionId, userId };

    const join = () => {
      socket.emit('join-session', { sessionId, userId });
    };

    const handleConnectError = (err: Error) => {
      if (err.message === 'Session not found' || err.message === 'User not found in session') {
        showSessionClosed({ sessionTitle: 'Planning Poker Session', moderatorName: null });
      }
    };

    // Belt-and-braces: if a connect event was somehow missed, re-emit the join
    // once after 5 s (idempotent — the server answers with session-joined).
    if (readyTimeoutRef.current) clearTimeout(readyTimeoutRef.current);
    readyTimeoutRef.current = setTimeout(() => {
      if (!isSocketReadyRef.current && socket.connected) {
        join();
      }
    }, 5000);

    // `connect` fires again on every automatic reconnect, so this handler
    // alone keeps the socket bound to the room across transport blips.
    socket.on('connect', join);
    socket.on('connect_error', handleConnectError);

    if (socket.connected) {
      join();
    } else {
      socket.connect();
    }

    const interval = startHeartbeat(socket, sessionId, userId);
    heartbeatRef.current = interval;

    return () => {
      if (readyTimeoutRef.current) {
        clearTimeout(readyTimeoutRef.current);
        readyTimeoutRef.current = null;
      }
      stopHeartbeat(heartbeatRef.current);
      heartbeatRef.current = null;
      socket.off('connect', join);
      socket.off('connect_error', handleConnectError);
    };
  }, [socket, sessionId, userId, showSessionClosed]);

  // ── Effect 2: incoming-event handlers (registered once per socket) ────────
  useEffect(() => {
    if (!socket) return;

    // M5.2: every incoming broadcast is validated at the boundary
    // (`validateEvent`) and merged by the typed reducer (`applyEvent`).
    // A malformed delta is dropped — never silently corrupting local state.
    const patch = <E extends EventName>(event: E, data: unknown) => {
      const payload = validateEvent(event, data);
      if (!payload) return;
      onSessionUpdateRef.current((prev) =>
        prev ? applyEvent(prev, event, payload) : prev,
      );
    };

    socket.on('vote-submitted', (data) => patch('vote-submitted', data));

    // Server-confirmed echo of the voter's own card (targeted event).
    socket.on('vote-accepted', (data) => patch('vote-accepted', data));

    socket.on('votes-reset', (data) => patch('votes-reset', data));
    socket.on('voting-started', (data) => {
      notifyVotingStartedRef.current();
      patch('voting-started', data);
    });
    socket.on('round-stopped', (data) => patch('round-stopped', data));
    socket.on('test-sound-trigger', (data) => {
      notifyVotingStartedRef.current();
      patch('test-sound-trigger', data);
    });
    socket.on('card-set-updated', (data) => patch('card-set-updated', data));

    socket.on('user-name-updated', (data) => {
      const p = validateEvent('user-name-updated', data);
      if (!p) return;
      onSessionUpdateRef.current((prev) =>
        prev ? applyEvent(prev, 'user-name-updated', p) : prev,
      );
      if (p.userId === currentUserRef.current?.id) {
        onCurrentUserUpdateRef.current((user) => (user ? { ...user, name: p.newName } : user));
      }
    });

    socket.on('user-joined', (data) => patch('user-joined', data));

    socket.on('session-joined', (data) => {
      // Initial full-state load — the only event that still ships the whole session.
      const p = validateEvent('session-joined', data);
      if (!p) return;
      onSessionUpdateRef.current(p.session as SessionState | null);
      setIsSocketReady(true);
      isSocketReadyRef.current = true;
      if (readyTimeoutRef.current) {
        clearTimeout(readyTimeoutRef.current);
        readyTimeoutRef.current = null;
      }
    });

    socket.on('user-disconnected', (data) => patch('user-disconnected', data));

    socket.on('moderator-changed', (data) => {
      const p = validateEvent('moderator-changed', data);
      if (!p) return;
      onSessionUpdateRef.current((prev) =>
        prev ? applyEvent(prev, 'moderator-changed', p) : prev,
      );
      const me = currentUserRef.current;
      if (me) {
        const updatedUser = me.id === p.newModeratorId
          ? p.newModerator
          : (me.id === p.previousModeratorId ? p.previousModerator : null);
        if (updatedUser) onCurrentUserUpdateRef.current(updatedUser);
      }
      const isNewMod = !!me && me.id === p.newModeratorId;
      const wasPrevMod = !!me && me.id === p.previousModeratorId;
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
      try { removeUserSession(sessionIdRef.current); } catch { /* already gone */ }
      alert(p.message || 'Your session has been accessed from another location.');
      navigateRef.current('/');
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
      navigateRef.current('/');
    });

    socket.on('session-cleanup', (data) => {
      const p = validateEvent('session-cleanup', data);
      if (!p) return;
      try { removeUserSession(sessionIdRef.current); } catch { /* already gone */ }
      alert(`Session closed: ${p.message}`);
      navigateRef.current('/');
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
      onSessionUpdateRef.current((prev) =>
        prev ? applyEvent(prev, 'vote-out-ended', p) : prev,
      );
      if (p.removed && currentUserRef.current?.id === p.targetUserId) {
        alert('You have been removed from the session by participant vote.');
        try { removeUserSession(sessionIdRef.current); } catch { /* already gone */ }
        navigateRef.current('/');
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

    return () => {
      socket.off('vote-submitted');
      socket.off('vote-accepted');
      socket.off('votes-reset');
      socket.off('voting-started');
      socket.off('round-stopped');
      socket.off('test-sound-trigger');
      socket.off('card-set-updated');
      socket.off('user-name-updated');
      socket.off('user-joined');
      socket.off('session-joined');
      socket.off('user-disconnected');
      socket.off('moderator-changed');
      socket.off('participant-removed');
      socket.off('connection-conflict');
      socket.off('session-closed');
      socket.off('you-were-removed');
      socket.off('session-cleanup');
      socket.off('user-countdown');
      socket.off('participant-auto-removed');
      socket.off('leave-acknowledged');
      socket.off('vote-out-started');
      socket.off('vote-out-cast');
      socket.off('vote-out-ended');
      socket.off('error');
    };
  }, [socket, showSessionClosed]);

  return { isSocketReady, sessionClosed, sessionClosedInfo, isFlashing, socket, heartbeatRef };
};

export default useSessionSocket;