import { useEffect, useState } from 'react';
import { io, type Socket } from 'socket.io-client';

// Same-origin by design: nginx proxies /socket.io (polling + websocket
// upgrade) and CSP pins connect-src to 'self'. Only dev targets the server
// port directly.
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL
  || (import.meta.env.DEV ? 'http://localhost:8081' : '');
const HEARTBEAT_INTERVAL_MS = 30_000; // throttled server-side: persisted every 60s

/**
 * Create (once) and tear down a Socket.IO connection. Returns the live `Socket`
 * or `null` before it has been created. The instance is created paused
 * (`autoConnect: false`) so callers attach auth and handlers first.
 */
export const useSocket = (): Socket | null => {
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    const socketInstance = io(SOCKET_URL, {
      // Polling-first (Socket.IO's default handshake), upgrading to websocket
      // afterwards. A direct first websocket connect races with the reverse
      // proxy under Docker Desktop (connection closes ~1ms after the upgrade);
      // polling-first + upgrade is robust and is what socket.io does by default.
      transports: ['polling', 'websocket'],
      upgrade: true,
      // rememberUpgrade deliberately OFF: with it on, every reconnect skipped
      // polling and went websocket-first — the exact race described above — and
      // server→client deltas were lost, leaving the page live but deaf.
      rememberUpgrade: false,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30000,
      reconnectionAttempts: Infinity,
      timeout: 20000,
      forceNew: false,
      path: '/socket.io/',
      autoConnect: false,
    });
    setSocket(socketInstance);

    if (import.meta.env.DEV) {
      socketInstance.on('connect', () => {
        console.log(`Socket.IO connected (transport: ${socketInstance.io.engine.transport.name})`);
      });
      socketInstance.on('disconnect', (reason) => {
        console.log(`Socket.IO disconnected: ${reason}`);
      });
    }

    socketInstance.on('connect_error', (error) => {
      console.error('Socket.IO connection error:', error.message);
    });
    socketInstance.on('error', (error) => {
      console.error('Socket error:', error);
    });

    return () => {
      socketInstance.removeAllListeners();
      socketInstance.disconnect();
    };
  }, []);

  return socket;
};

/** Emit a heartbeat every interval so the server can track liveness. */
export const startHeartbeat = (
  socket: Socket | null,
  sessionId: string,
  userId: string,
): ReturnType<typeof setInterval> | null => {
  if (!socket || !sessionId || !userId) return null;
  return setInterval(() => socket.emit('heartbeat', { sessionId, userId }), HEARTBEAT_INTERVAL_MS);
};

export const stopHeartbeat = (heartbeatInterval: ReturnType<typeof setInterval> | null): void => {
  if (heartbeatInterval) clearInterval(heartbeatInterval);
};