// Thin wrapper around Tauri's `invoke` that logs every command call (name + duration)
// and warns on rejection, so the console/Sentry breadcrumbs show the IPC timeline.
// Screens import this as `invoke` (aliased), so existing call sites are unchanged.
import { invoke as tauriInvoke, type InvokeArgs } from "@tauri-apps/api/core";
import { log } from "./log";

export async function call<T>(cmd: string, args?: InvokeArgs): Promise<T> {
  const started = performance.now();
  try {
    const out = await tauriInvoke<T>(cmd, args);
    log.info("invoke", { cmd, ms: Math.round(performance.now() - started) });
    return out;
  } catch (err) {
    log.warn("invoke failed", { cmd, ms: Math.round(performance.now() - started), err: String(err) });
    throw err;
  }
}
