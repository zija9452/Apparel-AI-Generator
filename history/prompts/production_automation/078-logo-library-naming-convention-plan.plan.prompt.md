---
id: 078
title: Logo library naming convention plan
stage: plan
date: 2026-07-20
surface: agent
model: claude-fable-5
feature: production_automation
branch: main
user: zija9452
command: none
labels: ["logo-library", "personalization", "naming-convention", "planning"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - none (planning only; inspected Backend/scripts/automate_production.jsx, Backend/main.py, Backend/services/excel_service.py, Frontend/my-app/components/UploadForm.tsx, Frontend/my-app/app/order-guide/page.tsx)
tests:
 - none
---

## Prompt

EXPLORE My whole project, and us me ab logos disfferent ja rhe hen , to hm ek ai file de den , jis me mein logos k nam rkh dun , or kese pta cdhle ga k ye logo i pr ja ye ga ?

[Follow-up, after AskUserQuestion was rejected] logo hon ge , excel me nam de den ge front/back ya right/left sleeve logo , then excel me parser aye ga , k red logo , green logo , then frotend pr jese abhi check he , wo aye ga ,. agr check hua tick to .ai fil;e upload krne ka option aye , whn saray logos hon ge then jese front k name number change hon ge jahn front logo ho jo bh excel me col ka name he to us ki jga personalized logo a jayen , ye logic sirf un pr xchle jin pr tick check hua ho , jese side sleeve matching me ho rha he

## Response snapshot

Explored the whole repo to explain why logos currently come out wrong/fixed: mockups bake one logo directly into the design; automate_production.jsx only special-cases anything named "logo" for z-order (bringLogosToFront, jsx:2593) and detection-exclusion (jsx:1373, 1706, 2235) — it never swaps logo artwork. main.py's LLM prompt (line 110) and excel_service.py's generic column parser (line 31, comment already lists "Back Logo" as a supported "<Part> <Field>" column) recognize a LOGO field, but applyTextReplacements (jsx:2332) only implements NAME/NUMBER — LOGO replacements silently do nothing. A prior attachLooseLogos feature (jsx:2609) exists but its call is commented out (jsx:302).

Confirmed feasibility: a named-logo library .ai file is exactly the same pattern already proven for colors (Excel color name -> matched "Official" swatch by string, correction.txt:374-408) and part lookup (findAnywhere/getByName). Proposed AskUserQuestion (library reuse model, Excel column granularity, placement source) was rejected by the user, who instead specified the full design directly:
1. Excel gets part-scoped Logo columns (Front Logo, Back Logo, Right/Left Sleeve Logo) — already structurally supported by the generic column parser.
2. Cell values are the logo's name (e.g. "Red Logo", "Green Logo") = the lookup key.
3. Frontend gets a new checkbox (mirroring match_sleeve_to_side) that, when ticked, reveals a new "Logo Library (.ai)" file upload containing all named logo groups.
4. JSX replaces the mockup's existing per-part logo placeholder (same footprint-preserving approach already used for NAME/NUMBER, jsx:2368) with the matching named group copied from the library file.
5. Gated per-part by whichever parts actually have a LOGO value from Excel — deterministic, no LLM, same checkbox-gated/skip+warn pattern as side-sleeve matching.

Design confirmed back to user as fully specified and low-risk (reuses established patterns); asked whether to proceed with implementation now.

## Outcome

- Impact: User has a concrete, precedented plan for logo-library personalization; root cause of current wrong/fixed-logo behavior identified (LOGO field recognized upstream but never executed in JSX).
- Tests: none
- Files: none changed (planning only)
- Next prompts: User to confirm go-ahead to implement: UploadForm.tsx (checkbox + conditional logo_library_ai file input) -> main.py (accept/pass file) -> automate_production.jsx (new LOGO graphic-swap routine parallel to NAME/NUMBER, footprint-preserving, skip+warn on name-miss).
- Reflection: User preferred specifying the full design directly over answering a structured multi-question prompt — for this project, presenting the current-state findings and letting the user dictate the exact mechanism (then reflecting it back for confirmation) works better than front-loading multiple-choice questions.

## Evaluation notes (flywheel)

- Failure modes observed: AskUserQuestion tool use was rejected by user; recovered by answering in free text instead, which the user then used to state the full design unprompted.
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): On confirmation, start with the frontend checkbox + conditional file input (smallest, most visible piece), then main.py passthrough, then the JSX LOGO-swap routine last.
