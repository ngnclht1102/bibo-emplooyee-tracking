---
title: "Does employee monitoring software use your webcam?"
description: "Does monitoring software use webcam access? Almost never, and here is how to prove it to your team before you install anything."
date: 2026-11-09
updated: 2026-11-09
tags: [employee-monitoring, privacy, remote-teams]
focus_keyword: "does monitoring software use webcam"
---

The first time I asked a contractor to install our desktop app, the reply was not about features. It was: "I'm very careful with installing non-OSS stuff on my computer that records my webcam 24/7." So let's answer it directly: does monitoring software use webcam access? For the mainstream tools small teams actually buy — Hubstaff, Time Doctor, Toggl Track, Clockify, DeskTime, ActivTrak, and mine — no. None of them record video of your face. The fear is reasonable, it's just aimed at the wrong thing.

What these tools *do* collect is often more revealing than a webcam feed, which is why "no camera" is a starting point for the conversation, not the end of it.

## Why people assume the camera is on

Three things got mixed together in people's heads.

**Proctoring software is real.** Exam tools like Proctorio and ProctorU genuinely use the camera, because the whole product is "confirm a human is sitting there alone." Students hated it, it got written about a lot, and the mental image stuck to anything called "monitoring."

**Call-center and trucking surveillance is real.** Some fleet cameras and some BPO setups do take face snapshots. That's a different industry with a different risk model, and it's usually written into a specific contract.

**Screenshots sound like photos.** When a founder says "it takes screenshots," a lot of people hear "it takes pictures." It takes pictures of the screen — the thing the employee is choosing to put there. The distinction is obvious once you say it out loud and invisible until you do.

Add that most of these agents are closed-source binaries with broad-sounding install prompts, and distrust is the sane default. You don't get to argue someone out of that. You have to show them.

## How to check whether a tool can touch the camera

Don't take the vendor's word, including mine. Both platforms make this checkable in under five minutes, and I'd rather a team run these checks than trust a sentence on a pricing page.

### macOS

macOS will not give any app the camera without an explicit permission dialog, and the grant is recorded permanently. Open **System Settings → Privacy & Security → Camera**. Every app that has ever asked is listed with a toggle. If the tracker isn't in that list, it has never requested camera access. There's no backdoor around this for a normal App Store or notarized app — the TCC layer sits below the application.

Two more things worth knowing: the green LED next to the lens is wired to the camera's power, not to software, so it cannot be lit without the sensor running. And since Ventura, macOS shows an orange dot in the menu bar whenever the mic is live.

### Windows

Go to **Settings → Privacy & security → Camera**. Windows lists recent camera access per app, including the last time it was used. If a tracker has been running for a week and never appears there, it isn't touching the camera.

### The harder check, for a skeptical engineer

Point them at the network tab. On macOS, `lsof -i -P | grep <appname>` shows what the agent is connected to. Sustained video upload is not subtle: even heavily compressed 720p is roughly 1–2 Mbps, so an eight-hour day would be something like 4–7 GB per person per day. A screenshot-based tracker at one capture every ten minutes uploads maybe 48 JPEGs, a few MB total. If someone is worried about hidden video, bandwidth is the easiest tell — you cannot hide gigabytes.

I like this check because it doesn't rely on trusting the binary. The numbers either show up on the wire or they don't.

## The thing your team should actually worry about

Here's where I'd rather be honest than reassuring. The camera is the scary-sounding item. The genuinely invasive items are the ones nobody asks about:

- **Keystroke logging.** Some tools record every keypress, which captures personal messages and passwords typed into non-password fields. A few vendors offer this. I would not turn it on, and I didn't build it.
- **Full URL capture.** "Browser activity" can mean the domain, or it can mean the full URL with query strings — which leaks a lot: medical searches, job applications, a document title.
- **Screenshots at short intervals.** Every ten minutes is a work-pattern sample. Every thirty seconds is a flipbook of someone's day, including the DM they had open.
- **Running outside work hours.** This is the one that destroys trust fastest. If the agent tracks whenever the laptop is on, you're monitoring someone's evening.

When I rolled this out, the questions that mattered were "what exactly is captured," "who can see it," and "how long is it kept" — and the answers I had to write down were uncomfortable in a useful way. If you're having that conversation this week, I wrote up how I phrase it in [how to tell your team you are adding monitoring](/blog/how-to-tell-your-team-you-are-adding-monitoring/), and the full capture-by-capture breakdown is in [what employee monitoring software can and cannot see](/blog/what-employee-monitoring-software-can-and-cannot-see/).

## What to promise, in writing

Verbal reassurance decays. Put four things in a one-page document people can re-read after they've forgotten the meeting:

1. **The exact list of what's captured.** Not "activity data." Write: work time, screenshots every N minutes, active app name, browser domain. If something isn't on the list, it isn't collected.
2. **The retention window.** Ours is a fixed number of days, then the screenshots are deleted. Pick a number and hold to it. "Indefinitely" is not a policy.
3. **The schedule.** Tracking runs when the app is on the clock and stops when it isn't. Say whether the employee controls that, because that's the real question behind "is it watching me."
4. **Who has access.** In a ten-person company this is usually one or two people. Name them.

And then do the boring part: let someone run the OS permission check in front of you during onboarding. Two minutes, settles it.

### Where this gets uncomfortable anyway

Some people will install nothing closed-source on a personal machine, and they're not being difficult. That's a defensible position. The workable answers are a company-issued laptop, or a separate user account, or honestly accepting manual timesheets for that person. If you're hiring in the EU, GDPR also expects a documented necessity argument and a DPIA for systematic monitoring — "we wanted to see" isn't a lawful basis, and a legal review is cheaper than the alternative.

And if what you need is work hours rather than evidence, skip the agent entirely. A tool that just records time has a far smaller trust cost — I compared the two approaches in [automatic time tracking vs starting a timer by hand](/blog/automatic-time-tracking-vs-starting-a-timer-by-hand/).

## Where my tool sits

[bibotracker](/) is a desktop app for macOS and Windows that records work time, takes periodic screenshots, and logs browser activity, with a web admin where owners review it. There's no camera access, no microphone access, and no keystroke logging — not as a setting you can enable, but as code that doesn't exist. If your team wants to verify that rather than believe it, the OS permission panel will back me up.

If you need webcam verification, live video, or keystroke logs, I'm the wrong choice, and I'd point you at an enterprise tool built for that. If you need to know where the hours went without surveilling a person's face, that's the whole product.
