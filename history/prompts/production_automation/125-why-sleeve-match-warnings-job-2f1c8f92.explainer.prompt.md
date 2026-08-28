---
id: 125
title: Why sleeve match warnings job 2f1c8f92
stage: explainer
date: 2026-08-18
surface: agent
model: claude-opus-5
feature: production_automation
branch: main
user: zija9452
command: chat
labels: ["sleeve-match", "warnings", "diagnosis", "naming-typo", "open-question"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - Backend/uploads/2f1c8f92-2303-4eb1-b964-dc8c9cec9d29/renders/debug_log.txt (read only)
  - Backend/uploads/2f1c8f92-2303-4eb1-b964-dc8c9cec9d29/sleeve_match_warnings.json (read only)
  - Backend/uploads/2f1c8f92-2303-4eb1-b964-dc8c9cec9d29/automation_bundle.jsx (read only)
tests:
  - none (log analysis only)
---

## Prompt

D:\Zija_Yaseen\Web development\AI-Apparel-Order-Generator\Backend\uploads\2f1c8f92-2303-4eb1-b964-dc8c9cec9d29 is me kia he ab ?

(follow-up, mid-turn) D:\...\renders\sleeve_match_warnings.txt is me q warning ayi he ye btana tha bs

## Response snapshot

Job 2f1c8f92 ran 10:54-11:03 today ON THE NEW CODE (its bundle contains
`_smTargetFor`, and the warnings carry the new "(or 'unitrigh1')" wording).
Finished "Production Ready" with 34 JPGs, but 14 sleeve-match warnings = 2 per
size x 7 sizes. Body side worked: `[back <size>] 'unit 1': D = 71.9 - 114.7mm
(bottom anchor)`, one target stored per size.

Sleeve has TWO units - 'unit righ 1' and 'unit left 1'. Pre-match diagnostics show
they sit correctly: 'unit righ 1' left=no-reach right=87.3mm; 'unit left 1'
left=90.4mm right=no-reach (Large).

Warning 1 - "no unit named 'unit righ 1' (or 'unitrigh1') found on the body
reference": NAMING TYPO. "righ" is not "right", so (a) _smCollectUnits cannot tag
it as a side unit (falls to "continuous"), and (b) _smBaseName strips only
"left"/"right", so "unitrigh1" never reduces to "unit1" and finds no body target.

Warning 2 - "artwork does not reach the seam": the unit was solved against a
corner its artwork never touches (the diagnostic already shows 'unit left 1' has
right=no-reach), so no D could be measured there.

OPEN QUESTION (flagged to user, not resolved): the log's side words look inverted
- side "left" processed 'unit righ 1' and side "right" processed 'unit left 1'.
Hand-tracing the shipped bundle (_smNorm 3277, _smCollectUnits 3303-3316,
usingContinuous 4572, side loop 4686-4691) predicts the opposite pairing
(left <- 'unit left 1', right <- continuous 'unit righ 1'). Verified: single
definition of each function in the bundle, names are clean ASCII (od dump, no
hidden characters), only two units exist. So the observed assignment is not
reproducible from the naming rule alone - needs a live check after the typo is
fixed, because if left-tagged units really do land on the right corner, correct
naming will still mismatch.

Recommended next step: rename the sleeve unit "unit righ 1" -> "unit right 1" in
the mockup and re-run; then read the per-unit VERIFY lines.

## Outcome

- ✅ Impact: both warning families explained with log evidence; one real naming typo found; one unexplained side-assignment anomaly recorded
- 🧪 Tests: none (analysis of an existing run)
- 📁 Files: none modified
- 🔁 Next prompts: re-run after the rename; if the side words still look inverted, trace _smGetUnitSets/side loop live
- 🧠 Reflection: the pre-match "native" diagnostic lines were what made this readable - they show where each unit actually reaches before anything moves

## Evaluation notes (flywheel)

- Failure modes observed: a one-character naming typo silently costs a whole unit's matching; possible left/right corner inversion in the tagged branch (unconfirmed)
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): log the tag each unit received (continuous/left/right) next to the native pre-match line - would settle the inversion question in one run
