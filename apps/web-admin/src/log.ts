// Lightweight logging facade: writes to the console AND forwards to Sentry (breadcrumbs
// for info/warn, captured exceptions for error). No-op-safe when Sentry is disabled.
//
// Never log secrets (tokens, passwords) or full response bodies — ids/paths/status only.
import { Sentry } from "./sentry";

type Fields = Record<string, unknown>;

function breadcrumb(level: "info" | "warning" | "error", message: string, data?: Fields) {
  Sentry.addBreadcrumb({ level, message, data, category: "app" });
}

export const log = {
  debug(message: string, fields?: Fields) {
    console.debug(`[debug] ${message}`, fields ?? "");
  },
  info(message: string, fields?: Fields) {
    console.info(`[info] ${message}`, fields ?? "");
    breadcrumb("info", message, fields);
  },
  warn(message: string, fields?: Fields) {
    console.warn(`[warn] ${message}`, fields ?? "");
    breadcrumb("warning", message, fields);
  },
  error(message: string, err?: unknown, fields?: Fields) {
    console.error(`[error] ${message}`, err ?? "", fields ?? "");
    breadcrumb("error", message, fields);
    if (err instanceof Error) Sentry.captureException(err, { extra: fields });
  },
};
