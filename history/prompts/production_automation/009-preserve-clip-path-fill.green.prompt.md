---
id: 009
title: Preserve fill when releasing internal clip masks
stage: green
date: 2026-06-23
surface: agent
model: claude-opus-4-8[1m]
feature: production_automation
branch: main
user: zija9452
command: fix swatch color relink (round 4 - clip cause)
labels: ["illustrator", "extendscript", "clipping-mask", "cmyk", "badge", "fill"]
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

lekin ye issue to nhi hona chahiye he, jb front ko hm duplicate krte hen to front me jo bhi clip
ho a ajna chahiye he, bs bd me hm color change krwayen, rgb to cmyk me

## Response snapshot

User's architectural point is correct: duplicating Front should bring clips intact; we should only
recolor RGB->CMYK, not mutate structure. Inspected the mockup.ai directly (PDF/AI):
- skin-color, lgreen-color etc. are normal RGB `Separation` (spot) colors (skin≈222,198,172;
  lgreen≈44,147,78). So `spot.color` resolves cleanly and processSubColor WILL convert them. The
  mockup is NOT the problem; color logic is fine.
- Found the structural disruptor: `releaseInternalClippingMasks` sets `clipped=false` on every nested
  clip group. Illustrator STRIPS fill/stroke from a clip path when its clip is released (standard
  behaviour). The QAWH badge's visible shapes (skin scallop / green circle) act as clip paths, so
  after release they become unpainted -> vanish ("shape but no fill"), while the letters (separate)
  survive. This is exactly the reported symptom and matches the user's "we shouldn't break structure".

Fix (matches user's principle): in `releaseInternalClippingMasks`, capture the clip path's
fill/stroke/strokeWidth BEFORE `clipped=false`, then RESTORE them after. Recolor (mergeAndCleanup)
already ran earlier, so the restored fill is the already-converted CMYK. Visual stays identical;
clip is still flattened for alignment; genuinely-unpainted masks stay unpainted (no regression).

## Outcome

- ✅ Impact: badge skin/green (and any visible shape used as a clip path) keep their CMYK fill after
  clip release; clips still flattened for alignment as before.
- 🧪 Tests: node --check parse PASS; runtime verification pending next Illustrator run.
- 📁 Files: Backend/scripts/automate_production.jsx (releaseInternalClippingMasks paint-preserve).
- 🔁 Next: re-run; badge green+skin should now render filled. New log line to watch:
  `CLIP RELEASE: restored fill on released clip path ...`.
- 🧠 Reflection: the bug wasn't color resolution at all — a structural flatten step was discarding
  paint on clip paths. User's "only recolor, keep structure" framing pointed straight at it.

## Evaluation notes (flywheel)

- Failure modes observed: clip-path fill stripped on release -> visible badge shapes vanish.
- Graders run and results (PASS/FAIL): node --check PASS.
- Next experiment: if still empty, confirm via round-3 `[CLIPPING-MASK]` flag whether skin/green are
  the clip path or clipped content; if content, investigate z-order vs the duplicated base panel.
