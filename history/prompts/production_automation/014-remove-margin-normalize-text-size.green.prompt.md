---
id: 014
title: Remove bottom margin and normalize text size
stage: green
date_iso: 2026-07-07
surface: agent
model: claude-fable-5
feature: production_automation
branch: main
user: zija-yaseen
command: implement
labels: [margin, scaling, text-size, personalization, alignAndScale, illustrator]
links: null
files_yaml:
 - Backend/scripts/automate_production.jsx (modified)
tests_yaml:
 - none (manual verification: regenerate an order and compare personalized text size against mockup)
prompt_text: "jersey front and back and sleeve pr jo 1 inch ka ka margin tha , khatam, kr do use , ab margin na ho , or mene mockup file di , jo k perfect thi , lekin automation k wakt us ne text and number kafi baray kr diye jo k personaluized the , how i resolve this??? k test print wo mere order file me perfect aye , mtlb dekhe k zyada bara ho rha he to khud ko adjust kr le ?? koi sense?? or jo edge caces hon unhen khud se assume na krna , blke puch lena"
response_text: "Root cause: alignAndScale stretches the whole mockup design non-uniformly (independent width/height ratios) to fill the pattern panel, which distorts/enlarges personalized names and numbers; the 1-inch bottom margin lived in the same function. User confirmed via clarifying questions: (1) bottom margin = zero for front/back/sleeve, (2) text size should keep the mockup proportion (scales with garment size), (3) correction applies only to personalized text frames from text_replacements. Implemented: mBottom changed from 25.4mm to 0; alignAndScale now returns its applied width/height scale percentages; replaceInContainer tags each replaced TextFrame with note='PERS_TEXT'; new normalizePersonalizedText() runs after both alignAndScale call sites and resizes tagged frames' height by sw/sh (center-anchored), forcing a uniform width-based scale so text-to-garment ratio matches the mockup exactly, undistorted."
outcome: success
evaluation: implemented-pending-user-print-test
---
