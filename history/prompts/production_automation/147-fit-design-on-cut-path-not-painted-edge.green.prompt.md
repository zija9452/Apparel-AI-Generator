---
id: 147
title: Fit Design On Cut Path Not Painted Edge
stage: green
date: 2026-08-20
surface: agent
model: claude-opus-5
feature: production_automation
branch: main
user: zija9452
command: (direct request)
labels: ["scaling", "alignment", "visible-bounds", "miter-join", "front-back-match", "illustrator", "jsx"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Backend/scripts/automate_production.jsx
tests:
 - bl_stroke_probe.jsx / run_bl_stroke_probe.py - read-only per-edge stroke + bounds dump of mockup.ai, pattern.ai and production_ready_order.ai
 - formula replay on the measured bounds, OLD vs NEW rule, Small + Medium (Front/Back difference 3.17pt -> 0.00pt)
 - node --check on the modified JSX (PASS)
---

## Prompt

ek issue is me ye bhi tha k , front and back same design chl rha he , same height share krte hen , same width , lekin jb mene front ko bak pr rkha to us k design me fix 1.5pt ka gap he , aesa q ??

(follow-up) pattern pr 1pt stroke thi , jb pattern se duplicate kr k order me aty hen to stroke ko 3pt kr dety hen , , hr pattern pr 3pt stroke he .

(follow-up) ...check kro is ka mockup , and pattern order file bhi , medium me mene khud test kia he , 1.5 pt ka frk he , dekho k q

(follow-up) lekin issue kia he , plan share kro pehle , fix kia krna he

(follow-up) ok , lekin kia mockup me isi trha he ?? k agr me mockup ka whi small size order me rkhun to ye differnce nhi aye ga ??

(follow-up) mockup me front ko back pr rkha he , us me frk nhi he ,

(follow-up) ok kro fix / lekin fix kia kre ga ye ?? easy me btao , or sath hi full buton pr bhi

## Response snapshot

### The defect

Every scaler read `visibleBounds` on BOTH the panel and the design reference, on the
reasoning that pinning the pattern outline to `PATTERN_OUTLINE_PT` (3pt) made the
mockup's 3pt `base-path` and the panel's 3pt outline cancel out.

**They do not cancel.** `visibleBounds` is not "path plus half the stroke" - at a sharp
corner the MITER JOIN projects several times that, and a Front neckline is not the same
shape as a Back one.

### Measured, per edge, on the real mockup

Two `base-path`s that are geometrically **identical** (1681.17 x 1876.67 both) and both
stroked at 3pt. Paint outside the path, per edge:

| base-path | L | T | R | B | centre shift Y |
| --- | --- | --- | --- | --- | --- |
| Front | +1.50 | **+4.91** | +1.50 | +1.50 | **+1.70** |
| Back | +1.50 | **+1.75** | +1.50 | +1.50 | **+0.12** |

Left, right and bottom are a clean half-stroke. Only the TOP misbehaves, and it poisons
the fit twice:

1. **Scale**, from visible heights: Front 114.4668% vs Back 114.6352%
2. **Centring**, which put the reference's VISIBLE centre on the target's VISIBLE centre

Net vertical error of the placed design's geometric centre against the panel's:
Front **-1.61pt**, Back **-0.02pt**. The **1.59pt** between them is a pure translation,
constant over the whole panel - exactly the "fixed 1.5pt gap" the user measured by hand
with Front laid over Back. The user confirmed the same two overlay perfectly in the
mockup: the difference was manufactured by the script, not inherited.

Why it looked size-dependent: Small's Front PANEL happens to carry the same +1.70 miter
shift as the mockup's Front base-path, so the two largely cancelled (0.30pt). Medium's
panel is +0.34 against the design's +1.70 - nothing cancels, and the full 3.17pt shows.

### The fix

One helper, four call sites:

```js
function pmFitBounds(item) { return item.geometricBounds; }
```

| function | why |
| --- | --- |
| `alignAndScale` | `design_scale_mode: "both"` |
| `pmAlignAndScaleToHeight` | `"height"` / `"height_sides"` - this job's path |
| `pmApplyFixedScale` | full-button |
| `pmPeekFullButtonScale` | full-button - and it settles a second mismatch there: `peekPattern` is a raw duplicate that never goes through `applyPatternOutlineStroke`, so it was measured at the pattern's 1pt while the panel it predicts for is already at 3pt |

Applied to the target, the scale reference AND the centring reference in each, which is
why both the size error and the position error go away together.

The 3pt outline is untouched - it still prints as the cut marker. It just no longer
decides how big the design gets or where it sits. The other 53 `visibleBounds` uses in
the file (tiling, artboards, hood gap, back-label clearance) are deliberately left alone:
those measure things the eye judges.

### Verified

Formula replayed on the measured bounds, OLD rule vs NEW.

Two separate errors stack, and they are NOT the same size, so the gap Front-vs-Back
depends on where on the panel it is measured (Medium, before):

| measured at | gap |
| --- | --- |
| bottom hem | 0.00pt |
| lower third | 0.79pt |
| **middle (number / chest)** | **1.59pt** |
| upper third | 2.38pt |
| neck / top | 3.17pt |

- POSITION error 1.59pt - a pure translation, identical everywhere
- SIZE error 1.58pt per side - Front's design is 3.16pt shorter overall, which ADDS to
  the translation at the top and CANCELS it at the bottom

The user's hand measurement was 1.5pt, taken around the number/chest area - the middle
row above. An earlier draft of this write-up quoted the 3.17pt top-edge figure as "the"
difference; that was wrong to present as the headline and the user caught it.

After the change every row is **0.00pt** (Small: 0.30pt -> 0.00pt). Scale becomes
Front 114.66108%, Back 114.66054% - the same number to four decimals.

## Outcome

- ✅ Impact: Front and Back designs now land identically on identically-sized panels. Every panel's design is fitted to the cut path instead of to a painted edge whose size depends on corner geometry.
- 🧪 Tests: node --check PASS; read-only probe of all three documents (nothing written, nothing closed that was not opened by the probe); formula replay 3.17pt -> 0.00pt.
- 📁 Files: Backend/scripts/automate_production.jsx
- 🔁 Next prompts: full end-to-end run (~28 min), then lay Medium Front over Medium Back in the output and confirm by hand.
- 🧠 Reflection: `PATTERN_OUTLINE_PT = 3` was introduced to make two strokes cancel inside a visibleBounds comparison. That was treating the symptom - the comparison should never have been on painted edges. Matching stroke widths only cancels when the corner geometry also matches, which for a Front vs a Back neckline it never does.

## Evaluation notes (flywheel)

- Failure modes observed: (1) My first hypothesis was `applyPatternOutlineStroke`'s `if (!outline.stroked) return false;` guard silently skipping a panel. The user corrected it from direct knowledge - every pattern outline does get 3pt - which killed the theory before any code was written. (2) Reported width/height only in the first probe pass; that showed the scale error but hid the centring error entirely. Per-EDGE overhang was what exposed the miter spike sitting on the top edge alone. (3) Started implementing before sharing the plan; the user stopped it, the edit was reverted, the plan went out first.
- Graders run and results (PASS/FAIL): node --check PASS; formula replay PASS (0.00pt on both sizes).
- Prompt variant (if applicable): user supplied the decisive fact themselves - "mockup me front ko back pr rkha he, us me frk nhi he" - which ruled out a mockup-side cause in one line.
- Next experiment (smallest change to try): log the computed scale % per panel so a Front/Back divergence is visible in debug_log.txt without a probe.
