---
id: 015
title: Fit longer replaced text to mockup width
stage: green
date_iso: 2026-07-07
surface: agent
model: claude-fable-5
feature: production_automation
branch: main
user: zija-yaseen
command: implement
labels: [text-overflow, uniform-scaling, personalization, centering, illustrator]
links: null
files_yaml:
 - Backend/scripts/automate_production.jsx (modified)
tests_yaml:
 - none (manual verification: order with a 3-digit number where mockup shows 2 digits)
prompt_text: "yr agr 66 ki jga 666 aye ga , to is ki width or height dono hi barhe gi ?? to agr sirf width km kren ge to stretch lge ga jo k kharab he or agr height km kren ge to or kharabn lge ga , to dono adjust hon na , k perfect lge , ye kese kren ge ??"
response_text: "Clarified: 666 does NOT grow in height (point size is preserved) — only width grows 1.5x. Agreed with user's instinct: on overflow, scale width AND height together (uniform) so letter shapes stay perfect, never condense or stretch one axis. User confirmed via questions: width limit = the width the original mockup text occupied (not panel width), and replaced text must sit on the mockup text's center. Implemented in replaceInContainer: capture visibleBounds of the original text before replacement; after contents + style reapply, if new width exceeds original width, tf.resize(k,k) uniformly to fit; then always re-center the frame on the original text's center (handles left-aligned frames growing sideways). Runs pre-alignAndScale, so the mockup-space fit carries through the later panel scaling and PERS_TEXT height normalization from PHR 014."
outcome: success
evaluation: implemented-pending-user-print-test
---
