---
id: 196
title: Verify Layer Names From Code
stage: green
date: 2026-09-17
surface: agent
model: claude-opus-5
feature: production_automation
branch: main
user: zija9452
command: (direct request)
labels: ["docs", "naming", "verification", "pattern", "mockup", "illustrator"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Frontend/my-app/app/docs/page.tsx
tests:
 - npx tsc --noEmit (clean)
 - npx eslint app/docs/page.tsx components (clean)
 - rendered /docs fetched and every new string confirmed present
---

## Prompt

pattern layers name and mockup layers name ye bhi thk kr do code se dekh kr docs me  100% verified kr k

## Response snapshot

Read the name lookups out of `Backend/scripts/automate_production.jsx` and
rewrote chapters 02, 04 and 05 against them. Nothing in the docs is now claimed
that is not backed by a line of code.

**The lookup engine** - `findAnywhere` (jsx:~2830) keys on
`toLowerCase().replace(/[^a-z0-9]/g, "")`, so spacing, capitals and punctuation
really are ignored. Chapter 04's intro was already right about this.

**Corrections made:**

| Docs said | Code says | Where |
|---|---|---|
| one required "Master pattern" | TWO files, Adult + Youth, NEITHER required; size routes between them | `UploadForm.tsx:625-646`, `isYouthPatternSize` |
| Sleeve = Short/Long Sleeve | also `SS`, `LS`, `Full Sleeve`, `Sleeves`, and 8 per-side spellings | `getSourceView` 10068-10100 |
| Rib & Cuff: "Rib Cuff and Cuff also match" | six spellings, and on the PATTERN side `Cuff`/`Rib` are probed FIRST | `ribTargets` 10060, `partLabelAliases` 11613 |
| Front halves: Front Left / Front Right | `Left Front` / `Right Front` too | 10104-10105 |
| Outside Hood / Inside Hood | `Hood Outside` / `Hood Inside` too; children just need left/right as a SUBSTRING | 11695-11733 |
| size table "prefix MUST be" | every size is probed as `Adult X`, `AX`, every short code, `Youth X`, `Toddler n`, `n Months` | `sizeAliases` 11510-11561 |
| no toddler or infant sizes at all | `1T`-`10T` and `1M`-`12M` are first-class | `sizeCodes` 11418-11429 |
| "Any name starting with Match_" | prefix is `match`, so a bare `Match` counts | 8993 |
| side / shoulder: one word order | `left side` and `right side` work too, and both may be numbered | `SIDE_TAG` 5772, `SHOULDER_TAG` 6005 |
| Back Label | matches a name STARTING with it, and only SPACES are stripped, so `Back-Label` fails | `findBackLabelArt` |
| (absent) | a part that finds none of its own names FALLS BACK to a `LOGO` group - a misspelt `Back` renders the logo instead of failing | 10111 |
| (absent) | anything named `remove` is deleted - that is where on-mockup size tags go | 3729, 1523 |

Also confirmed unchanged and correct: `base-path` (plus `base_path`/`basepath`,
and only those three), `NAME`/`NUMBER`/`NUM`/`#`, `LOCAL TAG` + `SIZE`,
`rib`/`cuff`/`box`, `Center`, `Pattern`, `armhole match` + `unit N`, the four
side-seam name pairs, `teamname[0-9]*`, and the reserved
`design_clip_group` / `TAG-MASK` / `MOCK_`.

## Outcome

- ✅ Impact: chapters 04 and 05 now list every spelling the job actually accepts,
  and two silent-failure traps (the LOGO fallback, `Back-Label`) are documented
- 🧪 Tests: tsc and eslint clean; `/docs` fetched and every new string confirmed
  in the rendered HTML, including the pattern table's new third column
- 📁 Files: `Frontend/my-app/app/docs/page.tsx`
- 🔁 Next prompts: `public/Mockup_Naming_Reference.xlsx` and
  `Pattern_Naming_Reference.xlsx` are downloadable from chapter 02 and were
  written 2026-08-20 - they almost certainly carry the same gaps and nobody has
  checked them
- 🧠 Reflection: the LOGO fallback is the find that matters most - it converts
  every naming mistake from a loud failure into a plausible-looking wrong panel

## Evaluation notes (flywheel)

- Failure modes observed: docs written from the canonical name only, while the
  code had accumulated alias lists for a year; "must be" phrasing where the code
  probes a dozen spellings
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): pull the alias arrays out of the JSX
  into one table the docs page imports, so the two cannot drift again
