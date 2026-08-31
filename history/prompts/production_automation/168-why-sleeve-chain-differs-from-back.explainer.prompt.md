---
id: 168
title: Why the sleeve chain differs from the back
stage: explainer
date: 2026-08-29
surface: agent
model: claude-opus-5
feature: production_automation
branch: main
user: zija9452
command: (chat question - how did the back match the sleeve)
labels: ["sleeve-match", "measurement", "chord-vs-arc", "ribbon-unit"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - (none - read-only measurement of C:\Production\Sleeve_matching)
tests:
 - chain3.py - full chain on back armhole + both cap halves, own-chord and along-seam
 - reproduces the run's own VERIFY lines exactly (unit1 L 78.6/R 76.1; unit4 L 9.2/R 11.5)
---

## Prompt

ye back ki sleve k sath matching kese hui jo nmb the ?? sleeve me bhi sb whi the na , top se naapo to 78.61 , 9.8, 135.05, 7.73 , 9.19, ye sleeve ki measurment hen , jo k back se match nhi krrhi hen , thats the point

## Response snapshot

Her sleeve figures reproduce EXACTLY as the cap's LEFT half, own-chord, on the
-7mm line: 78.63 / 9.80 / 135.03 / 7.73 / 9.10 (she had 78.61 / 9.8 / 135.05 /
7.73 / 9.19). Both her chains are therefore correct.

**The 5.44mm "mismatch" on unit 3 is a measuring artefact, not a real one.**
A straight-line reading only equals seam length when the seam is straight. The
back armhole is strongly curved, the cap is nearly flat:

| unit 3 | own chord | along the seam |
|---|---|---|
| back | 129.61 | 135.42 |
| sleeve L | 135.03 | 135.20 |

Along the seam - the only thing sewing cares about - unit 3 is 135.42 vs 135.20,
i.e. **0.22mm apart**. Whole-chain: back chords sum 232.18 but its seam is
238.13; the cap's chords sum 240.29 against a 240.93 seam. So 5.3mm of the
apparent 8.1mm gap is the curve, and 2.8mm is the cap genuinely being longer
(sleeve ease).

**What IS really mismatched:**

1. `unit 2` (the ring) reads 7.66mm on the back's seam and 9.80 / 9.93mm on the
   cap - 2.1-2.3mm wider. Same artwork, different crossing angle (~28 deg on the
   armhole, ~46 deg on the cap). A translation cannot fix this; it is the same
   ring whose width `_smRibbonGap` mislabels as a "gap" (see [[167]]).
2. Boundary drift after unit 2: left cap +3.24 / +3.02 / +3.01 mm, right cap
   +0.83 / +0.68 / +0.66 mm. unit 1's boundary - the one actually solved for -
   is within 1.1 / 1.4mm.
3. `unit 3` and `unit 4` own lengths agree well (135.42 vs 135.20; 7.74 vs 7.73).

**How the match ran:** the back's right armhole was the single reference (4
target D's: unit1 78.2 top, unit2 78.2 top, unit3 17.3 bottom, unit4 9.6
bottom). Each sleeve unit was then moved on its own until its D from the
corresponding anchor hit the target - unit1 19.8mm, unit2 19.8mm, unit3 45.8mm,
unit4 46.3mm rescue + 0.8mm. So exactly ONE EDGE per unit is controlled. The
opposite edge is never checked, and the stripe's width along the seam is never
compared - which is where the drift comes from.

Measurement fidelity check: the reconstruction reproduces the run's own VERIFY
lines - unit1 left 78.63 / right 76.14 (log: 78.6 / 76.1) and unit4 bottom gap
left 9.10 / right 11.45 (log: 9.2 / 11.5).

## Outcome

- ✅ Impact: separated the real mismatch (ring width 2.1mm, left-cap drift 3mm)
  from the apparent one (5.44mm, which is chord-vs-curve).
- 🧪 Tests: chain3.py; agreement with the run's own VERIFY lines to ~0.05mm.
- 📁 Files: none modified.
- 🔁 Next prompts: decide between (a) matching both edges of a unit, (b) letting
  ribbon units resize so their seam footprint matches, (c) accepting 2-3mm.
- 🧠 Reflection: comparing two differently-curved seams with a straight ruler is
  the trap. Chords are fine WITHIN one seam (they reproduced every hand
  measurement) but are not comparable ACROSS seams of different curvature.

## Evaluation notes (flywheel)

- Failure modes observed: a real 0.2mm agreement presented as a 5.4mm failure,
  purely because of the measuring method.
- Graders run and results (PASS/FAIL): reproduction of her 5 sleeve numbers PASS
  (max deviation 0.09mm); reproduction of the log's VERIFY PASS.
- Next experiment: measure the crossing angle of unit 2 on both seams directly,
  to confirm 7.66 = 6.76/cos and 9.80 = 6.76/cos as predicted.
