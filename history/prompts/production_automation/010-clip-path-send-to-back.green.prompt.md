---
id: 010
title: Send restored clip path to back of badge group
stage: green
date: 2026-06-23
surface: agent
model: claude-opus-4-8[1m]
feature: production_automation
branch: main
user: zija9452
command: fix swatch color relink (round 5 - z-order)
labels: ["illustrator", "extendscript", "clipping-mask", "z-order", "badge"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Backend/scripts/automate_production.jsx
tests:
 - node --check (parse-only on copied .js) -> PASS
---

## Prompt

ok, isse bedge color to a gya he, lekin green color or jo letter the kia wo us k peeche hide ho
gye hen??

## Response snapshot

Round-4 fix (restore clip-path fill on release) worked — badge color now renders. But the restored
clip path sits at the TOP of its group (clip masks always do), so as a now-opaque filled shape it
covers the previously-clipped content (green circle + letters). Hence green/letters hidden behind it.

Fix: after restoring the clip path's fill, send it to the BACK of its group via
`zOrder(ZOrderMethod.SENDTOBACK)` (guarded to only when it actually had a visible fill). The skin
scallop is the badge background, so behind its siblings is correct; green + letters now render in
front. zOrder is scoped to the immediate parent group, so no effect outside the badge — no
regression to unrelated art.

## Outcome

- ✅ Impact: restored clip-path background goes behind its content; badge stacks correctly
  (skin back < green < letters front).
- 🧪 Tests: node --check parse PASS; runtime verification pending next Illustrator run.
- 📁 Files: Backend/scripts/automate_production.jsx (releaseInternalClippingMasks z-order).
- 🔁 Next: re-run; badge should show full skin + green + letters. Log: "restored fill + sent clip
  path ... to back".
- 🧠 Reflection: restoring a mask's paint without fixing its z-order just moves the bug from
  "invisible" to "covers everything"; clip paths are top-most by definition.

## Evaluation notes (flywheel)

- Failure modes observed: restored clip path (top-most) occluded its clipped content.
- Graders run and results (PASS/FAIL): node --check PASS.
- Next experiment: if nested badges still mis-stack, capture each clip path's original index and
  reinsert at that depth instead of a blanket send-to-back.
