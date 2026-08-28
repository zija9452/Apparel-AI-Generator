---
id: 157
title: Measure seam gap on all three seams
stage: green
date: 2026-08-22
surface: agent
model: claude-opus-5
feature: production_automation
branch: main
user: zija9452
command: (chat)
labels: ["full-button", "placket-match", "side-seam-match", "hood-center-match", "stroke-allowance"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Backend/scripts/automate_production.jsx
tests:
 - node --check on a .js copy of automate_production.jsx - PASS
 - scratchpad e2e (job bb7c1b8c files, sizes 2XL + S) - PASS, both PM-DIAG lines count the 3pt
---

## Prompt

ye fix ho gya he ? or isi trha phr side seam matching me bhi hoga , or hood me bhi , us me bhi fix k do

(follow-ups: "jb canva pr artboard placed hota he , to wo stroke ko hta kr full button me 0 gap pr ata he outside ki , ya mila kr ? mtlb 3 pt gap reh jata he ? right ?" / "hood me side seam me kia hua he ab ??" / "side seam me naya q bnaya , usi me 3pt add krna tha na , kia logic he wo")

## Response snapshot

**Placket verified first.** Scratchpad e2e against job bb7c1b8c's own files:

```
2XL   : measured seam gap 3.000000pt -> combinedCenterX -6496.3398778918  (pre-fix -6494.8398778918)
Small : measured seam gap 3.000000pt -> combinedCenterX -6682.09999996779 (pre-fix -6680.59999996779)
RESULT: PASS
```

The test recomputes BOTH candidate centres from the panel bounds the run itself logs, and fails if the measured gap is 0 (nothing to tell the fix apart from the old behaviour) - so the PASS is not a coincidence of hardcoded numbers.

**Confirmed the placement question:** pieces are laid out AND artboarded on `visibleBounds` (`:841-842`, `:934`), and Front-Right gets `currentX = pmLastFullButtonPanel.rightX` with no spacing (`:863`). So the PAINT touches at zero gap and the two cut PATHS stay `PATTERN_OUTLINE_PT` = 3pt apart.

**Side seam** (`ssJoinOneSeam`): added `SS_SEW_PT` (14mm), `ssSeamGap()` and `ssCloseDistance()`; `ssCombinedCenterX` and Back's unfold shift both moved onto it. `SS_OVERLAP_PT` (19mm) is now the fallback for `ssProcessPair`'s Left pairing only, where Back is labelled the LEFT member while the layout puts it to the RIGHT of Front - the two seam edges face away from each other there and the measurement is meaningless, not merely small. Right/generic pairing measures the real 5mm + 3pt -> ~20.06mm.

**Hood** (`hcmProcessOutsideHood`): `overlapPt = HCM_SEW_PT + gapPt` instead of `HCM_SEW_PT + HCM_GAP_PT`. `gapPt` was already being measured and logged, just not used. Falls back to the constant sum (plus a hoodieWarning) when the gap is negative or wider than half a panel. `HCM_GAP_PT` still sets the 5mm VISIBLE centre gap for the cutter - that no longer costs the centre design anything.

**Why measure instead of adding 3pt** (asked directly): `applyPatternOutlineStroke` can return false when no placement path is found, leaving a piece at its own stroke width - the file's existing rule (`:6835`, and the size-tag note) is "MEASURED, never assumed to be PATTERN_OUTLINE_PT". Bigger reason: the `5mm` inside `19mm` is an assumption too, and breaks outright if Front and Back land in different rows; measuring covers both, and an implausible result trips the 50% guard instead of shipping silently.

Regression run (2XL + S) with the side-seam and hood edits in place: job completed, both placket numbers still exact, "all applicable parts matched within +/-1mm".

## Outcome

- ✅ Impact: all three seams now bridge the real path-to-path distance; the 3pt (1.06mm) each was losing is counted.
- 🧪 Tests: `node --check` PASS; scratchpad e2e PASS on 2XL and Small. Side seam and hood NOT exercised - this job's mockup has no "Front side match"/"Back side match" names and no hood.
- 📁 Files: `Backend/scripts/automate_production.jsx` (SS_SEW_PT, ssSeamGap, ssCloseDistance, ssCombinedCenterX, ssJoinOneSeam, hcmProcessOutsideHood, constants comment block).
- 🔁 Next prompts: run a job with a Front/Back side-match pair and a hoodie job; verify the Right side seam on a TEST PRINT (it moves 19mm -> ~20.06mm, and the 19mm came from the user's own empirical testing); then remove the temporary `PM-DIAG` log at `:6974`.
- 🧠 Reflection: the hood already measured the number it needed and threw it away - worth grepping for other "measured, then ignored" diagnostics.

## Evaluation notes (flywheel)

- Failure modes observed: three features that share one geometry drifted into three behaviours because each was tuned in isolation; the "make them all consistent" pass earlier had made them consistently wrong.
- Graders run and results (PASS/FAIL): placket e2e PASS (2XL, Small). Side seam / hood: NOT RUN.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): a mockup carrying "Front side match"/"Back side match" through the same scratchpad harness, asserting the new SIDE-SEAM MATCH log prints "14mm sewing + the 6.06mm measured path gap".
