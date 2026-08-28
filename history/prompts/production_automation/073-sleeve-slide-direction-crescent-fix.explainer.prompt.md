---
id: 073
title: Sleeve slide direction crescent fix
stage: explainer
date: 2026-07-18
surface: agent
model: claude-fable-5
feature: production_automation
branch: main
user: zija9452
command: none
labels: ["sleeve-match", "debugging", "bleed", "mockup-design"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - Backend/scripts/automate_production.jsx (inspected only)
tests:
  - COM inspection of mockup.ai sleeve groups (bounds/bleed verification)
---

## Prompt

is k pas sense nhi he k niche nhi uper krna tha design ya sirf nicke krne ki hi
logic lgi he ?? kia krna he ye btao

## Response

Direction logic dono taraf kaam karti he - move vector dynamically compute hota
he (boundary point E se target point T tak, seam ke sath). Neeche is liye gaya
kyunki mockup me sleeve ki MATCH_black boundary corner se 165.8mm pr thi jabke
body ki 153.2mm pr - 12.6mm design mismatch; slide 15.6mm along seam.

Top ka crescent is liye khula: V ke corners pr bleed 51mm he (user sahi tha,
bleed maujood he) lekin V ka TOP CENTER sleeve cap ke curve ke sath chipka hua
he - wahan bleed ~0. Slide down hone se sirf apex ka chand-numa hissa khula.

Fix bataya: (1) mockup me MATCH_black ka top flat/uncha kar den (center anchors
ko corners tak ya 20-25mm aur upar) - clip mask extra kaat deta he, mockup me
farq nahi ayega; (2) optionally sleeve V ko sahi D pr banayen to slide ~0;
(3) offer: post-slide coverage safety check (revert + warning) code me.
