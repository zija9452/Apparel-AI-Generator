---
id: 195
title: Docs Option Diagrams And Sync
stage: green
date: 2026-09-17
surface: agent
model: claude-opus-5
feature: production_automation
branch: main
user: zija9452
command: (direct request)
labels: ["docs", "frontend", "svg", "options", "hoodie", "rib-cuff"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Frontend/my-app/components/OptionDiagrams.tsx (new)
 - Frontend/my-app/app/docs/page.tsx
 - Frontend/my-app/components/UploadForm.tsx
 - Backend/main.py
tests:
 - npx tsc --noEmit (clean)
 - npx eslint components app (clean)
 - python ast.parse Backend/main.py (clean)
 - headless Edge screenshots of every diagram, reviewed
---

## Prompt

explore my whole project, and us me docs me jo jo articles hen , un ki images bhi lgani he hr opiton ki , ta k visiually clear ho k kia checkbox krta kia he ,

(follow-up mid-turn) neck contrast text ye to logic hi nhi he ab , jo he wo rkho , or jo bhi new he wo bhi add kro

(follow-up mid-turn) hooded jersey me bhi hota he rib & cuff to

(follow-up mid-turn) mtlb kia ?? hooded jersey me rib and cuff nhi hota ? short explain

(follow-up mid-turn) samjh nhi aya he mere , khud kese add hoga ? mtlb flow kia he?

## Response snapshot

Chose hand-drawn SVG over screenshots (user picked it): no assets in `public/`,
theme-aware through the CSS tokens, versioned with the code. Scope was kept to
docs chapter 06, also the user's choice.

**New `components/OptionDiagrams.tsx`** - one schematic per option, exported as
`OPTION_DIAGRAMS` keyed by the exact option name, rendered at the top of each
open accordion in `app/docs/page.tsx`. Every figure is the same shape: left half
is the job without the option, right half with it, plus a caption. Three visual
languages, picked per option: a jersey/panel geometry drawing for the seam and
scaling options, a piece-chip list for the options that change WHICH pieces get
built, and a four-cell wide figure for the armhole correction modes.

**Chapter 06 was out of sync with the form and the backend.** Fixed:

| Docs said | Reality |
|---|---|
| "Neck contrast text" | removed 2026-09-04 (`main.py:1102`), replaced by `mockup_neck_color` |
| nothing | `team_name_scale` - Team name keeps its width |
| nothing | `sleeve_match_mode` - the four armhole correction methods |
| nothing | `export_mode` - preview renders vs AI file only |

Also added a `team name` row to the chapter 04 mockup naming table.

**Found and fixed a real bug.** `main.py:1082` called
`_enforce_hoodie_rib_cuff(plan_dict, hoodie)` - deliberately not `any_hood`,
"per explicit instruction". But nothing else can put a `cuff` item in the plan:
the LLM is told not to invent accessory parts and no checkbox requests it. So a
Hoodie Jersey shipped with **no Rib & Cuff at all**, silently. The comment
claimed "the pattern piece is still reachable the normal way", which was not
true. The user confirmed a hooded jersey does carry one; changed to `any_hood`
and updated the docstring, the docs copy and the form copy to match.

## Outcome

- ✅ Impact: 19 options in chapter 06, each opening with a before/after diagram;
  the list now matches `job_options` in `main.py` exactly
- 🧪 Tests: tsc and eslint clean; `main.py` parses; every diagram rendered in
  headless Edge and reviewed, then the temporary preview route deleted
- 📁 Files: `OptionDiagrams.tsx` (new), `app/docs/page.tsx`,
  `components/UploadForm.tsx`, `Backend/main.py`
- 🔁 Next prompts: a Hoodie Jersey pattern file with no `{Size} Rib & Cuff`
  group will now PAUSE at preflight instead of silently skipping - Continue
  restores the old output, but it is worth checking the hoodie patterns first
- 🧠 Reflection: the diagram was what surfaced the bug. Drawing "what pieces
  come out" forced a decision on Rib & Cuff that the prose had been able to
  fudge for weeks

## Evaluation notes (flywheel)

- Failure modes observed: documentation describing a flag deleted 13 days
  earlier; a code comment asserting a fallback path that does not exist
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): when documenting options, diff the
  docs list against `job_options` in `main.py` first - it is the one declaration
  both endpoints share, so it cannot drift
