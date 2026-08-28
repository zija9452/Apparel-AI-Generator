---
id: 018
title: Fix collapsed personalization in plan
stage: green
date_iso: 2026-07-07
surface: agent
model: claude-fable-5
feature: production_automation
branch: main
user: zija-yaseen
command: implement
labels: [personalization, llm-hallucination, plan-validation, excel, deterministic]
links: null
files_yaml:
 - Backend/main.py (modified - _norm_size, _enforce_personalization, wired into upload flow)
tests_yaml:
 - scratchpad test_enforce.py - simulated job 881ac952 collapse (6 Medium fronts/backs) expands correctly; already-itemized plans untouched; size aliases (M, 2XL, XXL) match - ALL PASSED
prompt_text: "previous jo changing ki thi name and number ki , to ab to wo sb jersey me ek hi nam de rha he . jb k json plan me alag alg nam the , dekho D:\\Zija_Yaseen\\Web development\\AI-Apparel-Order-Generator\\Backend\\uploads\\881ac952-9e48-456c-bed4-28baa24e6022 || aesa q hua tha , edge cases q discus nmhi kiye the , khud se hallucinate na krna , edge cases puch lena"
response_text: "Root cause was NOT the JSX text changes: production_plan.json itself contained one collapsed item per size (e.g. Medium front quantity:6 with only NAME=Abbie) - the Gemini agent violated its own de-duplication instruction and merged 6 personalized jerseys into one quantity bucket, and the JSX faithfully rendered that plan (debug log confirms Abbie on all six Medium fronts). Fix is deterministic instead of trusting the LLM: _enforce_personalization() runs after the agent responds, groups Excel raw_orders by normalized size (S/M/L/XL/2XL/XXL aliases), and when a size group has fewer front/back items than distinct name/number combinations in Excel, rebuilds those items one per unique combination (back prefers back_name, falls back to name; identical prints aggregate quantity; non-NAME/NUMBER replacements like LOGO are preserved from the first item). Verified with a simulation test against the real function."
outcome: success
evaluation: tested-with-simulation-pending-real-order
---
