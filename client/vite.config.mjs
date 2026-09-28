import { configDefaults, defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Migrated from CRA (react-scripts 5.0.1, deprecated).
//
// Deliberate choices that keep the deployment pipeline byte-identical:
// - outDir 'build': the Dockerfile, nginx container and deploy.sh all expect
//   the historical output path. Changing it would touch three other systems.
// - sourcemap: CRA shipped maps; keep parity so error reporting and the
//   nginx cache rules (js/css catch-all) behave the same.
// - single bundle, no inline scripts: the strict CSP in nginx/nginx.conf
//   (script-src 'self', no unsafe-inline) was verified against that shape —
//   scripts/verify-build.mjs enforces it on every build.
//
// M7 PWA: the precaching service worker is generated AFTER this build by
// scripts/generate-sw.mjs (npm "build" chain: vite build → prerender →
// generate-sw). It must run after scripts/prerender.mjs — the SW precaches
// app.html and the pre-rendered pages, which only exist then. Registration
// lives in the bundle (src/index.tsx), NOT as an injected <script>: the CSP
// allows only external scripts and the build contract pins the script
// inventory. sw.js itself is same-origin and self-contained (Workbox runtime
// inlined, no importScripts) — no CSP change.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: 'build',
    sourcemap: true,
  },
  server: {
    // Keep port 3000: dev-setup.sh and server .env point clients at it.
    port: 3000,
  },
  // react-helmet-async is CommonJS; without noExternal Vite's SSR module
  // runner cannot statically resolve its named exports during the build-time
  // pre-render (scripts/prerender.mjs).
  ssr: {
    noExternal: ['react-helmet-async'],
  },
  test: {
    environment: 'jsdom',
    // globals: true is required by @testing-library/react's automatic
    // cleanup (it hooks into the global afterEach).
    globals: true,
    // E2E specs live in e2e/ and belong to Playwright, not Vitest.
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
});