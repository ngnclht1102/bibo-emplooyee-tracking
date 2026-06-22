// Product analytics from the web UI. Forwards events to the Rust `track_event` command,
// which posts them to Aptabase through the same pipeline as `app_started` (stable
// per-device session, batching, offline queue). Fire-and-forget — never throws.
import { call as invoke } from "./api";

export type EventProps = Record<string, string | number | boolean>;

export function track(name: string, props?: EventProps): void {
  invoke("track_event", { name, props }).catch(() => {});
}
