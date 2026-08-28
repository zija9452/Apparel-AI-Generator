---
id: 2
title: Font loading analysis for Illustrator
stage: general
date_iso: 2026-07-04
surface: agent
model: claude-fable-5
feature: none
branch: main
user: zija-yaseen
command: explain
labels: [fonts, illustrator, backend, automation]
links: null
files_yaml:
 - Backend/main.py (inspected)
 - Backend/services/illustrator_automation.py (inspected)
 - Backend/scripts/automate_production.jsx (inspected)
 - Frontend/my-app/components/UploadForm.tsx (inspected)
tests_yaml:
 - none
prompt_text: "explore my project and is me fonts install nhi hen pc me , jo us test print me hen , to ab hm ne frontend se fonts ki files di hem to wo load kr leta he ?? or adobe illustrator me thk fonts load ho jaty hen ?"
response_text: "No — current flow does NOT load the uploaded fonts into Illustrator. Backend saves fonts to a 'Document Fonts' folder (Backend/main.py:148-157), but auto-loading fonts from a 'Document Fonts' folder is an InDesign-only feature; Illustrator ignores it. Illustrator only sees Windows-installed fonts, C:\\Program Files\\Common Files\\Adobe\\Fonts, and Adobe Fonts. Additionally UserInteractionLevel = -1 suppresses the missing-font dialog, so Illustrator silently substitutes fonts (why test prints show wrong fonts). Fix: install uploaded fonts into Windows (per-user: %LOCALAPPDATA%\\Microsoft\\Windows\\Fonts + HKCU registry + WM_FONTCHANGE broadcast) in run_illustrator_automation before opening the document."
outcome: success
evaluation: explained-no-code-change
---
