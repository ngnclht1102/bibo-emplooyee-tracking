---
title: "How our desktop app tracks time on macOS and Windows"
description: "How our desktop time tracking app handles idle detection, offline capture and sync on macOS and Windows — and where it still gets things wrong."
date: 2026-11-14
updated: 2026-11-14
tags: [desktop-app, time-tracking, offline-sync]
focus_keyword: "desktop time tracking app"
---

If you are evaluating a desktop time tracking app, the demo video tells you almost nothing about the part that matters. What matters is what happens when the laptop sleeps mid-task, when the wifi dies on a train, when someone reads a long PDF without touching the keyboard, and when two devices run the same account at once. Those are the moments that produce wrong timesheets and arguments. This post explains exactly how our macOS and Windows app handles them.

I built both clients, so I know where the edges are. I will point them out as I go.

## What the app actually records

The app runs as a small background process. It is not a browser tab, and there is no timer button to remember — tracking starts when the person signs in and the work session begins, and it stops when they clock out or shut the machine down. If you are still deciding between that model and a manual start/stop timer, I wrote about the tradeoff in [automatic time tracking vs starting a timer by hand](/blog/automatic-time-tracking-vs-starting-a-timer-by-hand/).

Three streams get captured:

- **Work time.** Start and stop timestamps, plus idle gaps. Not a single running counter — a list of intervals, which matters later.
- **Screenshots.** Periodic captures of the screen, at an interval the owner sets. Default is one every 10 minutes.
- **Browser activity.** The domain and page title of the active tab, sampled while the person works.

That is the whole list. No keystroke contents, no webcam, no microphone, no reading of files. People ask about the webcam a lot, so there is [a separate post on that](/blog/does-employee-monitoring-software-use-your-webcam/).

### How the two platforms differ

The code is shared, but the operating systems are not, and honest answers here are short:

On **macOS**, screenshots require the Screen Recording permission and browser activity requires Accessibility permission. Both are system prompts that the person has to accept themselves, in System Settings, and macOS makes you restart the app after granting them. You cannot silently push these through MDM in a way that avoids the person seeing it. I consider that a feature, but if your plan was invisible installation, macOS is going to fight you.

On **Windows**, there is no permission prompt. The installer asks for admin rights once, and after that screenshots and window titles just work. Windows also handles multiple monitors differently: we capture the full virtual desktop, so a three-screen setup produces one wide image rather than three files.

One real gap: on macOS with multiple Spaces, we capture the active Space only. If someone has a second desktop open behind the current one, it is not in the screenshot.

## Idle detection, and why we draw the line at 5 minutes

Idle detection is where cheap trackers get dishonest. The naive version counts any second without input as not-working, which punishes anyone who reads, thinks, takes a call, or watches a build run.

We ask the operating system for the system-wide idle time — how long since the last keyboard or mouse event — and we only treat it as idle after **5 minutes of no input**. Under 5 minutes, it is counted as work, no questions asked. That is a deliberate tradeoff: a developer staring at a stack trace for four minutes is working, and no amount of clever heuristics beats simply not being paranoid about short pauses.

When the 5 minutes pass, three things happen:

1. The current work interval is closed at the moment input actually stopped, not at the moment we noticed. You do not lose 5 minutes, and you do not get credited for them either.
2. Screenshots stop. There is no point in collecting 40 identical pictures of a locked screen, and it keeps the storage bill down.
3. The person gets a notification on their machine saying tracking paused. No silent gaps.

When input comes back, a new interval opens. The idle stretch is stored and visible in the admin as an explicit gap, with its start and end. That is the part I would check in any tool you evaluate: **can you see the gaps, or does the tool just give you a lower number with no explanation?** A number you cannot audit is useless when someone disputes their hours.

### What we do not do

We do not score the idle time. We do not compute an activity percentage out of input frequency, because the metric rewards typing fast and punishes thinking — I went into why in [why activity percentage scores are a bad productivity metric](/blog/why-activity-percentage-scores-are-a-bad-productivity-metric/).

We also do not ask people to explain their idle time with a pop-up. Some tools do this and people hate it.

Sleep and lid-close are handled separately from idle. On both platforms we hook the system sleep and wake events, close the interval at sleep time, and open a fresh one at wake. Without that hook you get the classic bug where closing a laptop at 6pm and reopening it at 9am produces a 15-hour day.

## Offline capture and how sync actually works

Every tracker claims it works offline. The detail that decides whether it is true: where the data lives before it uploads, and what happens when the upload fails.

Everything is written to a local database on the machine first — timestamps, screenshot files, browser events. The network is never in the critical path. If you unplug the wifi, the app does not notice and does not stop tracking; it keeps appending locally exactly as before.

A background uploader then drains that local queue in batches, oldest first, with retry and backoff. A few specifics worth knowing:

- **Nothing is deleted until the server confirms it.** A row or screenshot leaves the local store only after a successful acknowledgement. A crash mid-upload means a duplicate attempt, not a lost hour.
- **Duplicates are the server's problem, not yours.** Each record carries a client-generated id, so a retried batch gets rejected as already-seen instead of double-counting the time.
- **Offline days are bounded by disk, not by a timer.** Screenshots dominate the size. A full day offline on one machine is a few hundred megabytes at the 10-minute default. A week offline is fine. A month offline on a small SSD is not, and the app will warn before it becomes a problem.
- **Timestamps are the client's, in UTC.** We do not re-stamp records at upload time. If a machine's clock is badly wrong, the timesheet will be wrong in the same way — this is the one failure mode where we trust the device and cannot defend you.

When the laptop reconnects, the backlog lands and the admin fills in retroactively. Hours appear under the day they happened, not the day they uploaded. That sounds obvious and several tools get it wrong.

If you want the full picture of which bytes leave the machine and which do not, [what a time tracker sends out, and what stays on the laptop](/blog/what-a-time-tracker-sends-out-and-what-stays-on-the-laptop/) covers it.

### Two devices, one person

A desktop and a laptop running the same account both track. We do not merge the intervals into one number — overlapping time from two machines shows as overlapping intervals, labelled per device. You decide what that means. Merging it silently would hide the useful signal.

## Where this is the wrong tool

Some honest limits before you commit:

- **Linux.** No client. If part of your team is on Linux, we are out.
- **Mobile.** No iOS or Android app. Field work tracked from a phone is not something we do.
- **Project and task breakdown.** We tell you time and activity, not time-per-task against a project tree. If you need granular project codes for client billing, Toggl Track or Clockify are a better fit.
- **Covert installation.** Both clients show a visible tray icon and the person can see their own tracked time. If the requirement is that employees do not know, stop reading now.
- **Air-gapped machines.** No network at all, ever, means the local store grows forever. There is no self-hosted server option today.

If what you want is reliable work time and screenshots from a small macOS and Windows team, with idle gaps you can actually inspect, that is what [bibotracker](/) does — a desktop app on each machine and one web admin where you see the result. Install it on one machine first and leave it offline for a day on purpose. That tells you more than any feature list, including this one.
