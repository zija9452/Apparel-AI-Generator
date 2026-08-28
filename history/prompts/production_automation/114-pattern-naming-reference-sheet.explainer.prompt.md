---
id: 114
title: Pattern naming reference sheet
stage: explainer
date: 2026-08-17
surface: agent
model: claude-opus-5
feature: production_automation
branch: main
user: zija9452
command: chat
labels: ["naming", "pattern-file", "documentation", "excel", "size-tags", "rib-cuff", "reference"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Backend/scripts/docs/Pattern_Naming_Reference.xlsx
 - Backend/scripts/docs/Mockup_Naming_Reference.xlsx
tests:
 - both workbooks re-opened with openpyxl; pattern book = 5 sheets (18 name rows, 15 size rows, 9 tag rows, 5 inside rows), mockup book = 49 master rows after the rib/cuff addition
---

## Prompt

or patterns k kia nam hen ?? us k nam bhi btao pehle idhrr

(follow-up) Match sleeve bottom line to test print / Keeps the rib/cuff line's distance from the sleeve bottom and its height the same as the test print (mockup), instead of a fixed size. Leave unchecked to let it scale normally with the rest of the design. is ka koi anm nh dety is k liye ?

(follow-up) ok , pattern ki bhi excel file bna do , jo nam diye the tm ne

## Response snapshot

Pattern-side names, read out of `findAnywhere(patternDoc, ...)` call sites,
`getFriendlySize`, `RENAME_SIZE_WORDS`/`SIZE_ALIAS_GROUPS`, `isAccessory` and
`findPlacementPath`. The rule is the inverse of the mockup's: **`{Size} Part`**,
size as a prefix, e.g. `Small Front`, `XL Pocket`, `2XL Right Hood`.

Delivered `Backend/scripts/docs/Pattern_Naming_Reference.xlsx`, 5 sheets:
Read Me · Pattern Names (18 rows: body panels, Full Button, Hoodie, Universal
accessories) · Size Prefixes (order code → prefix word, incl. youth and the
adult A-prefix) · Size Tag Words (global list vs per-size single-letter aliases)
· Inside a Piece.

Three things worth recording:

1. **Accessories carry NO size prefix** - `Placket`, `Twill Tape`, `Tukdi` are
   looked up bare. The comment at `automate_production.jsx:174` claiming Full
   Button makes Placket per-size is **stale**: `isAccessory()` includes "placket"
   unconditionally and `_enforce_accessories()` always emits one Universal group,
   so `targetGroupName` never gets a size. The per-size button strip is `Patti`.
2. **The pattern needs no `base-path`** - that name is mockup-only. The cut
   outline is chosen by LARGEST AREA (`findPlacementPath`), which is why an
   oversized guide rectangle inside a piece would be picked as the cut shape.
   Stroke width is irrelevant here too: the script pins it to 3pt itself.
3. **Size tags are matched on TEXT, not object name** - and single letters
   (`s`/`m`/`l`) are deliberately excluded from the global word list, accepted
   only for the size currently being processed. That scoping exists because Hood
   pieces carry a one-letter `"s"` tag.

Separately answered the rib/cuff question: **`preserve_sleeve_rib_distance` is the
only feature in the file that finds its target by GEOMETRY rather than by name**
(`collectBottomPaths`, `:930`) - width > 15% of panel, height < 150mm, top in the
bottom 25% - OR a name containing `rib` / `cuff` / `box`. Recommended naming it
anyway, for two reasons: the selected path is resized to the full panel width +
7mm each side, so a geometry false-positive gets smeared across the sleeve; and
when nothing matches there is **no warning at all** - `:942` only logs on success,
no pre-flight guards it. Added that row to the mockup workbook's Master List
(now 49 rows) plus a cross-reference between the two files.

## Outcome

- ✅ Impact: Both halves of the naming contract (mockup + pattern) are now
  documented artifacts instead of scattered code comments.
- 🧪 Tests: Both workbooks reloaded and asserted (sheet names, per-sheet row and
  column counts, example column spot-checked).
- 📁 Files: Pattern_Naming_Reference.xlsx (new), Mockup_Naming_Reference.xlsx (rib/cuff row + companion link)
- 🔁 Next prompts: Fix the stale Placket comment at automate_production.jsx:174,
  and consider logging a warning when PRESERVE_RIB_DISTANCE finds zero paths.
- 🧠 Reflection: The silent-no-match case is the same class of bug as PHR 111's
  Offset Path no-op - a feature that does nothing, says nothing, and is only
  visible by an ABSENT log line.

## Evaluation notes (flywheel)

- Failure modes observed: a stale code comment contradicting the code beside it
  (Placket per-size); a feature whose success is signalled only by a log line that
  is missing on failure; area-based selection that can silently pick the wrong path.
- Graders run and results (PASS/FAIL): PASS - reload check matched intended shape
  on both books.
- Prompt variant (if applicable): N/A
- Next experiment (smallest change to try): one-line `log()` in the `else` branch
  of `if (ribPaths.length > 0)` so a zero-match run is visible in debug_log.txt.
