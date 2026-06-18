/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base path of the NestJS API (default `/api`). */
  readonly VITE_API_BASE?: string
  /** Public origin of this SPA, used to build share/invite links. */
  readonly VITE_APP_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
