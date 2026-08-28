---
id: 066
title: What did reference file do
stage: explainer
date: 2026-07-18
surface: agent
model: claude-fable-5
feature: production_automation
branch: main
user: zija9452
command: none
labels: ["reference-file", "artboard-spacing", "explainer"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - Backend/main.py
  - Backend/services/illustrator_automation.py
  - Backend/scripts/automate_production.jsx
tests:
  - none (read-only explanation)
---

## Prompt

to pehle refernce file kia kam krti thi ?

## Response

Reference Output (.ai) ka pipeline me sirf EK functional kaam tha: artboard spacing
naapna. Flow: UploadForm (required) -> main.py saves reference.ai -> path JSX ko
`referencePath` ke tor pr pass hota -> JSX use kholta, pehle 2 artboards ka gap
naapta, wohi spacing use karta, file band. Na LLM ko jati thi, na design/color/layout
me aur kahin use hoti thi. 5mm fix hone ke baad ye file ab kuch nahi karti — form me
ab bhi required he; optional/remove karna pending decision.
