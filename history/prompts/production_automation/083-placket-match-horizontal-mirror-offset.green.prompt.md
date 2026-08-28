---
id: 083
title: Placket-match horizontal mirror offset
stage: green
date: 2026-07-22
surface: agent
model: claude-sonnet-5
feature: production_automation
branch: main
user: zija-yaseen
command: implement
labels: [placket-match, horizontal, mirror-offset, full-button-jersey, screenshot-diagnosis]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Backend/scripts/automate_production.jsx (modified - new _pmDesignOffsetX helper; pmMeasureFrontLeft now also stores offsetX; pmApplyFrontRight rewritten to independently check+correct both vertical drop and horizontal mirror-offset, each with its own 1mm tolerance and guard)
tests:
 - node --check on the edited .jsx - syntax pass
 - live read-only ExtendScript checks (via app.DoJavaScript) against two real files, no mutation:
   - the graded XL job's production_ready_order.ai (034ecda3.../ff052762...) - reproduced the exact ~7.3mm horizontal mismatch found by manual analysis
   - the native-size test print ("Full Button File.ai") - found the SAME issue already present there (~6.8mm), proving this was never a grading/resize artifact
---

## Prompt

D:\Zija_Yaseen\Web development\AI-Apparel-Order-Generator\Backend\uploads\ff052762-98f3-47fe-80a9-3293e47d8eb4 same issue is me bhi , is me to nam dia tha mene

[follow-up] mjhe visually brabr chahiye he na , jese mene pic dikhay us me j or text me A nhi a rha tha

[follow-up mid-turn] test print prho , us me nhi he ye ??

## Response snapshot

User pointed at a job (ff052762) where "Match_Front Left/Right" WAS present and PLACKET-MATCH ran successfully - log showed "drop = 233.7mm, target 233.7mm - within 1mm - nothing to move" (vertical perfectly matched) - yet the user's own manual test (screenshot: physically placing Front-Right's print against Front-Left's red line in Illustrator, "production_ready_order.ai* @ 66.67%") showed a visibly broken "A" letterform and logo, i.e. real misalignment despite vertical passing.

Investigated the currently-open production_ready_order.ai directly via COM/DoJavaScript (read-only): confirmed Match_Front Left and Match_Front Right are TRUE MIRROR IMAGES of each other (flipping one's anchor X-coordinates and translating by a constant reproduces the other's anchors almost exactly, to 1e-8 precision) - not a plain side-by-side translation. My existing PLACKET-MATCH code only ever checked vertical (Y) position; it never checked horizontal (X) position at all. Measuring the logo's horizontal center relative to each side's own match-line center (bounding-box based, both match lines share identical width so their bbox centers are the true mirror axis) revealed a real, consistent ~7.3mm mismatch, identical across both personalized instances (Item1 STOUT/32, Item2 LTC Costas/24) in this job - proving it's systematic, not random.

Implemented the fix: new `_pmDesignOffsetX(art, matchItem)` computes a combined-bounding-box design center minus the match line's own center. `pmMeasureFrontLeft` now stores this alongside `drop`. `pmApplyFrontRight` was rewritten to check BOTH axes independently - vertical drop (existing) and horizontal offset (new, expecting `offsetX_right = -offsetX_left` since the two panels are confirmed mirror images) - each with its own 1mm tolerance and its own guard (15% of line height for vertical, 50% of line width for horizontal), shifting via the same `_smShiftArt(art, dx, dy)` already used, combined into one shift call and one combined log line.

User then asked whether this same horizontal issue exists in the ORIGINAL test print (not just the graded XL output) - a sharp, well-targeted question given only vertical had been verified against the test print before ([[080]]/[[081]]). Opened "Full Button File.ai" fresh (was not already open, so safely closed afterward without saving - see [[illustrator-com-never-close-open-docs]]) and ran the same read-only check: found the SAME ~6.8mm mismatch already present at native/test-print size. This proves the horizontal offset was NEVER a resize/grading artifact (unlike the earlier vertical-drop-vs-chord confusion in [[080]]) - it's a small positioning imprecision baked into the original mockup's logo placement, present at every size, that nobody had checked before because only vertical alignment had ever been validated.

Verified the new code (not just manual arithmetic) reproduces the same numbers live against the real graded job: drop=233.7/233.7mm (matches, no vertical move needed) and offsetX=-105.7mm vs target -113mm (deltaX ≈ -7.3mm, matching the hand-calculated mismatch exactly).

## Outcome

- ✅ Impact: PLACKET-MATCH is now a true 2-axis (vertical + horizontal) correction instead of vertical-only - closes the exact gap the user caught by physically testing the sewn seam in Illustrator. Will now also correct this same ~7mm horizontal drift that has apparently been present since the original test print, at every size, automatically.
- 🧪 Tests: node --check pass; live read-only verification against both the graded job and the native test print reproduced the expected numbers without touching either open document.
- 📁 Files: Backend/scripts/automate_production.jsx.
- 🔁 Next prompts: user should re-run a full-button job through the real pipeline (not just read-only checks) to confirm pmApplyFrontRight's horizontal shift actually converges the visible logo/text to a clean seam match; consider whether the ~7mm native-file imprecision is worth fixing at the mockup-authoring level too (so the correction starts from near-zero rather than relying on the script every time).
- 🧠 Reflection: the user's method of validation - physically overlaying the two panels in Illustrator at the seam and eyeballing a specific letterform ("A") - caught a real defect that my own earlier verification (checking only vertical numbers) missed entirely. Checking "the numbers agree" is not the same as checking "the thing the numbers are supposed to represent is visually correct" - should have checked both axes from the start once the mirror relationship between the two match lines was first discovered.

## Evaluation notes (flywheel)

- Failure modes observed: scoped the original PLACKET-MATCH design too narrowly (vertical-only, mirroring SIDE-PANEL FIX's underarm model) without asking whether horizontal position could also drift; only caught via the user's independent physical verification, not via my own testing methodology.
- Graders run and results (PASS/FAIL): syntax PASS; live numeric reproduction PASS on both the graded job and the native test print (same order of magnitude mismatch on both, consistent with a real, systematic, non-grading-related cause).
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): before declaring any geometric "matching" feature complete, explicitly check both axes (X and Y) rather than only the axis the initiating symptom pointed at, since asymmetric designs can drift on an axis nobody happened to look at yet.
