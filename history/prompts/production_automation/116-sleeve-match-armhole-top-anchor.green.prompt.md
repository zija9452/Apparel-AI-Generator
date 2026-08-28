---
id: 116
title: Sleeve match armhole-top anchor and official offset seam
stage: green
date: 2026-08-17
surface: agent
model: claude-opus-5
feature: production_automation
branch: main
user: zija9452
command: chat
labels: ["sleeve-match", "armhole-match", "top-anchor", "offset-path", "seam", "bugfix"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Backend/scripts/automate_production.jsx
tests:
 - 8 read-only scratchpad probes against job 33d99084 (measurement layer)
 - prototype self-check - fix-disabled path reproduces the original function exactly, 4/4
 - top anchor reproduces the user's own pen-tool value: 47.46mm vs 47.46mm measured by hand
 - 3 full patched pipeline runs (XL Front + XL Short Sleeve) into scratchpad job dirs
 - full-file parse check via new Function() -> PARSE OK (482972 chars)
---

## Prompt

D:\...\uploads\33d99084-de23-418b-aebd-6df7d673be5d is ko analyze kro , or btao k seam tk q
nhigya he ?? top pr design he jersey k , to sleeve me center me aye ga , dekho q failed hua he ,
fix kro , test kro scartchpad sse

(key follow-ups) "meri logic thi na , k jahn pehle mil jaye ga unit whi se measure kre gi" /
"offset method wo use krna jo pocket me he ... isi trha idhr bhi 7mm ka lena he" /
"kia a rha he D ? 47.46 ?? qk xl me yhi a rha he" / "jese bottom me napty hen na , k base path
ka 7mm le lia andar offset se , then us corner se mtlb top se -7mm chor kr , and rigt se -7mm
chor kr , usi point se napty hen jahn tk unit 1 he" / "bottom ki or top ki logic puchi thi , k
kia wo same he , ek hi trha lete hen d ??"

## Response snapshot

All 5 sizes had failed with "artwork does not reach the seam". Three defects.

**1. The walk stopped before the artwork.** `_smMeasureAlongEdge` breaks on a
7-sample "flat" window meant to catch a body panel's SHOULDER SEAM, but the top
of any armhole - and all of a sleeve CAP - is flat too. Measured: it tripped at
ratio 0.286 (sleeve) / 0.290 (front) against the same 0.30 threshold, stopping
~90pt short of the sleeve's centre stripe on both sides. Now DEFERRED: the flat
window is only a candidate, confirmed as a seam only if the outline runs 20% of
the panel width horizontally without reaching the apex.

**2. No top anchor existed.** `_uaWalkDown`'s `Ltop`/`Rtop` land on the hem/cuff
(0% of panel height) on BOTH panels, so the "top" anchor has never once worked in
production - every job silently fell back to the underarm. Added
`_smMeasureFromArmholeTop`.

**3. (self-correction) The top corner is NOT the panel's highest point.** A first
attempt anchored at the outline's global apex. On a FRONT that sits near the NECK -
measured 544.9pt away from the shoulder tip where the armhole actually ends - so it
measured from the wrong end of the shoulder and produced 40.3mm against the user's
47.46mm. The top corner is now derived as the END OF THE ARMHOLE WALK, which is
also correct on a sleeve for free (there the same walk ends at the cap apex).

**Seam line** now comes from Illustrator's own Offset Path -7mm (`_smSeamOutline`),
the official recipe the Pocket uses at -1in, with the `app.redraw()` and shrink
guard from PHR 111/112 and a fallback to the old polyline inset. Justified by
measurement: the hand-rolled inset differs from the real offset by avg 5.7pt
(2.0mm) and up to 24.2pt (8.5mm) at corners, on a +/-1mm feature.

**Both ends now share one code path** (the user's question): `_smArmholeWalk` does
the single walk; `_smMeasureAlongEdge` anchors at its underarm end,
`_smMeasureFromArmholeTop` at its top end. Same seam line, same
`_smLineIntersect` corner recovery, same `_smMeasureFromSA` chord. Confirmed in
the numbers - both ends report the same 7.17mm perpendicular drop and the same
9.63mm intersect drop on the front, because it is the same geometry read from
opposite ends.

Verification, XL Front right armhole:

| | |
|---|---|
| armhole TOP corner | [-5717.65, 7595.36] (544.9pt from the panel's highest point) |
| -7mm perpendicular drop | 7.17mm |
| -7mm x -7mm intersect drop | 9.63mm (used) |
| **D from TOP** | **47.46mm** - user's hand measurement: **47.46mm** |
| D from BOTTOM | 201.42mm |

Pipeline run: front `D = 47.5mm (armholetop anchor)`, sleeve native 55.7mm.
At the old +25%/-20% cap the solve hit the floor and stopped 1.4mm short with a
warning; the cap was then raised to **+/-30%** on explicit instruction and the
solve completes - `matched at D = 47.5mm (moved 0mm, resized 24.1% in 3 step(s))`,
0 warnings.

**Follow-on fix - width-only resize for top-anchored units.** `scaleRounds`
resized UNIFORMLY, so the 24.1% shrink pulled the sleeve's centre stripe in on
BOTH axes and it stopped reaching the rib it is drawn running down to. At the top
of a cap the seam runs roughly horizontally, so D is set by the unit's WIDTH and
its height cannot affect the match at all. `_smScaleArt` now takes a `widthOnly`
flag, threaded through `opScale`/`undoOp`, and `scaleRounds` sets it when any
target's anchor is `armholetop`. NOT hardcoded - bottom-anchored units keep the
uniform resize unchanged. Re-run: same `matched at D = 47.5mm ... resized 24.1%`,
0 warnings, and the stripe keeps its full height.

No measurable cost: start -> first front measurement was 294s before and 293s
after (that stretch is `_buildNameIndex`).

## Outcome

- ✅ Impact: the top-of-armhole anchor works for the first time, and reproduces the
  customer's own pen-tool method exactly.
- 🧪 Tests: 8 probes, prototype self-check, 3 pipeline runs, parse check.
- 📁 Files: Backend/scripts/automate_production.jsx
- 🔁 Next prompts: run all 5 sizes; decide whether the 20% resize cap should be
  raised or the mockup's sleeve stripe redrawn.
- 🧠 Reflection: I anchored at "the top" as geometry (highest point) when the
  customer meant it as construction (where the armhole ends). Their number, given
  to two decimals, is what exposed it - a single measured value from the user was
  worth more than three of my probes.

## Evaluation notes (flywheel)

- Failure modes observed: a heuristic tuned for one panel type silently mis-firing
  on another; a corner detector returning a plausible-but-wrong point with no
  validation; "top" meaning two different things to code and to customer.
- Graders run and results (PASS/FAIL): PASS - 47.46mm computed vs 47.46mm measured.
- Prompt variant (if applicable): N/A
- Next experiment (smallest change to try): warn when `_uaWalkDown`'s result is not
  in the top half of the panel, instead of returning it silently.
