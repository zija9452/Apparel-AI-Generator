---
id: 186
title: Youth Adult Dual Pattern Files
stage: plan
date: 2026-09-14
surface: agent
model: claude-opus-5
feature: production_automation
branch: main
user: zija9452
command: (conversation)
labels: ["pattern-files", "youth-adult", "792pt", "upload-form", "pre-flight"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - (none yet - design only)
tests:
 - (none yet - design only)
---

## Prompt

explore my whole project , and the problem is that pattern files adult ki ai file pattern alg hoti hen or youth ki alg or hmare pas bs ek hi pattern file dene ka option he , or pattern cache kr lete hen order bnane se pehle ta k 792pt error na aye , to ab mjhe pattern file bhi deni he , to kese dun ? or mention bhi ho k kidhr youth ki or idhr adult ki ?? ya system khud kese check kre ga , or kese youth and adult handle hon ge , abhi aesa ho rha he k pehle adult bnta he phr youth ,,

(follow-up) and optional na rhe youth , kbhi asahota he k adult nhi hota to youth hota he bs

## Response snapshot

### Current state found by exploration

- ONE pattern document only, and it is Illustrator's ACTIVE document:
  `illustrator_automation.py:1706` does `app.Open(abs_pattern_path)`, then
  `automate_production.jsx:10` takes `var patternDoc = app.activeDocument;`.
- Every pattern lookup is hard-coded to that one doc: `findPatternPanel`
  (`:11474`), accessories (`:11463`), sleeve length probe (`:4527-4531`),
  full-button Back (`:4354`), Pocket (`:12348`), Hood (`:12924`), Border
  (`:12943`).
- The 792pt guard: `prebuildPatternSizes()` + `prebuildFullButtonScales()` at
  `:219-220` run BEFORE `app.documents.add()` at `:223`. Any pattern bounds read
  after the order document exists shifts coordinates by 792pt.
- The name index is PER DOCUMENT, keyed by the container object
  (`_nameIndexes` = `{c, x}`, `:4857`), so a second pattern document gets its own
  index for free - but it must be warmed with `warmNameIndex()` while it is the
  active document (`:156`), or every read costs ~125ms instead of ~0.02ms.
- Youth/adult is ALREADY distinguished in the plan: `getFriendlySize` (`:11328`)
  keeps `YM`/`2T` as-is and turns adult codes into `Small`/`Medium`/`Large`.
  Youth pattern files name their pieces with youth codes (`YM Front`, `YL Front`
  - see `:2578`).
- Export folders do not collide: `sizeFolderCode` (`:11029`) yields `YS/` vs `S/`.
- `_size_rank` (`Backend/main.py:359`) already ranks youth 0 and adult 1, so
  youth sorts first. The observed "adult first, then youth" is not the sort - it
  is because youth is run as a SEPARATE JOB today (`RELEASE.md:196` names job
  `Strictly_Molokai_Brown_Jersey_Order_Youth-3`).

### Decisions taken with the architect

1. Mockup: ONE test print serves both youth and adult. Only the pattern file is
   doubled.
2. Toddler sizes (1T-10T) route to the YOUTH pattern file.
3. Accessories / the Universal group (Placket, Twill Tape, Tukdi - no size
   prefix in their names): look in the adult file first, fall back to the youth
   file. "Whichever file has it."
4. Size order stays youth-first (no `_size_rank` change).
5. Youth is NOT an optional extra on top of a required adult file. Both fields
   are individually optional and AT LEAST ONE is required - an order can be
   youth-only, adult-only, or mixed. Which files are actually required is
   derived from the sizes in the plan.

### Design

- Explicit second upload field, not content sniffing. Routing is by size code
  (`Y*` / `^[0-9]+T$` -> youth, everything else -> adult). A file dropped in the
  wrong slot is already caught by the existing pattern-piece pre-flight
  (`_find_missing_pattern_pieces`, `illustrator_automation.py:986`), which pauses
  the job and names the missing panels.
- Frontend (`UploadForm.tsx`): `pattern_ai` -> "Adult Pattern",
  new `pattern_youth_ai` -> "Youth Pattern"; neither HTML-required. After
  `/plan` returns (`:441`) and BEFORE the 135MB step-2 upload (`:447`), derive
  needsAdult/needsYouth from `plan.production_groups[].size` and `fail()` with a
  phrased error if a needed file was not picked. Add `pattern_youth_ai` to
  `FIELD_LABELS` (`:219`) so the staleness check can name it.
- `Agent/main.py:487` and `Backend/main.py:1203`: both pattern fields optional,
  validated against the plan's sizes, saved as `pattern.ai` / `pattern_youth.ai`,
  both paths passed through. Both resume paths pass whichever files exist (same
  shape as `logo_library_path`).
- `illustrator_automation.py`: add `pattern_youth_ai_path=None`; add
  `_is_youth_size()`; split the pre-flights so each size group is checked against
  its own file, with accessories satisfied by either.
- JSX: Python opens the adult file (or the youth file when that is the only one),
  so `patternDoc = app.activeDocument` keeps working. Two new script args -
  `patternYouthPath` and `patternIsYouthOnly` - let the JSX resolve roles, open
  the second file right after `warmNameIndex(patternDoc, "pattern")` at `:156`
  and warm it there. New `patternDocFor(sizeLabel)` replaces every
  `findAnywhere(patternDoc, ...)` call site. Both files are opened, warmed and
  pre-measured before `documents.add()` at `:223`, so the 792pt rule holds
  unchanged.

### Risks flagged

- Two ~135MB pattern docs plus the mockup plus the order doc open at once raises
  memory and therefore PARM risk. Mitigation available: per chunk, open only the
  pattern file(s) the remaining sizes need - sizes are sorted youth-first and
  `split_per_size` aligns chunk boundaries with sizes, so most chunks need one
  file only.
- The chunk loop re-runs everything above the size loop, so both patterns re-open
  on every chunk.
- Each of `_find_missing_pattern_pieces` and `_pattern_has_hoodie_objects` opens
  and closes a pattern file; two files means two extra open/close cycles per
  pre-flight.

## Outcome

- ✅ Impact: design agreed for dual (adult + youth) pattern files in one job, replacing today's two-separate-jobs workflow. No code written yet.
- 🧪 Tests: none yet - design only.
- 📁 Files: none modified yet. Touch list: `Frontend/my-app/components/UploadForm.tsx`, `Agent/main.py`, `Backend/main.py`, `Backend/services/illustrator_automation.py`, `Backend/scripts/automate_production.jsx`.
- 🔁 Next prompts: implement the five-part change; then verify on a mixed youth+adult order that both size sets render from their own pattern file with no 792pt shift.
- 🧠 Reflection: the observed "adult first then youth" was a workflow artefact, not a sorting bug - `_size_rank` already put youth first. Checking that before proposing a sort change avoided a wrong fix.

## Evaluation notes (flywheel)

- Failure modes observed: initial framing assumed adult was mandatory and youth an optional add-on; the architect corrected that youth-only orders exist, which flipped the validation from "one required + one optional" to "both optional, at least one required, derived from the plan's sizes".
- Graders run and results (PASS/FAIL): n/a - no code produced.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): add the second upload field and the plan-derived validation only, with the JSX still using a single pattern doc, to confirm the upload/validation half in isolation before touching the render path.
