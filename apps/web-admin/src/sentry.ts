// Sentry error reporting for the web admin. Enabled only when VITE_SENTRY_DSN is set,
// so local dev (no DSN) is a silent no-op. Call initSentry() once before render.
import * as Sentry from "@sentry/react";

const DSN = import.meta.env.VITE_SENTRY_DSN;

export const sentryEnabled = Boolean(DSN);

export function initSentry(): void {
  if (!DSN) return;
  Sentry.init({
    dsn: DSN,
    environment: import.meta.env.MODE,
    // No performance tracing for now — error reporting only.
    tracesSampleRate: 0,
  });
}

export { Sentry };
