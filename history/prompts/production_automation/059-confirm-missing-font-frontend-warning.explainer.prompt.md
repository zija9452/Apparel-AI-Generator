---
id: 059
title: Confirm Missing Font Frontend Warning
stage: explainer
date: 2026-07-16
surface: agent
model: claude-fable-5
feature: production_automation
branch: main
user: zija9452
command: none
labels: ["fonts", "font_missing", "status.json", "frontend-warning", "pause-resume", "explainer"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Backend/scripts/automate_production.jsx (inspected - font pre-flight jsx:37-82)
 - Backend/services/illustrator_automation.py (inspected - install_job_fonts:116, pause handling:384-392)
 - Backend/main.py (inspected - resume actions:380-381)
 - Frontend/my-app/components/ProductionPlan.tsx (inspected - warning UI:76-108)
tests:
 - none (verification of existing behavior only)
---

## Prompt

ok , or agr font missing aye to wo hmy fronten pr btaye ga nhi kia ?? btana chahiye na ye font ki warning a rhi he , ye logic to he hi to ?

## Response snapshot

Confirmed the missing-font warning pipeline already exists end-to-end (PHR 011/012/017 work):

1. Backend pre-step: install_job_fonts() auto-installs fonts uploaded in the job's
   'Document Fonts' folder as per-user Windows fonts; Illustrator restarts if new
   fonts were installed (illustrator_automation.py:116-234).
2. JSX pre-flight (automate_production.jsx:37-82): scans every text frame in the
   MOCKUP, checks each font via app.textFonts.getByName, and on any miss writes
   status.json with font_missing:true + missing_fonts:[...] + message "Missing
   fonts detected - automation paused", then stops before rendering anything.
3. Python sees font_missing in status.json and leaves it in place for the frontend
   (illustrator_automation.py:384-392).
4. Frontend ProductionPlan.tsx:79-108 polls status and renders an amber box
   "⚠️ Missing Fonts — Automation Paused" listing each missing font, with two
   buttons: "Run Again" (action=retry -> force_font_refresh, restarts Illustrator
   to pick up fonts the user just installed) and "Continue with default font
   anyway" (action=continue -> ignoreMissingFonts=true skips the check).
   main.py:380-381 wires both actions.

Caveat noted to user: the pre-flight scans only the mockup document's text.
A font used only in the PATTERN file's own text would not trigger the warning.

## Outcome

- ✅ Impact: User reassured the warning reaches the frontend with font names and pause/resume controls; no code change needed.
- 🧪 Tests: none (read-only)
