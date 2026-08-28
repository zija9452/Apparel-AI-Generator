id: 005
title: Force UI Refresh for CMYK Swatches
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
  - ui-refresh
files_yaml:
  - Backend/scripts/automate_production.jsx
prompt_text: |
  Implemented a workaround to force the Illustrator Swatches panel to refresh by temporarily renaming the swatch and setting its `colorType` to `ColorModel.PROCESS`. This forces the UI to correctly render the CMYK values defined in the swatch.
response_text: |
  Applied UI refresh hack (rename/restore) and switched to `ColorModel.PROCESS` to ensure Swatches panel shows correct CMYK mode.
