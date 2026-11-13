---
title: "Why activity percentage scores are a bad productivity metric"
description: "Employee activity percentage measures typing and clicking, not work. Why 70% thresholds backfire, and what to track instead for a small remote team."
date: 2026-11-13
updated: 2026-11-13
tags: [remote-team-productivity, employee-monitoring, metrics]
focus_keyword: "employee activity percentage"
---

Most monitoring tools show you an employee activity percentage next to each person's name. It looks like a productivity score. It isn't. It's a count of how often the keyboard and mouse moved during each ten-minute block, turned into a number between 0 and 100. That's it. If you're choosing what to measure for a small remote team, this is the first metric I'd throw out.

I've read a lot of threads from people on the receiving end of these scores. Three stuck with me: a developer whose activity dropped to 30% during a day spent reading a legacy codebase, a designer who kept jiggling her mouse during client calls because her manager had set a 70% floor, and a support lead who learned to leave a text editor open with a key repeating. None of them were slacking. All three were being measured wrong, and all three figured out how to game it within a week.

## What the number actually measures

Activity percentage is input frequency. Different vendors count it slightly differently — some count keystrokes and clicks, some add mouse movement, some weight them — but it's always the same shape: did this person touch the hardware in this interval, yes or no, how often.

So here's what scores high:

- Typing a long Slack message
- Copying data between two spreadsheets
- Scrolling aimlessly through anything
- Moving the mouse in circles while you think

And here's what scores low:

- Reading documentation or a contract
- A video call where your hands are in your lap
- Thinking through a problem on paper
- Watching a build run
- Talking to a customer on the phone

Look at those two lists and notice something uncomfortable. The low-scoring list contains most of the work your senior people do. The high-scoring list is mostly data entry and busywork. Activity percentage doesn't measure productivity — it measures *how manual someone's job is*. Your most junior data-entry hire will always out-score your lead engineer, and that's not a bug in the implementation. It's what the metric is.

### The 70% threshold problem

The real damage starts when you pick a number. "Everyone should be above 70%." It feels reasonable. Managers set it because it sounds like a fair floor, not a stretch target.

What happens next is predictable. People who do input-heavy work clear it without trying and learn nothing. People who read, think, or talk for a living fall under it and now have a problem that has nothing to do with their output. They can either explain themselves every week, or they can fix the number. Fixing the number is easier — a weighted key, a mouse jiggler app, a browser tab auto-scrolling, or just typing in a scratch file during calls. None of that takes skill and none of it is hard to find.

Now your data is worse than useless. The people gaming it look fine. The honest ones look bad. You've inverted the signal and you're making decisions on it.

## What to measure instead: time on task

The metric that survives contact with real work is time on task. Not "was this person active" but "what was this time spent on, and does that split look right."

For a 10-person team, that means three things:

**1. Total tracked hours per person per week.** Blunt and useful. If someone logged 12 hours in a week they said was full-time, that's a real conversation. If someone logged 52, that's also a real conversation, and a more urgent one.

**2. Hours split by project or client.** This is where you find actual problems. A project you quoted at 20 hours that's absorbed 60 is a pricing problem or a scope problem. One person carrying three clients while another carries one is a distribution problem. Neither shows up in an activity score.

**3. Application and site categories, at the team level.** Not per-minute, per-person surveillance — just whether the week's shape makes sense. If a developer's week is 60% in a browser and 5% in an editor, something's going on. Maybe they're stuck in meetings and nobody noticed. That's worth asking about. The answer is usually not laziness.

### Make idle time visible, not punishable

You do still want to know when nothing happened for 45 minutes — not to dock anyone, but because a tracker that counts a lunch break as billable hours will eventually embarrass you in front of a client.

The fix is to treat idle time as a question, not a verdict. Flag the gap, let the person label it, and move on. "That was a call with the client" or "I was reading the spec" takes five seconds to write and makes the timesheet accurate. Compare that to an activity score, which gives you a low number with no explanation and no way to add one.

This is also why I lean toward automatic capture over manual timers for most teams — people forget to start timers, and the forgetting isn't evenly distributed. I wrote more about that tradeoff in [automatic time tracking vs starting a timer by hand](/blog/automatic-time-tracking-vs-starting-a-timer-by-hand/).

## Where activity scores are genuinely fine

I don't think the metric is evil, just badly aimed. There are narrow cases where it's the right tool:

- **High-volume repetitive work with a known rhythm.** Data entry, transcription, moderation queues. The work really is keyboard-shaped, so input frequency correlates with output. Even then, output count is a better metric if you can get it.
- **Confirming the tracker is running at all.** Zero activity for an entire eight-hour shift usually means the app crashed or the laptop was asleep, not that someone sat perfectly still. That's a health check, not a performance review.
- **A single person debugging their own focus.** Looking at your own numbers to see where your day fragmented is fine. It's the comparison across people and the threshold that cause harm.

Outside those, if you find yourself needing an activity score to know whether someone works, the problem is that you can't see their output — and no amount of mouse-movement data will fix that. Define what "done" looks like for the role, and measure that.

### The honest tradeoff

Dropping activity scores costs you something real: a single number you can sort a column by. Time on task takes more judgment. You have to look at a week, know what the person was supposed to be doing, and form an opinion. That's slower than scanning for anyone under 70%.

I think that's the right trade for a team under 20 people, where you know everyone and can just ask. If you're running 200 contractors you've never met, you'll want more automation than I'm describing here — and a tool built for that scale, not mine.

## What we do about it

[bibotracker](/) tracks work time, app and site activity, and periodic screenshots for small remote teams, and shows the result as hours against projects rather than an activity percentage. There's no score to hit and no threshold to game. If you want a number to rank people by, we're the wrong choice — and I'd push back on wanting one at all.
