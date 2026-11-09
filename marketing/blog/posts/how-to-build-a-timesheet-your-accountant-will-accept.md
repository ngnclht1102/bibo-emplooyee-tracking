---
title: "How to build a timesheet your accountant will accept"
description: "A practical guide to timesheet software that survives payroll, invoicing and an audit: what fields to record, what to keep, and what to throw away."
date: 2026-11-08
updated: 2026-11-08
tags: [timesheets, payroll, record-keeping]
focus_keyword: "timesheet software"
---

My accountant rejected my first timesheet export. Not because the hours were wrong — because she couldn't tell where they came from. It was a spreadsheet with names down the side and weekly totals across the top. Her question was simple: "If someone disputes this in six months, what do you show them?" I had no answer. Most timesheet software exports something equally useless by default, so this post is about what to actually record, and how to get it out in a shape that holds up for payroll, for client invoices, and for the awkward conversation where someone says they worked more than you paid them for.

## What "defensible" actually means

A defensible record is one where each number can be traced back to something that happened. Not "Mai worked 38 hours in week 45" but "Mai worked 38 hours in week 45, made up of 23 sessions, here they are, here's what was open during each one."

Three things make a record defensible:

- **Granularity.** Per-session rows, not per-week totals. A week total is a conclusion. A session list is evidence.
- **Provenance.** Each row says how it was created: the app recorded it, or a person typed it, or a person typed it and someone approved it.
- **Immutability of the original.** Edits are fine. Edits that silently overwrite the original are not. You want the before and the after.

If your export has all three, you can answer almost any question after the fact. If it has none, you're asking people to trust your spreadsheet, which is exactly what my accountant refused to do.

## The nine fields your export needs

Here's the column list I settled on. It's boring on purpose.

1. **Employee identifier** — a stable ID, not just a name. Names change, and two people can share one.
2. **Date** — the local date the work happened, in the person's timezone.
3. **Start time and end time** — with timezone offset. Not duration alone.
4. **Duration in minutes** — computed, but stored, so you aren't re-deriving it from timestamps in a spreadsheet at 11pm.
5. **Idle or break minutes inside the session** — kept separate from the duration, never silently subtracted.
6. **Project or client code** — the same code your invoicing uses. If your timesheet says "redesign" and your invoice says "PRJ-204", someone has to map them by hand every month.
7. **Source** — `automatic`, `manual`, or `manual-approved`.
8. **Edited flag plus original value** — if the duration was changed from 240 to 300 minutes, both numbers live in the row.
9. **Approved by and approved at** — who signed off and when. Empty is a valid value, but the column exists.

Two more columns I'd add if you bill clients: a billable yes/no, and a rate or rate code. Keeping rates out of the timesheet and in a separate pricing sheet sounds cleaner, but then nobody can check an invoice without opening two files.

## Choosing timesheet software that won't fight you

Most tools can produce something like the list above. The differences that actually matter when you're exporting for payroll:

**Does the export include edits, or only final values?** This is the single biggest divider. Plenty of tools let a manager adjust hours, then export only the adjusted number. That's a timesheet with the audit trail deleted. Before you commit to any tool, edit one entry and export it. If you can't tell from the file that an edit happened, that tool will not survive a dispute.

**Is the raw data exportable, or just reports?** PDF reports look great and are worth very little. You want CSV or an API that gives you rows. If the only way out is a formatted report, you're locked into their idea of what your accountant wants.

**How does it handle timezones?** If someone in Vietnam works 9pm to 1am, that's two local dates and often two pay periods. Check what the export does with that session before you find out during a month-end close. Some tools store UTC and render in the viewer's timezone, which means your export changes depending on who clicked the button. That's a mess.

**Rounding.** Some tools round every session to the nearest 15 minutes. Twenty sessions a week, rounding up, and you've invented two and a half hours that nobody worked. Round at the invoice line if your client contract requires it, never in the stored record.

**Retention.** Check how long sessions and screenshots are kept. Thirty days is common and is shorter than most payroll disputes. If your tool deletes the supporting evidence before the dispute arrives, the audit trail you carefully designed is gone.

## Make automatic the default, manual the exception

The source column matters more than anything else on the list, because the mix tells you how much the record is worth. A month that's 95% automatic with a handful of approved manual entries is a strong record. A month that's 70% manual is a self-reported estimate with extra steps.

So set it up so automatic is the easy path. The app records when the machine is in use; people only type entries for the real exceptions — a client meeting off-laptop, a day with a dead internet connection, work on a phone. I wrote about the tradeoff between the two approaches in more detail in [automatic time tracking vs starting a timer by hand](/blog/automatic-time-tracking-vs-starting-a-timer-by-hand/), and the short version is that manual timers fail quietly: people forget to start them, then reconstruct the week on Friday from memory. Reconstructed hours are honest and still wrong, usually by 20 to 40 minutes a day in either direction.

For manual entries, require two things: a reason in a free-text field, and approval by someone other than the person who entered it. Not because you distrust your team. Because "I approved my own 11-hour Saturday" is the row an auditor will circle.

### The monthly close, in four steps

1. **Export the raw session rows** for the period. All of them, including zero-duration and rejected ones.
2. **Filter for anomalies** before you look at totals: sessions over 12 hours, sessions under 2 minutes, sessions that overlap each other for the same person, manual entries with no approver.
3. **Resolve each anomaly with the person** while they still remember the day. This takes 20 minutes a month and saves the argument later.
4. **Freeze the period.** Lock it so later edits create a new adjustment row in the next period instead of changing a number you already paid against.

Step 4 is the one everyone skips, and it's the one that makes your past exports stay true. If last March's export can still change today, you don't have records, you have a live database.

## Where this is the wrong approach

If you're a two-person shop paying a flat monthly amount with no client billing, all of this is overhead. Keep a shared doc. The complexity only pays off when money depends on the numbers: hourly pay, client invoices, contractors, or a jurisdiction with real working-time rules.

It's also the wrong approach if your work genuinely happens away from a computer. Field work, driving, warehouse shifts — automatic desktop tracking records almost none of it, and you'll end up with a manual-heavy record plus a monitoring tool nobody needed. Use something built for mobile check-ins instead.

And if your team's output is naturally measurable — shipped features, closed tickets, delivered designs — a defensible timesheet may be solving a problem you don't have. Hours are a proxy. Don't build an audit trail for a proxy when you can audit the thing itself.

For the case this post is about — a small remote team where hours turn into payroll and invoices — [bibotracker](/) records work sessions automatically on macOS and Windows, keeps the original value when an entry is edited, and exports per-session rows with the source and approver attached. That's the file I now send my accountant, and she stopped asking where the numbers came from.
