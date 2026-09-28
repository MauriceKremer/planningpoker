const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8081/api';

import type { SessionState, SessionUser } from '../protocol/session';

/** Server response for `POST /sessions/create`. */
export interface CreateSessionResponse {
  sessionId: string;
  userId: string;
  session: SessionState;
}

/** Server response for `POST /sessions/:id/join`. */
export interface JoinSessionResponse {
  session: SessionState;
  userId: string;
  user: SessionUser;
}

/** Server response for `GET /sessions/:id`. */
export interface GetSessionResponse {
  session: SessionState;
}

/** Error thrown by `request`: callers match on HTTP status (the stable
 *  contract), with the parsed body available as `data`. */
export class RequestError extends Error {
  status: number;
  data: unknown;

  constructor(message: string, status: number, data: unknown) {
    super(message);
    this.name = 'RequestError';
    this.status = status;
    this.data = data;
  }
}

// Track server version for cache busting
let serverStartTime: string | null = null;
let versionCheckInProgress = false;

interface VersionResponse {
  startTime?: string;
}

// Check version on first API call
const checkServerVersion = async (): Promise<void> => {
  if (versionCheckInProgress) return;

  try {
    versionCheckInProgress = true;
    const response = await fetch(`${API_BASE_URL}/version`);
    if (!response.ok) throw new Error(`Version check failed: ${response.status}`);
    const data = (await response.json()) as VersionResponse;
    const currentStartTime = data.startTime;

    if (serverStartTime && serverStartTime !== currentStartTime) {
      // Server restarted - clear cache and reload (but only once)
      if (!sessionStorage.getItem('_server_reload')) {
        console.log('Server restarted detected, reloading page...');
        sessionStorage.setItem('_server_reload', '1');
        if ('caches' in window) {
          caches.keys().then(names => {
            names.forEach(name => caches.delete(name));
          });
        }
        window.location.reload();
      } else {
        // Already reloaded once, update stored version
        serverStartTime = currentStartTime ?? null;
        sessionStorage.removeItem('_server_reload');
      }
    } else {
      serverStartTime = currentStartTime ?? null;
      sessionStorage.removeItem('_server_reload');
    }
  } catch (error) {
    console.warn('Version check failed:', error instanceof Error ? error.message : error);
  } finally {
    versionCheckInProgress = false;
  }
};

// Check version on every API response via headers
const checkResponseVersion = (response: Response): void => {
  const serverStart = response.headers.get('x-server-start');
  if (serverStart && serverStartTime && serverStart !== serverStartTime) {
    // Server restarted - reload only once
    if (!sessionStorage.getItem('_server_reload')) {
      console.log('Server restart detected via response header');
      sessionStorage.setItem('_server_reload', '1');
      setTimeout(() => window.location.reload(), 1000);
    } else {
      serverStartTime = serverStart;
      sessionStorage.removeItem('_server_reload');
    }
  } else if (serverStart) {
    serverStartTime = serverStart;
  }
};

interface RequestOptions extends RequestInit {
  headers?: Record<string, string>;
}

const request = async <T>(endpoint: string, options: RequestOptions = {}): Promise<T> => {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  checkResponseVersion(response);

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    let data: unknown = null;
    try { data = text ? JSON.parse(text) : null; } catch { /* non-JSON body */ }
    throw new RequestError(`Request failed: ${response.status}`, response.status, data);
  }

  return response.json() as Promise<T>;
};

// Initialize version check
checkServerVersion();

export const createSession = async (
  moderatorName: string,
  title: string,
  cardSet?: string[],
): Promise<CreateSessionResponse> => {
  const payload: { moderatorName: string; title: string; cardSet?: string[] } = { moderatorName, title };
  if (cardSet) {
    payload.cardSet = cardSet;
  }
  return request<CreateSessionResponse>('/sessions/create', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
};

export const joinSession = async (sessionId: string, userName: string): Promise<JoinSessionResponse> => {
  return request<JoinSessionResponse>(`/sessions/${sessionId}/join`, {
    method: 'POST',
    body: JSON.stringify({ userName }),
  });
};

export const getSession = async (sessionId: string): Promise<GetSessionResponse> => {
  return request<GetSessionResponse>(`/sessions/${sessionId}`, {
    method: 'GET',
  });
};