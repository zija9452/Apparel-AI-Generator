---
id: 183
title: Hoodie Jersey garment without pocket
stage: green
date: 2026-09-10
surface: agent
model: claude-opus-5
feature: production_automation
branch: main
user: zija9452
command: (direct request)
labels: ["hoodie", "hoodie-jersey", "garment-type", "frontend", "jsx", "pre-flight"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Backend/scripts/automate_production.jsx
 - Backend/main.py
 - Backend/services/illustrator_automation.py
 - Frontend/my-app/components/UploadForm.tsx
 - Frontend/my-app/components/ProductionPlan.tsx
 - Frontend/my-app/components/types.ts
 - Frontend/my-app/app/docs/page.tsx
 - Frontend/my-app/app/home/page.tsx
tests:
 - node --check on automate_production.jsx (copied to .js) - PASS
 - python -m py_compile Backend/main.py Backend/services/illustrator_automation.py - PASS
 - npx tsc --noEmit (Frontend/my-app) - PASS, no output
 - npx eslint on the five changed frontend files - PASS, no output
 - scratchpad/check_hoodie_jersey.py - exercises _enforce_hoodie_neck / _enforce_neck / _enforce_sleeve_length / _enforce_hoodie_rib_cuff for all four garment combinations - PASS
---

## Prompt

explore my whole project , especially hoodie section , coz is k jesa same ek or section bnana he , Hooedie Jersey k anm se , jis me front back SS/Ls, border, Hoo(Left/Right) sb ho , lekin pocket wali logic na ho bs ,is me pocket nhi bne gi , ye section add kr do frontend me bhi check

## Response snapshot

Explored the full Hoodie flow across 5 files, then added a second garment type
**Hoodie Jersey** = Hoodie minus the Pocket.

Key decision: **reuse the hoodie builders, do not duplicate them.** The hoodie
branch in `automate_production.jsx` is ~1400 lines and only ONE piece differs,
so a second copy would drift the moment either side is fixed. Two flags instead:

- `HOODIE_ON = (plan.hoodie === true || plan.hoodie_jersey === true)` - turns the
  whole hood flow on for either garment.
- `HOODIE_POCKET_ON = (plan.hoodie === true)` - gates the only two Pocket-specific
  things: the Pocket build inside `buildHoodieExtras`, and
  `hoodieResolveLocalTagVsPocket` in the main loop (a Hoodie Jersey has no Pocket
  for the Local Tag to collide with, so the tag stays at its natural 1.5in).
- `HOODIE_PIECE_LIST` declared beside them (above the main loop, so ExtendScript's
  var-hoisting cannot make the progress line read `undefined`).

Confirmed edge cases with the user before writing code:
1. Mutually exclusive on the frontend (checking one clears the other), plus a
   defensive normalise in `_build_plan` if both ever arrive.
2. Neck dropped (hood covers it) - `any_hood = hoodie or hoodie_jersey`.
3. Rib & Cuff NOT auto-added - `_enforce_hoodie_rib_cuff` deliberately still
   reads `hoodie` alone.
4. Sleeve defaults to long, same as Hoodie; instructions / Excel `Sleeve` column
   still override.
5. Nested "Hood center design match" offered for both; both nested checkboxes
   collapse into the single existing `plan.hoodie_center_design_match` key, so
   the JSX and the mockup pre-flight scan needed no change at all.

Pre-flight: `_pattern_has_hoodie_objects` gained `require_pocket`, so a Hoodie
Jersey job is no longer paused over a `Pocket` group the order never builds. The
pause status now carries `hoodie_pocket_required` so the frontend card names the
right garment and the right groups; tested `!== false` so pre-existing statuses
still read as Hoodie.

## Outcome

- ✅ Impact: New garment type end to end - form toggle + nested option, plan
  rules, Illustrator pre-flight, JSX build, pause card, docs and home page.
  Zero behaviour change for existing Hoodie / full-button / normal jobs (both new
  flags default false, and every shared enforcer is passed the same value it got
  before when `hoodie_jersey` is off).
- 🧪 Tests: 5 checks, all passing - see `tests:` above. The plan-rule script is
  the meaningful one: it proves neck-drop and long-sleeve fire for the new
  garment, that Rib & Cuff does not, and that `"half sleeve"` still overrides.
- 📁 Files: 8 changed - 3 backend, 5 frontend.
- 🔁 Next prompts: run a real Hoodie Jersey order through Illustrator to confirm
  the Hood pair + Border land in the right rows with no Pocket reserved.
- 🧠 Reflection: the two-flag split kept the diff at ~40 real lines across the
  12.8k-line JSX. Duplicating `hoodie*` into `hoodieJersey*` would have been the
  literal reading of "ek or section bnana he" and the wrong engineering call.

## Evaluation notes (flywheel)

- Failure modes observed: none in this change. The one trap avoided by
  construction was declaring `HOODIE_PIECE_LIST` below the main loop, which
  ExtendScript would have hoisted as `undefined` (see the JSX var-hoisting note
  in project memory).
- Graders run and results (PASS/FAIL): syntax PASS, typecheck PASS, lint PASS,
  plan-rule behaviour PASS. Not graded: the actual Illustrator render, which
  needs a real pattern/mockup pair with a Hood but no Pocket.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): a Hoodie Jersey job on a pattern that
  DOES contain a `Pocket` group, to confirm the piece is ignored rather than
  built.
