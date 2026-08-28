---
id: 089
title: Patti stroke cleanup for full-button jersey
stage: green
date: 2026-08-10
surface: agent
model: claude-sonnet-5
feature: production_automation
branch: main
user: zija9452
command: N/A
labels: ["illustrator-automation", "stroke-cleanup", "patti", "placket"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Backend/scripts/automate_production.jsx
tests:
 - Manual verification pending (no automated test harness for the ExtendScript pipeline)
---

## Prompt

jis trha twill tape , neck and placket me stroke remove he , wese hi full button jersey hoti he to us me patti hoti he , us me bhi stroke remove krni he

## Response snapshot

Investigated `Backend/scripts/automate_production.jsx` and found the accessory stroke cleanup (`clearAllStrokes`) is gated by `isAcc` (from `isAccessory()`, covering twill/tukdi/tape/placket only) — neck was never actually wired into that cleanup despite the user's belief. Asked a clarifying question; user confirmed scope should be Patti-only, leave neck as-is.

Added a new `isPatti` flag (`nPartName.indexOf("patti") !== -1`) alongside the existing `isNeck`/`isSleeve` flags (around line 552), and changed the stroke-cleanup call site from `if (isAcc)` to `if (isAcc || isPatti)`. Deliberately did NOT add "patti" into `isAccessory()` itself, since that function also drives `targetGroupName`, master-processing (`masterProcessed`), and SLEEVE-MATCH scoping — Patti is intentionally excluded from those per an existing code comment (it's sized per-panel like Front/Back/Neck, not shared like Twill Tape/Placket). Updated the surrounding comments (call site + `clearAllStrokes` doc comment) to document the new isPatti path.

## Outcome

- ✅ Impact: Patti panels (full-button jersey's placket strip) now get the same non-spot-color stroke cleanup as Twill Tape/Tukdi/Placket, without disturbing Patti's per-size grouping/master-processing behavior.
- 🧪 Tests: No automated test run — ExtendScript/Illustrator pipeline has no test harness; needs a manual production run against a full-button jersey job with a Patti part to visually confirm strokes are gone.
- 📁 Files: Backend/scripts/automate_production.jsx (added `isPatti` flag near line 560; call site around line 618; doc comment near line 5580)
- 🔁 Next prompts: Run a real full-button jersey job through the pipeline and confirm Patti's stroke is visually removed in the exported artwork.
- 🧠 Reflection: User's stated premise (neck already has stroke cleanup) didn't match the code; verifying against the actual isAcc/isAccessory logic before acting avoided silently changing neck's behavior by mistake.

## Evaluation notes (flywheel)

- Failure modes observed: None during this change; risk avoided was conflating "add patti to isAccessory()" with "add patti to stroke cleanup only" — the former would have altered unrelated grouping/master-processing logic.
- Graders run and results (PASS/FAIL): N/A (no automated grader for this codebase)
- Prompt variant (if applicable): N/A
- Next experiment (smallest change to try): N/A
