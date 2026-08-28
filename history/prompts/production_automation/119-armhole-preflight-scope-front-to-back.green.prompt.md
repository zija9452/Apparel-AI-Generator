---
id: 119
title: Armhole preflight scope front to back
stage: green
date: 2026-08-18
surface: agent
model: claude-opus-5
feature: production_automation
branch: main
user: zija9452
command: chat
labels: ["sleeve-match", "preflight", "bugfix", "false-warning", "ui-copy"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - Backend/services/illustrator_automation.py
  - Frontend/my-app/components/ProductionPlan.tsx
  - Frontend/my-app/components/UploadForm.tsx
tests:
  - "python -m py_compile Backend/services/illustrator_automation.py - PASS"
  - "npx tsc --noEmit (Frontend/my-app) - PASS (exit 0)"
---

## Prompt

ok , kro

(context: apply the 3-spot fix diagnosed in PHR 118 - the armhole-match pre-flight
scans the mockup's Front view while the JSX runtime measures the Back panel, so a
correctly named mockup was blocked with a false "no armhole match layer" warning)

## Response snapshot

Applied, 4 spots (3 planned + 1 same-family copy bug found while editing):

1. `illustrator_automation.py::_mockup_has_armhole_match_objects` - probe now hunts
   the BACK view: `var backNames = {back:1, backview:1};` (was
   `{front:1, frontview:1}`), `frontGroup/huntFront` renamed to `backGroup/huntBack`,
   `huntArmhole(backGroup)`. Docstring rewritten to state the real runtime rule
   (`smMeasureBodyD` -> `if (!isBack(partName)) return;`, plus the full-button
   reason: back stays one panel, front splits into halves).
2. `illustrator_automation.py:954` - logger text "Front view" -> "Back view".
3. `illustrator_automation.py:957` - status.json message "Front view" -> "Back view".
4. `ProductionPlan.tsx:267,273` - warning copy "mockup's Front view" -> "Back view",
   "group the Front panel's right-side design" -> "Back panel's".
5. `UploadForm.tsx:138-139` - checkbox helper text was doubly wrong ("Only the Front
   panel's right side needs this group - it's mirrored to ... both sleeves
   automatically"). Sleeves are NOT automatic: `smApplySleeveMatch` reads each
   sleeve's OWN "armhole match" group (jsx:4488-4489 warns "no 'armhole match'
   group found on this sleeve's design"). Copy now says: Back view AND each sleeve
   view need the group, units pair by name (unit 1 <-> unit 1), only the Back
   panel's right side is measured and mirrored to the left.

Verification: `py_compile` PASS; frontend `tsc --noEmit` exit 0. Not yet exercised
against a live Illustrator job - next real upload with the group on Back only should
pass the pre-flight instead of pausing.

## Outcome

- ✅ Impact: false-positive block removed; guidance text now matches the runtime (Back + sleeves)
- 🧪 Tests: py_compile PASS, tsc --noEmit PASS; live Illustrator run pending
- 📁 Files: illustrator_automation.py, ProductionPlan.tsx, UploadForm.tsx
- 🔁 Next prompts: upload a job with "armhole match" on Back + sleeves and confirm no pause; consider extending the probe to also verify each Sleeve view carries the group
- 🧠 Reflection: the pre-flight probes mirror JSX rules in a second language - any runtime scope change needs a sweep of probe + status message + UI copy together

## Evaluation notes (flywheel)

- Failure modes observed: validator/runtime drift after the front->back measurement change; UI helper text additionally claimed sleeves were automatic when they need their own group
- Graders run and results (PASS/FAIL): py_compile PASS, tsc PASS
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): add a Sleeve-view arm of the same probe so a missing sleeve group warns up front instead of only in debug_log
