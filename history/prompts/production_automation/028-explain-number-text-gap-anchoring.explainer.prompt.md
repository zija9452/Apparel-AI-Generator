---
id: 028
title: Explain number text gap anchoring
stage: explainer
date: 2026-07-08
surface: agent
model: claude-fable-5
feature: production_automation
branch: main
user: zija9452
command: none
labels: ["illustrator", "personalization", "text", "alignment", "gap"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - Backend/scripts/automate_production.jsx (inspected only, no changes)
tests:
  - none (explanation only; real personalized job run still PENDING from PHR 027)
---

## Prompt

Ok , perfect personalized numbers ka scenario ye he k jb numbers zyada baray ho ajty hen to proportionally fix hota he size , ro wo abhi lkl fix size pr a rhe hen , lekin aese hota he k us number k uper koi text hota he us k fix margin pr hi number hota he to number porpotiionally fix krne se wo or niche chla jata he jisse uper zyada gap a jata he , lekin issue ye bhi he k hmy nhi pta k text kbhi niche hota he , or kbhi uper us number k , to text ko niche ki alignment note krni he ya uper ki , qk agr number k uper text ho to jitna gap he name and number me utna hi rhe , aese hi agr niche text ho to jitna niche wale name or number me gap he utna hi ho. Lekin hmy kese pta chle ga k niche he text ya uper ??? and how I fix this ??

## Response

Duplicate of the PHR 027 prompt (verbatim). Confirmed the fix from that
session is already present in Backend/scripts/automate_production.jsx:

- findVerticalNeighborSide (line ~1031): at replacement time, scans all
  other LIVE text frames in the design, keeps those overlapping the number
  horizontally, and picks the vertically nearest one -> "above"/"below"/null.
- Fit-to-mockup shrink (lines ~1364-1374): anchors TOP edge when text is
  above, BOTTOM edge when below, CENTER otherwise.
- normalizePersonalizedText (lines ~1012-1016): re-applies the same edge
  anchoring via tf.note (PERS_TEXT_ABOVE / PERS_TEXT_BELOW / PERS_TEXT)
  after the non-uniform stretch normalization.

Explained the detection mechanism to the user; acceptance test on a real
personalized job (3-digit number with name above) is still pending.
