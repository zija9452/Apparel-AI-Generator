---
id: 156
title: Placket seam 3pt stroke gap - status recovery
stage: explainer
date: 2026-08-22
surface: agent
model: claude-opus-5
feature: production_automation
branch: main
user: zija9452
command: (chat)
labels: ["full-button", "placket-match", "stroke-allowance", "session-recovery"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Backend/scripts/automate_production.jsx (read-only inspection; no edits this turn)
tests:
 - node --check on a .js copy of automate_production.jsx - PASS
---

## Prompt

full button me 3pt stroke ka last session chl rha tha , wo closed hogya tha , wo dekh lo

## Response snapshot

Recovered the state of the interrupted session (scratchpad `3c09c546-...`, 2026-08-22 10:11-13:14).

**The issue:** Full Button Jersey lays Front-Right flush against Front-Left using `visibleBounds`, so the two PAINTED outlines touch. But the cut line is the PATH, and the 3pt outline straddles it (1.5pt per side) - so the two paths are actually `PATTERN_OUTLINE_PT` = 3pt apart. PLACKET-MATCH simulated the sewn slide as if the paths already touched, so the shared "Center" graphic landed 3pt (1.06mm) off.

**Proof** (last session's e2e run, `renders/debug_log.txt` 12:24:48):
`PM-DIAG 2XL: abA[...,-6415.33987785396,...] abB[-6412.33987785396,...]` -> exactly 3pt. Small showed the same 3pt (-6601.0999999 / -6598.0999999).

**Fix already in the working tree (uncommitted, untested):**
- `pmSeamGap(a,b)` (`automate_production.jsx:6844`) - MEASURES the real path-to-path gap off `baseShape.geometricBounds`, never assumes 3pt; negative clamps to 0.
- `pmCloseDistance(a,b) = PM_OVERLAP_PT + pmSeamGap(a,b)` (`:6857`).
- Consumed by `pmCombinedCenterX` (`:6863`), Panel B's unfold shift (`:7024`) and `pmStripeSeamShift` (`:6887`), so all three describe one movement.
- Rationale documented at `:429-446`; hood (`HCM_GAP_PT`) and side seam (`SS_OVERLAP_PT`) deliberately still ignore the 3pt (`:443-446`, `:458-462`).

**Verified this turn:** the only e2e run so far predates the fix. Log's `combinedCenterX=-6494.8398778918` reconstructs exactly from `close=162` (overlap only). With the fix it must be `-6496.3398778918` (`close=165`).

## Outcome

- ✅ Impact: no code changed; the interrupted session's state, evidence and exact acceptance numbers are recovered and written down.
- 🧪 Tests: `node --check` PASS (via .js copy - Node rejects the `.jsx` extension). No Illustrator run.
- 📁 Files: none modified.
- 🔁 Next prompts: re-run the 2XL+Small e2e job with the fix in place; confirm PM-DIAG `dx` drops by exactly 1.5pt (2XL 47.2546 -> 45.7546, Small 2.9099 -> 1.4099); then remove the temporary `PM-DIAG` log at `:6974`.
- 🧠 Reflection: the PM-DIAG line was what made the 3pt visible in the first place - keep such diagnostics until the fix has a passing run, not just a passing syntax check.

## Evaluation notes (flywheel)

- Failure modes observed: a fix landed after the last verification run, leaving "done in code" indistinguishable from "verified" without reconstructing the log arithmetic by hand.
- Graders run and results (PASS/FAIL): syntax check PASS; Illustrator e2e NOT RUN.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): re-run only 2XL through the scratchpad e2e harness and diff the single PM-DIAG line.
