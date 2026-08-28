---
id: 118
title: Armhole preflight front vs back mismatch
stage: explainer
date: 2026-08-18
surface: agent
model: claude-opus-5
feature: production_automation
branch: main
user: zija9452
command: chat
labels: ["sleeve-match", "preflight", "bug", "false-warning", "armhole"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - Backend/services/illustrator_automation.py (read only - lines 489-559, 947-962)
  - Backend/scripts/automate_production.jsx (read only - lines 3930-3946, 6714)
  - Frontend/my-app/components/ProductionPlan.tsx (read only - lines 263-278)
tests:
  - none (diagnosis only)
---

## Prompt

Recommended: open the mockup in Illustrator, group the Front panel's right-side design as "armhole match" with each piece inside named "unit 1", "unit 2", etc. (or "unit left 1"/"unit right 1" if the two sides differ), then upload a new job. This job's mockup file can't be swapped from here. Continuing below will render every sleeve unmatched, using whatever position it already has. , is me front ko q , back ko dekhna tha , back me he nam , to warning q ?

## Response snapshot

Diagnosis: STALE PRE-FLIGHT SCOPE - the warning is a FALSE POSITIVE.

- The runtime (`automate_production.jsx`) measures the BACK panel only:
  `smMeasureBodyD` starts with `if (!isBack(partName)) return;` (line 3946),
  and the comment at 3930-3942 says "BACK, not front, on explicit instruction"
  (full-button jersey splits the front into halves; the back stays one panel).
- The pre-flight (`illustrator_automation.py::_mockup_has_armhole_match_objects`,
  lines 489-559) still hunts the FRONT view only:
  `var frontNames = {front:1, frontview:1};` - it was written before the
  front->back switch and never updated. Its own docstring still claims
  "smMeasureBodyD only ever measures Front's right armhole".
- So a correctly-named mockup (group on Back + each Sleeve) fails the Front-only
  scan -> `armhole_match_layer_missing` -> UI text at ProductionPlan.tsx:267/273
  tells the user to put it on the Front, which the JSX would then IGNORE.

Practical effect for the current job: pressing Continue sets
`ignore_armhole_match_warning` (main.py:729), the run proceeds, and because the
Back DOES carry the group, sleeve matching actually WORKS - the "every sleeve
will render unmatched" sentence is wrong in this case.

Fix scope (3 spots, small diff):
1. illustrator_automation.py:513 - hunt `{back:1, backview:1}` instead of front
   (+ rewrite the docstring at 489-506).
2. illustrator_automation.py:954,957 - message text "Front view" -> "Back view".
3. ProductionPlan.tsx:267,273 - UI copy "Front view"/"Front panel" -> "Back".
Optional extra: also verify each Sleeve view carries its own "armhole match"
group (smApplySleeveMatch needs it; today a missing one only logs a skip).

## Outcome

- ✅ Impact: false-positive pre-flight identified with exact line numbers; user unblocked (Continue is safe for this job)
- 🧪 Tests: none run (diagnosis only, no code changed yet)
- 📁 Files: none modified
- 🔁 Next prompts: apply the 3-spot fix and re-run a job with the group on Back only
- 🧠 Reflection: when a runtime rule changes panel scope, every mirror of that rule (python pre-flight probe, status message, UI copy, naming docs) must be swept - this one drifted silently

## Evaluation notes (flywheel)

- Failure modes observed: pre-flight validator drifted out of sync with JSX runtime after the front->back measurement change (PHR 088 era code vs later instruction)
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): flip the probe's view-name map to back and re-upload the same mockup - warning should disappear
