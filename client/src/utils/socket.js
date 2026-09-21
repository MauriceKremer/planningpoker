import { useEffect, useState } from 'react';
import io from 'socket.io-client';

const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || 'http://localhost:8081';

export const useSocket = () => {
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    // Create socket in paused state (no autoConnect) until auth is set
    const socketInstance = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      upgrade: true,
      rememberUpgrade: true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30000,
      reconnectionAttempts: Infinity,
      timeout: 20000,
      forceNew: false,
      path: '/socket.io/',
      autoConnect: false
    });
    setSocket(socketInstance);

    socketInstance.on('connect', () => {
      console.log('✅ Connected to server via Socket.IO');
      console.log('Socket ID:', socketInstance.id);
      console.log('Transport:', socketInstance.io.engine.transport.name);
      // If currently on polling and rememberUpgrade is enabled, Socket.IO will attempt upgrade automatically
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

// Helper function to start heartbeat for a session
export const startHeartbeat = (socket, sessionId, userId) => {
  if (!socket || !sessionId || !userId) return null;

  const heartbeatInterval = setInterval(() => {
    socket.emit('heartbeat', { sessionId, userId });
  }, 30000); // Send heartbeat every 30 seconds (throttled on server side to persist every 60s)

  return heartbeatInterval;
};

export const stopHeartbeat = (heartbeatInterval) => {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
  }
};