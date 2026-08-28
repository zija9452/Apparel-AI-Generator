---
id: 030
title: Relax text fit width allowance
stage: green
date: 2026-07-08
surface: agent
model: claude-fable-5
feature: production_automation
branch: main
user: zija9452
command: none
labels: ["illustrator", "personalization", "text", "shrink", "fit-width"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - Backend/scripts/automate_production.jsx
tests:
  - node --check on JSX copy (syntax OK)
  - Real personalized job run PENDING (acceptance: 2-digit number ~full height when placeholder is 1 digit)
---

## Prompt

Jo text and number tm porpotinally small kr rhe personalization k , wo kch zyada hi small ho rhe hen q ??  kia size he kia ho rha he , pan discuss kro , short me samjhao,.

Follow-ups (verbatim):
- "pehle btao to k abhi kiia ho rha he shrink kese ho rha he"
- "agr mockup me 1 digit he , or hm do digits den ge order me to 1 digit k according width aye gi 2 digits ki , jb k ye bht choty ho jaye ge 2 digits . to aesa kren na k 0.5 brha do bs normal mockup se , agr is kisam ka aye to , ya kia krna chahiye k visually to thk lge , na zyada chota na zyada bara"

## Edge-case decisions (user-confirmed via AskUserQuestion)

1. Shrink rule: "Kabhi shrink na ho" pehle chuna, phir clarify ke baad
   "Placeholder width ka 1.5x-2x allowance" select kiya.
2. Default allowance 1.5x (user ke words "0.5 brha do" ke mutabiq), single
   constant FIT_WIDTH_ALLOWANCE - baad me 2.0 karna one-line change.

## Root cause

Fit-to-mockup rule (PHR 015) replacement text ko placeholder ki APNI width
tak uniformly shrink karta tha. Placeholder 1 digit ho aur order me 2-3
digits aayen to text aadha/tihai reh jata tha (job 1397e67f log: '666' ->
51%, '29' -> 74%, '10' -> 90%). normalizePersonalizedText ka 105% adjustment
culprit nahi tha.

## Response

automate_production.jsx: FIT_WIDTH_ALLOWANCE = 1.5 introduced. Ab shrink
sirf tab jab new text placeholder width ke 1.5x se bhi wider ho, aur shrink
target 1.5x width hai (pehle 1.0x tha). Center/edge anchoring unchanged.
Example: '29' vs 1-digit placeholder (~2x wider) -> ab 75% (pehle ~50%);
'666' (~3x) -> 50% (pehle ~33%).
