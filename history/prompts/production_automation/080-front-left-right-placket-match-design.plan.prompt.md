---
id: 080
title: Front-left/right placket match design
stage: plan
date: 2026-07-22
surface: agent
model: claude-sonnet-5
feature: production_automation
branch: main
user: zija-yaseen
command: plan
labels: [placket-match, front-left, front-right, seam-matching, match-named, overlap-bleed, per-size]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - E:/Testing order/File/Tehachapi/Full Button File.ai (inspected read-only via live Illustrator COM session, no edits, no docs closed)
 - Backend/scripts/automate_production.jsx (referenced - existing SLEEVE-MATCH machinery, no changes yet)
tests:
 - none (design/architecture discussion only; no code written yet)
---

## Prompt

me tmhe btati hun , tm prho test print file , us me Mtch_front Left/right /back hen , ab wo jo front me red lines hen na , to righ front ko left front k red lines tk design ata he , mtlb k agr logo lga hua he to right pr bs red lines k corner tk count hoga , or phr left k start se , isi trha ye center logo left k red line tk ho baki bleeding or jb right panel ko hm left kl red line pr rkhen to design match ho , is trha se , kia ye possible he is trha matching ?? mtlb k in dono lines ko touch krti hui hr shape yhi logic lge gi

3 wala samjh nhi aya he sawal .

## Response snapshot

Verified (not assumed) via live COM inspection of the already-open "Full Button File.ai": Front Right, Front Left, and Back groups each contain a PathItem literally named "Match_Front Right" / "Match_Front Left" / "Match_Back" - stroked, unfilled, SpotColor, ~19pt width - confirmed to be the visible red line itself (not a hidden guide). Front-Left/Right lines: 8 anchors, ~2691pt tall bounding box (matches the curve-then-straight line seen in renders). Back: 3 anchors, short (neckline only).

Explained this is architecturally the same pattern as the existing SLEEVE-MATCH system (corner-anchored chord-distance measurement between two named edges, shift/resize to equalize, treat overflow as bleed) - just applied to the front-left/front-right center-placket seam using the Match_ paths as the reference edge instead of the armhole.

Clarified 3 open design questions with the user via AskUserQuestion:
1. Seam type: **overlap/underlap placket** (not a butt seam) - bleed amount must be sized to the actual overlap width so design continues under the placket, not a generic seam allowance.
2. Per-size behavior: **yes, auto-recheck at every size** (S-5XL) after grading/scaling, same defensive pattern as SIDE-PANEL FIX (skip + warn if the crossing point can't be confidently located, never guess).
3. Match scope (needed a concrete example since the user didn't follow the abstract phrasing - reused their own render as the example): "Trojans Tehachapi" wordmark splits across Front-Right ("Troj...TEHACH") and Front-Left ("...jans...ACHAPI") - **that** is the kind of shape needing matching. Base panel black fill and the "32" number stay out of scope entirely (fill is trivially continuous; number never crosses the seam). User chose **scope = only seam-crossing design/logo shapes**, explicitly excluding base-path fill and personalized text/number.

Resulting design (not yet implemented): a PLACKET-MATCH pass, run after alignAndScale per size, that (a) auto-detects non-base-path, non-personalized-text shapes whose bounds touch/cross the panel's own Match_ path, (b) measures each shape's crossing distance from a fixed corner of the Match_ line (reusing the existing chord/corner-walk math), (c) computes the same measurement for the counterpart panel, (d) shifts/resizes to equalize within tolerance, using the overlap width as the allowed bleed budget, (e) skips with a manual-check warning (never silently guesses) when detection is ambiguous - mirroring the SIDE-PANEL FIX / SLEEVE-MATCH skip contract already proven in this codebase.

## Outcome

- ✅ Impact: Full design agreed with user for a new cross-cutting matching subsystem (front-left ↔ front-right seam-crossing logo alignment); no code changed yet, ready to move to implementation.
- 🧪 Tests: none yet - this is pre-implementation design.
- 📁 Files: none modified; Full Button File.ai inspected read-only (already-open doc, not closed, no edits, no save).
- 🔁 Next prompts: implement the PLACKET-MATCH pass in automate_production.jsx reusing _uaAnchors/_smMeasureAlongEdge-style corner/chord helpers, scoped per the 3 confirmed answers above; then run a report-only measurement test (like [[016]]/[[018]]) on this job's actual pattern before a full pipeline run.
- 🧠 Reflection: abstract phrasing of scope question failed - user understood immediately once shown their own render's split wordmark as the concrete example. Prefer concrete in-file examples over abstract option labels when clarifying with this user going forward.

## Evaluation notes (flywheel)

- Failure modes observed: first AskUserQuestion phrasing for "match scope" was too abstract ("har shape jo line touch kare" without a referent) - user replied "samajh nahi aya"; had to re-ask with the user's own wordmark logo as a worked example, which landed immediately.
- Graders run and results (PASS/FAIL): N/A (design/plan stage).
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): when asking multi-choice design questions to this user, always anchor each option to a concrete example already visible in their own files/renders rather than generic wording.
