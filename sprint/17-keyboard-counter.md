# 17 — Keyboard counter (counts only)

- **Phase:** 2
- **Type:** Implementation
- **Status:** Blocked
- **Blocked by:** 5, 13
- **Blocks:** 18, 21

## Goal
Count keypresses per time bucket into `keystroke_bucket`. **Never store which key.**

## Scope
- Global keyboard listener via `rdev` (`CGEventTap`); requires Accessibility +
  Input Monitoring (gated by task 13's checks — pause if not granted).
- On each key event: increment an in-memory counter only — discard the key code.
- Flush counts per N-minute bucket; upsert on `ts_bucket` (idempotent).
- Feed the same input signal into idle detection (shared with task 7).
- Handle permission revoked mid-run: pause cleanly, resume when re-granted.

## Acceptance criteria
- [ ] Keypresses increment the bucket count; counts persist correctly.
- [ ] No key codes/characters are ever written to disk or logs (verify in code +
      DB + logs).
- [ ] Bucket upsert is idempotent across flushes.
- [ ] Without permission, counting is paused (no crash); resumes when granted.
