---
title: "Free Hubstaff alternative: what to look for"
description: "A buyer's checklist for replacing Hubstaff without a per-seat bill: the seven things a free time tracker has to get right, and where most of them quietly fall short."
date: 2026-10-27
updated: 2026-10-27
tags: [time-tracking, alternatives, hubstaff]
focus_keyword: "free hubstaff alternative"
---

Most teams start looking for a **free Hubstaff alternative** for one of two reasons: the
per-seat bill stopped making sense, or someone asked an uncomfortable question about what
the agent actually records. Both are good reasons. Neither is a good reason to grab the
first "free forever" tracker on a listicle.

Free trackers fail in predictable places. Below is the checklist we use ourselves — seven
questions, in the order they usually bite — plus how to answer each one in under ten
minutes.

## 1. Is it free, or free until you are dependent on it?

"Free" covers at least four different business models:

- **Free tier with a seat cap.** Fine at five people, a wall at six.
- **Free trial dressed up as a plan.** The clock is in the fine print.
- **Free client, paid server.** The agent costs nothing; storing what it collects does.
- **Open source.** Free because you can run it yourself, forever.

Only the last one is structurally free. Everything else is a price you have not been
quoted yet. Before you roll anything out, find the page that says what happens at seat
number 11, and what happens to data you already collected if you stop paying.

## 2. Where does the data actually live?

This is the question that decides whether a migration is possible later. A cloud-only
tracker owns your history. If the vendor raises prices, gets acquired, or has an outage
during payroll week, you have no local copy to fall back on.

Ask for three specifics:

- Is there a **local store** on the machine, and does tracking keep working offline?
- What is the **export** format — CSV and an API, or a PDF report?
- Can you point the agent at **your own backend**?

A tracker that is local-first and self-hostable can never strand you. One that is neither
is a subscription you cannot leave without losing the record.

## 3. What does it record, exactly?

There is a real line between measuring work and reading over someone's shoulder, and
plenty of monitoring tools quietly cross it. The ones that matter:

- **Keyboard** — reasonable: keystroke *counts* per interval. Crossing the line: logging
  what was actually typed.
- **Screen** — reasonable: periodic screenshots with a retention limit. Crossing the line:
  continuous screen recording.
- **Browser** — reasonable: page title and time on page. Crossing the line: form field
  contents and saved credentials.
- **Apps** — reasonable: app and window time, idle-aware. Crossing the line: reading
  document contents.

If a vendor cannot tell you which side of each line it sits on, assume the wrong one. For free
tools specifically, also ask what is done with the data in aggregate — if the product has
no revenue model you can see, the data is the revenue model.

## 4. Is idle time handled honestly?

A tracker that counts a machine sitting on a login screen as eight hours of work is worse
than no tracker, because now you have numbers and they are wrong. Look for:

- An explicit idle threshold, and idle gaps that are **excluded** from active time rather
  than silently filled in.
- Visible idle periods in the timeline, so a reviewer can see the shape of the day.
- No "keep me active" workaround that makes the number meaningless anyway.

Test it: install the agent, go make coffee for fifteen minutes, and check whether the day
total moved.

## 5. Does it run properly on the machines you actually have?

Free trackers are frequently one real app plus a thin port. On macOS, screen recording,
accessibility and input monitoring each need a separate permission grant, and an app that
handles those badly either fails silently or nags forever. On Windows, an unsigned
installer means a SmartScreen warning every single employee will have to click past.

Install it on one machine of each OS you own before you decide anything. Fifteen minutes
here saves a rollout.

## 6. Can the person being tracked see what you see?

Monitoring that people discover rather than agree to is the fastest way to turn a tooling
decision into a trust problem. The practical test is whether the employee can open their
own data: today's timeline, the screenshots that were taken, the signals being collected.

A tool built with that in mind will have it as a visible screen. A tool built around
surveillance will have it as a support ticket.

## 7. Is there a dashboard, or just a database?

Self-hosted and open-source options sometimes win on every point above and then lose on
this one: the data is all there, and reading it means SQL. If you are replacing Hubstaff,
you are also replacing its reports. Check that someone who is not you can answer "what did
this team do last week" without help.

## The short version

Score any candidate out of seven: structurally free, local-first storage, documented and
proportionate signals, honest idle handling, real support for your OS mix, transparency
to the person tracked, and a usable dashboard. Most free trackers score three or four.
That is fine — as long as you know which three before you roll it out, not after.

## How BiBoTracking answers these

We built BiBoTracking because we kept scoring badly on points 1, 2 and 6. It is open
source and free for unlimited employees, stores activity locally first and syncs to a
backend you can host yourself, records keystroke **counts** rather than keystrokes, hatches
out idle gaps instead of counting them, keeps screenshots on a retention limit, and gives
owners a web dashboard rather than a database connection string. On point 5 we are honest
about where we score badly: the macOS app is signed and notarised, the Windows installer
is not yet, so Windows users still see a SmartScreen warning on first run.

If that sounds like your checklist, the [feature-by-feature comparison](/#compare) is the
fastest way to see where it lands against Hubstaff, and the [pricing page](/#pricing)
explains what "free forever" means here in writing. Everything is
[open source](/#oss) if you would rather read the code than take our word for it.

*BiBoTracking is not affiliated with or endorsed by Hubstaff. Comparisons are based on
publicly listed Hubstaff plans and features at the time of writing.*
