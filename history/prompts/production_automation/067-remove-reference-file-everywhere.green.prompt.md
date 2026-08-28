---
id: 067
title: Remove reference file everywhere
stage: green
date: 2026-07-18
surface: agent
model: claude-fable-5
feature: production_automation
branch: main
user: zija9452
command: none
labels: ["reference-file", "upload-form", "cleanup"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - Frontend/my-app/components/UploadForm.tsx
  - Backend/main.py
tests:
  - py_compile on Backend/main.py (passed)
---

## Prompt

to hta do frontend e bhi

## Response

Reference Output (.ai) poori pipeline se hata di (5mm fixed spacing ke baad iska
koi kaam nahi bacha tha):

- UploadForm.tsx: "Reference Output (.ai)" file field remove.
- main.py /jobs/upload: `reference_ai` param, reference.ai save, aur
  run_illustrator_automation ko reference_path pass karna — sab remove.
- main.py /jobs/resume: reference.ai lookup remove.
- illustrator_automation.py untouched: `reference_ai_path=None` default pehle se
  handle he (JSX me `var referencePath = undefined;` inject hota he, jo ab kahin
  use nahi hota).
- Purane jobs ke resume pr koi asar nahi.
