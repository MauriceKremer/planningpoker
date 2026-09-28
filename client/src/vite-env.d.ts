/// <reference types="vite/client" />

/**
 * Vite build-time env contract. `import.meta.env` is consumed by the
 * typed client modules (e.g. `utils/socket.ts` reads `VITE_SOCKET_URL`). These
 * are the only Vite vars the app reads; declaring them keeps `strict` happy
 * without an `any` `import.meta`.
 */
interface ImportMetaEnv {
   readonly VITE_SOCKET_URL?: string;
   readonly VITE_API_URL?: string;
}

interface ImportMeta {
   readonly env: ImportMetaEnv;
}
