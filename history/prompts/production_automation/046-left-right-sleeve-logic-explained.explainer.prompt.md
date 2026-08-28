---
id: 046
title: Left Right Sleeve Logic Explained
stage: explainer
date: 2026-07-15
surface: agent
model: claude-fable-5
feature: production_automation
branch: main
user: zija9452
command: none
labels: ["sleeves", "left-right", "per-side-personalization", "mockup-expansion", "excel-columns"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Backend/scripts/automate_production.jsx (inspected - lines 136-172 sleeve expansion, 198-199 part mapping, 1391-1397 getSourceView)
tests:
 - none (explainer only, no code changed)
---

## Prompt

or jese abhi logic he k sleeve alg alg , jese left alg or right alg to ?? is ka kese ??

## Response snapshot

Explained the two distinct "different sleeves" cases against the current code:

1. Different DESIGN per side — already works today. mockupHasBothSleeveSides()
   (jsx:141-172) detects paired Left/Right sleeve groups in the mockup and auto-expands
   a generic sleeve item into a Right + Left pair; each side pulls its own mockup design,
   quantity splits in half, tags read "Medium Short Sleeve Right". Nothing needed in Excel.

2. Different TEXT per side (per-player left vs right name/number) — NOT supported today:
   the expansion clones the same text_replacements onto both sides (jsx:165).

How it fits the standard (Phase 1): no sleeve column = design only; "Sleeve Number" =
same number both sides; "Left Sleeve Number" / "Right Sleeve Number" = per-side values.
Plan builder will emit sleeve-left / sleeve-right items with their own replacements —
the JSX already understands those part names (jsx:198-199 mapping, getSourceView
left/right targets), so the remaining work is the Excel parser and plan builder.

This also answers edge case #1 from PHR 043: support BOTH patterns (shared Sleeve Number
and per-side columns).

## Outcome

- ✅ Impact: User understands design-level left/right is already automatic via mockup groups; text-level left/right is a Phase 1 parser/plan-builder task with the JSX side mostly ready.
- 🧪 Tests: none (no code changed)
- 📁 Files: none modified; JSX inspected
- 🔁 Next prompts: remaining edge cases (logo per-player? Excel-vs-form conflict? plain column on two parts?); then Phase 1 implementation
- 🧠 Reflection: The sleeve expansion cloning replacements to both sides is exactly the seam where per-side text support will plug in.

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): emit sleeve-left/sleeve-right items from the plan builder and skip JSX auto-expansion when sides are already explicit
