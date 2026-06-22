// Auto-update via Tauri's updater plugin. Checks our signed manifest
// (https://bibotracker.com/download/latest.json); on a newer version it downloads the
// signed artifact and then PROMPTS the user to restart — we never relaunch without
// confirmation. Signature is verified against the public key baked into tauri.conf.json —
// an unsigned/tampered artifact is rejected.
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { ask } from "@tauri-apps/plugin-dialog";
import { log } from "./log";

export type UpdateProgress =
  | { state: "checking" }
  | { state: "uptodate" }
  | { state: "available"; version: string }
  | { state: "downloading"; pct: number }
  | { state: "ready"; version: string }
  | { state: "error"; message: string };

// We check on launch AND on every window focus (App.tsx). These module-level guards keep
// that cheap and non-spammy: skip overlapping checks, rate-limit the network call, and
// once an update is downloaded-and-waiting, stop re-checking/re-prompting for this run.
let inFlight = false;
let stagedVersion: string | null = null;
let lastCheckAt = 0;
const CHECK_THROTTLE_MS = 5 * 60 * 1000; // at most one focus-check every 5 minutes

/** Download + stage an update, reporting progress. Does NOT relaunch. */
async function downloadUpdate(update: Update, onProgress?: (p: UpdateProgress) => void): Promise<void> {
  let total = 0;
  let got = 0;
  onProgress?.({ state: "downloading", pct: 0 });
  await update.downloadAndInstall((ev) => {
    switch (ev.event) {
      case "Started":
        total = ev.data.contentLength ?? 0;
        break;
      case "Progress":
        got += ev.data.chunkLength;
        onProgress?.({ state: "downloading", pct: total ? Math.round((got / total) * 100) : 0 });
        break;
      case "Finished":
        onProgress?.({ state: "ready", version: update.version });
        break;
    }
  });
  stagedVersion = update.version;
  log.info("update downloaded; awaiting user restart", { version: update.version });
}

/** Ask the user to restart now; relaunch into the new build only if they confirm. */
export async function promptRestart(version: string): Promise<void> {
  const restart = await ask(
    `Version ${version} has been downloaded. Restart now to finish updating?`,
    { title: "Update ready", kind: "info", okLabel: "Restart now", cancelLabel: "Later" },
  );
  if (restart) {
    log.info("user confirmed restart into update", { version });
    await relaunch();
  } else {
    log.info("user postponed update restart", { version });
  }
}

/**
 * Manual "Check for updates" (Settings). Reports each phase via onProgress; on a newer
 * version it downloads then prompts to restart. Returns true if an update was found.
 */
export async function checkForUpdates(onProgress?: (p: UpdateProgress) => void): Promise<boolean> {
  try {
    onProgress?.({ state: "checking" });
    const update = await check();
    if (!update) {
      onProgress?.({ state: "uptodate" });
      return false;
    }
    onProgress?.({ state: "available", version: update.version });
    await downloadUpdate(update, onProgress);
    await promptRestart(update.version);
    return true;
  } catch (e) {
    log.warn("update check failed", { err: String(e) });
    onProgress?.({ state: "error", message: String(e) });
    return false;
  }
}

/**
 * Background check used on launch and on every window focus. Throttled + de-duped so it
 * never spams the network or the user: at most one check per CHECK_THROTTLE_MS, none while
 * one is in flight, and none once an update is staged. On a newer version it downloads
 * silently then prompts to restart (declined → stays staged, no further prompts this run;
 * re-checked on the next launch).
 */
export async function autoCheckAndPrompt(): Promise<void> {
  if (inFlight || stagedVersion) return;
  const now = Date.now();
  if (now - lastCheckAt < CHECK_THROTTLE_MS) return;
  lastCheckAt = now;
  inFlight = true;
  try {
    const update = await check();
    if (!update) return;
    log.info("update available", { version: update.version });
    await downloadUpdate(update);
    await promptRestart(update.version);
  } catch (e) {
    log.warn("auto update check failed", { err: String(e) });
  } finally {
    inFlight = false;
  }
}
