---
id: 167
title: Armhole D-chain measured in the production file
stage: explainer
date: 2026-08-29
surface: agent
model: claude-opus-5
feature: production_automation
branch: main
user: zija9452
command: (chat question - measure the back's D and the sleeve's)
labels: ["sleeve-match", "measurement", "jsx", "illustrator", "d-chain"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - (none - read-only inspection of C:\Production\Sleeve_matching)
tests:
 - read-only COM probe of the already-open production_ready_order.ai (nothing opened or closed)
 - geometry export + independent Python re-measurement (measure2.py, verify_log.py, compare2.py)
 - offset self-intersection diagnostic (diag_offset.py)
---

## Prompt

ribbon ka gap 6.8 to tha hi nhi or top se measure krna shuru kia he ya bottom se , or q?? mere pas unit 1 78.2 , unit 2 7.66, unit3=129.61 unit 4=7.73 , production file me measure kro . or last me jo gap bacha he ye 4 unit khatam hone k bd bottom ka gap armhole bottom tk 9.6 mm

## Response snapshot

Measured `C:\Production\Sleeve_matching\Sleeve_matching\production_ready_order.ai`
directly. It was ALREADY OPEN in Illustrator with `Saved=False`, so it was
inspected in place - nothing opened, nothing closed
(see [[illustrator-com-never-close-open-docs]]).

Method: JSX exported the Medium Back clip path and the four `unit N` items as
flattened polylines (100 samples/bezier segment); Python rebuilt the -7mm sewing
line, walked it with 0.02mm steps plus 40-step bisection at every crossing, and
applied z-order occlusion (unit 1 is frontmost and hides most of unit 3).

**1. Her numbers are right.** Straight line between each stripe's two edges on
the -7mm line of the right armhole:

| | measured | she had |
|---|---|---|
| unit 1 | 77.87 | 78.2 |
| unit 2 | 7.66 | 7.66 |
| unit 3 | 129.61 | 129.61 |
| unit 4 | 7.74 | 7.73 |
| gap to underarm | 9.31 | 9.6 |

**2. "ribbon gap 6.8 tha hi nahi" - correct, the label is wrong.** unit 2 and
unit 4 are CompoundPathItems with exactly 2 sub-paths, which is the whole test
`_smIsRibbonUnit` uses (`automate_production.jsx:5118`). They are not expanded
strokes: sub-path 0 is IDENTICAL to unit 1 / unit 3's own outline (same bounds
to 5 decimals) and sub-path 1 is that outline grown outward. The fill lies
BETWEEN them - it is a ring, and the 6.76mm `_smRibbonGap` returns is the ring's
painted width, not a gap. Along the armhole the same ring reads 7.66mm because
the seam crosses it at an angle. Harmless this run (vertical mode logged "ribbon
width left as drawn"); the horizontal-mode resize path (~6777) would act on it.

**3. Top or bottom, and why.** `_smMeasureUnitD` (6159) measures each unit from
BOTH ends of that side's seam and keeps whichever D is SMALLER - the comment at
6192 quotes the instruction verbatim: "jo km ho d, whn se measure krna start
krna". So unit 1/2 anchored at armholetop, unit 3/4 at bottom. unit 1's D=78.2
is its FAR edge (the walk starts inside it, so the first boundary found is the
exit) and unit 2's D=78.2 is its near edge - same boundary, which is why both
log lines read 78.2.

**4. The logged chain is systematically short.** `_smUnitSpan` (5809) and
`_smMeasureFromSA` (5639) both measure a CHORD from the anchor corner, not
distance along the seam. Reproduced from the geometry:

| | log said | chord (same method) | true |
|---|---|---|---|
| gap | 9.6 | 9.68 | 9.31 |
| unit 4 | 7.7 | 7.73 | 7.74 |
| unit 3 | 126.9 | 126.99 | 129.61 |
| unit 2 | 6.8 | 6.82 | 7.66 |
| unit 1 | 71.8 | 69.94 | 77.87 |

The error grows with distance from the anchor.

**5. It does NOT break the match.** On the -7mm sewing line, measured from the
point the two pieces are joined at (body shoulder tip / sleeve cap apex):
unit 2 boundary body 78.01 vs sleeve right 76.56 (-1.4) / left 79.11 (+1.1);
unit 3 85.67 vs 86.49 (+0.8) / 88.91 (+3.2); unit 4 221.09 vs 221.77 (+0.7) /
224.11 (+3.0). That reproduces the run's own VERIFY line (L/R differ 2.5mm;
measured 2.55mm). The residual is the sleeve cap's own left/right asymmetry,
not the chord metric.

## Outcome

- ✅ Impact: her hand measurements are confirmed against the finished file, and
  the two things that looked wrong in the log are explained - one is a genuine
  mislabel (ribbon gap), one is a metric mismatch (chord vs seam length).
- 🧪 Tests: read-only inspection; three independent Python re-measurements; the
  offset diagnostic that caught my own error before it was reported.
- 📁 Files: none modified.
- 🔁 Next prompts: rename/repair `_smRibbonGap` for ring-shaped units; decide
  whether D-CHAIN should report seam length instead of chord.
- 🧠 Reflection: a naive inward offset self-intersects wherever the curve bends
  tighter than 7mm, and the phantom length made the body/sleeve gap look like
  12-16mm. Chord distances between two boundary points survive that; arc length
  does not. The tell was the -7mm armhole measuring LONGER (262mm) than the raw
  edge (240mm) - an inward offset of a concave scoop must be shorter.

## Evaluation notes (flywheel)

- Failure modes observed: (a) picking the wrong anchor as the shoulder tip -
  anchor 5 is the neck end of the shoulder seam, anchor 4 is the tip, and
  slicing to 5 dragged the whole shoulder into the "armhole"; (b) 1.3mm sampling
  along the seam invented gaps between adjacent stripes; (c) miter offset spikes
  inflating arc length.
- Graders run and results (PASS/FAIL): reproduction of the designer's 5 numbers
  PASS (2 exact, 3 within 0.35mm); reproduction of the log's D-CHAIN PASS
  (4 of 5 within 0.1mm); reproduction of the log's L/R VERIFY delta PASS
  (2.55 vs 2.5mm).
- Next experiment: measure a second size to see whether the left/right cap
  asymmetry is per-size or constant.
