---
title: "Blocking distracting sites vs tracking where the time went"
description: "Website blocker vs time tracker: one restricts machines, the other gives you a record of the hours. Which one a small remote team actually needs."
date: 2026-11-06
updated: 2026-11-06
tags: [employee-monitoring, remote-teams, productivity]
focus_keyword: "website blocker vs time tracker"
---

A developer on a five-person team told his boss he kept losing afternoons to Reddit and YouTube. The boss's reaction was to ask me whether we could block those sites on the work laptops. That's the website blocker vs time tracker question, and it comes up a lot: the instinct is to restrict the machine, when the actual gap is that nobody — including the developer — knows where those afternoons went.

These are two different problems. Blocking is a control. Tracking is a record. They feel similar because both get filed under "focus", but they fix different things, and picking the wrong one quietly makes your team angrier for no gain.

## What a blocker actually does

A site blocker enforces a rule you wrote in advance. You decide a list of domains, and the machine refuses to load them during certain hours. Tools like Cold Turkey, Freedom, or the blocking features inside monitoring suites all work this way.

That rule has to be right in advance, and that's where it breaks down in real work:

- **Your blocklist is a guess.** Reddit is a time sink for one person and where another one finds the answer to a Postgres locking bug. YouTube is distraction and also half the documentation for Blender, Unity, and most video tooling.
- **The distraction moves.** Block Twitter and the time goes to Hacker News. Block that and it goes to the phone sitting next to the laptop, which you do not control and should not try to.
- **It produces nothing you can look at later.** On Friday you still cannot answer "how many hours went into the client's redesign this week?" You only know that nobody loaded reddit.com on a work machine.

Blockers work well in exactly one situation: when somebody chooses it for themselves. Self-imposed blocking is genuinely useful — I use a blocker during writing blocks. Imposed from above on an adult professional, it reads as "we assume you can't control yourself", and you'll hear about it.

There's also a practical problem nobody mentions in the sales copy. If you block at the machine level, you now own a support queue. Someone can't reach a vendor portal because it's on a shared CDN domain. Someone's on their own laptop and your policy doesn't apply. Someone needs the block lifted for an hour. That's your afternoon.

## Website blocker vs time tracker: what each one gives you

The honest split, for an owner deciding between them:

**A blocker gives you prevention with no evidence.** It tries to stop a specific behavior and tells you almost nothing. The only data you get is a list of attempted visits, which is a measure of friction, not of work.

**A tracker gives you evidence with no prevention.** It doesn't stop anybody from opening anything. It records hours, the apps and sites that were open, and — if you turn it on — periodic screenshots. On Friday you can see that the redesign took 31 hours, not the 20 you quoted.

Now look at the questions owners actually have when they come to me:

- Is this project losing money?
- Did the contractor really work the 40 hours on the invoice?
- Why did a two-day task take nine days?
- Who on the team is drowning while someone else is idle?

Not one of those is answerable by a blocker. All of them are answerable by a record of hours. That's the real reason I think most small teams reach for the wrong tool: the pain is "I have no visibility", and blocking feels like doing something about it without the awkward conversation that measurement forces.

### The nine-day task

The nine-day two-day task is the case worth sitting with, because it's the one blocking would have flagged as a distraction problem and gotten completely wrong.

When you look at an actual time record for that kind of task, the distraction hours are usually not the story. What you find instead: four hours in meetings that week, three separate half-days where the task was started and dropped because something urgent came in, a day of waiting for an API key, and two hours of actual social media. The fix is "stop interrupting this person", not "block Twitter". A blocker would have removed the two hours and left the other 28 in place.

You can only make that call if you have the record. This is the same reason I prefer tracking that runs on its own over a timer somebody remembers to press — I wrote about that tradeoff in [automatic time tracking vs starting a timer by hand](/blog/automatic-time-tracking-vs-starting-a-timer-by-hand/). Memory invents a tidy story. The record doesn't.

## How to actually decide

Three questions, in order.

**1. Can you name the decision the data will change?**

Write it down in one sentence. "I need to know whether the Henderson account is profitable." "I need to verify contractor invoices before I pay them." If you can write that sentence, you want a tracker. If you can't write any sentence — if the honest version is "I feel like people are slacking" — don't buy either tool yet. Go find out what's actually happening, because tooling bought on a vague feeling becomes surveillance theater and your team will read it that way.

**2. Is the problem one person or the system?**

If it's one person, this is a management conversation, not a software purchase. Buying monitoring for twelve people to address one person is a cowardly and expensive way to avoid a ten-minute talk, and the other eleven will notice.

If it's structural — projects consistently overrun, invoices you can't verify, no idea where capacity goes — that's a measurement problem and software helps.

**3. Does the person doing the work need the data too?**

This is the test I'd actually weight most. Blocking is purely for the person who imposed it; the blocked person gets nothing but a wall. A time record is useful to both sides. The developer who lost his afternoons wanted to know where they went just as much as his boss did. Tooling that only serves one side of the table breeds resentment. Tooling both sides can use survives.

## Where measurement is the wrong answer too

I'd rather you not buy my product than buy it for the wrong reason, so here's the other side.

Tracking is the wrong choice if you're running a team on pure deliverables — a designer on three fixed-fee logos a month doesn't need hours recorded, they need the logos on time. It's wrong if your real problem is unclear priorities; a record of chaos is still chaos. And it's wrong if you plan to use it punitively. Screenshot monitoring in particular costs you trust, and if you deploy it quietly, the cost arrives all at once on the day someone notices. Tell people before you turn it on, tell them what's captured, and let them see their own data.

Tracking is also the wrong choice if you won't look at it. I've watched owners install monitoring, check the dashboard twice, and never open it again. You've paid money and spent trust for nothing. If no one owns a weekly fifteen minutes of actually reading it, skip it.

And if the real goal is one person's own focus, buy them a blocker. A $60 license for someone who asked for it beats a monitoring rollout for twelve who didn't.

If what you need is the record — hours, the apps and sites that were open, optional screenshots, and a weekly view of who worked on what — that's what [bibotracker](/) does, on macOS and Windows with a web admin for owners. It won't block anything, by design.
