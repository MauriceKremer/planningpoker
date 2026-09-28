import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

const container = document.getElementById('root');
if (!container) {
  // #root is the mount point of index.html — the app has no fallback UI.
  throw new Error('Root element #root not found');
}

// M7: service worker registration. Deliberately inside the bundle, not
// injected as a separate <script>: the strict CSP and the build contract
// allow exactly one external script per HTML document. PROD-only so dev
// (vite dev server serves no SW) and the jsdom unit tests are unaffected.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js');
}

ReactDOM.createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);