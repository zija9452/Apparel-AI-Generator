---
id: 061
title: Why No Missing Font Warning
stage: explainer
date: 2026-07-16
surface: agent
model: claude-fable-5
feature: production_automation
branch: main
user: zija9452
command: none
labels: ["fonts", "illustrator", "debugging", "preflight"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Backend/scripts/automate_production.jsx (inspected)
 - Backend/services/illustrator_automation.py (inspected)
 - Backend/uploads/2ec448ee-eb1e-41c4-9621-45270617e855 (job artifacts inspected)
tests:
 - COM probe: getByName("NationalChampion-Medium") with 0 docs open -> MISSING
 - COM probe: same check with mockup.ai open -> FOUND; after close -> MISSING
---

## Prompt

font missing he still koi warning nhi ayi he , q ?

D:\Zija_Yaseen\Web development\AI-Apparel-Order-Generator\Backend\uploads\2ec448ee-eb1e-41c4-9621-45270617e855 ye he recent

## Response snapshot

Root cause found and empirically proven: the JSX font pre-flight (including the
XMP-name check) runs AFTER `app.open(mockupPath)`. When Illustrator opens a
document that uses a missing font, it registers a substituted font entry in
`app.textFonts` under the ORIGINAL name for as long as the document is open, so
`app.textFonts.getByName("NationalChampion-Medium")` succeeds even though the
font is not installed on Windows. Verified via COM: with 0 documents open the
font reports MISSING; with the job's mockup.ai open it reports FOUND; after
closing the doc it reports MISSING again. The job 2ec448ee therefore logged
"Font check passed" and silently substituted the font. Proposed fix: run the
xmpFontNames getByName check BEFORE opening the mockup document (the
per-character scan is inherently blind to missing fonts and can stay or go).

## Outcome

- ✅ Impact: Diagnosed why the missing-font pause never triggers; fix location identified (move XMP check above app.open in automate_production.jsx).
- 🧪 Tests: Two COM probes against running Illustrator confirming open-document font-substitution masking.
- 📁 Files: None modified (diagnosis only).
- 🔁 Next prompts: Implement pre-open XMP font check; decide whether to drop the useless per-character scan.
- 🧠 Reflection: Preflight checks that query app state must run before the state is polluted by the thing being checked.

## Evaluation notes (flywheel)

- Failure modes observed: getByName false-positive while doc with substituted fonts is open.
- Graders run and results (PASS/FAIL): PASS (hypothesis confirmed empirically both directions).
- Prompt variant (if applicable): null
- Next experiment (smallest change to try): Move xmpFontNames check before app.open and rerun the same job.
