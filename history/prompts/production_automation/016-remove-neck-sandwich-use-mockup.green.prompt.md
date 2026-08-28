---
id: 016
title: Remove neck sandwich logic use mockup
stage: green
date_iso: 2026-07-07
surface: agent
model: claude-fable-5
feature: production_automation
branch: main
user: zija-yaseen
command: implement
labels: [neck, sandwich-logic, margins, alignAndScale, illustrator]
links: null
files_yaml:
 - Backend/scripts/automate_production.jsx (modified)
tests_yaml:
 - none (manual verification: regenerate an order with a neck part and confirm the mockup neck design fills the neck panel)
prompt_text: "or sleece k bottom se 1 inch margin khatam kr do , or neck ki sandwich logic remove kr do , bs o mockup me neck di gyi he , usi ko adjust kr do"
response_text: "Sleeve bottom 1-inch margin was already removed in PHR 014 (mBottom=0 covers front/back/sleeve). Removed the entire Color Sensing Sandwich block for neck (the code that sampled top/second colors from the mockup design, built three stacked rectangles over the panel, and deleted the real design). Neck now flows through the same path as every other part: the mockup's neck design is duplicated and alignAndScale fits it onto the neck panel. In alignAndScale, isNeck now zeroes all four margins (top/sides/bottom) so the neck strip prints edge-to-edge, matching the old sandwich's full-coverage intent; the existing clipping mask trims any bleed overflow."
outcome: success
evaluation: implemented-pending-user-print-test
---
