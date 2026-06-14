# ctracking browser extension

Manifest V3 extension (Chrome/Edge) that reports the active tab's URL + time-on-page
to the local ctracking desktop app. No build step — plain files.

## Load it (unpacked)

1. Make sure the **ctracking desktop app is running** (it hosts the local server).
2. Open **chrome://extensions** (or **edge://extensions**).
3. Toggle **Developer mode** on (top-right).
4. Click **Load unpacked** and select this folder (`apps/extension`).
5. The toolbar icon's popup shows **● Connected** once it finds the app.

## How it works

- **Discovery:** probes the candidate ports `47615, 48291, 49377, 50603, 51719, 52837`
  with `GET /whoami`, confirms `app == "ctracking"`, and caches `{port, token}`.
- **Tracking:** on tab activation / URL change / window focus change, it finalizes the
  previous page (time on page) and `POST`s it to `/ingest` with the shared token.
  Only counts while a browser window is focused.
- **Recovery:** if the app restarts on a different port (or the token changes), a
  failed post triggers re-discovery automatically.
- **Privacy:** only the active tab URL, title, and duration are sent — to 127.0.0.1.

## Notes

- Requires the desktop app's local server (Task 23). The token is read from
  `/whoami`; a web page can't read it (no CORS) and `/ingest` rejects web origins.
- Pause tracking from the popup toggle.
