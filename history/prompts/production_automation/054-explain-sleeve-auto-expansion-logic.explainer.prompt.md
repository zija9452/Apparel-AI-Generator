---
id: 054
title: Explain Sleeve Auto Expansion Logic
stage: explainer
date: 2026-07-15
surface: agent
model: claude-fable-5
feature: production_automation
branch: main
user: zija9452
command: none
labels: ["sleeves", "auto-expansion", "mockupHasBothSleeveSides", "jsx-logic", "explainer"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Backend/scripts/automate_production.jsx (inspected - jsx:141-172 expansion, jsx:211-215 shared pattern panel, jsx:257-264 tag rename, jsx:1391-1405 getSourceView per-side design)
tests:
 - none (explanation only)
---

## Prompt

{
          "part_name": "sleeve-short",
          "size": "Medium",
          "quantity": 1,
          "text_replacements": []
        }
      ]
    },ye is me ek br likha he sleeve shorty lekin order me kese do bn jati hen right and left , jo k blkl thk bn rhi hen ye logic kia he ??

## Response snapshot

Explained the JSX auto-expansion pipeline that turns one plan item into two prints:

1. mockupHasBothSleeveSides() (jsx:141-153) checks the MOCKUP doc for a Right+Left
   design pair (e.g. "Short Sleeve Right" + "Short Sleeve Left"; 5 supported pairs).
2. If both exist, every generic sleeve item in the plan is split in memory
   (jsx:154-172) into two copies with sleeve_side="Right"/"Left"; quantity halves
   (min 1 each). JSON on disk is untouched - this is render-time only. Produces the
   log line "Expanded 'sleeve-short' (Medium) into Right + Left".
3. Both sides duplicate the SAME pattern panel "Medium Short Sleeve" (jsx:211-215,
   cut is identical) but pull DIFFERENT mockup designs: sourcePartName becomes
   "sleeve-short-right" -> getSourceView targets "Short Sleeve Right" (jsx:1395-1396).
4. Size tag on the placed pattern is renamed "Medium" -> "Medium Short Sleeve Right/
   Left" (jsx:257-264) and artboards get per-side names, so the cut table can tell
   the prints apart.

Rationale: only the mockup knows whether the designer made one generic sleeve or two
distinct sides - Excel/plan carries no such info - so the decision happens where the
designs live. Cross-referenced PHR 049: reversed word order ("Right Short Sleeve")
fails the pair check and silently falls back to a single generic print.

## Outcome

- ✅ Impact: User understands why one plan line correctly yields two side-specific sleeve prints, and which naming keeps it working.
- 🧪 Tests: none (read-only)
- 📁 Files: none modified
- 🔁 Next prompts: pending decisions - Phase 4 flavour (hybrid vs full deterministic), Excel persistence, Phase 2 mockup scan
- 🧠 Reflection: The "plan says 1, output shows 2" confusion comes from render-time expansion being invisible in the JSON - the Phase 6 preflight report would surface it up front.

## Evaluation notes (flywheel)

- Failure modes observed: none new (working as designed)
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): none for this question
