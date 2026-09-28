import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

const container = document.getElementById('root');
if (!container) {
  // #root is the mount point of index.html — the app has no fallback UI.
  throw new Error('Root element #root not found');
}

// The service worker registers from inside the bundle — an injected
// <script> would break the CSP and the build contract's script inventory.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js');
}

ReactDOM.createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);