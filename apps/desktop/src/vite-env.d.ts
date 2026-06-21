/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Sentry DSN for the desktop UI (separate project from the Rust core). Empty ⇒ disabled. */
  readonly VITE_SENTRY_DSN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
