---
id: 049
title: Debug Single Sleeve Name Order
stage: explainer
date: 2026-07-15
surface: agent
model: claude-fable-5
feature: production_automation
branch: main
user: zija9452
command: none
labels: ["debugging", "sleeves", "left-right", "mockup-naming", "word-order", "findAnywhere"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Backend/scripts/automate_production.jsx (inspected - findAnywhere/_buildNameIndex exact normalized match, pair list jsx:143-147)
 - Backend/uploads/*/renders/debug_log.txt (inspected - 4 jobs from 2026-07-15)
 - history/prompts/production_automation/029-front-size-tag-and-per-side-sleeves.green.prompt.md (reviewed per user request)
tests:
 - none (diagnosis only, no code changed per user instruction)
---

## Prompt

abhi number nhi , jo logic he use ehne do wese hi. bs mjhe btao k agr test print me right and left sleeve dun me alg alg to kia hoga , abhi ek hi sleve a rhi he, jb k mene do di hen test print me alg alg left anmd right , to ab ?? pehle to thk a rha tha or nam bhi a rha tha sleeve k label pr to

Follow-up (verbatim): "or debug k sath APHR bhi dekh lena , k pehle kia krwaya tha"

## Response snapshot

Reviewed PHR 029 (2026-07-08: per-side sleeve expansion + tag rename implemented; decision:
single mockup sleeve design = one generic print) and the debug logs of all four 2026-07-15
jobs. Timeline:

- 12:55 job 3b44fa63: pairing NOT detected -> one generic sleeve, source matched
  "Short Sleeve Left" (single print, Left design). This is the user's "ek hi sleeve".
- 15:12 ff022588 / 15:14 10b461a9: pairing detected and expanded correctly, but the
  PATTERN file had no "Medium Short Sleeve" panel -> CRITICAL skip, no sleeves at all.
- 15:20 8c7763c4: fully working - Right+Left both rendered (JPGs verified in renders/),
  tags "Medium Short Sleeve Right/Left".

Root cause of the 12:55 single sleeve: findAnywhere matches EXACT normalized names
(lowercase, alphanumerics only), so WORD ORDER matters. Supported pairs (jsx:143-147):
"Short Sleeve Right/Left", "Long Sleeve Right/Left", "Right/Left Sleeve", "Sleeve
Right/Left". A group named "Right Short Sleeve" (the order the user typed) normalizes to
"rightshortsleeve" which matches nothing -> pair check fails -> PHR-029 fallback (one
generic print). The Left group's correct name explains why the single print carried the
Left design.

No code changed (user explicitly said leave the logic as is). Guidance: designers must
name sleeve groups in the supported word order; adding reversed-order aliases to the pair
list is a ~2-line future option.

## Outcome

- ✅ Impact: User knows the latest job already works, why the earlier job printed one sleeve (name word order), and why two mid-day jobs had no sleeves (pattern file missing the panel).
- 🧪 Tests: none (read-only diagnosis)
- 📁 Files: none modified
- 🔁 Next prompts: optionally add reversed word-order aliases ("Right Short Sleeve") to the JSX pair list; Phase 2 mockup scan would surface such naming issues before render
- 🧠 Reflection: This exact failure (placeholder/group naming mismatch discovered after a full render) is the strongest argument yet for the Phase 2 upload-time mockup scan + preflight report.

## Evaluation notes (flywheel)

- Failure modes observed: mockup group name word-order mismatch silently degrades to single-sleeve fallback; missing pattern panel skips the part with only a log line
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): reversed-order alias pairs in mockupHasBothSleeveSides
