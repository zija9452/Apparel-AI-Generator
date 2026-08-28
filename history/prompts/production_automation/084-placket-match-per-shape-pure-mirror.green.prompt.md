---
id: 084
title: Placket-match per-shape pure mirror
stage: green
date: 2026-07-22
surface: agent
model: claude-sonnet-5
feature: production_automation
branch: main
user: zija-yaseen
command: implement
labels: [placket-match, per-shape, mirror, ghosting, full-button-jersey, root-cause]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Backend/scripts/automate_production.jsx (rewritten - _pmCollectSeamArt now keys each candidate: TextFrame by contents, named GroupItem by name as one rigid unit, unnamed GroupItem recursed through as pure organizational wrapper, anonymous Path/CompoundPath by order; pmMeasureFrontLeft stores per-key {drop, offsetX} instead of one blended measurement; pmApplyFrontRight corrects each candidate independently against its matching key, target = pure mirror (removed the earlier SM_SEAM_PT addition) for offsetX, same drop value for vertical)
tests:
 - node --check on the edited .jsx - syntax pass
 - live read-only verification (via app.DoJavaScript) against both real files (native test print "Full Button File.ai" and the graded XL order), confirming the new per-candidate deltas match the precise anchor-derived mirror-transform numbers from this session's investigation almost exactly (text: +17.74/+19.20mm, logo: -6.77/-7.33mm on test print/XL respectively)
---

## Prompt

kia gap yr ?? bs krna ye he k overlap kr k check kro , match a rha he ya nhi , agr a rha he to thk he duplicate ghost na a rha ho , agr nhi a rha he to usi k according adjust kr do

[preceding this turn, across several messages] User pushed back hard on my "tighten tolerance to 0.1mm" and "+7mm seam allowance" theories, asking me to actually verify rather than assume ("hallucinate na krna, edge case discuss kr lena"). Investigation (this session) found: the earlier combined-bounding-box measurement was hiding that the LOGO (Trojans CompoundPathItem) and the TEXT (TEHACHAPI TextFrame) need DIFFERENT, even opposite-direction corrections relative to a pure mirror of Front-Left - confirmed via an anchor-point-exact mirror transform (0.0000pt deviation) on both the native test print and the graded XL order file, with near-identical numbers on both (logo ~7mm, text ~18-19mm, opposite sign). This proved the earlier "combine everything into one shift" approach was structurally wrong - a single delta can't satisfy two shapes that need different, opposite corrections - which is exactly why fine letters ("A" in TEHACHAPI, "j"/"o" in Trojans) showed a slight duplicate/ghost even though the combined-shape check reported "within tolerance."

## Response snapshot

Implemented per-shape independent matching, replacing the earlier one-combined-shift design from [[083]]:

- `_pmCollectSeamArt` now assigns each candidate a matching key so Front-Right can find its Front-Left counterpart: TextFrames key on their own lowercased contents (same wording both sides), a **named** GroupItem is treated as one rigid unit (keyed on its name) and NOT recursed into - same convention SLEEVE-MATCH's MATCH-named mode already established - while an **unnamed** GroupItem is pure organizational wrapping and gets recursed through to find the real independent pieces inside. Anonymous Path/CompoundPath shapes key on order of appearance. This directly answers the user's question ("kese pta hoga wo group hen ya alag") with an existing, already-proven codebase rule rather than a new invented one.
- `pmMeasureFrontLeft` now stores a per-key map `{ key: {drop, offsetX} }` instead of one blended measurement across every candidate.
- `pmApplyFrontRight` loops each of its own candidates, looks up the matching key, and corrects EACH independently: vertical drop targets the same value (unchanged from [[083]]); horizontal offsetX now targets a **pure mirror of Front-Left's SAME shape - no added constant**. This directly follows the user's explicit instruction to stop guessing at allowance constants (rejected an AskUserQuestion about "which constant" mid-turn) and instead just measure the real overlap gap and close it, whatever that gap actually is, per shape.
- Verified live, read-only, against both real files: new per-shape deltas (text +17.74mm/+19.20mm, logo -6.77mm/-7.33mm on test print/XL) match the earlier precise anchor-based numbers almost exactly, confirming the simpler bounding-box-center mirror derivation used in the real (non-anchor-walking) code is accurate enough for production use.

## Outcome

- ✅ Impact: PLACKET-MATCH no longer conflates independent design elements into one shift - each seam-crossing shape (logo, text, or anything else, including future named-group units) is measured and corrected on its own against a pure-mirror target of its Front-Left counterpart, closing the exact gap that caused visible letter-doubling in the graded order.
- 🧪 Tests: node --check pass; live read-only numeric verification against both the native test print and the graded XL order reproduced the expected per-shape deltas.
- 📁 Files: Backend/scripts/automate_production.jsx.
- 🔁 Next prompts: user should run a full pipeline job through the actual automation (not just read-only checks) and re-do their physical overlay test on the resulting XL output to confirm the "A"/"j"/"o" ghosting is gone; if a future mockup needs two shapes to move together as one, group and name them (any name) per the rule established here.
- 🧠 Reflection: user's repeated "don't hallucinate, verify" pushback (rejecting two AskUserQuestion attempts mid-turn) was the right call - my first two theories (loosen/tighten tolerance, add a universal +7mm allowance) were both plausible-sounding but wrong; the actual root cause (two shapes need different corrections, revealed only by comparing anchor-exact numbers per-shape) would never have surfaced from continuing to guess at a single blended constant.

## Evaluation notes (flywheel)

- Failure modes observed: repeatedly treated a multi-shape "seam-crossing design" as one measurable unit across three iterations ([[081]], [[083]], and an aborted mid-084 attempt) before the user's insistence on verifying against the real, unmodified file state forced a proper anchor-level comparison that revealed the shapes disagree.
- Graders run and results (PASS/FAIL): syntax PASS; live per-shape delta reproduction PASS on both real files (numbers consistent with the independently-derived anchor-exact reference).
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): when a "combined measurement" of multiple design elements produces a small-but-nonzero residual that a human report as visually wrong, decompose into per-element measurements before adjusting any tolerance - a blended number hides exactly the kind of disagreement that matters here.
