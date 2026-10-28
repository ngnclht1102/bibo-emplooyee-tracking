---
title: "How to set up employee time tracking in one afternoon"
description: "How to track employee hours with a small remote team: a practical afternoon setup guide covering policy, install, first week, and the tradeoffs."
date: 2026-10-28
updated: 2026-10-28
tags: [employee-time-tracking, remote-teams, how-to]
focus_keyword: "how to track employee hours"
---

If you have three to ten people working remotely and you are trying to figure out how to track employee hours without turning it into a two-week project, this is the guide I wish someone had handed me. The actual software part takes about twenty minutes. The rest of the afternoon goes to the decisions you make before anyone installs anything — and those are the part that determines whether tracking still works in month three.

I build a time tracking tool, so I have watched a lot of first rollouts, including the ones that fell apart. Most of them failed on the policy, not the product.

## Before you install anything: decide what you actually want

Write down one sentence answering this: what decision will I make with this data?

Be specific. Real answers look like:

- "I need accurate hours per client so I can invoice correctly."
- "I pay hourly contractors and I need something better than a Slack message saying 'did 6 hours today'."
- "Two people on the team are drowning and I can't tell who, because everyone says they're busy."

Bad answers look like "I want to know people are working" or "I want visibility." Those aren't decisions, they're anxieties, and tracking built on them turns into surveillance because there's no point at which you have enough data to stop looking.

The sentence matters because it determines what you turn on. If you need billable hours per client, you need projects and manual time entry, and you can leave screenshots off entirely. If you pay hourly contractors you've never met, screenshots start to make sense. If you want workload balance, you want totals and trends and you should never look at an individual's hour-by-hour detail.

### Pick your settings from that sentence

Most tools let you turn on everything. Don't. Decide now, in writing:

- **Screenshot interval, or none at all.** Common options are every 5 or 10 minutes, blurred or clear, or off. If you don't have a concrete reason, off is correct.
- **Who can see what.** Can team members see their own data? (They should.) Can they see each other's? (Usually no.)
- **Idle handling.** What happens after 5 minutes of no keyboard or mouse. Reading a spec and thinking is work. Auto-discarding idle time punishes the people doing the hardest parts of the job.
- **How long you keep data.** Pick a number — 30, 60, 90 days — and set it. Data you keep forever is data you will eventually have to explain.
- **Hours of day.** Tracking should not run at 11pm on a Sunday. Most tools don't enforce this, so say it in the policy and mean it.

Budget about an hour for this. It's the highest-leverage hour of the whole afternoon.

## How to track employee hours: the rollout steps

### 1. Tell the team first, in writing, before they see an install link

An install link that arrives with no context reads as an accusation. One short message, sent a few days ahead, covering: what gets recorded, what does not, who can see it, how long it's kept, and what decision you're making with it. Then offer a call for questions.

The honesty here is load-bearing. If screenshots are on, say "it takes a screenshot every 10 minutes while the timer is running." Don't say "light activity monitoring." People find out what it actually does within a day, and if your description was softer than reality, you've spent trust you needed.

I wrote more about the morale side of this in [time tracking that does not destroy team morale](/blog/time-tracking-that-does-not-destroy-team-morale/) — the short version is that the damage comes from surprise and from people not being able to see their own data.

### 2. Set up your own account and run it on yourself for a day

Before anyone else installs it: create the workspace, install the desktop app on your own machine, and work a normal day with it running.

You will find things. The timer kept running through lunch. The app asked for screen recording permission in a way you'd need to explain. A screenshot caught your bank tab. Better you hit all of that than your team.

On macOS, expect to grant screen recording and accessibility permissions in System Settings, and expect the app to need a restart afterwards. Write down the exact clicks, because you'll be answering that question five times.

### 3. Create projects, but only a few

Start with three to five projects maximum. Usually clients, or big buckets of work. People will not maintain fifteen categories, and a timesheet where everything is logged to "General" is worse than no categories at all.

You can add more later once you see where the time actually goes.

### 4. Roll out to one person, then the rest

Pick whoever is most likely to tell you the truth when something is annoying. Have them install it and work two days. Ask specifically: did it slow your machine down, did it log you out, did the hours look right at the end of the day.

Then send the install link to everyone else with the permission steps you wrote down in step 2.

### 5. Check the first week's data, then say something out loud

At the end of week one, look at the totals. You will find something wrong — someone forgot to start the timer, someone left it running overnight, one project is absorbing time that belongs elsewhere.

Fix the entries, then tell the team what you found and what you changed. This is the step most owners skip, and skipping it is how tracking becomes a thing that silently watches people. If the data has visible consequences — a correction, a rebalanced workload, an invoice that's right — it's a tool. If nothing ever comes of it, it's just a camera.

## Where this goes wrong

**Looking at screenshots when you have no reason to.** If you catch yourself scrolling through someone's screenshots out of curiosity, you've turned a billing tool into a trust problem. Either you have a specific question or you close the tab.

**Comparing people's hours as a performance metric.** Hours measure hours. The person with 42 tracked hours may have shipped more than the person with 51. If you start ranking by tracked time, your team will optimize for tracked time, and you'll get exactly what you measured.

**Tracking salaried employees the same way as hourly contractors.** The case for screenshots on an hourly contractor you've never met is real. The case for them on a salaried senior engineer is thin, and the cost in resentment is high. It is fine to run different settings for different people, and better to say so plainly than to apply one policy because it was easier to configure.

**Not telling clients, when the data goes to clients.** If tracked hours appear on an invoice, your client may want the detail. Decide in advance how much you'll share.

## Picking a tool, and when not to pick mine

For a team this size, the real differences between tools are: the per-user price, whether the desktop app is actually stable on your team's OS mix, and how much of the monitoring you can turn off. Most of the big names — Hubstaff, Time Doctor, DeskTime — do far more than a five-person team needs, and you pay for it. Toggl Track and Clockify are good at timers and have little or no monitoring, which is the right answer for plenty of teams. If you're shopping on price, I went through what to actually check in [free Hubstaff alternative: what to look for](/blog/free-hubstaff-alternative-what-to-look-for/).

Be honest about where you don't fit. If you need payroll, invoicing, and scheduling in one system, or Linux desktops, or deep integrations with twenty tools, or a procurement process with SOC 2 paperwork, go with an established vendor. If your team's work happens mostly on phones, desktop tracking won't tell you much.

What I built is for the narrow case I kept hitting: a small remote team, macOS and Windows, that wants accurate hours and the option of screenshots and browser activity, without paying per-seat for a platform. [bibotracker](/) is a desktop app plus a web admin where you see who worked on what — and every monitoring feature can be switched off, because the policy you wrote this afternoon should drive the settings, not the other way around.
