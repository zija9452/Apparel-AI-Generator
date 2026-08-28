---
id: 052
title: Deterministic Plan Explained Rated
stage: explainer
date: 2026-07-15
surface: agent
model: claude-fable-5
feature: production_automation
branch: main
user: zija9452
command: none
labels: ["deterministic-plan", "phase-4", "llm-vs-python", "options-rating", "production-plan-json"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Backend/services/excel_service.py (referenced - Phase 1 personalization dict feeds Phase 4)
 - Backend/main.py (referenced - current LLM plan generation + _enforce_personalization)
tests:
 - none (explanation only)
---

## Prompt

deterministic plan kiaa?? isse json nhi bne ga phrr? kia hoga , kia best he , kon si logic ? rate kro

## Response snapshot

Clarified the core misconception: production_plan.json STILL gets generated in the exact
same format - deterministic only changes WHO writes it (Python rules instead of the LLM).
JSX/Illustrator pipeline untouched.

Pipeline comparison:
- Now: Excel -> parser -> LLM "thinks" -> plan.json (nondeterministic; 2 incidents today)
- Phase 4: Excel -> parser (already emits personalization dict) -> Python if/else rules
  -> same plan.json. Rules: personalized part = one item per unique value with counted
  quantity; unpersonalized part = quantity 1 per size group (de-dup as CODE, not an
  instruction the LLM can forget); Sleeve Half/Full -> sleeve-short/long.

Rated three options:
- A pure LLM (current): 4/10 - zero effort but proven unreliable today
- B LLM + quantity post-processor: 7/10 - ~15 lines, catches the 6-fronts bug, LLM can
  still err elsewhere
- C deterministic builder (Phase 4): 9/10 - same input = same output guaranteed; ~1 day;
  Phase 1 parser already did the hard part; LLM kept only as fallback/validation

Recommendation: B immediately, C as the permanent fix; B's rule becomes C's core (no
wasted work). Suggested ADR: /sp.adr deterministic-plan-builder (awaiting consent).

## Outcome

- ✅ Impact: User understands JSON output is unchanged, sees the pipeline difference, and has a clear rated comparison with a staged recommendation (B now, C next).
- 🧪 Tests: none (explanation only)
- 📁 Files: none modified
- 🔁 Next prompts: implement option B post-processor; then Phase 4 builder; optionally /sp.adr deterministic-plan-builder
- 🧠 Reflection: "Deterministic" scared the user into thinking the JSON artifact disappears - naming the artifact as unchanged first resolved the fear before the comparison.

## Evaluation notes (flywheel)

- Failure modes observed: none new (conceptual clarification)
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): option B - force quantity=1 on identical unpersonalized parts within a size group
