---
id: 090
title: Sleeve-match rescue cap and overlap warning disable
stage: green
date: 2026-08-10
surface: agent
model: claude-sonnet-5
feature: production_automation
branch: main
user: zija9452
command: N/A
labels: ["illustrator-automation", "sleeve-match", "rescue-search", "overlap-warning"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Backend/scripts/automate_production.jsx
tests:
 - Manual verification pending (no automated test harness for the ExtendScript pipeline)
---

## Prompt

D:\Zija_Yaseen\Web development\AI-Apparel-Order-Generator\Backend\uploads\302ea3bc-2240-4792-b080-db68c1b7a0d4\renders\sleeve_match_warnings.txt , unit 4 q nhi hua he fix ?? ise hona chahiye tha , or overlap ho to is ka issue nhi he , ye remove kr do , jo  - XL XL Short Sleeve: XL Short Sleeve 'unit 4': artwork does not reach the seam - rendered without matching is trha k logs ayen bs , o mjhe btao k q nhi pohncha ye reach tk ?? jb k ja skta tha , agr hm ise or top pr move krte lekin ye static na rkhna , dynamically q nhi ho rha he ??

## Response snapshot

Read the referenced `sleeve_match_warnings.txt` (11 warnings: unmatched 'unit 4' on Medium, unit-4-doesn't-reach-seam + several overlap warnings on XL). Traced "artwork does not reach the seam" to `_smSolveUnit`'s RESCUE mechanism (Backend/scripts/automate_production.jsx, `rescueAxis()` inside `_smSolveUnit`) - it tries sliding the unit both directions on an axis, at growing step sizes, but only up to `rGuard = 0.30 * corners.H` (30% of the panel's own full height, `corners.H` from `_smFindCorners`). If a unit needs to travel further than that to make first contact with the seam, the rescue gives up and the unit is left unmatched with the "does not reach the seam" warning - which is exactly what happened to XL's unit 4.

First attempted removing the overlap-warning code (`_smWarnOverlaps` + its call site + `appliedBoxes` plumbing) entirely per "ye remove kr do" - user rejected the deletion mid-edit ("remove na kro"). Asked a clarifying question; user confirmed they want the overlap *check* to simply not run at all, but without deleting any code. Commented out the single call site (`_smWarnOverlaps(appliedBoxes, sizeLabel, label);` at the end of `smApplySleeveMatch`) with an explanatory comment, leaving the `_smWarnOverlaps` function definition and `appliedBoxes` tracking untouched/in place.

For the "does not reach the seam" issue, explained the 30%-of-panel-height cap as the actual static ceiling (already per-size dynamic in that `corners.H` varies by size, but the 0.30 fraction itself was a flat guess). Asked user to confirm how far to extend it; user chose the recommended option - raise the rescue guard from `0.30 * corners.H` to the panel's full height (`corners.H`, i.e. 100%), so a unit gets the entire physical panel extent to search for first contact with the seam instead of an arbitrary 30% slice of it.

## Outcome

- ✅ Impact: (1) Sleeve-match rescue search for units that don't initially touch the seam now searches the full panel height instead of capping at 30% - should let cases like XL's 'unit 4' actually make contact and get matched instead of being skipped. (2) Overlap-after-matching is no longer flagged/logged anywhere (call site disabled), since the user doesn't consider it an actionable issue.
- 🧪 Tests: No automated test run - ExtendScript/Illustrator pipeline has no test harness. Needs a re-run of the same XL Short Sleeve job to confirm unit 4 now matches and that sleeve_match_warnings.txt no longer contains overlap lines.
- 📁 Files: Backend/scripts/automate_production.jsx (rescueAxis's `rGuard` at ~line 3258; `_smWarnOverlaps` call site commented out at ~line 3745)
- 🔁 Next prompts: Re-run the job that produced `sleeve_match_warnings.txt` (upload 302ea3bc-2240-4792-b080-db68c1b7a0d4) and confirm unit 4 matches cleanly and no overlap warnings appear.
- 🧠 Reflection: User explicitly rejects deleting code even when asking to "remove" a behavior - "remove" meant disable the effect (stop it from running/logging), not delete the implementation. Should default to disabling/commenting for "remove this behavior" asks in this codebase unless the user confirms deletion is fine.

## Evaluation notes (flywheel)

- Failure modes observed: Initially over-interpreted "ye remove kr do" as "delete the code" and started deleting `_smWarnOverlaps` - user caught this immediately. Corrected by asking before re-attempting.
- Graders run and results (PASS/FAIL): N/A (no automated grader for this codebase)
- Prompt variant (if applicable): N/A
- Next experiment (smallest change to try): If the full-height rescue guard still isn't enough for some unit/size, next step would be sizing the guard dynamically from the actual measured gap between the unit's art and the seam corner rather than a flat multiple of panel height.
