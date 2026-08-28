---
id: 091
title: Sleeve-match rescue cap tuned to 60 percent
stage: green
date: 2026-08-10
surface: agent
model: claude-sonnet-5
feature: production_automation
branch: main
user: zija9452
command: N/A
labels: ["illustrator-automation", "sleeve-match", "rescue-search"]
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

D:\Zija_Yaseen\Web development\AI-Apparel-Order-Generator\Backend\uploads\85beca78-c6a4-4716-9703-77ce32ca6eeb\renders\XL_Short_Sleeve_Item1.jpg ,us ne blkl straight q kr di ye line ?? 0.30 se 0.60 kr do bs

## Response snapshot

Read the referenced render (`XL_Short_Sleeve_Item1.jpg`) - the white chevron line at the top of the sleeve had been dragged dead straight/horizontal instead of following the body's own angled seam shape. This is the previous fix (090: rescue guard raised from `0.30 * corners.H` to `1.0 * corners.H`) overshooting - the rescue search was now allowed to travel the full panel height and dragged unit 4 too far past its natural position to make contact.

Changed `rGuard` in `_smSolveUnit`'s `rescueAxis()` (Backend/scripts/automate_production.jsx, ~line 3258) from `corners.H` (100%) to `0.60 * corners.H` (60%), per the user's explicit instruction, as a middle ground between the original too-tight 30% (unit 4 unmatched) and the too-loose 100% (unit 4 overshot/straightened).

## Outcome

- ✅ Impact: Rescue search cap for sleeve-match units now 60% of panel height instead of 30% (too tight, caused unmatched units) or 100% (too loose, caused overshoot/distortion like the straightened chevron line on XL Short Sleeve).
- 🧪 Tests: No automated test - needs a re-run of the job that produced this render to visually confirm the chevron line follows the body's natural angle again while unit 4 still matches (not reverting to "does not reach the seam").
- 📁 Files: Backend/scripts/automate_production.jsx (`rGuard` in rescueAxis, ~line 3258)
- 🔁 Next prompts: Re-run the XL Short Sleeve job (upload 85beca78-c6a4-4716-9703-77ce32ca6eeb) and visually confirm the chevron line is no longer straight and unit 4 still gets matched.
- 🧠 Reflection: The rescue-guard cap is sensitive - straight percentage jumps (30% -> 100%) can swing from "doesn't reach" to "overshoots." Future tuning of this value should be treated as iterative/visual rather than assumed correct from logic alone.

## Evaluation notes (flywheel)

- Failure modes observed: 100% guard (from PHR 090) overshot and visually distorted the artwork - confirms the rescue mechanism's search distance directly affects final visual quality, not just pass/fail matching.
- Graders run and results (PASS/FAIL): N/A (no automated grader for this codebase)
- Prompt variant (if applicable): N/A
- Next experiment (smallest change to try): If 60% still doesn't look right, consider a genuinely distance-based dynamic guard (compute actual gap between unit's art bounds and the seam corner, plus margin) instead of guessing more flat percentages.
