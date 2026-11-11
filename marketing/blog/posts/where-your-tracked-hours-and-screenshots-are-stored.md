---
title: "Where your tracked hours and screenshots are stored"
description: "Employee tracking data privacy starts with storage: where your hours and screenshots actually live, who can read them, and what to ask a vendor."
date: 2026-11-11
updated: 2026-11-11
tags: [data-privacy, screenshot-monitoring, remote-teams]
focus_keyword: "employee tracking data privacy"
---

Every time tracker I tried before building my own did one of two things. It shipped every screenshot and every window title to a server I knew nothing about, or it waited for someone to press start — and then recorded nothing at all until they did. For anyone who cares about employee tracking data privacy, that first option is the problem. You cannot answer "who can see this?" if you do not know where the data sits.

This post is the plain answer for my own product, and a checklist you can run against any other tracker. No legal language. Just where the bytes go.

## The three places tracking data can live

There are only three, and most tools mix them.

**On the laptop.** The desktop app writes to a local file or database first. On macOS that is usually somewhere under the user's Application Support folder; on Windows, under AppData. This is where raw data is born, and in most tools it is also a buffer: if the laptop is offline, the app keeps writing locally and uploads later.

**On the vendor's cloud.** The app uploads to a server the vendor rents, usually on AWS, Google Cloud, or Azure. Screenshots become image files in object storage. Activity becomes rows in a database. The admin web dashboard reads from there. This is how Hubstaff, Time Doctor, DeskTime, and ActivTrak all work, and it is how most of the market works, including my own hosted setup.

**On a server you control.** Self-hosted. You run the backend, the database, the screenshot storage. The vendor never holds the data. Very few monitoring tools offer this, because supporting it properly is a lot of work for a small customer segment.

The honest version of the local-vs-cloud question is this: almost nothing is *only* local. If there is a web dashboard where you can see your team, the data left the laptop. What differs is how much leaves, how long it stays, and who holds the keys.

### What actually leaves the laptop

For BiBoTracking, the desktop app sends four kinds of things:

- Time segments — start time, end time, whether the machine was idle.
- The active application name and window title, sampled periodically.
- Screenshots, as compressed JPEGs, at the interval the owner configured.
- Browser activity — the URL and page title of the active tab, when the browser extension is installed.

It does not send file contents, keystrokes, clipboard, microphone, or webcam. I wrote a whole post on the webcam question because people ask it constantly: [does employee monitoring software use your webcam?](/blog/does-employee-monitoring-software-use-your-webcam/)

That list is the thing to demand from any vendor. Not "we take security seriously" — the actual field list. If they cannot produce one, they either do not know or do not want to say.

## Where screenshots sit, specifically

Screenshots are the sensitive part. A window title tells you someone opened a bank site. A screenshot shows the balance.

So three storage questions matter more for screenshots than for anything else.

**How long are they kept?** Mine default to 30 days, then get deleted by a retention job, with a longer window available if an owner needs it for billing disputes. Hubstaff and Time Doctor keep them longer on paid tiers — that is a feature if you bill clients from evidence, and a liability if you do not. A screenshot you never look at is pure risk sitting on a disk.

**Can they be turned off per person?** On a team of ten you rarely need the same setting for everyone. A contractor you have never met is a different case from your co-founder. If the tool only has one global switch, you will end up over-collecting to cover the one person you were worried about.

**Who can open them?** In my setup: business owners and admins of that business. Not other employees. Not other businesses. As the person who runs the servers, I can technically reach the storage — that is true of every hosted vendor on earth, and anyone who tells you otherwise is describing an architecture they do not have. The useful questions are whether access is logged and whether support staff can browse your screenshots without you asking. For me the answer is that I touch production data only when someone opens a ticket and asks me to look.

### Blurring and deletion are not the same thing

Some tools offer blurred screenshots. It is a decent middle ground, but understand what it is: the blur happens on the laptop, before upload, so the sharp image never exists on the server — or the blur happens server-side and the sharp one does. Ask which. If it is server-side, you have not reduced what is stored, only what is displayed.

Deletion is the stronger control. If an employee can delete a screenshot before it uploads, or flag one for removal after, you have a real pressure valve for the moment someone's personal email is on screen. Fewer tools offer this than you would expect.

## What employee tracking data privacy means in a 10-person team

Most of the advice written about this topic is aimed at enterprises with a privacy office. For a small remote team, it compresses to four practical decisions.

**1. Decide what you actually need before you turn anything on.** If you need hours for invoicing, you need time segments and nothing else. Screenshots are for a specific problem — usually a trust gap with a new remote hire, or a client who disputes invoices. If you do not have that problem, do not collect the data. You cannot leak what you never stored.

**2. Set retention to the shortest window you can live with.** Pick it from a real scenario: how far back does a billing dispute go? Thirty days covers a monthly invoice cycle. Ninety if you bill quarterly. Default-forever is a choice, not a default.

**3. Write down where it lives, and tell the team.** One paragraph in your handbook: what is collected, where it is stored, how long, who can see it. The storage answer is the one technical people on your team will actually read. If you are nervous about that conversation, I wrote up how I handle it: [how to tell your team you are adding monitoring](/blog/how-to-tell-your-team-you-are-adding-monitoring/).

**4. Check the laptop side too.** The local buffer is still data. If a tracker caches a week of screenshots on disk because someone was travelling, a stolen laptop is a screenshot leak. Full-disk encryption on every machine is the fix, and it is free on both macOS and Windows.

### Where my tool is the wrong choice

If your requirement is that tracking data never leaves the employee's machine, I am not your answer, and neither are Hubstaff, Time Doctor, DeskTime, or ActivTrak. Pick a self-hosted monitoring tool and run it yourself, or drop screenshots entirely and use something like Toggl Track or Clockify where the only data is hours.

If you are under a contract or regulation that requires data residency in a specific country, ask me before buying rather than after. My hosting is in one region and I will tell you plainly which, but I am not going to pretend a solo operation has a multi-region compliance story.

And if your team is three people who already trust each other, screenshot monitoring is an answer to a question you do not have. Track hours, skip the images.

## The short version

Storage is the first question technical buyers ask because it is the only one that cannot be answered with marketing copy. Data is either on the laptop, in a vendor's cloud, or on your own server — and the web dashboard you want is what forces it off the laptop. Ask for the field list. Ask for the retention default. Ask who can open a screenshot without your permission.

The reason I built an automatic tracker rather than a manual one is a related storage decision: a timer someone forgets to start stores nothing, which is privacy-friendly and useless. I wrote about that tradeoff in [automatic time tracking vs starting a timer by hand](/blog/automatic-time-tracking-vs-starting-a-timer-by-hand/).

[bibotracker](/) is my own take: a desktop app for macOS and Windows that records work time, periodic screenshots and browser activity, with a web admin where owners see who worked on what, screenshots off by default and 30-day retention. If the storage answers above are the ones you wanted to hear, try it on one machine for a week before you roll it out to anyone else.
