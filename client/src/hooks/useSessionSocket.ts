import {
  useState,
  useEffect,
  useCallback,
  useRef,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { useSocket, startHeartbeat, stopHeartbeat } from '../utils/socket';
import { removeUserSession } from '../utils/sessionStorage';
import { getAvatarPreferences } from '../utils/avatarPreferences';
import { applyEvent } from '../utils/sessionDelta';
import { validateEvent, type EventName, type EventPayload } from '../protocol/events';
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
 *    incoming-event handler exactly once per socket, via a single registry
 *    table. All values that change across renders (currentUser object,
 *    navigate, parent callbacks) are read through refs, so the handler set is
 *    never torn down and re-attached by a render — that cycle stripped
 *    handlers while a delta was in flight, leaving the page live but deaf.
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
  const isSocketReadyRef = useRef(false);
  const [sessionClosed, setSessionClosed] = useState(false);
  const [sessionClosedInfo, setSessionClosedInfo] = useState<
    SessionClosedInfo | null
  >(null);
  const [isFlashing, setIsFlashing] = useState(false);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const readyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Notify participants that voting started (sound + flash). Both are gated
  // behind the user's motion preference — nothing pulses or plays when the OS
  // asks for reduced motion.
  const notifyVotingStarted = useCallback(() => {
    const reducedMotion = typeof window !== 'undefined'
      && typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) return;
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
      // A returning user re-seeds their locally saved avatar on every
      // (re)connect — the server keeps the session copy in sync, so the room
      // always sees the freshest preference.
      const avatar = getAvatarPreferences();
      socket.emit('join-session', { sessionId, userId, ...(avatar ? { avatar } : {}) });
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
        socket.emit('join-session', { sessionId, userId });
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

    heartbeatRef.current = startHeartbeat(socket, sessionId, userId);

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

    // Every incoming broadcast is validated at the boundary (`validateEvent`)
    // and merged by the typed reducer (`applyEvent`). A malformed delta is
    // dropped — never silently corrupting local state.
    const patchValidated = <E extends EventName>(event: E, payload: EventPayload<E>) => {
      onSessionUpdateRef.current((prev) => (prev ? applyEvent(prev, event, payload) : prev));
    };
    const patch = <E extends EventName>(event: E, data: unknown) => {
      const payload = validateEvent(event, data);
      if (payload) patchValidated(event, payload);
    };

    const leaveLocally = () => {
      try { removeUserSession(sessionIdRef.current); } catch { /* nothing stored */ }
      navigateRef.current('/');
    };

    // One registry drives both registration and teardown.
    const handlers: Array<[EventName, (data: unknown) => void]> = [
      ['vote-submitted', (data) => patch('vote-submitted', data)],
      ['vote-accepted', (data) => patch('vote-accepted', data)],
      ['votes-reset', (data) => patch('votes-reset', data)],
      ['round-stopped', (data) => patch('round-stopped', data)],
      ['card-set-updated', (data) => patch('card-set-updated', data)],
      ['user-joined', (data) => patch('user-joined', data)],
      ['user-disconnected', (data) => patch('user-disconnected', data)],
      ['user-countdown', (data) => patch('user-countdown', data)],
      ['participant-removed', (data) => patch('participant-removed', data)],
      ['participant-auto-removed', (data) => patch('participant-auto-removed', data)],
      ['leave-acknowledged', (data) => patch('leave-acknowledged', data)],
      ['vote-out-started', (data) => patch('vote-out-started', data)],
      ['vote-out-cast', (data) => patch('vote-out-cast', data)],

      ['voting-started', (data) => {
        notifyVotingStartedRef.current();
        patch('voting-started', data);
      }],
      ['test-sound-trigger', (data) => {
        notifyVotingStartedRef.current();
        patch('test-sound-trigger', data);
      }],

      ['session-joined', (data) => {
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
      }],

      ['user-name-updated', (data) => {
        const p = validateEvent('user-name-updated', data);
        if (!p) return;
        patchValidated('user-name-updated', p);
        if (p.userId === currentUserRef.current?.id) {
          onCurrentUserUpdateRef.current((user) => (user ? { ...user, name: p.newName } : user));
        }
      }],

      ['user-avatar-updated', (data) => {
        const p = validateEvent('user-avatar-updated', data);
        if (!p) return;
        patchValidated('user-avatar-updated', p);
        if (p.userId === currentUserRef.current?.id) {
          onCurrentUserUpdateRef.current((user) => (user ? { ...user, avatar: p.user.avatar } : user));
        }
      }],

      ['moderator-changed', (data) => {
        const p = validateEvent('moderator-changed', data);
        if (!p) return;
        patchValidated('moderator-changed', p);
        const me = currentUserRef.current;
        if (!me) return;
        if (me.id === p.newModeratorId) {
          if (p.newModerator) onCurrentUserUpdateRef.current(p.newModerator);
          if (p.wasManualTransfer) alert(`You have been made the moderator by ${p.previousModeratorName}!`);
          else alert('You are now the moderator of this session!');
        } else if (me.id === p.previousModeratorId) {
          if (p.previousModerator) onCurrentUserUpdateRef.current(p.previousModerator);
          if (p.wasManualTransfer) alert(`You have transferred moderator role to ${p.newModeratorName}`);
        }
      }],

      ['vote-out-ended', (data) => {
        const p = validateEvent('vote-out-ended', data);
        if (!p) return;
        patchValidated('vote-out-ended', p);
        if (p.removed && currentUserRef.current?.id === p.targetUserId) {
          alert('You have been removed from the session by participant vote.');
          leaveLocally();
        }
      }],

      ['connection-conflict', (data) => {
        const p = validateEvent('connection-conflict', data);
        if (!p) return;
        leaveLocally();
        alert(p.message || 'Your session has been accessed from another location.');
      }],

      ['you-were-removed', (data) => {
        const p = validateEvent('you-were-removed', data);
        if (!p) return;
        alert(`${p.reason} by ${p.removedBy}`);
        leaveLocally();
      }],

      ['session-cleanup', (data) => {
        const p = validateEvent('session-cleanup', data);
        if (!p) return;
        alert(`Session closed: ${p.message}`);
        leaveLocally();
      }],

      ['session-closed', (data) => {
        const p = validateEvent('session-closed', data);
        if (!p) return;
        showSessionClosed({ sessionTitle: p.sessionTitle, moderatorName: p.moderatorName ?? null });
      }],
    ];

    for (const [event, handler] of handlers) socket.on(event, handler);

    // Control-plane error channel (not a schema'd event). A reconnected socket
    // can emit `close-session` before its follow-up `join-session` lands; the
    // session is then already deleted and the server answers join-session with
    // this plain error. Treat it like connect_error so the user is never
    // stranded on a stale page.
    const handleError = (error: { message?: string }) => {
      if (error?.message === 'Session not found' || error?.message === 'User not found in session') {
        showSessionClosed({ sessionTitle: 'Planning Poker Session', moderatorName: null });
        return;
      }
      console.error('Socket error:', error);
    };
    socket.on('error', handleError);

    return () => {
      for (const [event] of handlers) socket.off(event);
      socket.off('error', handleError);
    };
  }, [socket, showSessionClosed]);

  return { isSocketReady, sessionClosed, sessionClosedInfo, isFlashing, socket, heartbeatRef };
};

export default useSessionSocket;