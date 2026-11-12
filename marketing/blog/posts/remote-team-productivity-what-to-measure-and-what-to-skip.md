---
title: "Remote team productivity: what to measure and what to skip"
description: "A founder's guide to remote team productivity metrics: what hours, screenshots and output data actually tell you, and which numbers to ignore."
date: 2026-11-12
updated: 2026-11-12
tags: [remote-teams, productivity, time-tracking]
focus_keyword: "remote team productivity"
---

I run a fully remote team. Everyone works from a different city, nobody shares an office, and I cannot walk past a desk to see how things are going. So I did what most founders do: I started collecting numbers. Hours. Activity levels. Screenshots. App usage.

Most of those numbers turned out to be useless. Not wrong — useless. They moved up and down and told me nothing I could act on. After about two years of this I ended up with a short list of things I actually look at, and a longer list of things I stopped looking at. This post is that split, because measuring remote team productivity badly is worse than not measuring it at all: you make confident decisions on noise.

## Start with the question, not the dashboard

Every metric should answer a question you would otherwise have to ask a person. That is the test. If a number does not replace a conversation or prevent a surprise, it is decoration.

Here are the four questions I actually have about a remote team:

- Is this person stuck, and have they been stuck longer than they would admit?
- Is the work taking much longer than we estimated, and when did that start?
- Are we billing or paying for hours that match reality?
- Is someone quietly working 55 hours a week and heading for burnout?

Notice what is not on that list: "is this person typing right now." I do not care. A developer thinking about a data model with their hands off the keyboard is working. A designer reading competitor sites in a browser is working. Any metric that punishes those minutes is measuring the wrong thing.

Write your own four questions before you install anything. The tool you need falls out of the questions. If you install first, you will end up justifying whatever the dashboard happens to show you.

## What to measure

### Hours against a task, not hours against a day

A total of "8h 12m today" tells me almost nothing. "5h on the invoice import, 2h on support, 1h in meetings" tells me the invoice import is now at 23 hours against a 12-hour estimate, and that is a conversation worth having on Tuesday instead of finding out on Friday.

This is the single most useful number I have. It needs work time attributed to a project or task, which means either people categorise their time, or the tracker does it automatically from the apps and sites in use. Both work. Automatic categorisation is less accurate but it actually happens — I wrote about that tradeoff in [automatic time tracking vs starting a timer by hand](/blog/automatic-time-tracking-vs-starting-a-timer-by-hand/).

### Estimate versus actual, tracked over time

One task running over is noise. The same person running 3x over on every backend task is a signal — maybe the estimates are optimistic, maybe the codebase fights them, maybe they are stuck and not saying so. All three are my problem to fix.

Keep this simple. A spreadsheet with task, estimate, actual, and a date is enough. You are looking for a pattern across ten tasks, not precision on one.

### Total weekly hours, as a ceiling and a floor

I look at the weekly total for exactly two reasons: someone working far under contract, and someone working far over. The second one catches more real problems than the first. Remote workers overwork quietly; there is no office emptying out at 6pm to tell them to stop.

### A sample of what the work looked like

Periodic screenshots or activity summaries are useful as context, not as surveillance. When a task has gone 3x over estimate, being able to see that the person spent eleven hours in a vendor's documentation and a support chat changes the conversation entirely — the problem is the vendor, not the person.

The discipline is to only open this data when a number already raised a question, never as a browsing habit. If you look at screenshots when nothing is wrong, you will find something to be annoyed about, and your team will feel it. [How to read screenshot data without micromanaging](/blog/how-to-read-screenshot-data-without-micromanaging/) goes deeper on this.

### Delivered work

The least technological metric and the most important one. What shipped this week? What did the customer get? Everything above exists to explain this number when it looks wrong, not to replace it.

## Remote team productivity metrics worth skipping

### Activity percentage

Keyboard and mouse activity scored as a percentage is the headline number in most monitoring tools, and it is the one I trust least. It rewards typing and penalises thinking. It is trivially gamed — a mouse jiggler costs about $12 and takes ten seconds to plug in. And the moment your team learns the number exists, it stops measuring work and starts measuring their response to being measured.

If your tool shows it, hide it. If you cannot hide it, at least never mention it to anyone.

### Screenshots as a daily review

Looking through everyone's screenshots every morning is not a metric. It is a habit that costs you an hour a day, surfaces nothing you could not get from the hours data, and corrodes trust the week someone finds out. Sample, don't surveil.

### Online status and response time

Green dots measure availability, not productivity, and treating them as productivity trains people to sit on chat instead of doing deep work. If a response time genuinely matters for a role — support, say — measure it directly as a service level on real tickets.

### Hours as a ranking

The person with the most hours is not your best worker. Often they are your slowest, or the one with the worst context switching, or the one covering for someone else. The moment hours become a leaderboard, hours inflate and stop being data.

### Comparisons between people

Two developers with the same title are doing different work on different parts of the system. Comparing their numbers produces a confident conclusion from nothing. Compare a person to their own last month, or compare a task to its estimate, and nothing else.

## Making the numbers safe to collect

Metrics only stay honest if people are not afraid of them. That means saying out loud what you collect, what you look at, and what you will never use it for — before you turn anything on, not after someone notices. Tell people they can see their own data. Then follow your own rule about not browsing it for entertainment, because that is the part they will be watching.

Also accept that some of this is simply the wrong fit. If you run a small senior team that ships predictably, you probably need invoicing-grade hours and nothing else — adding screenshots buys you noise and costs you goodwill. If you need task-level project management, burndown charts or performance reviews built on output quality, a time tracker is not that tool and will not become one. And if you want to monitor people without telling them, no tool fixes that; the problem is upstream.

If the measurement side is what you need — work time attributed to projects, periodic screenshots you can check when a number looks wrong, and a weekly view that catches both overwork and drift — that is what I built [bibotracker](/) for: a desktop app for macOS and Windows plus a web admin, aimed at small remote teams rather than enterprises. It will not tell you who your best engineer is. Nothing will. It will tell you where last week went, which is the part you can actually act on.
