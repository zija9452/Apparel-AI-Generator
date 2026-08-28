---
id: 076
title: Apex bleed coverage warning
stage: green
date: 2026-07-18
surface: agent
model: claude-fable-5
feature: production_automation
branch: main
user: zija9452
command: none
labels: ["sleeve-match", "bleed", "warning", "safety-check"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - Backend/scripts/automate_production.jsx
tests:
  - node --check parse (passed)
  - runtime verification pending: job with no-bleed V design should emit apex warning
---

## Prompt

"D:\...\780aa058-...\renders\3XL_Short_Sleeve_Right_Item1.jpg" , is me dekho ,
kesa resize hua he , k shape uper s eempty hua he .

## Response

Log se confirm kiya: is job me RESIZE hua hi nahi (log: "moved 15.9mm in 2
step(s)", koi resize line nahi). Ye purana bleed masla he: V design ki
MATCH_black ka top center cap ke curve ke sath chipka he (bleed 0), aur design
mockup me 12.6mm ghalat D par bana he (165.8 vs body 153.2), to sahi matching
ke liye 15.9mm neeche slide hui aur apex ke pass white khula. Fix mockup-side
he: MATCH_black ka top kinara center me bhi upar/flat karen (~20-25mm bleed);
clip mask extra kaat deta he.

Script me safety add ki (smApplyNamedMatch): move se PEHLE check hota he k cap
ka apex point design se covered tha ya nahi; agar pehle covered tha aur
successful match ke BAAD uncovered ho gaya to sleeve_match_warnings me saaf
message jata he ("no bleed above the cap - extend its top edge upward in the
mockup"). Geometry ko ye check nahi chherta - sirf report karta he.
