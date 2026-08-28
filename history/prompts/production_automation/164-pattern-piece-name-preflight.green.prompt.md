---
id: 164
title: Pattern piece name preflight
stage: green
date: 2026-08-27
surface: agent
model: claude-opus-5
feature: production_automation
branch: main
user: zija9452
command: chat
labels: ["preflight", "pattern-file", "validation", "illustrator", "status-json"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Backend/services/illustrator_automation.py
 - Backend/main.py
 - Frontend/my-app/components/types.ts
 - Frontend/my-app/components/ProductionPlan.tsx
 - Frontend/my-app/app/docs/page.tsx
tests:
 - python -m py_compile main.py services/illustrator_automation.py (PASS)
 - npx tsc --noEmit (PASS, no errors)
 - _expected_pattern_pieces name resolution against a real production_plan.json + a synthetic full-button/accessory/youth/A-prefix plan (PASS - names match resolvePartLabel/patternTargetName)
 - _find_missing_pattern_pieces with a fake COM app: partial-present set flags only the absent pieces; 'undefined' result and a raising DoJavaScript both return [] (PASS - a failed scan never blocks a job)
 - node --check on the generated ExtendScript probe + ES3 reserved-word/chained-ternary scan (PASS)
---

## Prompt

explore my whole prject , and json me wo pattern ho or pattern file me na mile wo pattern name , to pre flight pr hi bta do , k ye pattern name nhi he pattern ki file me , jese code he consistency rkhna ,

## Response snapshot

Explored the project and found the gap: the plan JSON carries `part_name` + `size` per item; the JSX turns that into a panel name via `resolvePartLabel` (automate_production.jsx:3633) and `patternTargetName` (:3395), then `findAnywhere(patternDoc, targetGroupName)` at :824. On a miss it only logs `CRITICAL: Could not find '<name>' in Master Pattern document. Skipping.` and carries on - a full render is burnt and the order file is quietly short that piece.

Added a 9th pre-flight, built to the same shape as the existing eight in `illustrator_automation.py:938-1096`:

- `_PART_LABEL_MAP` / `_FRIENDLY_SIZE_MAP` / `_friendly_size` / `_is_accessory` / `_norm_name` mirror the JSX's own resolution rules key-for-key (exact-key lookup, no case folding, "A" prefix stripping, accessories and the Universal group carrying no size prefix).
- `_expected_pattern_pieces(plan_data)` returns `(alternatives, description)` pairs. `alternatives` is a list of name-groups, satisfied when ALL names in ANY one group exist - which covers the two places the JSX itself picks between names: `part_name: "sleeve"` (Short -> Long -> plain "Sleeve") and a full-button `front` (single `"<Size> Front"` OR the `Front Left` + `Front Right` pair, since the split only happens when the mockup carries both designs).
- `_find_missing_pattern_pieces` opens the pattern over COM with zero documents open and runs a probe that replicates `_buildNameIndex` exactly - same normalization AND the same `depth > 3` cut-off - so a name it finds is a name the render can also reach. The probe returns an `'OK|'` marker; anything else, or a COM exception, is treated as a failed scan and returns `[]`, so an unreadable pattern can never block a job.
- The check runs unconditionally (every job has these names) at progress 29, last of the pre-flights, and pauses with `pattern_piece_missing` + `missing_pattern_pieces` in status.json.
- `main.py` resume passes `ignore_pattern_piece_warning` on "continue"; `types.ts` and `ProductionPlan.tsx` add the flag, the paused state and a warn Alert listing each missing name with the size/part it came from; the docs page's Preflight stage, Continue row and "A size printed nothing" trouble entry were updated to match.

## Outcome

- ✅ Impact: a mistyped or absent pattern panel is now reported before Illustrator renders anything, naming every missing panel and the order row that needs it, instead of surfacing as a silently incomplete order file after a ~28 minute run.
- 🧪 Tests: py_compile + tsc clean; name resolution verified against a real plan and a synthetic full-button/accessory/youth plan; all three failure modes of the probe verified to return no findings; generated ExtendScript syntax-checked.
- 📁 Files: 5 changed - 1 new pre-flight + helpers, 1 resume wiring, 3 frontend/docs.
- 🔁 Next prompts: run a real job whose pattern is missing one panel and confirm the pause text reads well in the UI.
- 🧠 Reflection: the alternatives model was the piece that mattered - a strict single-name check would have raised false alarms on exactly the patterns the JSX handles fine, and a false alarm here blocks every job, not one feature.

## Evaluation notes (flywheel)

- Failure modes observed: a probe returning `undefined` on error would have read as "nothing found" and paused every job - fixed with the `'OK|'` marker before it could ship.
- Graders run and results (PASS/FAIL): PASS - py_compile, tsc --noEmit, node --check, ES3 reserved-word scan, fake-COM behaviour tests.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): report the reverse direction too (panels present in the pattern that no order row asks for) as an end-of-job note rather than a pause.
