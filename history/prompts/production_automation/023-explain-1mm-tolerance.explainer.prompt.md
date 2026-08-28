---
id: 023
title: Explain 1mm tolerance meaning
stage: explainer
date: 2026-07-17
surface: agent
model: claude-fable-5
feature: production_automation
branch: main
user: zija9452
command: none
labels: ["sleeve-matching","tolerance","quality-check"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - none (explanation only)
tests:
 - none
---

## Prompt

ye plus minus 1mm kiaaaaaaaaaaa?

## Response snapshot

Explained the +-1mm tolerance in plain terms: after shifting the sleeve panel so its boundary lands at D, the script RE-MEASURES to verify. Since armhole/cap are curves, perfect zero error is impossible, so a pass/fail threshold is needed. Example: D=72.0mm, sleeve measures 71.4mm -> 0.6mm diff -> PASS; sleeve stuck at 74.8mm -> 2.8mm diff -> FAIL -> skip + warning (frontend + zip debug log). Why 1mm: seam allowance is already 7mm and fabric cut/sew variation exceeds 1mm, so a <=1mm error is invisible after stitching, while 3-4mm breaks the red/black line visibly at the seam. Offered 0.5mm (stricter) or 2mm (relaxed) as alternatives but recommended locking 1mm.

## Outcome

- ✅ Impact: User understands the tolerance is a verify threshold (quality gate), not a design parameter.
- 🧪 Tests: none
- 📁 Files: none changed
- 🔁 Next prompts: User to confirm 1mm (or pick another value); then implementation can start.
- 🧠 Reflection: Anchoring the tolerance against the known 7mm seam allowance made the number concrete instead of arbitrary.

## Evaluation notes (flywheel)

- Failure modes observed: n/a
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): Make tolerance a single JSX constant (SLEEVE_MATCH_TOL_MM = 1.0) so changing it later is one line.
