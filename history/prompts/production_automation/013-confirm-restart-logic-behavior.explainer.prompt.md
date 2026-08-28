---
id: 013
title: Confirm font restart logic behavior
stage: explainer
date_iso: 2026-07-04
surface: agent
model: claude-fable-5
feature: production_automation
branch: main
user: zija-yaseen
command: explain
labels: [fonts, illustrator, automation, logic-confirmation]
links: null
files_yaml:
 - Backend/services/illustrator_automation.py (inspected, no changes)
tests_yaml:
 - none
prompt_text: "agr pehle se illustrator bnd ho to illustrator bnd hone ki command nhi chle gi , aesa hi he ??? or agr koi install ho to hi illustrator open ho to close hoga ?? otherwise nhi hogaa ??"
response_text: "Confirmed both behaviors: (1) If Illustrator is already closed, GetActiveObject inside _close_illustrator_if_running raises and the function does nothing — Quit() is only called on an actually-running instance. (2) _close_illustrator_if_running is only invoked behind the 'if newly_installed:' gate in run_illustrator_automation, so when zero new fonts are installed (all already on PC, or no fonts uploaded), Illustrator is never touched and a running instance is reused. All four open/closed x installed/not-installed scenarios end with Illustrator in a valid state with correct fonts loaded."
outcome: success
evaluation: confirmed-no-code-change
---
