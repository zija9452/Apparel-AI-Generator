---
id: 123
title: Remove 7mm margin both axis scaling
stage: green
date: 2026-08-18
surface: agent
model: claude-opus-5
feature: production_automation
branch: main
user: zija9452
command: chat
labels: ["design-scaling", "alignAndScale", "margin-removal", "jsx"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - Backend/scripts/automate_production.jsx
tests:
  - "node --check (file copied to .js) - PASS"
  - "grep: no margin7 references remain; rib/cuff sideMargin untouched"
---

## Prompt

height and width both scale pr bhi remove kr do 7mm

## Response snapshot

Removed the 7mm safe margin from `alignAndScale` (the design_scale_mode "both"
scaler), `Backend/scripts/automate_production.jsx:2559-2587`.

Before: `margin7 = 7 * mm` inset the target before fitting - 7mm off the top and
both sides always (0 for Neck), plus 7mm off the bottom unless the part was
bottom-aligned/sleeve/neck. The design therefore stopped short of the panel edge.

After: the fit uses the panel's FULL `visibleBounds` (safeTop/Bottom/Left/Right =
tB[1]/tB[3]/tB[0]/tB[2]). Centering math is unchanged - with the margins at zero
it reduces to the same centre `pmAlignAndScaleToHeight` uses, so the two modes now
differ only in which axes scale. `alignBottom`/`isSleeve`/`isNeck` params kept in
the signature (every call site passes them) but noted as no longer affecting
anything here.

Deliberately NOT touched (different 7mm values, different jobs):
- `SM_SEAM_PT` (line 303) - the -7mm Offset Path stitch line SLEEVE-MATCH measures
  D on. Measurement only, nothing to do with scaling.
- rib/cuff `sideMargin` (line 905, used at 963/969) - deliberately makes the
  rib/cuff line 7mm WIDER than the panel per side under PRESERVE_RIB_DISTANCE.

Affected call sites (all "both"-mode, plus Neck which already had zero margins):
main per-item loop (jsx:871, 896) and the Hoodie hood/border path (jsx:6866).

Verification: `node --check` PASS on the edited script; grep confirms no `margin7`
left and the rib/cuff margin intact. No live Illustrator run yet - first "both"
mode job should show the design running to the panel edge on all four sides.

## Outcome

- ✅ Impact: "Height and width both scale" now fills the panel edge-to-edge, matching the height-only mode's fit area
- 🧪 Tests: node --check PASS, grep checks PASS; live render pending
- 📁 Files: automate_production.jsx
- 🔁 Next prompts: run a job in "both" mode and compare the export against the previous 7mm-inset output
- 🧠 Reflection: three unrelated 7mm constants live in this file - naming them by purpose (seam / safe margin / rib bleed) in the comments is what kept this change from touching the wrong one

## Evaluation notes (flywheel)

- Failure modes observed: none in this change; the risk was confusing the scaling margin with SM_SEAM_PT or the rib bleed
- Graders run and results (PASS/FAIL): node --check PASS
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): if edge-to-edge proves too tight for print, reintroduce the margin as a frontend-controlled value rather than a hardcoded 7mm
