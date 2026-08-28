---
id: 027
title: Explain sleeve matching logic
stage: explainer
date: 2026-07-17
surface: agent
model: claude-fable-5
feature: production_automation
branch: main
user: zija9452
command: none
labels: ["sleeve-matching","explainer","seam-line","measurement"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - none (read-only: PHRs 024 and 026)
tests:
 - none
---

## Prompt

last phr read kro , or btao k sleeves matching ki kia logic he , or kese implement hoti he , short me btao or unnecesary word na use kro
last phr read kro , or btao k sleeves matching ki kia logic he , or kese implement hoti he , short me btao or unnecesary word na use kro , or ye bhi btao k kis trha measure hota he

## Response snapshot

Read PHR 026 (latest) and 024. Summarized in Roman Urdu:

- LOGIC: body panel ka D aur sleeve ka D compare; farq >1mm to sleeve artwork vertically shift (never scaled) via secant iteration (max 7) tak |err| <= 1mm; failure par exact restore + warning (sleeve_match_warnings.txt), never silent.
- IMPLEMENTATION: frontend checkbox (default OFF) -> match_sleeve_to_side form field -> deterministic plan injection -> JSX SM_ON gate; front/back render first to store D per size, then sleeves matched.
- MEASUREMENT (post-026): outline bezier-sampled (32/seg) -> winding se interior side -> har point 7mm inward normal offset = seam line (SM_SEAM_PT, _smInsetOutline) -> underarm corner se seam polyline par walk -> farthest inside->outside crossing ka arc distance = D. Matches customer's manual -7mm margin convention (72.13 vs 76.6 mismatch isi se pakra gaya).

## Outcome

- ✅ Impact: user ko current sleeve-matching design ka concise Urdu summary mila; koi code change nahi.
- 🧪 Tests: none (explainer only).
- 📁 Files: none modified.
- 🔁 Next prompts: real job re-run with checkbox ON to validate seam-line D against manual measurement.
- 🧠 Reflection: PHR 024 + 026 together fully answer "logic/implementation/measurement" without opening the JSX.

## Evaluation notes (flywheel)

- Failure modes observed: none.
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): n/a
 mene abhi x-large ka isi trha -7mm ka mrgin de kr design napa , to jersey ka a rha h 81.72 or jb k sleeve ka design jo k sleeve k andar nazar a rha he wo he km isse , to me kia real world approach use krun k
  ye best aye
