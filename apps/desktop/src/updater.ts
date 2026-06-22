// Auto-update via Tauri's updater plugin. Checks our signed manifest
// (https://bibotracker.com/download/latest.json), and on a newer version downloads +
// installs the signed artifact, then relaunches. Signature is verified against the
// public key baked into tauri.conf.json — an unsigned/tampered artifact is rejected.
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { log } from "./log";

export type UpdateProgress =
  | { state: "checking" }
  | { state: "uptodate" }
  | { state: "available"; version: string }
  | { state: "downloading"; pct: number }
  | { state: "installing" }
  | { state: "error"; message: string };

/** Download + install an update, reporting progress, then relaunch into the new build. */
async function installUpdate(update: Update, onProgress?: (p: UpdateProgress) => void): Promise<void> {
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
        onProgress?.({ state: "installing" });
        break;
    }
  });
  log.info("update installed; relaunching", { version: update.version });
  await relaunch();
}

/**
 * Manual "Check for updates" (Settings). Reports each phase via onProgress and installs
 * if the user-facing flow finds one. Returns true if an update was found+installed.
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
    await installUpdate(update, onProgress);
    return true;
  } catch (e) {
    log.warn("update check failed", { err: String(e) });
    onProgress?.({ state: "error", message: String(e) });
    return false;
  }
}

/**
 * Silent check on launch. If an update exists it downloads, installs, and relaunches —
 * the app has just started, so applying it immediately is unobtrusive. Failures are
 * swallowed (offline, endpoint down) so a bad check never blocks startup.
 */
export async function autoUpdateOnLaunch(): Promise<void> {
  try {
    const update = await check();
    if (!update) return;
    log.info("update available on launch", { version: update.version });
    await installUpdate(update);
  } catch (e) {
    log.warn("auto-update on launch failed", { err: String(e) });
  }
}
