---
title: "How to spot time theft without accusing anyone"
description: "How to prevent time theft on a small remote team: what to check, what the data proves, and how to run the conversation without accusing anyone."
date: 2026-11-10
updated: 2026-11-10
tags: [time-theft, employee-monitoring, remote-teams]
focus_keyword: "how to prevent time theft"
---

Someone on your team logs 40 hours a week and ships about 15 hours of work. You have noticed it for a month and you still have not said anything, because you have nothing except a feeling. That is the right instinct. The honest answer to how to prevent time theft is not "catch them" — it is "make hours boring to verify," so a padded week shows up as a question about data instead of a question about character.

I run a small team and I built a time tracker, so I have been on both sides of this. Here is what actually works.

## Separate the four things you might be looking at

"Time theft" gets used for four different situations that need four different responses. Decide which one you are in before you look at any data.

**Honest overestimation.** Someone works 6 real hours, feels like it was 8, and writes 8. No intent. Very common with manual timesheets filled in on Friday for the whole week.

**Idle time nobody is tracking.** The timer runs through a 90-minute lunch, a school pickup, a long call with their bank. They are not hiding it. Nobody told them the timer should stop.

**Second job overlap.** The same hours billed to you and to someone else. This is the one that usually sits behind the feeling you cannot name.

**Deliberate padding.** Mouse jigglers, scheduled scripts, fake activity. Rare, but it exists, and it leaves a very distinctive trace.

The first two are process problems and you fix them with a rule change, not a meeting about trust. Only the last two are worth building a case over. If you skip this step you will walk into a conversation about dishonesty when the real answer was "nobody told me to pause the timer at lunch."

## Collect two weeks of data before you say anything

One bad week is noise. Someone's kid was sick, their internet died, they spent three days on a problem that turned out to be a dead end. You need a pattern, and a pattern needs at least two weeks — ideally four.

Here is the specific thing to do. Turn on tracking for the whole team, announce it properly, and then do nothing for two weeks. No comments, no "I saw you only had 5 hours Tuesday." Just let it run. If you start reacting on day three, you teach everyone to manage the tool instead of doing the work, and your data becomes worthless.

While you wait, write down what you expect. "I think Tom is at about 25 real hours." Then check your guess against the numbers. I have done this and been wrong in both directions — once I was convinced someone was coasting and the data showed 38 solid hours on a project I had forgotten I assigned them.

### What to actually look at

In order of how much they tell you:

1. **Active time vs logged time.** The gap is the whole question. A 40-hour week with 22 hours of keyboard and mouse activity is not automatically bad — designers think, developers read, everyone takes calls — but a consistent 45% gap needs an explanation.
2. **Shape of the day.** Real work is lumpy. Bursts, gaps, a dead hour after lunch, a push at 4pm. Perfectly even activity across eight hours is the single most suspicious pattern there is, because humans do not work like that.
3. **Screenshots across a full day, not cherry-picked.** One screenshot of YouTube proves nothing. Twelve screenshots across a Wednesday, where nine show a personal browser and three show the actual project, is a pattern. I wrote about reading this data properly in [how to read screenshot data without micromanaging](/blog/how-to-read-screenshot-data-without-micromanaging/) — the short version is that you look at the day, never the frame.
4. **Browser activity by domain, aggregated weekly.** Not "they opened Reddit." Rather: 11 hours this week on sites unrelated to any project.
5. **Output in whatever system you already have.** Tickets closed, PRs merged, designs delivered, calls made. This is the control. Hours without output is a question; hours with output is usually just a different working style.

### The mouse jiggler tell

If you suspect deliberate padding, look for activity with no variance: identical movement intervals, cursor motion with zero clicks and zero keystrokes, activity that continues at exactly the same rate for hours. Automatic trackers record this plainly — the activity log is flat in a way a human never is. Compare it to the same person's known-good week. Mouse jigglers and timer scripts are also the one case where manual timesheets are useless, because the person is already writing whatever number they want. That tradeoff between automatic and manual capture is the whole reason I only trust automatic data here, and I went through it in detail in [automatic time tracking vs starting a timer by hand](/blog/automatic-time-tracking-vs-starting-a-timer-by-hand/).

## Fix the process before you fix the person

Most of what looks like theft dissolves when you write down three rules. Do this before any conversation, and do it for the whole team so it is policy, not a targeted accusation.

**Rule 1: say what counts as work time.** Mine is: pause for anything over 10 minutes that is not work. Lunch, errands, the gym. Nobody gets penalised for a 32-hour week if 32 hours is what they worked and it is agreed.

**Rule 2: say what the numbers are used for.** Payroll and invoices. Not rankings, not a daily leaderboard. If people think hours are a competition, they will pad hours, and you built that incentive yourself.

**Rule 3: make the data visible to them.** Everyone should see their own hours, their own screenshots, their own activity score — the same view you see. Half the padding stops the week people realise the number is checkable and they can check it themselves.

After two weeks of those rules, re-measure. In my experience a decent chunk of the gap closes with no conversation at all, which tells you it was process, not dishonesty. What remains is the real signal.

## How to run the conversation

You have four weeks of data, the rules were clear, and the gap is still there. Now you talk — and the trick is that you do not bring an accusation, you bring a number and a question.

What works: "Your logged hours are 38 a week, active time is averaging 19. Help me understand the difference." Then stop talking. Let them answer. Sometimes the answer is good — they spend half their week on client calls on a phone the tracker cannot see, which is a tracking gap, not theft, and that is your problem to fix.

What does not work: "I saw a screenshot of you on Instagram." Now you are arguing about one frame, they are defensive, and the real pattern never gets discussed. Never lead with a screenshot. Lead with the aggregate, use specifics only if they dispute the aggregate.

Two more things. Do it in a one-to-one call, never in writing first — a message with numbers in it reads like a disciplinary notice no matter how you phrase it. And know your outcome before you start: a changed arrangement, a fixed rate instead of hourly, a performance plan, or an exit. "I wanted you to know I noticed" is not an outcome and it just poisons the relationship.

### Where this approach is wrong

Monitoring is a bad answer for a few situations and I would rather say so.

If you have one or two people, skip all of this and just talk to them. Installing monitoring software on a two-person team is a sledgehammer, and the signal you get is worse than a direct conversation.

If the real problem is output, measure output. Someone can sit at a keyboard 40 hours a week and deliver very little. Activity data will not catch that; it will just reassure you wrongly.

If you are already sure you want this person gone, do not use tracking to build a file. Your team will work out what you did, and you will lose more trust than the one departure was worth.

And if the work is genuinely project-based with deadlines and deliverables, consider dropping hourly entirely. Fixed scope for fixed money removes the incentive to pad in the first place. No tool beats removing the reason.

If you do need the data, that is what I built [bibotracker](/) for: a desktop app on macOS and Windows that records work hours, takes periodic screenshots and logs browser activity, plus a web admin where you see the gap between logged and active time per person per week. It is built for teams under about 20 people, and it shows employees their own data by default — because the version where people can check their own numbers is the version that actually prevents padding.
