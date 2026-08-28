---
id: 15
title: Shoulder Anchor Per Size Rotation
stage: green
date: 2026-08-19
surface: agent
model: claude-opus-5
feature: production_automation
branch: main
user: zija9452
command: fix shoulder band angle
labels: ["illustrator", "extendscript", "shoulder-anchor", "back-label", "sleeve-match"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Backend/scripts/automate_production.jsx
tests:
 - scratchpad/sa_test.js - 10/10 pass (real helpers extracted from the .jsx)
 - scratchpad/ua_test.js - 8/8 pass (re-run after the edits)
 - node --check on the whole file - pass
 - Illustrator run (job sa2xl, 2XL only) - in progress at time of writing
---

## Prompt

sirf 2xl pr test kr lo

(this PHR covers the whole shoulder-band thread: "jo cheez mockup me touch krrhi ho
udhr, sirf unhen khiskana tha", "hn sahi tareeqa lga do", "ye kia kharab kia he",
"and patti shoulder wala issue??", plus the Ctrl+Y / 90pt-stroke observation)

## Response snapshot

### Root cause, measured not guessed

The yellow shoulder band leaves a wedge of bare panel above it on every size except
Small. Measured off the renders of job 2b17c990, and later confirmed by the script's
own logging on job c5eed114:

| Size | panel shoulder | mockup band | mismatch | gap armhole -> neck |
|------|---------------|-------------|----------|---------------------|
| Small  | 14.84 | 14.81 | 0.06 | 1.4mm -> 2.1mm |
| Medium | 13.81 | 14.29 | 1.14 | 2.8mm -> 2.1mm |
| Large  | 12.96 | 14.78 | 1.99 | 5.9mm -> 0.7mm |
| XL     | 11.54 | 14.78 | 3.41 | 11.1mm -> 1.4mm |
| 2XL    | 11.20 | 14.98 | 3.76 | 13.8mm -> 1.4mm |

The mockup was drawn on the **Small** pattern. A uniform scale preserves angles, but
the pattern's shoulder slope grades flatter with size, so the band drifts off the
shoulder line by up to 3.8deg.

Two options were ruled out with numbers, not opinion:
- **Bleed** fills the black but leaves the band tapered: 56.4mm at the armhole vs
  44.0mm at the neck on 2XL. The user spotted this before the measurement confirmed it.
- **Redrawing the mockup** cannot work either - one drawing carries one angle, and the
  pattern wants a different angle per size.

### SHOULDER-ANCHOR (new)

`anchorShoulderBandsToPanel` + `_saRings` / `_saTopYAt` / `_saSlope` / `_saSampleGaps`.
Samples the bare-panel gap above the band at 5 points, derives BOTH edge angles,
rotates by their difference, then lifts the band back onto the cut edge and
re-measures. Runs beside SIDE-ANCHOR, i.e. before SLEEVE-MATCH, so the sleeve follows.

Identified by the item's **NOTE**, not its name: the band is called `unit 1` and
SLEEVE-MATCH pairs body/sleeve units by exact normalized name (`_smTargetFor`,
automate_production.jsx:3935). Renaming would break that pairing silently.

### Three real bugs found and fixed

1. **Angle formula** - caught by the Node harness. Used `atan(slope of gap)` where the
   answer is `panelAngle - bandAngle`; atan is not linear, so it asked for 3.98deg where
   3.78deg was needed, leaving 0.5mm of taper.
2. **`rotate()` signature** - caught by the Illustrator run (job c5eed114). Passed
   `100` in argument 6, copying `resize()`'s shape; this engine's `rotate()` takes six
   arguments with `rotateAbout` (an enum) at 6. Every rotation on every size threw
   "Illegal argument - argument 6 - Enumerated value expected" and silently did
   nothing. Now the 6-argument form with a `rotate(deg)` fallback.
3. **Placket guard missing in SIDE-PANEL FIX** - the back-driven underarm fix let
   front halves reach that code for the first time, and it promptly dragged the
   "J&S Sports" swoosh (which runs to the design's placket edge and crosses the
   underarm) down 11.2mm. Copied the guard `anchorSideGraphicsToSeam` already had.

### Back-label / logo overlap - diagnosed, NOT yet fixed

The badge visibly touches the neck trim arc while the clearance check reports a
healthy 0.29in. Two facts pin it down: the user's Ctrl+Y screenshot shows the PATHS
clearing each other, and the overlap measures **identical on all five sizes** - the
signature of a constant stroke offset, not anything that grades.
`pmCombinedBounds` used `geometricBounds`, which ignores stroke. Changed to accept an
opt-in `useVisible` flag, passed only from `pmResolveBackLabelClearance` so no other
caller's tuning moves. The user believes `visibleBounds` will not pick up the stroke
either (reported as 90pt), so BL-DIAG now prints geometric bottom, visible bottom,
`stroked` and `strokeWidth` for every Match_ item and the label - one run decides
whether the bounds change is enough or whether `strokeWidth / 2` has to be subtracted
by hand. No blind fix applied.

### Still open

- PARM errors: 0 in the pre-change run, 4 in the first test run, 3 in job c5eed114
  (2XL Back aborted at `removeBasePaths`, which is why that render looked mangled -
  no clipping mask ran). Correlation noted and not dismissed; SHOULDER-ANCHOR mutated
  nothing in that run, so the candidates are SIDE-PANEL FIX now touching many more
  panels, or plain Illustrator instability.

## Outcome

- Impact: shoulder-band angle correction implemented and measuring correctly in a
  real run; two silent-failure bugs and one collateral-damage bug fixed.
- Tests: sa_test.js 10/10, ua_test.js 8/8, node --check pass. Illustrator 2XL run
  launched to verify the rotation actually applies.
- Files: Backend/scripts/automate_production.jsx
- Next prompts: read the 2XL run's SHOULDER-ANCHOR + BL-DIAG lines; decide the
  back-label fix from the printed bounds; chase PARM if it recurs.
- Reflection: the Node harness caught the maths bug, but only Illustrator could catch
  the API-signature bug - a `try/catch` around `rotate()` turned a hard failure into a
  silent no-op, which is why the log line mattered more than the guard.

## Evaluation notes (flywheel)

- Failure modes observed: rotate() argument shape assumed from resize(); atan
  non-linearity; missing placket guard; two harness geometry mistakes (inverted
  armhole parametrisation, width measured from the wrong quantity).
- Graders run and results (PASS/FAIL): sa_test.js PASS, ua_test.js PASS
- Prompt variant (if applicable): N/A
- Next experiment (smallest change to try): read BL-DIAG's geoBottom vs visBottom on
  the Match_ arcs before touching the clearance maths again.
