# 166 — What's new / feedback order (CTR-38): the feedback form comes first

**Date:** 2026-11-08 · **Status: Released in 1.7.3 (2026-11-09)** ·
builds on [160](160-desktop-whatsnew-feedback.md), [165](165-feedback-replies.md)

## What changed and why

On the desktop **What's new** page the release-note history came first and the feedback form
sat underneath it. With every shipped version listed, the form kept sliding further down the
page — by 1.7.2 you had to scroll past the whole history to write to us, and the replies card
from [165](165-feedback-replies.md) was the only feedback thing visible without scrolling.

The page now opens with what the user can *do*:

1. **Send feedback** form
2. **Your feedback** (own messages + super-admin replies, signed-in only)
3. Release notes, newest version first

Only the order changed — no copy, no translations, no behaviour. The extra top margin on the
feedback card was dropped since it is no longer separating itself from the release list.

## Verified

`tsc --noEmit` and `vite build` clean in `apps/desktop`.
