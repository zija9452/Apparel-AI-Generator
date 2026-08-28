---
id: 041
title: Name Number Front Back Routing
stage: explainer
date: 2026-07-15
surface: agent
model: claude-fable-5
feature: production_automation
branch: main
user: zija9452
command: none
labels: ["excel-parsing", "personalization", "front-back-routing", "mockup-placeholders"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Backend/services/excel_service.py (inspected)
 - Backend/main.py (inspected)
 - Backend/scripts/automate_production.jsx (inspected)
tests:
 - none (explainer only, no code changed)
---

## Prompt

explore my whole project. and agr me excel sheet me name and number likhun to wo back pr apply hon ge ya front pr ?? me ise kis trha dynamic krun ?? agr name number back pr chl rhe ho to ?? or agr front pr chl rhe hon to ??? kia best approach he

## Response snapshot

Explored the full pipeline (excel_service.py → AI agent in main.py → _enforce_personalization → automate_production.jsx applyTextReplacements) and explained current routing:

- Plain "Name" column → front part (agent rule, main.py:113).
- Plain "Number" column → agent default is back; mockup decides where it actually lands (main.py:114).
- "Back Name" / "Back Number" columns → back part explicitly (excel_service.py:57,90).
- Final gate is the mockup itself: applyTextReplacements (jsx:1437) only replaces text frames named/containing NAME/NUMBER inside that part's group. No placeholder in a part's mockup group = nothing printed there, regardless of plan.

Recommended best approach (hybrid, mostly already built):
1. Explicit columns win: "Front Name/Front Number/Back Name/Back Number" — all four already parse correctly today.
2. Plain Name/Number = dynamic via mockup placeholders — designer places a NAME/NUMBER text frame in the Front or Back group of mockup.ai and that decides the print side.
3. Gap identified: plain "Name" is hard-wired to front by agent instruction; if the mockup only has a NAME placeholder on the back and Excel only has plain "Name", the back would keep placeholder text. Fix option: scan mockup groups for placeholders and route plain columns accordingly (asked user before implementing).

## Outcome

- ✅ Impact: User understands current front/back routing and the mockup-placeholder mechanism; clear decision path for making it dynamic.
- 🧪 Tests: none (no code changed)
- 📁 Files: none modified; three pipeline files inspected
- 🔁 Next prompts: implement mockup-scan routing for plain Name/Number columns if user confirms the edge cases
- 🧠 Reflection: The system is already ~90% dynamic via mockup placeholders; only the plain-name-to-front hard rule limits it.

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): route plain Name/Number by scanning which mockup groups contain NAME/NUMBER placeholders
