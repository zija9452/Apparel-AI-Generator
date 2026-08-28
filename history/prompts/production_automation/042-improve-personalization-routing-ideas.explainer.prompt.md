---
id: 042
title: Improve Personalization Routing Ideas
stage: explainer
date: 2026-07-15
surface: agent
model: claude-fable-5
feature: production_automation
branch: main
user: zija9452
command: none
labels: ["personalization", "routing", "preflight-validation", "mockup-placeholders", "architecture"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Backend/services/excel_service.py (inspected earlier)
 - Backend/main.py (inspected earlier)
 - Backend/scripts/automate_production.jsx (inspected earlier)
 - Frontend/my-app/components/ProductionPlan.tsx (referenced)
tests:
 - none (advisory only, no code changed)
---

## Prompt

hm or better kia kr skte hen ??

## Response snapshot

Proposed ranked improvements over the current name/number routing:

1. Mockup placeholder scan at upload (deterministic placement map) — a small JSX pass opens mockup.ai, records which part groups contain NAME/NUMBER text frames, and that map (not the LLM) routes plain Excel columns. Removes LLM guesswork from placement entirely.
2. Preflight mismatch report before rendering — cross-check Excel columns vs placeholder map; block/warn on (a) column with no placeholder (data silently dropped), (b) placeholder with no column (literal "PLAYER NAME" prints on garment), before a long Illustrator run.
3. Routing preview + override in ProductionPlan.tsx — show "Name → Front, Number → Back" chips with a manual override before user clicks render.
4. Placeholder-blanking safety net in JSX — any un-replaced NAME/NUMBER placeholder in a personalized-capable part gets blanked instead of printing literally.

Recommended order: 1+2 together (same scan powers both), then 4 (few lines), then 3.
Flagged as architecturally significant (placement decision moves from LLM to deterministic code) and suggested /sp.adr per project rules.

## Outcome

- ✅ Impact: User has a prioritized roadmap for making personalization routing deterministic and mistake-proof.
- 🧪 Tests: none (no code changed)
- 📁 Files: none modified
- 🔁 Next prompts: implement placeholder scan + preflight report; run /sp.adr for placement-routing decision
- 🧠 Reflection: The biggest reliability win is removing the LLM from placement decisions; the biggest customer-facing win is failing fast before a 10+ minute Illustrator job.

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): JSX placeholder scan writing placement_map.json at upload time
