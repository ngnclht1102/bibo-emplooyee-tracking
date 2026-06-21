// ctracking browser extension — MV3 service worker.
//
// Tracks the active tab and reports each completed page visit (URL + time on page)
// to the local ctracking app. Discovers the app's loopback port by probing a fixed
// candidate list and reads the shared token from /whoami. See docs/04-browser-extension.md.

const CANDIDATE_PORTS = [47615, 48291, 49377, 50603, 51719, 52837];
const BROWSER = navigator.userAgent.includes("Edg") ? "edge" : "chrome";

// Reserved URL markers emitted when the user flips the popup toggle. The desktop app
// records these even while tracking is paused (so an "off" event still lands).
const MARKER_OFF = "user_turn_off_in_browser";
const MARKER_ON = "user_turn_on_in_browser";

const now = () => Math.floor(Date.now() / 1000);
const trackable = (url) => typeof url === "string" && /^https?:\/\//.test(url);

// ---------- link (port + token) discovery ----------

async function getLink() {
  const { link } = await chrome.storage.local.get("link");
  return link || null;
}

async function discover() {
  for (const port of CANDIDATE_PORTS) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/whoami`);
      if (!res.ok) continue;
      const j = await res.json();
      if (j && j.app === "employeetrack" && j.token) {
        const link = { port, token: j.token };
        await chrome.storage.local.set({ link });
        return link;
      }
    } catch (_) {
      /* port closed — keep probing */
    }
  }
  await chrome.storage.local.set({ link: null });
  return null;
}

async function ensureLink() {
  return (await getLink()) || (await discover());
}

async function postVisit(visit) {
  let link = await ensureLink();
  if (!link) return false;
  const send = (l) =>
    fetch(`http://127.0.0.1:${l.port}/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-ctracking-token": l.token },
      body: JSON.stringify(visit),
    });
  try {
    let res = await send(link);
    if (res.status === 401 || res.status === 404) {
      // Token/port changed (app restarted) — re-discover once and retry.
      link = await discover();
      if (!link) return false;
      res = await send(link);
    }
    return res.status === 200;
  } catch (_) {
    // Connection refused — app moved/closed. Clear so we re-discover next time.
    await chrome.storage.local.set({ link: null });
    return false;
  }
}

// Forward an unexpected error to the local desktop app, which reports it to Sentry on
// our behalf (an MV3 service worker can't bundle the Sentry SDK cleanly). Best-effort:
// swallow its own failures and never recurse. "App closed" (connection refused) is a
// normal state, not an error to report.
async function reportError(err, context) {
  try {
    const link = await getLink();
    if (!link) return; // no app to report to; don't trigger discovery just for this
    await fetch(`http://127.0.0.1:${link.port}/report-error`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-ctracking-token": link.token },
      body: JSON.stringify({
        message: String((err && err.message) || err),
        stack: err && err.stack ? String(err.stack) : null,
        context: context || null,
        url: BROWSER,
      }),
    });
  } catch (_) {
    /* desktop app unreachable — drop the report. */
  }
}

// ---------- current visit + transitions ----------

async function getCurrent() {
  const { current } = await chrome.storage.session.get("current");
  return current || null;
}

async function isPaused() {
  const { paused } = await chrome.storage.local.get("paused");
  return !!paused;
}

async function bumpCount() {
  const today = new Date().toDateString();
  const { countDay, count } = await chrome.storage.local.get(["countDay", "count"]);
  if (countDay === today) {
    await chrome.storage.local.set({ count: (count || 0) + 1 });
  } else {
    await chrome.storage.local.set({ countDay: today, count: 1 });
  }
}

// Finalize the current visit (if any) and begin a new one for `url`.
async function transition(url, title) {
  const current = await getCurrent();
  if (current && trackable(current.url)) {
    const duration = now() - current.startTs;
    if (duration >= 1) {
      const ok = await postVisit({
        url: current.url,
        page_title: current.title || null,
        ts: current.startTs,
        browser: BROWSER,
        duration_s: duration,
      });
      if (ok) await bumpCount();
    }
  }

  if (!(await isPaused()) && trackable(url)) {
    await chrome.storage.session.set({
      current: { url, title: title || "", startTs: now() },
    });
  } else {
    await chrome.storage.session.set({ current: null });
  }
}

// Emit a marker browser-page when the user toggles tracking on/off in the popup.
// Driven from the service worker so port/token discovery (postVisit) is reused.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes.paused) return;
  const paused = !!changes.paused.newValue;
  postVisit({
    url: paused ? MARKER_OFF : MARKER_ON,
    page_title: paused
      ? "Tracking turned off in browser"
      : "Tracking turned on in browser",
    ts: now(),
    browser: BROWSER,
    duration_s: 0,
  });
});

// ---------- events ----------

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    await transition(tab.url, tab.title);
  } catch (e) {
    // chrome.tabs.get rejects for closed/forbidden tabs — that's expected; only an
    // unexpected transition failure is worth reporting.
    reportError(e, "onActivated");
  }
});

chrome.tabs.onUpdated.addListener(async (_tabId, changeInfo, tab) => {
  if (!tab.active) return;
  if (changeInfo.url || changeInfo.status === "complete") {
    try {
      await transition(tab.url, tab.title);
    } catch (e) {
      reportError(e, "onUpdated");
    }
  }
});

chrome.windows.onFocusChanged.addListener(async (windowId) => {
  try {
    if (windowId === chrome.windows.WINDOW_ID_NONE) {
      // Browser lost focus — finalize and stop counting.
      await transition(null, null);
    } else {
      const [tab] = await chrome.tabs.query({ active: true, windowId });
      if (tab) await transition(tab.url, tab.title);
    }
  } catch (e) {
    reportError(e, "onFocusChanged");
  }
});

// Catch stray throws / rejections in the service worker itself.
self.addEventListener("error", (ev) => reportError(ev.error || ev.message, "worker.error"));
self.addEventListener("unhandledrejection", (ev) => reportError(ev.reason, "worker.unhandledrejection"));

// Discover on install/startup, and keep a slow re-discovery alarm as a safety net.
chrome.runtime.onInstalled.addListener(() => discover());
chrome.runtime.onStartup.addListener(() => discover());
chrome.alarms.create("rediscover", { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === "rediscover") ensureLink();
});
