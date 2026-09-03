---
id: 170
title: Front/Back stripes match global scope
stage: plan
date: 2026-09-03
surface: agent
model: claude-opus-5
feature: production_automation
branch: main
user: zija9452
command: (chat) plan + edge cases for making the full-button "stripes match" feature global
labels: ["planning", "full-button-jersey", "stripes-match", "shoulder-match", "scope-widening"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Backend/scripts/automate_production.jsx (inspected only - 230-280, 565-630, 1360-1465, 7290-7460, 7580-7800, 8060-8300, 9915-9918)
 - Backend/services/illustrator_automation.py (inspected only - 280-370, 1310-1340)
 - Backend/main.py (inspected only - 860-980)
 - Frontend/my-app/components/UploadForm.tsx (inspected only - 625-680, 844)
 - Backend/scripts/docs/FULL_BUTTON_JERSEY.md (read)
tests:
 - none (planning/discussion only; no code changed)
---

## Prompt

ok , so the issue is , jo feature full button me stripes match ka he , use full button k ilawa global scpe bhi dena he , normal jerseys k liye , plan and edge cases discuss??

## Response snapshot

**Feature identified:** the UI Toggle titled "Front/Back stripes match" = `full_button_front_back_match`
(`UploadForm.tsx:644`), JSX flag `FRONT_BACK_MATCH` (`automate_production.jsx:246`), implemented by
`pmMeasureShoulderTarget` (`:8166`) + `pmApplyBackShoulderMatch` (`:8202`). It measures the straight
chord distance on the -7mm stitch line from Front-Left's own outer shoulder corner to where its
`Match_`-prefixed shape crosses that stitch line, then resizes+shifts Back's `Match_` shape until
Back's own two shoulder distances equal that target.

Ruled out the other candidate: `full_button_pattern_match` ("Pattern seam match", `pmStripeSeamShift`
`:7399`) corrects continuity across the **button placket seam** — a seam that does not exist on a
normal jersey, so it cannot be given global scope in any meaningful way.

**Plan proposed (not implemented — awaiting answers):** follow the existing `front_back_side_match` /
`SIDE_SEAM_MATCH` precedent (`:276`, `:1421`) exactly, since that is already a standalone,
non-nested checkbox that only fires for plain `front`/`back` parts:

1. New standalone checkbox `front_back_stripes_match` (default OFF), outside the Full Button nest.
   Leave the existing nested flag untouched — old one only fires on `front-left`/`back`, new one only
   on plain `front`/`back`, so the two can never both apply (Full Button ON means no plain "front"
   part exists at all).
2. `main.py` — Form field + `plan_dict` key, mirroring `front_back_side_match:867,979`.
3. `automate_production.jsx:~276` — `var STRIPES_MATCH = (plan.front_back_stripes_match === true);`
4. New block near `:1421` (Front queues, Back applies), placed **before** the SIDE_SEAM_MATCH block so
   the measurement is taken while Front's design is still untouched.
5. Parameterize `pmMeasureShoulderTarget` — it currently hardcodes Front-Left's LEFT bound
   (`panelB[0]`) as the single outer shoulder.
6. Widen `pmResolveBackLabelClearance`'s gate (`:1458`, `FULL_BUTTON && FRONT_BACK_MATCH`) or the
   resized stripe can collide with the back label on normal jerseys.
7. Frontend Toggle + `FULL_BUTTON_JERSEY.md` update.

The 2x2 solver in `pmApplyBackShoulderMatch` needs no change — it already carries two knobs (uniform
scale + horizontal shift) and a numerically-probed Jacobian for two targets.

**Edge cases raised for the user (8, unanswered):**

1. One shoulder vs two — Front-Left had a single outer shoulder (the other side is the placket), so one
   number was measured and applied to both of Back's shoulders. A plain Front has two outer shoulders
   and therefore two possibly-different targets. Measure both, or keep the single-number behaviour?
2. **Left/Right mapping (the critical one)** — when sewn, Front's LEFT shoulder joins Back's RIGHT
   (Back flips over); `SIDE_SEAM_MATCH` already encodes this convention ("Front Left side match" pairs
   with "Back Right side match"). Confirm Front-left -> Back-right. This question never arose in
   full-button mode because a single symmetric number made the mapping irrelevant.
3. Front's neckline is much deeper than Back's, and `pmSeamShoulderCrossDist` (`:8098`) walks up to a
   full panel width looking for the first crossing — on a deep front neck it can descend into the neck
   curve and pick a crossing on the far side. Reduce the travel cap to half a panel width?
4. Source panel — Front measured, Back adjusted (same convention `ssJoinOneSeam` uses)? Or reversible?
5. Pre-flight — this feature currently has none (missing `Match_` = soft warning, Back left alone).
   Keep it soft globally, or hard-stop the job like Center/Pattern/Side-seam do?
6. Hoodie — a hoodie's front is also a plain `"front"` part, so the checkbox would fire there too.
   Wanted, or restrict to jerseys?
7. `pmShoulderTargetDist` is keyed by `sizeLabel` only, so with several differently-designed Fronts in
   one size the last one measured wins for every Back of that size (pre-existing in the full-button
   version too). Keep, or go per-item?
8. Sleeve stripes matching the armhole — assumed out of scope; confirm.

Recommendation given: (1) measure both, (2) cross mapping, (3) yes reduce the cap, (5) keep it soft,
(6) jerseys only — with 2, 3 and 6 needing explicit confirmation before any code is written.

## Outcome

- ✅ Impact: Pinned down which of the three full-button sub-features "stripes match" refers to, found an
  exact in-repo precedent for a standalone (non-nested) match feature, and produced a 7-step plan plus
  8 edge cases — three of which are genuinely blocking and cannot be answered from the code.
- 🧪 Tests: None. No code changed; discussion/planning only.
- 📁 Files: No edits. Six files inspected.
- 🔁 Next prompts: User answers edge cases 2, 3, 6 (and ideally 1, 4, 5, 7, 8) -> implement the
  standalone flag end-to-end (frontend Toggle, main.py, JSX gate + call site, parameterized measure,
  back-label gate) -> update FULL_BUTTON_JERSEY.md.
- 🧠 Reflection: The feature's whole geometry rests on an assumption that is invisible until you move it
  out of full-button mode — Front-Left has exactly ONE outer shoulder, so a single scalar target was
  always sufficient and the left/right sewing correspondence never had to be decided. A plain Front
  breaks that silently rather than loudly: it would still run, still converge, and still produce a
  plausible-looking result with the two shoulders swapped.
- 📋 ADR: not suggested — this reuses an existing, already-established pattern (`SIDE_SEAM_MATCH`'s
  standalone-checkbox shape) rather than introducing a new architectural direction.

## Evaluation notes (flywheel)

- Failure modes observed: none (no execution). One naming hazard surfaced: three sibling checkboxes
  ("Center design match", "Front/Back stripes match", "Pattern seam match") all describe stripe/pattern
  alignment, so "stripes match" in conversation is ambiguous until matched against the UI Toggle titles.
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): once answered, wire the flag through with the JSX block
  calling the EXISTING single-target path first (Front's left shoulder only), verify one normal-jersey
  size end-to-end, and only then extend to two independent targets — that isolates the plumbing from
  the geometry change.
