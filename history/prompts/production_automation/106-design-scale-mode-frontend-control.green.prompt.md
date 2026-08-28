---
id: 106
title: Design Scale Mode Frontend Control
stage: green
date: 2026-08-15
surface: agent
model: claude-opus-5
feature: production_automation
branch: main
user: zija9452
command: (conversation)
labels: ["scaling", "frontend", "full-button", "hoodie", "illustrator"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - Backend/scripts/automate_production.jsx
  - Backend/main.py
  - Frontend/my-app/components/UploadForm.tsx
tests:
  - node --check on automate_production.jsx (copied to .js) - PASS
  - python -m py_compile on main.py and illustrator_automation.py - PASS
  - npx tsc --noEmit on Frontend/my-app - PASS
  - grep audit confirming all three alignAndScale call sites are gated - PASS
---

## Prompt

abhi sirf full button me ye logic ja rhi he k sirf height proportionally scale hoti he , width alg se scale nhi hoti he jese normal jerseys me hota he , to frontend pr check lgao k height proportionally jani he ya width bhi adjust krni he sath , agr user 1 select kre to normal me bhi full button jersey wla fuction chle kia he wo explain kro or agr 2. to as it is rehne do , yhi wali logic chle gi

Follow-ups in the same session:

- "7mm margin thk to nhi a rha he ,offset se lene ka tarika he dekho sahi wala kahn he ??"
- "acha front back se 7mm margin ka maqsad ye tha k , 7mm pehle hi wo ruk jaye design whn tk pura scale na ho , ta k wo to bleed kre ga or stitching me jaye ga , to aesa kch nhi ho rha he , design to stretch ho rha he end tk ,ab ? me official lga dun , jo perfect to aye ,"
- "short me easy language me ans plz"
- "rehne do ise , frontend pr check lgao , jo mene btaya he k align and scale wala , 1. is me sirf height proportioonally scale hogi bs , 2. is me dono scale hon ge , or ye sb me apply hoga , full button , hood , normal jersey"
- "1. (b) . 2. (2.a)"

## Response snapshot

Explained the two existing scalers before changing anything:

- `alignAndScale()` (`:2485`) computes `scaleW` and `scaleH` independently and stretches the design to fill the panel - aspect ratio not preserved. Two whole subsystems exist to clean up after it: `normalizePersonalizedText()` un-warps names/numbers, and `adjustSidePanelsToUnderarm()` re-anchors side art that the even stretch pushes too high on large sizes.
- `pmAlignAndScaleToHeight()` (`:4237`) takes ONE percentage from height and applies it to both axes. Full button additionally forces Front-Left/Front-Right/Back onto a single Back-driven percentage (`pmFullButtonScale`, peeked early via an off-canvas duplicate) so the three panels cannot drift apart across the placket seam.

Also diagnosed the 7mm margin question and reported it honestly rather than acting on it: `alignAndScale` insets the panel's bounding **box**, which is not an offset of the outline at all, and it measures the design's **base-path** rather than the artwork - so artwork drawn outside its own silhouette still reaches the panel edge, exactly the symptom observed in `Small_Front_Item1.jpg`. Front/Back also have `mBottom = 0` by design. Located the correct offset primitive (`officialInsetPolygon()` `:6957`, Illustrator's own Adobe Offset Path via `applyEffect` + `expandStyle`) and the hand-rolled `_smInsetOutline()` `:2977`, but flagged that swapping offset methods would not fix the symptom because the reference item, not the offset maths, is the cause. User chose to leave it.

Implemented a job-wide `design_scale_mode` control on the user's decisions 1(b) and 2(a):

- Frontend: a two-option radio (`both` default / `height`) placed at top level, not nested under any garment type.
- `main.py`: `design_scale_mode: str = Form("both")`, normalised to exactly `"height"` or `"both"` before entering the plan.
- JSX: `var SCALE_HEIGHT_ONLY = (plan.design_scale_mode === "height")` routing all three `alignAndScale` call sites - the main loop's base-path branch (`:850`), its bounds-only branch (`:891`), and `hoodiePasteDesign` (`:6347`, which covers Hood halves and Border).

Per decision 1(b), `pmIsFullButtonFront` is now ANDed with `SCALE_HEIGHT_ONLY`, so on "both" a full-button job stretches like everything else - its height-only behaviour is no longer unconditional. Per decision 2(a), normal and hoodie panels get a plain per-panel height fit with no shared-percentage layer; that layer stays exclusive to full button, where it solves a different problem (cross-panel consistency, not axis choice).

Neck is excluded from height-only on both settings - it is an edge-to-edge strip (zero margins in `alignAndScale` for `isNeck`) that must fill its panel, so an aspect-preserving fit would leave it short.

## Outcome

- ✅ Impact: design scaling is now an explicit job-wide choice instead of an implicit per-garment-type rule. Full button's height-only scaling became user-controlled rather than hardcoded.
- 🧪 Tests: JSX, Python and TypeScript checks all pass; grep audit confirms every `alignAndScale(pastedDesign, ...)` call site is behind the flag. No Illustrator run yet.
- 📁 Files: 3 changed - frontend radio, FastAPI form field + plan normalisation, JSX flag + three call-site branches.
- 🔁 Next prompts: confirm the default. The radio defaults to "both", which means existing full-button jobs will stretch unless the user picks "height" - a real behaviour change for a previously tested SOP. Also unresolved from the prior task: whether Inside Hood should get the 3mm gap normalisation.
- 🧠 Reflection: the user's 7mm question looked like a scaling bug but was a measurement-reference bug; saying so instead of swapping in the fancier offset function avoided work that would not have changed the output.

## Evaluation notes (flywheel)

- Failure modes observed: the frontend still carried a stale "19mm" description of the hood overlap, found only because this task re-read the same component - stale user-facing copy is not caught by any check in this repo.
- Graders run and results (PASS/FAIL): node --check PASS; py_compile PASS; tsc --noEmit PASS; call-site gating grep PASS.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): run one small job in each mode and diff the Front render, to confirm "height" visibly preserves proportion and "both" reproduces today's output byte-for-byte.
