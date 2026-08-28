---
id: 074
title: Accessory checkboxes placket twill tukdi
stage: green
date: 2026-07-18
surface: agent
model: claude-fable-5
feature: production_automation
branch: main
user: zija9452
command: none
labels: ["accessories", "placket", "twill-tape", "tukdi", "checkbox", "frontend", "plan-enforcement"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - Frontend/my-app/components/UploadForm.tsx
  - Backend/main.py
  - Backend/scripts/automate_production.jsx
tests:
  - node --check parse of automate_production.jsx (passed)
  - py_compile of Backend/main.py via Backend/.venv (passed)
  - runtime verification pending: upload with checkboxes on/off
---

## Prompt

acha , frontend me ye checkbox bhi rkho usse uper k , Plakit he ? or twill
tape ? Tukdi ?? agr check in ho to illustrator and json plan me rkho or find
kro. wrna nhi

## Response

Clarified via questions: Placket = Universal accessory (once per order, pattern
group 'Placket'); tino accessories pr mockup se DESIGN bhi paste hona chahiye
(sirf color detection nahi).

Frontend: 'Extra parts' box (Placket / Twill Tape / Tukdi checkboxes) sleeve-
match checkbox ke UPER add kiya; fields include_placket / include_twill_tape /
include_tukdi.

Backend main.py: accessories ab checkbox-driven, LLM se nahi - agent
instruction #3 ko 'do NOT include accessories' kiya; naya _enforce_accessories()
LLM ke banaye accessory items strip karta he aur checked parts ko ek 'Universal'
group (qty 1, no text_replacements) me append karta he. Unchecked = plan me
bilkul nahi.

JSX: partMap me 'placket'->'Placket'; isAccessory() me placket; getSourceView()
ab accessories ke liye unke apne mockup groups (Placket/Twill Tape/Tukdi)
dhoondta he (logo fallback ke baghair); design mile to accessories bhi full
design pipeline se guzarte hen (paste, base fill, clip), na mile to purana
color-detection fallback chalta he.
