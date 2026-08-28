---
id: 034
title: Tighter number width allowance
stage: green
date: 2026-07-14
surface: agent
model: claude-fable-5
feature: production_automation
branch: main
user: zija9452
command: none
labels: ["personalization", "number-sizing", "fit-width-allowance", "back-number"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Backend/scripts/automate_production.jsx
tests:
 - node --check syntax validation (PASS)
 - runtime verification pending: regenerate order, compare back "29" size vs previous render
---

## Prompt

OR TM NE YE ORDER READ KIA , TO YE 29 NUMBERKCH ZYADA BARA NHI LG RHA HE 2 DIGITS KA BACK PR ?? IS KO KIS TRHA AHNDLE KREN OR YE KIS TRHA HANDLE HO RHA HE ??/ QK HMY NHI PTA BD ME KIA FONT OR KIA NUMBER HON GE TO BD ME BHI FIX HI RHE ?

TO ME ISE RESOLVE KESE KRUN K VISUALLY TO SAHI LGE YE , IN SHORT

nhi, ye logic abhi thk he , lekin me bs 29 ko mazeed kese chota krun 1.5 ki jga 1.1 ka width k pass na ho or shrink kr jaye ?

## Response snapshot

Explained current handling: replaced text keeps the mockup placeholder's font size (savedSize), then shrinks only if wider than FIT_WIDTH_ALLOWANCE (1.5x) of the placeholder width - so "29" passed untouched (placeholder "13" has a narrow 1), "666" shrank to 76%. Proposed fixed-height standard as the long-term fix; user chose to keep the current logic and only tighten the width allowance to 1.1 for numbers.

Implemented: FIT_WIDTH_ALLOWANCE is now value-aware in replaceInContainer - pure-digit replacements (/^\s*\d+\s*$/) get 1.1x, names keep 1.5x so long names don't over-shrink. With placeholder "13": "29" now exceeds 1.1x and shrinks uniformly to fit, "666" shrinks harder than before, single digits stay full size.

## Outcome

- ✅ Impact: 2-digit back numbers like "29" now shrink to 1.1x the placeholder width instead of printing at full mockup size; names unaffected.
- 🧪 Tests: node --check PASS; visual check pending on a regenerated order.
- 📁 Files: Backend/scripts/automate_production.jsx (1 edit in replaceInContainer).
- 🔁 Next prompts: regenerate the job and compare Medium_Back_Item2 (Prima 29) against the old render; revisit fixed-height standard if sizes still feel inconsistent across fonts.
- 🧠 Reflection: user prefers minimal parameter tweaks over reworking the sizing model; keep the fixed-height proposal on record for when a future font/order breaks visual consistency again.

## Evaluation notes (flywheel)

- Failure modes observed: none yet; watch a narrow placeholder (e.g. "1") - even 1.1x of it may over-shrink 2-digit numbers.
- Graders run and results (PASS/FAIL): node --check PASS
- Prompt variant (if applicable): N/A
- Next experiment (smallest change to try): if numbers still vary too much, switch numbers to fixed-height scaling (measure bounds, scale to placeholder height, cap width).
