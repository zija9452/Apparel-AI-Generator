---
id: 020
title: Remove test-print size tags
stage: green
date: 2026-07-08
surface: agent
model: claude-fable-5
feature: production_automation
branch: main
user: zija9452
command: none
labels: ["illustrator", "jsx", "size-tags", "test-print"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Backend/scripts/automate_production.jsx
tests:
 - node --check syntax validation on automate_production.jsx (PASSED)
---

## Prompt

explore my whole project and the issue is k , test print se order bna rhe hen to test print he wo small size ka , to size tags bhi small k lge hue hen , to test print me emen un size tage ko remove ka name de dia he group ya layer jo h he wo , to wo remove ho jaye na , ta k pattern file me jo size tags lge hen , wo appear ho jayen

## Response snapshot

The mockup (test print) design duplicated into the order doc carried the test print's small size tags; the script had no logic to strip them. Added a `removeNamedItems(container, targetName)` helper to `automate_production.jsx` that recursively deletes every item whose name is "remove" (or starts with "remove", case-insensitive, trimmed) inside the pasted design. It is invoked right after `clearAllStrokes(pastedDesign)` and BEFORE `alignAndScale`, so the design scales on clean bounds and the pattern file's own size tags (already brought to front by `bringPatternLabelsToFront`) are what appears in the final order. Removal count is logged to debug_log.txt.

## Outcome

- ✅ Impact: Test-print size tags named "remove" are deleted from the pasted design; pattern-file size tags now show in production output.
- 🧪 Tests: node --check syntax validation passed.
- 📁 Files: Backend/scripts/automate_production.jsx (call site + helper function).
- 🔁 Next prompts: Verify with a real job whose mockup contains a "remove"-named group.
- 🧠 Reflection: Matching is name-prefix based ("remove", "Remove_tags"); designers must name the tag group/layer accordingly in the mockup.

## Evaluation notes (flywheel)

- Failure modes observed: none in syntax check; runtime verification pending a real Illustrator job.
- Graders run and results (PASS/FAIL): node --check PASS
- Prompt variant (if applicable): null
- Next experiment (smallest change to try): none
