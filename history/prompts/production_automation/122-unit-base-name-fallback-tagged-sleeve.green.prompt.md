---
id: 122
title: Unit base name fallback tagged sleeve
stage: green
date: 2026-08-18
surface: agent
model: claude-opus-5
feature: production_automation
branch: main
user: zija9452
command: chat
labels: ["sleeve-match", "naming-convention", "bugfix", "byName", "ui-copy"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - Backend/scripts/automate_production.jsx
  - Frontend/my-app/components/UploadForm.tsx
tests:
  - "node --check (file copied to .js) - PASS"
  - "node name-matching simulation over 6 naming combinations - all as intended"
  - "npx tsc --noEmit (Frontend/my-app) - PASS (exit 0)"
---

## Prompt

jerey pr wo unit 1 hi fnd kre, or sleeve pr agr unit left 1 and right 1 to samjh jaye k unit 1 ki hi bt ho rhi he jo dono pr chlna chahiye he

## Response snapshot

Implemented the base-name fallback so the customer's asymmetric convention works:
body "unit 1" (one continuous piece) <-> sleeve "unit left 1" / "unit right 1"
(two separate shapes), each placed on its own corner from the same measurement.

Changes in `Backend/scripts/automate_production.jsx`:
1. New `_smBaseName(nm)` (after `_smUnitsForSide`) - strips a left/right tag from
   a normalized unit name: "unitleft1"/"unitright1" -> "unit1". Same tag rule as
   `_smCollectUnits`.
2. New `_smTargetFor(rec, nm)` - exact name first, then base name.
3. `smMeasureBodyD` also stores the reverse alias (`byName["unit1"]` for a
   measured "unit right 1"), never overwriting a real exact-name entry - covers
   tagged body + untagged sleeve.
4. Both sleeve lookups now use `_smTargetFor` (continuous branch and tagged
   per-side branch); their "no unit named X" warnings now also print the base
   name that was tried.
5. Comment refresh: tagged-branch comment rewritten for the new rule; stale
   "mockup's Front view" comment near `_smGetUnitSets` corrected to "Back view"
   (leftover from PHR 119's scope fix).

`Frontend/my-app/components/UploadForm.tsx` - checkbox helper text now states the
convention plainly: Back + each sleeve need the group, pieces pair by name, and a
side that is a separate shape gets "unit left 1"/"unit right 1" which still pairs
with the body's "unit 1".

Verification: `node --check` PASS on the edited script; a standalone node
simulation of `_smNorm`/`_smBaseName`/`_smTargetFor` + the alias build over 6
naming combinations gave the intended result each time (user's convention, mixed
tagged/untagged, reverse direction, classic same-name, genuinely-missing name ->
warning, fully tagged body); frontend `tsc --noEmit` exit 0. No live Illustrator
run yet.

## Outcome

- ✅ Impact: user's intended mockup naming now works end-to-end; both sleeve shapes get placed instead of both warning
- 🧪 Tests: node --check PASS, name-matching simulation PASS (6/6), tsc --noEmit PASS; live job pending
- 📁 Files: automate_production.jsx, UploadForm.tsx
- 🔁 Next prompts: run a real job with body "unit 1" + sleeve "unit left 1"/"unit right 1" and check the VERIFY lines in debug_log
- 🧠 Reflection: name-keyed pairing needed an explicit notion of "same design element, split per side" - the base name is that notion, and aliasing both directions keeps it symmetric

## Evaluation notes (flywheel)

- Failure modes observed: previously both tagged sleeve units warned and rendered unmatched against an untagged body unit
- Graders run and results (PASS/FAIL): node --check PASS; simulation PASS; tsc PASS
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): confirm on a real render that the left-tagged shape solves against corners.L and the right-tagged against corners.R with the same target D
