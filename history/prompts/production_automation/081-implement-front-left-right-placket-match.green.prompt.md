---
id: 081
title: Implement front-left/right placket match
stage: green
date: 2026-07-22
surface: agent
model: claude-sonnet-5
feature: production_automation
branch: main
user: zija-yaseen
command: implement
labels: [placket-match, front-left, front-right, full-button-jersey, seam-matching, extendscript]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Backend/scripts/automate_production.jsx (modified - new PLACKET-MATCH helper block: _pmSampleOpenPath, _pmFindMatchLine, _pmCollectSeamArt, _pmMeasureAlongLine, _pmExemptNames, pmMeasureFrontLeft, pmApplyFrontRight, pmWarn; new isFrontLeft/isFrontRight helpers; call site wired after SIDE-PANEL FIX, gated by FULL_BUTTON; placket_match_warnings.json/.txt write-out mirroring sleeve_match_warnings)
tests:
 - node --check on the edited .jsx (copied to .js for the extension) - syntax pass
 - live read-only ExtendScript test via app.DoJavaScript against the already-open "Full Button File.ai" (real customer mockup) - validated detection + measurement WITHOUT mutating the live document (pmApplyFrontRight, which shifts art, was intentionally not exercised on the live file)
---

## Prompt

ok kro , or ye logic sirf tb chle jb frontend me full button jersey ko tick check ho

## Response snapshot

Implemented PLACKET-MATCH per the design agreed in [[080]]. Added to automate_production.jsx, gated entirely by the existing `FULL_BUTTON` flag (`plan.full_button_jersey === true` - already wired end-to-end from the frontend checkbox in Frontend/my-app/components/UploadForm.tsx, confirmed by grep, no frontend change needed):

- `_pmFindMatchLine`: locates the designer's own "Match_" reference path (reuses the same "name starts with match" convention as SLEEVE-MATCH's MATCH-named mode) - no armhole-style corner-walking needed since the seam is already explicit.
- `_pmSampleOpenPath`: bezier-samples an OPEN path (the Match_ line is not closed) without the wraparound `_smSampleOutline` would wrongly apply.
- `_pmCollectSeamArt`: auto-detects filled Path/CompoundPath shapes touching the line's bounds, excluding base-path and this item's own personalization target layer names (Name/Number) - matches the user's confirmed scope from [[080]] exactly.
- `_pmMeasureAlongLine`: first-color-boundary chord distance from a fixed top corner, mirroring `_smMeasureAlongEdge`'s `firstBoundary` semantics but simplified (no apex/flatten walk - the whole line already is the section to measure).
- `pmMeasureFrontLeft` / `pmApplyFrontRight`: store-then-match flow identical in spirit to `smMeasureBodyD`/`smApplySleeveMatch`'s single-target loop (shift along line via `_smPointAtChord`, iterate up to 5 steps, guard = 20% of the line's own span, rollback + warn on failure) - reuses `_smShiftArt`, `_smPointAtChord`, `_smInAny`, `_smPolysOf` verbatim from the SLEEVE-MATCH section instead of duplicating them.
- Wired into the main per-item loop right after the existing SIDE-PANEL FIX call (before `removeBasePaths`), calling `pmMeasureFrontLeft` for `front-left` items and `pmApplyFrontRight` for `front-right` items - relies on FULL-BUTTON's existing expansion order (left always renders immediately before right for a given size).
- `placket_match_warnings.json`/`.txt` written at the end of the run, mirroring the existing `sleeve_match_warnings` pattern exactly.

Testing: `node --check` passed after copying to `.js` (jsx extension isn't recognized). Found and fixed a real bug via a live ExtendScript test: `exemptNames.indexOf(nm)` used `Array.prototype.indexOf`, which ExtendScript's ES3 engine does not implement (confirmed - no other Array.indexOf use exists anywhere else in this codebase, only String.indexOf) - replaced with a manual loop (`inExempt`). Re-ran the read-only test via `app.DoJavaScript` against the customer's actual already-open "Full Button File.ai" (never touched/closed - see [[illustrator-com-never-close-open-docs]] memory): confirmed `_pmFindMatchLine` finds "Match_Front Left"/"Match_Front Right" correctly, `_pmCollectSeamArt` finds exactly 1 candidate on each side (the "Trojans Tehachapi" wordmark CompoundPathItem), and `_pmMeasureAlongLine` returns real, sensible D values - Front Left = 295.4mm, Front Right = 279.6mm from their respective top corners, a genuine ~15.8mm mismatch confirming the exact problem the user described. `pmApplyFrontRight` (which shifts art) was deliberately NOT exercised on this live, user-open document to avoid mutating unsaved work - it reuses `_smShiftArt`/`_smPointAtChord`, already proven in the live SLEEVE-MATCH feature, so a full pipeline run on an actual job is the next real-world check.

## Outcome

- ✅ Impact: full-button jersey orders now auto-align Front-Left/Front-Right seam-crossing designs (logos/wordmarks) to the placket line at every size, only when the "Full Button Jersey" checkbox is on - zero effect on any other job type.
- 🧪 Tests: node --check (syntax) pass; live read-only ExtendScript detection+measurement test against the real customer file (see above) - confirmed correct detection and a real, currently-uncorrected 15.8mm mismatch. Full end-to-end pipeline run (actually applying the shift inside a real job) not yet done.
- 📁 Files: Backend/scripts/automate_production.jsx.
- 🔁 Next prompts: run this job (or any full-button job) through the actual pipeline and check debug_log.txt for "PLACKET-MATCH" lines + placket_match_warnings.txt, to confirm pmApplyFrontRight's shift converges within +/-1mm on a real render, not just the read-only measurement.
- 🧠 Reflection: the live-document DoJavaScript test caught a real ES3-vs-ES5 bug (Array.indexOf) that node --check could never catch (jsx isn't run under Node's engine, just parsed) - worth doing this kind of live read-only probe for any new geometry helper before it goes anywhere near a real job's shift/resize step.

## Evaluation notes (flywheel)

- Failure modes observed: assumed modern Array methods (indexOf) were safe because they're common in ordinary JS; ExtendScript's much older engine silently doesn't have them - only caught by actually executing inside Illustrator, not by static syntax checking.
- Graders run and results (PASS/FAIL): syntax PASS; live detection/measurement PASS (real mismatch reproduced); live apply/shift NOT YET RUN (deferred to avoid touching the user's open, unsaved mockup).
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): before writing further new ExtendScript array/string helpers, grep the existing codebase first for the same method to confirm ExtendScript compatibility, rather than assuming ES5+ availability.
