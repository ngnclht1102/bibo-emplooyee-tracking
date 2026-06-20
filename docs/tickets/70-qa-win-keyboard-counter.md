# 70 — QA: Windows keyboard counter

- **Phase:** 6
- **Type:** QA (interactive)
- **Status:** Blocked
- **Blocked by:** 69
- **Blocks:** 79

## Goal
Confirm Windows keypress counting is accurate, global, and private.

## Interactive checklist (run on the `winbuild` PC via Parsec)
- [ ] Type a known number of keys (~50) in our app — the bucket count rises by ~that much.
- [ ] Type in **another** app (Notepad, browser) — counts still increase (global hook).
- [ ] Inspect the local DB + logs — **only counts**, never characters/key codes.
- [ ] Pause tracking (tray/Settings) — typing does **not** increase counts; resume — it does.
- [ ] Counts land in the correct per-minute bucket (timestamps line up).
- [ ] Type into an **elevated/admin** window (e.g. an admin PowerShell) — app does not
      crash; document whether counts are observed (expected gap per §8 risk).
- [ ] Leave running 5+ min under normal use — no leaked threads / runaway CPU.

## Pass condition
All boxes checked. **Privacy check (no keys stored) is mandatory.** Any failure → reopen
task 69.
