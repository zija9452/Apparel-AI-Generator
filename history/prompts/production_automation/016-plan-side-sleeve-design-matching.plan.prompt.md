---
id: 016
title: Plan side-sleeve design matching automation
stage: plan
date: 2026-07-16
surface: agent
model: claude-fable-5
feature: production_automation
branch: main
user: zija9452
command: none
labels: ["planning","sleeve-matching","geometry","illustrator-jsx","clipping"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Backend/scripts/automate_production.jsx (inspected - findUnderarmY, adjustSidePanelsToUnderarm, sleeve cuff logic, design_clip_group)
 - Backend/services/illustrator_automation.py (inspected)
tests:
 - none
---

## Prompt

ok , ab issue ye he ye ab mazeed personalization he jo k sirf kch hi jersey me chle gi , ab hota yun he k jerseys k side ka design and sleeves ka design sath mil kr design hota hen , jese lines side se aese jese sleeve pr whi se shuru hon , uper niche na hon , to us k liye pehle hm jerseys ki outline ko select krte hen then ctrl + backtick se -7mm lete hen , then us armhole se 7 mm hota kr us design tk hm pentool se naapte hen k kitna ye design aya he ,utna hi sleeve pr bhi rkhte hen , jese ye red lines side ki 72milimetes hen to sleeves k side se bhi 72 hi aye wo design ta k perfect ho ske , ab is ki jo ye matching ho rhi he , how i acheive this ?? k aesa ho k hm puch len k is me m,atching he ya nhi , ya bta den instruction me , ya kahi or , to ?? kese implement ho skta he ye ??

[Follow-up] 1,2,3, recommended, 4. 72mm default na ho , mene jo btaya k jersey se pta lgaye , jo design armhole ko choota he us ka 7mm ka mrgin le , or visualize me jo dikh rha he utna mm le utna hi sleeve pr aye , bhle box kitna hi bara ho lekin jersey k andar jo clip hua he wo dekho isi trha sleeve ka bhi , is me kia issue aye ga ??

## Response snapshot

Feature: side-panel <-> sleeve design continuity. Manual process: offset jersey outline -7mm, measure from armhole point to the side design's visible extent (e.g. 72mm), apply same distance on sleeve edge so lines flow when sewn. User decisions locked: trigger = frontend checkbox (deterministic flag match_sleeve_to_side in plan JSON, no LLM), failure mode = skip + warning log (UA-DETECT pattern), scope = shift only seam-hugging line elements. Measurement is NEVER hardcoded: script measures the CLIPPED/VISIBLE design span per size inside design_clip_group mask, box size irrelevant. Foundation already exists: findUnderarmY() (jsx:1376) self-calibrating underarm detection, adjustSidePanelsToUnderarm() (jsx:1423) seam-hugging artwork detection/shift. New work: SLEEVE-MATCH routine measuring visible span from underarm(-7mm seam inset) along seam on body panel, stored per size, applied to sleeve edge via arc-length walk (sleeve edges are slanted). Issues raised to user: (1) sleeve has TWO underarm edges (front+back seams) - which panel is the match source? (2) multi-line designs: is D the full span to the farthest visible line end? (3) shift-only cannot always achieve exact D - proposed 1mm tolerance then skip+warn; acceptable? (4) slanted sleeve edge solved by arc-length measurement; (5) processing order: fronts must render before sleeves, measurement stored per size, sleeve-only sizes skip+warn; (6) checkbox default OFF. Implementation files: Frontend/my-app/app/page.tsx (checkbox), Backend/main.py (flag passthrough), Backend/scripts/automate_production.jsx (SLEEVE-MATCH).

## Outcome

- ✅ Impact: Approach agreed (checkbox + auto-measure from clipped design); 3 edge-case questions pending user answers before implementation.
- 🧪 Tests: none
- 📁 Files: none modified (planning only)
- 🔁 Next prompts: User answers front-vs-back source, multi-line span definition, tolerance; then implement checkbox -> flag -> JSX SLEEVE-MATCH.
- 🧠 Reflection: Existing UA-DETECT geometry generalizes to sleeve matching; the visible-clipped-span definition avoids any hardcoded mm and self-calibrates per size.

## Evaluation notes (flywheel)

- Failure modes observed: n/a (planning)
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): Prototype visible-span measurement on the 366f6525 job's Large front panel and compare with the user's manual 72mm pen-tool reading.
