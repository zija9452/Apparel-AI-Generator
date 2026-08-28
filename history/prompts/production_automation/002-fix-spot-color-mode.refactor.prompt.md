id: 002
title: Fix Spot Color Mode in Swatches
stage: refactor
date_iso: 2026-06-20
surface: agent
model: gemini-3.1-flash-lite
feature: production_automation
branch: main
user: user
command: N/A
labels:
  - color-management
  - extendscript
  - bugfix
files_yaml:
  - Backend/scripts/automate_production.jsx
prompt_text: |
  User reported that swatches still show as RGB in the Swatches panel even after color conversion.
  Updated the `anyToCmyk` helper function to explicitly force the spot color's base color definition to CMYK, ensuring the Swatches panel reflects the correct color mode.
response_text: |
  Updated `anyToCmyk` in `Backend/scripts/automate_production.jsx` to correctly force-cast Spot Color base definitions to CMYK.
