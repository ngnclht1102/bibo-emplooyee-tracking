# Privacy Policy — BiBoEmployeeTracking (Browser Extension)

**Last updated: June 14, 2026**

This Privacy Policy explains how the **BiBoEmployeeTracking** browser extension ("the Extension") handles information. It applies to the extension published on the Chrome Web Store and to the equivalent build for Microsoft Edge.

## Summary

- **We do not collect any data.** The developer/publisher receives nothing.
- **Nothing is sent to the internet or to any external server.**
- **All data stays on the user's own device**, inside the local BiBoEmployeeTracking desktop application.
- The source code is available for inspection so anyone can independently verify these claims.

## What the Extension does

The Extension observes the **active browser tab** and records, for each completed page visit:

- the page URL,
- the page title,
- the time the visit started, and
- how long the tab stayed active (time on page),
- the browser name (Chrome or Edge).

This information is sent **only** to the BiBoEmployeeTracking desktop application running on the **same computer**, over the local loopback address `http://127.0.0.1` (also called "localhost"). The loopback address never leaves the device — it is not reachable from the network or the internet.

## What the Extension does NOT do

- It does **not** send any information to the developer, publisher, or any third party.
- It does **not** transmit data over the internet or to any remote/cloud server.
- It does **not** use analytics, advertising, tracking pixels, or third-party SDKs.
- It does **not** sell, rent, or share data with anyone.
- It does **not** read page content, form inputs, passwords, cookies, or keystrokes.
- It does **not** capture screenshots from within the browser.

## Where data is stored

All browsing-activity data is stored **locally on the user's device** within the BiBoEmployeeTracking desktop application. The Extension itself keeps only small operational values in the browser's local storage (e.g. the local app's port number and a per-device pairing token, a paused/active flag, and a daily counter). None of this is transmitted off the device.

The organization that deploys BiBoEmployeeTracking controls the desktop application and the data it holds. Data retention, access, and deletion are governed by that organization's own policies and by the desktop application — not by the browser extension or by the publisher.

## Permissions and why they are needed

- **`tabs`** — to read the active tab's URL and title in order to record the current page visit.
- **`storage`** — to store the local pairing details and small settings described above, on the device.
- **`alarms`** — to periodically re-establish the connection to the local desktop app if it restarts or changes port.
- **`host_permissions: http://127.0.0.1/*`** — to deliver visit data to the BiBoEmployeeTracking desktop app running locally on the same machine. This host is the device's own loopback interface and is not accessible from the network.

## Consent and intended use

BiBoEmployeeTracking is intended for **workplace use with the knowledge and consent of the people using the device**, in accordance with the deploying organization's policies and applicable local laws. Organizations are responsible for notifying users and obtaining any consent required in their jurisdiction.

## Children

The Extension is a workplace tool and is not directed to children, and we do not knowingly collect information from children.

## Source code and verification

Because no data leaves the device, the safest way to verify our claims is to read the code. The Extension's source is available for review on request, and customers may inspect the build before deployment.

## Changes to this policy

If this policy changes, we will update the "Last updated" date above and publish the revised version at the policy URL below.

## Contact

For privacy questions, contact:

- **Email:** hongphong2120@gmail.com

---

*This document is provided as the privacy policy for the BiBoEmployeeTracking browser extension. Host it at a public URL and enter that URL in the Chrome Web Store Developer Dashboard under "Privacy practices".*
