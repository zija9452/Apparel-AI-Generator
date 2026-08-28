---
id: 035
title: Fix tag background fill and digit scaling
stage: green
date: 2026-07-14
surface: agent
model: claude-fable-5
feature: production_automation
branch: main
user: zija9452
command: none
labels: ["size-tag", "clipping-mask", "background-fill", "number-sizing", "digit-count"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Backend/scripts/automate_production.jsx
tests:
 - node --check syntax validation (PASS)
 - runtime verification pending: regenerate order, confirm white label box visible + 666 back at ~76% + 29 at 85%
---

## Prompt

lekin names to bht choty hen , phr bhi shrink ho rhe hen q ?? LAST CALL name he moclup me front pr , or order me BRI to bri shrink hua he ??

or ye cap kia ?? numbers mtlb kitne choty or baray kia logic he ye

to ye to 1.5 se 1.1 kr k hm ne ghlt kia . qk 666 sahi a rha tha , to sahi approach kia he ??

hn na , aese to 666 bht chota ho gya he , to kia krna chaiye he mjhe ?? wo thk shrink ho rha tha , us ko utna hi kr do , or size tag label nhi a rhe hen complete mising hen q ?? check kro

## Response snapshot

1. Bri never shrank - debug log has no "wider than" line for it; replacements keep the mockup placeholder's font size, so 3-letter "Bri" has the same letter height as "LAST CALL" but fills less width. That is standard jersey behavior (same letter height for all names).

2. SIZE-TAG "missing" diagnosed from job c462e225 log + render: the label was there (M text, 92% resize, QR code all present) but invisible - the TAG-MASK path doubles as the label's WHITE BACKGROUND box (SpotColor fill), and setting clipped=true strips the mask's paint. Fixed in processSizeTagLabel: save maskPath fill/stroke before clipped=true, re-apply after (a clip path's fill renders behind the clipped content) - same pattern releaseInternalClippingMasks already uses.

3. Number sizing: reverted the 1.1 allowance experiment (it over-shrank 666 to ~55%; user confirmed 666 was right at 1.5x => 76%). One width allowance cannot both shrink "29" and keep "666" - so 2-digit numbers now get a flat 85% pre-shrink (tf.resize before the width-fit block), 1-digit stays 100%, 3+ digits are governed by the restored 1.5x width cap. Names unchanged.

## Outcome

- ✅ Impact: label background box restored; 666 back to its approved size; 29 now prints at 85%; deterministic per digit count for any font.
- 🧪 Tests: node --check PASS; visual verification pending on next regenerated order.
- 📁 Files: Backend/scripts/automate_production.jsx (2 edits).
- 🔁 Next prompts: regenerate order; tune the 85% constant if 2-digit numbers still feel off; optional scale-up-with-height-cap for short names like BRI (declined for now, standard behavior kept).
- 🧠 Reflection: masks that double as visible background shapes must have paint re-applied after clipped=true - Illustrator silently strips it every time.

## Evaluation notes (flywheel)

- Failure modes observed: clipped=true stripping mask paint made the label look "completely missing" on dark jerseys.
- Graders run and results (PASS/FAIL): node --check PASS
- Prompt variant (if applicable): N/A
- Next experiment (smallest change to try): adjust 2-digit pre-shrink (85 -> 80/90) after seeing the next render.
