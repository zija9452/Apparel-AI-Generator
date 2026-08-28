---
id: 019
title: Confirm sleeve-match plan is fully dynamic
stage: explainer
date: 2026-07-16
surface: agent
model: claude-fable-5
feature: production_automation
branch: main
user: zija9452
command: none
labels: ["sleeve-matching","dynamic","generalization","planning"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - scratchpad/sleeve-match-plan.html (DYNAMIC section added, republished same URL)
tests:
 - none
---

## Prompt

lekin dynamic hoga na is k bd , to ye kese acheive kren ge ?? ye sb dynamic hoga , ya sirf k liye ye plan he ?/

## Response snapshot

Confirmed the plan is fully dynamic, not specific to the current red-panel design. Nothing about this design is hardcoded: the core rule is geometric and color/shape-agnostic - "any design element inside the clip that crosses the armhole/cap edge; take its farthest visible boundary's arc-distance from the corner = D". Dynamic aspects: color (script never searches for 'red', only geometric edge-crossing), design shape (solid panels, stripes, gradients all work), D value (never stored; measured fresh per job AND per size at render time), underarm/cap corner detection (existing self-calibrating findUnderarmY on path anchors), garment type (any set-in-sleeve cut), sleeve length/side. The only constant is the -7mm seam allowance, which is the user's sewing standard, not a design property - offered to make it an adjustable frontend field (default 7mm). Designs that never touch the armhole are correctly auto-skipped (nothing to match). Artifact updated in place with a new DYNAMIC section (4 cards). Still pending before implementation: front/back half identification (or confirmation D is always symmetric) and +-1mm tolerance.

## Outcome

- ✅ Impact: User's generalization concern resolved; plan confirmed design-agnostic.
- 🧪 Tests: none
- 📁 Files: artifact HTML updated in scratchpad; no project code changed
- 🔁 Next prompts: Answers to half-identification + tolerance, then implement.
- 🧠 Reflection: Framing the matching rule as pure geometry (edge-crossing + arc-distance) is what makes it design-agnostic; keep color/name heuristics out of the JSX routine.

## Evaluation notes (flywheel)

- Failure modes observed: n/a
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): n/a
