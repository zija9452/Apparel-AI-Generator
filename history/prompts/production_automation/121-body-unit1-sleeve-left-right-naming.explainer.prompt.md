---
id: 121
title: Body unit1 sleeve left right naming
stage: explainer
date: 2026-08-18
surface: agent
model: claude-opus-5
feature: production_automation
branch: main
user: zija9452
command: chat
labels: ["sleeve-match", "naming-convention", "regression", "byName", "explainer"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - Backend/scripts/automate_production.jsx (read only - 3960-4003, 4438-4462, 4464-4477, 4605-4627)
tests:
  - none (analysis only)
---

## Prompt

hn jersey pr mene , unit 1 dun gi , or sleeve pr do alg shape hon to unit left 1 and unit right 1 dun gi , thk he ?

## Response snapshot

Concept CORRECT, code TODAY does NOT support it - one name lookup blocks it.

Traced the exact path for body "unit 1" + sleeve "unit left 1"/"unit right 1":
- Body (Back): sets.continuous = ["unit 1"] -> measured on the right armhole ->
  `rec.byName["unit1"] = {d, anchor, gap}` (jsx:3982-3993).
- Sleeve: sets.left/sets.right non-empty -> `usingContinuous` false -> tagged
  branch (jsx:4599-4627). Lookup is `rec.byName[_smNorm(name)]` =
  `byName["unitleft1"]` / `byName["unitright1"]` -> BOTH undefined -> warning at
  jsx:4615 "no unit named ... found on the body reference - rendered without
  matching". Result: neither sleeve shape moves.

Everything else for this case is already correct: `smApplyOneUnit` (jsx:4438-4443)
picks corners.L for a left-tagged unit and corners.R for a right-tagged one, and
the function docstring (jsx:4472-4477) explicitly describes this exact intent -
"the sleeve's left corner and right corner both get real, independent placement
even though only one body measurement drives both". So the byName keying (added
later to stop distance-sort mispairing, see tomorrow.txt fix #5) regressed the
untagged-body + tagged-sleeve combination.

Proposed fix (small, both directions): store each measured unit under BOTH its
full normalized name and its tag-stripped base name (unitleft1 -> unit1), and on
lookup try exact first, then base. That makes body "unit 1" <-> sleeve
"unit left 1"/"unit right 1" work, and also body-tagged <-> sleeve-untagged.
Awaiting user's go-ahead.

## Outcome

- ✅ Impact: user warned BEFORE renaming the mockup that this convention silently fails today; exact one-line cause identified
- 🧪 Tests: none (analysis only)
- 📁 Files: none modified
- 🔁 Next prompts: implement the base-name fallback in smMeasureBodyD/smApplySleeveMatch and re-run a job
- 🧠 Reflection: name-keyed pairing fixed one bug (wrong unit paired) but assumed identical names on both panels - the convention the user actually wants is deliberately asymmetric

## Evaluation notes (flywheel)

- Failure modes observed: tagged sleeve units cannot resolve an untagged body target; failure is a warning, not a crash, so it would have looked like "matching just didn't work"
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): add base-name aliases to rec.byName and an exact-then-base lookup helper
