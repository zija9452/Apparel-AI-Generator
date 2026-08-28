---
id: 019
title: LLM vs script division of labor
stage: explainer
date_iso: 2026-07-16
surface: agent
model: claude-fable-5
feature: production_automation
branch: main
user: zija-yaseen
command: discuss
labels: [architecture, llm, vision, automation, qa, hybrid]
links: null
files_yaml:
 - none (architecture discussion)
tests_yaml:
 - none
prompt_text: "yr hm ye sb kam script se kr rhen hen , llm se nhi kr skty k llm read kr le , qk llm to dekh pr skta he na , jese k abhi tm ne sb btaya ,"
response_text: "Explained why pure-LLM cannot replace the geometry script: (1) production needs sub-mm precision - vision LLMs estimate from pixels, they cannot produce '1.74in' exactly; vector anchors can; (2) 140MB .ai files cannot be ingested directly, and rendering to images loses the vector data (anchors/seams) that the underarm detection needs; (3) LLM output is non-deterministic run-to-run, scripts are repeatable - mandatory for cut fabric; (4) per-panel vision calls are slow/costly vs microsecond script math; (5) the LLM cannot move objects in Illustrator anyway - execution is always the script. Clarified that even this session worked as the recommended hybrid: scripts extracted exact geometry, the LLM designed logic and verified numbers. LLM's proper places in this system: order/Excel parsing into production_plan.json (already done), and a proposed future feature - vision-LLM QA pass over the renders/*.jpg output to flag suspicious panels (misplaced side panels, misspelled names, distorted logos) for human review. Formula: geometry+execution = script (exact, deterministic); understanding+oversight = LLM (flexible, can 'see')."
outcome: analysis-delivered
evaluation: user-considering-render-qa-feature
---
