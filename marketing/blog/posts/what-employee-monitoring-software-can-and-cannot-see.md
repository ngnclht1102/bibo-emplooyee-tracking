---
title: "What employee monitoring software can and cannot see"
description: "A plain, honest breakdown of what employee monitoring sees on a work laptop: screenshots, app titles, browser activity, and the limits."
date: 2026-11-07
updated: 2026-11-07
tags: [employee-monitoring, screenshot-monitoring, remote-teams]
focus_keyword: "what employee monitoring sees"
---

Search for what employee monitoring sees and you get two kinds of answers. Vendor pages that say "full visibility into your workforce", and forum posts where someone is sure their boss is reading their private messages. Neither is useful. I build a monitoring tool, so I know exactly how boring the truth is, and I think both sides of the laptop deserve the boring version.

This post is about desktop monitoring agents — the small app that gets installed on a work machine and reports to a web dashboard. That covers most of the category: Hubstaff, Time Doctor, DeskTime, ActivTrak, my own tool, and the rest.

## The three things almost every agent captures

Strip the marketing away and nearly all of these tools collect the same raw material.

### Time, in blocks

The agent knows when the machine is in use and when it is not. It watches for keyboard and mouse input at the operating-system level — not *what* you typed, just that input happened. After some idle threshold (usually 3 to 10 minutes) it stops counting.

So the dashboard sees "active from 09:12 to 11:40, idle until 12:05". It does not see you reading a long document with your hands off the keyboard, which is why idle time is the single most misread number in every one of these tools. Someone on a two-hour customer call with no screen sharing can look like they vanished.

### Screenshots of the whole screen

This is the part people most want a straight answer about. A screenshot is a screenshot: the full desktop, every window visible at that moment, at whatever interval the admin set — commonly every 5 or 10 minutes, sometimes random within the interval.

That means it captures whatever is on screen. Your inbox if your inbox is open. A personal bank tab if it is in the foreground. A WhatsApp Web conversation with your partner. The agent has no idea which of those is work and which is not. It is not "reading your messages" in any clever sense — it just photographed the screen you left them on.

On macOS this requires the Screen Recording permission, granted by hand in System Settings, and the permission prompt is impossible to miss. On Windows it generally needs no prompt at all. That asymmetry matters if you are trying to work out what is running on your machine.

### Active window and browser activity

The agent reads the title of the window in front and usually the URL of the active browser tab. Window titles are more revealing than people expect, because applications put real content in them: a document name, a ticket number, an email subject line, a video title.

Browser capture is usually domain or full URL, with the timestamp and duration. So the record is "github.com, 34 minutes" or "youtube.com/watch?v=..., 11 minutes". If you want the longer argument about what to do with that data, I wrote about [tracking where the time went instead of blocking sites](/blog/blocking-distracting-sites-vs-tracking-where-the-time-went/).

## What employee monitoring sees that surprises people

A few things that come up again and again, from both employees and owners who assumed the opposite:

- **Everything on the screen is on the screen.** There is no "personal app" filter that works reliably. Some tools let an admin blur or exclude specific apps, but the default in most products is capture everything.
- **Private browsing does not help.** Incognito hides history from the browser, not the window title from the operating system. The agent sits below the browser.
- **One screenshot can contain another person.** A video call grid, a shared screen, a client's data. This is the part teams never plan for, and it is a real compliance problem in some industries.
- **Deleted on the laptop is not deleted on the server.** Once a screenshot uploads, the retention policy is the admin's setting, not yours. Ask what it is. Mine defaults to 30 days; others keep months.
- **The dashboard records who looked.** Or it should. If an owner can scroll a year of someone's screens with no audit trail, that is a weakness in the tool, not a feature.

## What it cannot see

This list is shorter than the fear suggests, but it is real.

**Encrypted page content.** The agent sees that you were on a URL. It does not decrypt HTTPS traffic to read the page body. What it can see of the content is only what was visible in a screenshot.

**Other devices.** Your phone, your personal laptop, your tablet. The agent is installed on one machine and reports on that machine. Mobile monitoring is a separate product category with a separate install.

**Anything while it is off.** Agents can be quit, uninstalled, or starved of network. Most tools detect the gap and show missing time rather than inventing it. A six-hour hole is visible; it just is not filled in.

**Intent.** This is the important one. The tool can tell you a developer spent 40 minutes on Stack Overflow. It cannot tell you whether that was research or avoidance. Every chart in every one of these products stops at that line, and no amount of "productivity scoring" crosses it. The score is a guess made by whoever labelled the app categories.

**Keystroke content**, in most mainstream tools. Some products count keystrokes per minute; full keyloggers that record the characters you typed are a different, more invasive category and are illegal to deploy in several jurisdictions without explicit consent. Read the feature list carefully — "keyboard activity" and "keystroke logging" are not the same thing.

## How to check for yourself

If you are an employee: open your system settings and look at which apps hold Screen Recording and Accessibility permissions on macOS, or check installed programs and startup items on Windows. Then ask your manager three specific questions — what is captured, how long it is kept, and who can view it. A company that cannot answer those has a policy problem.

If you are an owner: install the agent on your own laptop first and leave it running for a week before anyone else gets it. Then look at your own screenshots. Most people reduce their capture frequency after seeing their own data, and a few decide against screenshots entirely. That is a legitimate outcome. I wrote about [reading screenshot data without micromanaging](/blog/how-to-read-screenshot-data-without-micromanaging/) because the raw feed is easy to misuse, and about [how to tell your team you are adding monitoring](/blog/how-to-tell-your-team-you-are-adding-monitoring/) because doing it quietly is how you lose good people.

## Where this leaves you

Monitoring is a blunt instrument. It produces an accurate record of screen time and a very poor record of value. If what you actually need is proof of hours for client invoicing, or a way to see whether a new hire is drowning, it works. If you are hoping it will tell you who your best engineer is, it will mislead you, and if your team already delivers predictably, you are buying a trust problem you did not have.

[bibotracker](/) is my take on the honest end of this: a desktop app that records work time, periodic screenshots and browser activity, with a web admin where you see who worked on what — and settings you can turn down rather than a pile of scores. If you decide the answer is no monitoring at all, that is a fine decision too. Just make it knowing what the software can and cannot see.
