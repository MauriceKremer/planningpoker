import type { Avatar } from '../protocol/events';
import type { SessionState, SessionUser } from '../protocol/session';

// Same-origin by design: nginx proxies /api and CSP pins connect-src to
// 'self', so an absolute cross-origin base gets blocked outright. Only dev
// (vite on :3000) talks to the server port directly.
const API_BASE_URL = import.meta.env.VITE_API_URL
  || (import.meta.env.DEV ? 'http://localhost:8081/api' : '/api');

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

// Track server start time for cache busting on server restarts.
let serverStartTime: string | null = null;
let versionCheckInProgress = false;

interface VersionResponse {
  startTime?: string;
}

const checkServerVersion = async (): Promise<void> => {
  if (versionCheckInProgress) return;

  try {
    versionCheckInProgress = true;
    const response = await fetch(`${API_BASE_URL}/version`);
    if (!response.ok) throw new Error(`Version check failed: ${response.status}`);
    const data = (await response.json()) as VersionResponse;
    const currentStartTime = data.startTime;

    if (serverStartTime && serverStartTime !== currentStartTime) {
      // Server restarted — clear caches and reload, but only once.
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
        // Already reloaded once — just adopt the new start time.
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

checkServerVersion();

export const createSession = async (
  moderatorName: string,
  title: string,
  cardSet?: string[],
  avatar?: Avatar,
): Promise<CreateSessionResponse> => {
  return request<CreateSessionResponse>('/sessions/create', {
    method: 'POST',
    body: JSON.stringify({
      moderatorName,
      title,
      ...(cardSet ? { cardSet } : {}),
      ...(avatar ? { avatar } : {}),
    }),
  });
};

export const joinSession = async (
  sessionId: string,
  userName: string,
  avatar?: Avatar,
): Promise<JoinSessionResponse> => {
  return request<JoinSessionResponse>(`/sessions/${sessionId}/join`, {
    method: 'POST',
    body: JSON.stringify({ userName, ...(avatar ? { avatar } : {}) }),
  });
};

// Shared copy for the two join flows (JoinSession page + UsernamePrompt).
const JOIN_ERROR_MESSAGES: Record<number, string> = {
  409: 'This username is already taken. Please choose a different name.',
  404: 'Session not found. Please check the session ID.',
};
const JOIN_ERROR_FALLBACK = 'Failed to join session. Please try again.';

export const joinErrorToMessage = (error: unknown): string =>
  error instanceof RequestError
    ? (JOIN_ERROR_MESSAGES[error.status] ?? JOIN_ERROR_FALLBACK)
    : JOIN_ERROR_FALLBACK;

export const getSession = async (sessionId: string): Promise<GetSessionResponse> => {
  return request<GetSessionResponse>(`/sessions/${sessionId}`, {
    method: 'GET',
  });
};