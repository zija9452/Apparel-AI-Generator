---
id: 085
title: Revert horizontal mirror placket match
stage: green
date: 2026-07-22
surface: agent
model: claude-sonnet-5
feature: production_automation
branch: main
user: zija-yaseen
command: implement
labels: [placket-match, revert, translation-vs-mirror, root-cause-confirmed, full-button-jersey]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Backend/scripts/automate_production.jsx (reverted - removed horizontal offsetX matching entirely from pmMeasureFrontLeft/pmApplyFrontRight; deleted the now-unused _pmDesignOffsetX helper; kept only the per-shape vertical drop check)
tests:
 - node --check on the edited .jsx - syntax pass
 - grep confirms no remaining references to the removed _pmDesignOffsetX
 - live visual verification (not just numeric): built temp Illustrator documents duplicating the real Front-Left/Front-Right design content from BOTH the native test print and the graded XL order, translated Front-Right by the design's own natural offset (no mirroring), exported PNG screenshots, and visually inspected them - both showed clean, non-ghosted "Trojans TEHACHAPI" text with no duplicate letters, confirming no horizontal correction is actually needed
---

## Prompt

mjhe ss do kia liye tm ne
[preceding, same exchange] bg q nhi a rha he orde me , or jo 14mm or 7mm ghlt kia tha wo revert kia ??

## Response snapshot

Confirmed to the user why the exported comparison screenshots showed no black jersey background (only the inner design groups - logo/text/match line - were duplicated for the comparison, not the base-path/panel fill, to keep the check fast) and copied both PNGs to the user's Desktop so they could inspect them directly (overlay_testprint.png, overlay_order_xl.png).

Confirmed the user's direct question ("revert kiya??") - no, only recommended it in the prior turn, not yet applied. Reverted now: removed the entire horizontal ("mirror + optional allowance") correction from pmApplyFrontRight and its measurement counterpart in pmMeasureFrontLeft, and deleted the now-orphaned `_pmDesignOffsetX` helper (grep-confirmed no remaining callers). PLACKET-MATCH is back to vertical-drop-only correction, per shape, which was never based on the flawed mirror assumption and remains valid.

This closes out a chain of self-corrected mistakes from earlier in the session: first assumed a pure-mirror target (wrong), then added a +7mm "seam allowance" fudge to explain a real-looking residual (still wrong, and only fit the logo, not the text), then discovered logo and text actually need DIFFERENT mirror corrections (7mm vs 18mm, opposite sign) suggesting per-shape independent matching was needed - until the user's repeated "verify, don't hallucinate" pushback led to directly testing a completely different transform (pure translation) instead of mirror, which turned out to be exactly right: text-dx equals logo-dx to ~0.001mm in BOTH the native test print and the graded XL job. A live visual overlay (not just numbers) of both real files, built by duplicating the actual design content into fresh temp documents and translating Front-Right by that measured, verified offset, showed clean results with zero horizontal correction applied - confirming there was never a real defect on this axis, only a wrong measurement model.

## Outcome

- ✅ Impact: PLACKET-MATCH no longer risks pushing correct full-button-jersey designs 7-19mm off in the wrong direction. Only the vertical drop check (independently verified, never implicated in this mistake) remains active.
- 🧪 Tests: node --check pass; grep confirms clean removal; live visual overlay screenshots of both real files (test print and graded XL) shared with the user directly (copied to Desktop) show no ghosting with the corrected (no horizontal shift) understanding.
- 📁 Files: Backend/scripts/automate_production.jsx.
- 🔁 Next prompts: if a future real job shows genuine, confirmed horizontal drift between Front-Left and Front-Right design content, derive the correct relationship (translation-consistency check across all seam-crossing shapes, not an assumed mirror) fresh from that job's own data before writing any correction.
- 🧠 Reflection: this whole investigation is a strong case for the user's repeated "don't hallucinate, verify" instruction - each of the three prior fixes (081's mirror, 083's tolerance, 084's per-shape mirror-with-allowance) was plausible-sounding and passed its own narrow numeric check, but all shared the same wrong root assumption (mirror rather than translation) that only a live visual overlay - not more numeric analysis of the same wrong model - finally exposed.

## Evaluation notes (flywheel)

- Failure modes observed: three consecutive iterations built increasingly sophisticated corrections on top of a wrong geometric model (mirror) instead of stepping back to test an alternative model (translation) - each new numeric check "confirmed" the existing assumption because it was measuring consistency WITHIN that same wrong frame, not against ground truth (an actual rendered visual).
- Graders run and results (PASS/FAIL): syntax PASS; visual inspection PASS (both files clean under the corrected, no-horizontal-shift understanding).
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): when a geometric "matching" hypothesis survives one round of numeric verification but a human still reports the visual result looks wrong, escalate directly to a rendered visual check (not another numeric refinement of the same model) before writing more correction code.
