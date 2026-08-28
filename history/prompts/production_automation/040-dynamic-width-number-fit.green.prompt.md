---
id: 040
title: Dynamic width-based number fit
stage: green
date: 2026-07-14
surface: agent
model: claude-fable-5
branch: main
feature: production_automation
user: zija9452
command: none
labels: ["number-sizing", "dynamic-fit", "width-matching", "font-aware"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Backend/scripts/automate_production.jsx
tests:
 - node --check syntax validation (PASS)
 - runtime verification pending: regenerate order, confirm 13 unchanged / 29 shrunk to 13's width / 666 at ~75%
---

## Prompt

or agr mockup me 1 digit hi dia jaye to ??? or agr 2 digit hi diye jayen to ??

acha 2 digit to 13 bhi he or 29 bhi , to ye dono hi choty ho rhe hen na ?? lekin emne to ye kaha tha k 13 se bara lg rha he 29 , bcz of font , to is trha hota k 13 wesa hi rehta lekin ye jo 29 he wo thora chota hota , dynam,ically , visiually thk lgta phr , tmhari logic hi ghlthe

## Response snapshot

User correctly identified the flaw in the flat digit-count pre-shrink (PHR 035/039): it shrank ALL 2-digit numbers including "13", whereas the real problem is font-driven WIDTH ("29" has two fat digits, "13" has a narrow 1). Replaced the flat 90% pre-scale with a dynamic width-based allowance in replaceInContainer:

FIT_WIDTH_ALLOWANCE for pure-digit replacements = max(1.02, newDigits / placeholderDigits); names stay at flat 1.5x. Placeholder digit count is read from the original frame contents (tfCont) with fallback 2. Outcomes over a "13" placeholder: "13" -> same width, untouched; "29" -> shrinks exactly until it matches 13's width (~76-82%, font-dependent = dynamic); "666" -> 3/2 = 1.5x, the previously approved look; "5" -> narrower, full size. Also fixes the 1-digit-placeholder case: "29" over "9" gets 2x the single digit's width instead of being crushed by the old flat 1.5x cap.

## Outcome

- ✅ Impact: number sizing is now font-aware and placeholder-proportional - same-count numbers always visually match the placeholder, more digits get proportional room.
- 🧪 Tests: node --check PASS; visual verification on next order.
- 📁 Files: Backend/scripts/automate_production.jsx (1 edit replacing the 90% block).
- 🔁 Next prompts: regenerate; check debug log "Number fit: ..." lines and compare 13/29/666 renders.
- 🧠 Reflection: the user's mental model (match the placeholder's visual width per digit) beat two rounds of constant-tuning; encode intent, not magic numbers.

## Evaluation notes (flywheel)

- Failure modes observed: flat digit-count rule shrank already-correct numbers ("13").
- Graders run and results (PASS/FAIL): node --check PASS.
- Prompt variant (if applicable): N/A
- Next experiment (smallest change to try): if kerning makes same-count numbers shrink a hair too much, raise the 1.02 tolerance slightly.
