---
id: 146
title: Back Label Offset On Painted Bounds
stage: green
date: 2026-08-20
surface: agent
model: claude-opus-5
feature: production_automation
branch: main
user: zija9452
command: (direct request)
labels: ["back-label", "visible-bounds", "stroke", "illustrator", "jsx", "placement"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Backend/scripts/automate_production.jsx
tests:
 - bl_render_measure.py - measured the printed neck-to-badge gap off all 5 sizes' 300-ppi renders
 - node --check on the modified JSX (PASS)
---

## Prompt

D:\Zija_Yaseen\Web development\AI-Apparel-Order-Generator\Backend\uploads\5df0f67e-d8ae-45f4-87dd-9a6335c2ef37 is me jo back label he , wo 1.5 inch uper jata he normal jerseys me , or 2.5 inch full button me , to ye visible bounds senhi ja rha he , geometriz se ja rha he normal jersey me , ise visible bound se kro , qk phr strokecut ho rhi hen na , is me back ko dekho ,

(follow-up) "D:\geometric bounds.JPG" "D:\visible bounds with stroke.JPG"

(follow-up) kia issue tha , kia fix krna he , kia fix kia he ?

## Response snapshot

### The defect

`placeBackLabel` measured the label's top with `pmCombinedBounds`, whose own comment
says it plainly: *"Geometric (path-only) union. For anything the EYE judges use
_blPaintedBounds instead - this one ignores strokes."* The badge on this job's mockup is
a circle carrying a heavy white ring, so `geometricBounds` stops at the circle PATH and
leaves half that ring hanging above it. Every panel logged **"verified at 1.50in"** while
printing short.

### Measured, not assumed

Read straight off the job's own 300-ppi renders (1px = 1/300in exactly), centre column,
painted neck edge to painted badge top:

| size | printed gap |
| --- | --- |
| Small | 1.417in |
| Medium | 1.420in |
| Large | 1.417in |
| XL | 1.420in |
| 2XL | 1.420in |

Against the intended 1.500in that is a consistent **0.082in (5.9pt)** shortfall - about
7.4pt of white ring above the badge's path, less the 1.5pt half of the panel's own 3pt
cut-line stroke that sits above the neck path. The user's two screenshots (Outline view
vs Preview) show the same thing by eye.

### The fix

In `placeBackLabel`:

- `lb = _blPaintedBounds(labelItems)` instead of `pmCombinedBounds` - visibleBounds per
  leaf, so the white ring counts
- the verification re-measure switched to the same painted rule, so the check can no
  longer pass on a number the print does not show
- the log line now also reports how far the painted top sits above the geometric one, so
  a future run shows the overhang instead of hiding it

The NECK reference initially stayed on the panel PATH, argued as a different decision:
the 3pt outline `applyPatternOutlineStroke` paints is a cut MARKER, not garment artwork,
so the 1.5in belonged to the seam line the cutter works to.

**Overruled by the user in the same session** - "wo 1.5pt jo he stroke k andar ja rha he
q?? jersey ka visible bound nhi lia tha kia?? isi trha jersey ka visible bound rkhna he
na". The point stands: `pmFindCrossingYAtX` samples path geometry, and the 3pt outline
straddles that path, so starting at the path starts the measurement in the MIDDLE of the
printed line and buries 1.5pt of the 1.5in inside the stroke. One measurement with two
different rules at its two ends is what produced the original short placement in the
first place.

So the neck now adds half the outline back:

```js
var halfOutline = 0;
try { if (baseShape.stroked) halfOutline = baseShape.strokeWidth / 2; } catch (eSW) {}
...
topRefY = neckCenterY + halfOutline;   // +y is UP: painted edge is above the path
```

Read off the item rather than assuming `PATTERN_OUTLINE_PT`, so a piece arriving with a
different outline (or none) still measures from its own real edge. The fallback branch
moved to `visibleBounds[1]` for the same reason. Horizontal centring stays on the path -
a stroke is symmetric left to right, and the path centre cannot be dragged sideways by a
miter spike on one edge. Net effect: the label sits 1.5pt (0.02in) lower than the first
version of this fix put it.

`pmResolveBackLabelClearance` already used `_blPaintedBounds` - this brings the placement
in line with the clearance check that runs right after it.

## Outcome

- ✅ Impact: the badge's printed white ring now lands at the intended 1.5in (2.5in full-button) instead of ~1.42in. The label moves down ~0.08in on every Back panel.
- 🧪 Tests: printed gap measured on all 5 sizes before the change; node --check PASS. No end-to-end re-run yet (~28 min, closes Illustrator) - not requested.
- 📁 Files: Backend/scripts/automate_production.jsx
- 🔁 Next prompts: re-run the job and re-measure with bl_render_measure.py; expect 1.50-1.52in.
- 🧠 Reflection: the helper that fixes this (`_blPaintedBounds`) already existed, written for the Match_ arc on this same feature, and `pmCombinedBounds` even carried a comment warning against exactly this use. The placement call site was simply never migrated.

## Evaluation notes (flywheel)

- Failure modes observed: (1) A first bbox-window search for the badge saturated on the shoulder swooshes and reported a 6in-wide badge - the yoke design is white and yellow too. Scanning the panel's centre COLUMN instead isolates the badge cleanly. (2) Trying to recover scale between the user's two screenshots via the number glyph failed: a stray registration "x" mark polluted the Outline-view bbox and made the aspect ratio disagree. The 300-ppi render made the screenshots unnecessary.
- Graders run and results (PASS/FAIL): node --check PASS; 5/5 sizes measured consistently at 1.417-1.420in.
- Prompt variant (if applicable): user supplied two Illustrator screenshots (Outline vs Preview) mid-turn to show the stroke difference.
- Next experiment (smallest change to try): after the next run, confirm the new log line's overhang figure matches the 7.4pt derived here.
