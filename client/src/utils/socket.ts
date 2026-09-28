import { useEffect, useState } from 'react';
import { io, type Socket } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:8081';

/**
 * Create (once) and tear down a Socket.IO connection. Returns the live `Socket`
 * or `null` before it has been created. The instance is created paused
 * (`autoConnect: false`) so callers attach auth and handlers first.
 */
export const useSocket = (): Socket | null => {
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    // Create socket in paused state (no autoConnect) until auth is set.
    const socketInstance = io(SOCKET_URL, {
       // Polling-first (Socket.IO's default handshake), upgrading to websocket
       // afterwards. A direct first websocket connect races with the reverse
       // proxy under Docker Desktop (connection closes ~1ms after the upgrade);
       // polling-first + upgrade is robust and is what socket.io does by default.
      transports: ['polling', 'websocket'],
      upgrade: true,
      rememberUpgrade: true,
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

    socketInstance.on('connect', () => {
      console.log('✅ Connected to server via Socket.IO');
      console.log('Socket ID:', socketInstance.id);
      console.log('Transport:', socketInstance.io.engine.transport.name);
       // If currently on polling and rememberUpgrade is enabled, Socket.IO
       // will attempt upgrade automatically.
     });

    socketInstance.on('disconnect', (reason) => {
      console.log('❌ Disconnected from server:', reason);
     });

    socketInstance.on('connect_error', (error) => {
      console.error('❌ Socket.IO connection error:', error.message);
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

// Helper function to start heartbeat for a session.
export const startHeartbeat = (
  socket: Socket | null,
   sessionId: string,
   userId: string,
): ReturnType<typeof setInterval> | null => {
  if (!socket || !sessionId || !userId) return null;

  const heartbeatInterval = setInterval(() => {
    socket.emit('heartbeat', { sessionId, userId });
    }, 30000); // Send heartbeat every 30 seconds (throttled on server side to persist every 60s)

  return heartbeatInterval;
};

export const stopHeartbeat = (
  heartbeatInterval: ReturnType<typeof setInterval> | null,
): void => {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    }
};
