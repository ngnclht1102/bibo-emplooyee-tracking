---
title: "What a time tracker sends out, and what stays on the laptop"
description: "What an offline time tracking app sends to a server, what it keeps locally, and how to verify it yourself with a proxy and a packet capture."
date: 2026-11-09
updated: 2026-11-09
tags: [privacy, employee-monitoring, remote-teams]
focus_keyword: "offline time tracking app"
---

A few weeks ago a thread about an offline time tracking app came across my feed. The poster wanted a tracker that worked without a connection, and most of the replies agreed that was a good requirement. Then someone asked whether it was open source, the answer was no, and the thread stopped there. That is the real objection. "Offline" sounds reassuring, but if you can't read the source, offline just means the data sits on the laptop until something sends it. Nobody told you when or what.

I build a tracker, so I have no neutral position here. What I can do is describe what a tracking agent actually does on the wire, and how you check it yourself instead of taking my word for it.

## What "offline" actually means in a tracker

Almost no tracker is offline in the sense of "never talks to a server." If the owner sees a dashboard, something uploaded. What vendors mean by offline is usually one of three things, and they are very different:

**Offline capture.** The app keeps recording when the connection drops. Time, app titles, screenshots go into a local queue. When the network comes back, the queue drains. This is the common meaning and it's mostly a reliability feature, not a privacy one.

**Local-only storage.** Data never leaves the machine. The "dashboard" is on that same machine. Almost nothing in this category is useful for a remote team, because the owner isn't on that machine.

**Self-hosted.** Data leaves the laptop but goes to a server you control. This is the one that actually answers the trust question, and it's rare in commercial trackers because it kills the subscription model.

If you're shopping with "offline" as a filter, decide which of those three you mean first. Most procurement conversations about offline trackers are really conversations about the third one, held in the language of the first.

## The traffic a tracking agent generates

Leave vendor claims aside. Here's the shape of what any screenshot-and-activity tracker has to send, because the dashboard can't work otherwise.

### Time and activity records

Small JSON, sent on a schedule. Typically every minute to every five minutes: a device id, a user id, a start and end timestamp, an idle/active flag, and often the foreground window title plus the app name. For an eight-hour day, that's a few hundred kilobytes. It's the least interesting traffic and the most revealing, because window titles leak more than people expect — document names, ticket titles, the subject line of whatever is open.

### Screenshots

The heavy part. At one screenshot every ten minutes on a 1440p display, compressed, you're looking at roughly 150–400 KB per shot and 5–20 MB per workday per person. Trackers that take three randomized shots per ten-minute block multiply that. This traffic is obvious in any capture: regular POSTs with a large body on a predictable cadence.

### Browser activity

A domain list, sometimes full URLs, sometimes page titles. This is the line that matters most and it's worth asking the vendor to be exact. "Browser activity" can mean `github.com` or it can mean the full path of the page your engineer had open in a personal tab. Ours records domain and title, not full URLs — but you shouldn't believe that from a blog post either, which is the whole point of the next section.

### Updates and telemetry

An update check, usually hourly or on launch, hitting a version manifest. Possibly crash reports. Possibly an analytics endpoint, which is the one that bothers skeptical engineers most, because it's traffic the product doesn't need to do its job. If a tracker phones a third-party analytics domain, that is a legitimate thing to object to.

## How to verify it yourself in an afternoon

You don't need source code to know what a binary sends. You need an hour and a laptop you don't care about.

**1. Put a proxy in front of it.** Install mitmproxy or Proxyman, trust its certificate, point the system proxy at it, and run the tracker for a normal working hour. You will see every HTTP request, the destination host, the body size and the cadence. Record the list of hostnames. If it's one vendor domain plus an update host, that matches what a tracker needs. If there's an analytics vendor, a crash service you didn't agree to, or an ad network, you have your answer.

**2. Watch what it does with the network off.** Turn off Wi-Fi, work for twenty minutes, turn it back on. Watch the queue drain in the proxy. This tells you two things: whether offline capture is real, and how much it buffers. While you're offline, look at where the queue lives on disk — on macOS it's usually under `~/Library/Application Support/<vendor>`, on Windows under `%APPDATA%`. If screenshots sit there as plain files, they're readable by anything running as that user. That's a real finding, and worth raising.

**3. Check for certificate pinning.** If the app refuses to work behind your proxy, it pins its certificate. Vendors do this for good reasons, but it also means you cannot audit the traffic, and you should weigh that. I'd rather a tracker be auditable than pinned.

**4. Run a packet capture for the non-HTTP stuff.** `tcpdump` or Wireshark for ten minutes will show anything that isn't going through the proxy — a UDP channel, a websocket to an unexpected host, DNS lookups for domains you didn't see in step one.

**5. Ask the vendor three questions in writing.** What hostnames does the agent contact? Where is the data stored, in which country? What's the deletion process and how long does raw data live? A vendor who won't put those in an email is telling you something.

Do this once, write down what you found, and show the team. That's a far better basis for installing monitoring than a vendor's privacy page — and it changes the conversation from "trust us" to "here's the capture." If you're about to have that conversation with your team, [how to tell your team you are adding monitoring](/blog/how-to-tell-your-team-you-are-adding-monitoring/) covers the human side of it.

## Where this leaves you if you can't read the source

Here's the honest tradeoff. Closed-source is a real limitation and the engineer on your team is right to flag it. Verification by proxy tells you what a binary does today, under the conditions you watched. It doesn't prove what a future version does, and it doesn't prove there's no conditional path you didn't trigger. Source code wouldn't fully prove that either — you'd still be trusting that the binary matches the source — but it's a stronger position and I won't pretend otherwise.

So the realistic options, in order of how much trust they require:

- **Self-hosted open source** (Kimai, ActivityWatch, and similar). Most trust-efficient, most work. You run the server, you patch it, you back it up. Screenshot support is usually weaker or absent.
- **A commercial tracker you've audited on the wire.** Less work, less certainty. You know what it did during your capture and you re-check after major updates.
- **No agent at all.** Self-reported timesheets, or tracking at the project-management layer. Zero intrusion, worse data. For a lot of small teams this is genuinely the right call, and I've said as much in [automatic time tracking vs starting a timer by hand](/blog/automatic-time-tracking-vs-starting-a-timer-by-hand/).

If the skeptical engineer on your team is the one who'd have to install it, let them do the capture and let them report back. The finding carries more weight coming from them, and if they find something you don't like, you've saved yourself a rollout.

For what it's worth: [bibotracker](/) is a desktop tracker for small remote teams that queues time, screenshots and browser activity locally when the connection drops and syncs to one backend you can see in a capture — and if your team's requirement is that nothing ever leaves the machine except to a server you own, a self-hosted open-source tool is the better fit and I'd rather you use that than argue you out of it.
