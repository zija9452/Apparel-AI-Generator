---
id: 030
title: Vector shift along seam
stage: green
date: 2026-07-17
surface: agent
model: claude-fable-5
feature: production_automation
branch: main
user: zija9452
command: none
labels: ["sleeve-matching","vector-shift","pen-mark","guard","left-sleeve-warnings"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Backend/scripts/automate_production.jsx (_smMeasureAlongEdge returns S/E/A; new _smPointAtChord pen-mark helper; _smShiftArt takes dx+dy; smApplySleeveMatch loop replaced - vector move E_cur->E_target instead of vertical-only secant; guard now on vector magnitude)
tests:
 - node --check on a .js copy - SYNTAX OK
 - scratchpad sm_geom_test_v3.js: 14 tests - all prior chord tests still pass; new: vector loop converges in 1 iter with move == D error (52.00), shallow-cap converges move 21.83 ~= error, guard blocks an oversize move cleanly (move=0), _smPointAtChord mark at chord 40 = (93,140) - ALL PASS
---

## Prompt

(sequence)
1. "to hmy br br q zrurt pr rhi he check krne ki , simple ye k pehle jersey ka size lo phr sleeve ka , agr sleeve ka design km a rha he to brha do..." (why iterate)
2. "uper niche nhi kro na , right left kro utna hi , phr perfect aye ga na" (why not horizontal)
3. "hm to yhi krte hen just jersey ka design dekha us corner tk then sleeve ka , udhr point lga dia jahn tk jesery ka d tha , then whi tk right ya left kr k sleeve ka design le aye usi point tk , ... kia is ki koi or logic nhi he kia ?? koi standard ??" (their real manual method: mark the point, drag the design to it)
4. "blkl perfecta gya he , feedback excellent" + stripes questions (explainer turns, no code)
5. "acha sb perfect ja rha he , lekin ye aya tha SLEEVE-MATCH WARNINGS (1) ... 3XL Short Sleeve: left side: could not reach D = 80.7mm within +/-1mm"

## Response snapshot

Live job (99160ddb) after the chord fix: body D values now in the customer's own range (72-82mm), all sleeves matched except 3XL LEFT. Log showed why: vertical-only shifting moves D at only ~27% efficiency on this cap (Large left: -41.1mm shift for 11.2mm of D), so 3XL left's 15.1mm error needed ~55mm - past the 30%-height guard.

Implemented the customer's actual manual method (their turn-3 description): put the pen mark E_target on the sleeve seam at straight-line distance D_body from the corner S, then move the artwork by the vector E_cur -> E_target - the move runs along the seam and its length ~= the D error itself (3XL left: ~15mm instead of ~55mm, well inside the guard). Direction is now automatic - resolves the user's vertical-vs-horizontal question for any design orientation.

Changes: _smMeasureAlongEdge also returns S (seam corner), E (current exit point) and A (walked seam polyline); new _smPointAtChord(S, A, dist) interpolates the pen mark; _smShiftArt takes dx+dy; smApplySleeveMatch loop is now vector steps (max 5) with the guard applied to the cumulative vector magnitude, re-measuring after each move, exact restore + warning on failure. Log wording: "moved X mm along the seam in N step(s)".

Also answered (explainer, no code): stripes match automatically because the group moves rigidly and both panels carry the same artwork; per-stripe verification offered but not yet requested-confirmed.

## Outcome

- ✅ Impact: shift mechanics now mirror the customer's hand method; expected to clear the remaining left-side warnings since required moves shrink ~3.7x.
- 🧪 Tests: 14/14 geometry tests (vector convergence, move==error, guard safety, pen-mark interpolation, all chord regressions); syntax OK. Needs one live re-run - 3XL left should now match.
- 📁 Files: automate_production.jsx only.
- 🔁 Next prompts: re-run the order, confirm zero warnings; optionally add per-stripe seam verification (measure every stripe crossing on both panels, warn >1mm) if the user confirms.
- 🧠 Reflection: the user's manual workflow was the spec all along - each of the three fixes (seam line, chord, vector-to-mark) replaced an engineering assumption with what their hands actually do.

## Evaluation notes (flywheel)

- Failure modes observed: vertical-only shift efficiency ~27% on shallow caps -> guard breach on the largest error.
- Graders run and results (PASS/FAIL): sm_geom_test_v3.js 14/14 PASS.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): per-stripe crossing comparison (verification-only warnings) once confirmed.
