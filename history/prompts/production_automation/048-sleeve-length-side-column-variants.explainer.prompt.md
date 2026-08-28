---
id: 048
title: Sleeve Length Side Column Variants
stage: explainer
date: 2026-07-15
surface: agent
model: claude-fable-5
feature: production_automation
branch: main
user: zija9452
command: none
labels: ["sleeves", "short-long", "left-right", "column-variants", "parser-verification"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Backend/services/excel_service.py (verified, no change needed)
 - Backend/scripts/automate_production.jsx (referenced - length+side group targets already exist)
 - scratchpad/test_sleeve_variants.py (created - 12-case verification)
tests:
 - 12/12 sleeve column-name variants matched correctly (Right Short Sleeve Number -> sleeve-right, Long Sleeve Number -> sleeve-both, etc.)
---

## Prompt

mene right short sleeve and Left short sleeve , or isi trha long i bhi klogic ouchi thi./

## Response snapshot

Confirmed how short/long (length) combines with left/right (side) across the system:

- LENGTH (short/long) and SIDE (left/right) are two separate axes. Length comes from the
  Excel "Sleeve" column (Half/Full) -> part sleeve-short/sleeve-long; side comes from the
  mockup groups (auto-expansion) or explicit Left/Right columns.
- Excel columns never need the length word: "Left Sleeve Number" is enough. But if a
  customer writes "Right Short Sleeve Number" or "Long Sleeve Left Number" anyway, the
  Phase-1 matcher ignores the length word and still resolves the correct side - verified
  12/12 variants including "Short/Long/Full/Half Sleeve Number" -> sleeve-both.
- The JSX already targets length+side mockup group names: pairs list (jsx:143-147) has
  "Short Sleeve Right/Left" and "Long Sleeve Right/Left", and getSourceView (jsx:1395-1397)
  matches "Short Sleeve Right", "Long Sleeve Left" etc. So a mockup with per-length,
  per-side sleeve groups is already handled for design; per-side TEXT lands in Phase 4.

No code change was needed - the existing parser handled every variant.

## Outcome

- ✅ Impact: Confirmed length x side is fully covered: length via Sleeve column + mockup group names, side via mockup expansion or explicit columns; parser tolerates length words in column names.
- 🧪 Tests: 12/12 variant checks passed
- 📁 Files: test script only; no production change
- 🔁 Next prompts: Phase 2 mockup scan
- 🧠 Reflection: Treating length and side as independent axes (rather than enumerating combinations) is why no new code was needed.

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results (PASS/FAIL): variant suite PASS (12/12)
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): none for this question
