/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE?: string;
  /** Where the personal "download the app" CTA points (marketing site). */
  readonly VITE_DOWNLOAD_URL?: string;
  /** Sentry DSN for error reporting. Empty/undefined ⇒ disabled. */
  readonly VITE_SENTRY_DSN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
