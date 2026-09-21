const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8081/api';

// Track server version for cache busting
let serverStartTime = null;
let versionCheckInProgress = false;

// Check version on first API call
const checkServerVersion = async () => {
  if (versionCheckInProgress) return;

  try {
    versionCheckInProgress = true;
    const response = await fetch(`${API_BASE_URL}/version`);
    if (!response.ok) throw new Error(`Version check failed: ${response.status}`);
    const data = await response.json();
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
        window.location.reload(true);
      } else {
        // Already reloaded once, update stored version
        serverStartTime = currentStartTime;
        sessionStorage.removeItem('_server_reload');
      }
    } else {
      serverStartTime = currentStartTime;
      sessionStorage.removeItem('_server_reload');
    }
  } catch (error) {
    console.warn('Version check failed:', error.message);
  } finally {
    versionCheckInProgress = false;
  }
};

// Check version on every API response via headers
const checkResponseVersion = (response) => {
  const serverStart = response.headers.get('x-server-start');
  if (serverStart && serverStartTime && serverStart !== serverStartTime) {
    // Server restarted - reload only once
    if (!sessionStorage.getItem('_server_reload')) {
      console.log('Server restart detected via response header');
      sessionStorage.setItem('_server_reload', '1');
      setTimeout(() => window.location.reload(true), 1000);
    } else {
      serverStartTime = serverStart;
      sessionStorage.removeItem('_server_reload');
    }
  } else if (serverStart) {
    serverStartTime = serverStart;
  }
};

const request = async (endpoint, options = {}) => {
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
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (e) { /* non-JSON body */ }
    const error = new Error(`Request failed: ${response.status}`);
    // Structured error contract: callers match on HTTP status (the stable
    // contract), with the parsed body available as error.data.
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return response.json();
};

// Initialize version check
checkServerVersion();

export const createSession = async (moderatorName, title, cardSet = undefined) => {
  const payload = { moderatorName, title };
  if (cardSet) {
    payload.cardSet = cardSet;
  }
  return request('/sessions/create', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
};

export const joinSession = async (sessionId, userName) => {
  return request(`/sessions/${sessionId}/join`, {
    method: 'POST',
    body: JSON.stringify({ userName }),
  });
};

export const getSession = async (sessionId) => {
  return request(`/sessions/${sessionId}`, {
    method: 'GET',
  });
};
