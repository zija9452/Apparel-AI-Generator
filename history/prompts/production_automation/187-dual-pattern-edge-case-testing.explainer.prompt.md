---
id: 187
title: Dual Pattern Edge Case Testing
stage: explainer
date: 2026-09-14
surface: agent
model: claude-opus-5
feature: production_automation
branch: main
user: zija9452
command: (conversation)
labels: ["youth-adult", "pattern-files", "edge-cases", "size-rank", "toddler", "local-tag"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - (no project file modified - scratchpad only)
tests:
 - scratchpad/load_real.py (AST-slices the real helpers out of Backend without importing win32com/FastAPI)
 - scratchpad/test_youth_routing.py (59 size spellings through the real _friendly_size / _size_aliases / _size_rank)
 - scratchpad/test_preflight_split.py (mixed youth+adult plan through the real _expected_pattern_pieces + two simulated name indexes)
---

## Prompt

scratchpad me testing kr lo , koi edge case ? or code nhi change krna he ,

## Response snapshot

Tests were run against the project's OWN functions, AST-sliced out of
`Backend/services/illustrator_automation.py` and `Backend/main.py` so nothing had
to be imported (win32com / FastAPI) and nothing was modified. The JSX constants
under test (`youthSizeKeys`, `sizeFolderCode`) were read out of
`automate_production.jsx` rather than retyped.

### Confirmed working

- 59 size spellings routed to the correct pattern file; adult, youth, toddler,
  the `Adult `/`A` prefixes and the `Youth `/`Y` prefixes all resolve.
- ALIAS CROSS-CONTAMINATION: none. No youth alias normalises to an adult alias
  after findAnywhere's lowercase + strip-non-alphanumeric, so no panel name can
  be claimed by both files. Routing by size code is safe.
- Export folders do not collide: `YS/` vs `S/`, `YL/` vs `L/`.
- A mixed 6-size order resolved all 27 pattern-piece requirements from the right
  file (24 youth/adult panels + 3 accessories out of the adult file).
- WRONG-SLOT SWAP: swapping the two files fails 24 of 27 requirements, so the
  existing pattern-piece pre-flight pauses the job and names them. No extra
  validation is needed to catch a mis-dropped file.

### Edge cases found

A. **Toddler sizes sort AFTER every adult size.** `_size_rank`
   (`Backend/main.py:361-364`) has no toddler branch: `4T` -> body `"4t"` ->
   `_size_code` returns None -> no `y`/`a` prefix -> `float("4t")` raises ->
   `(2, inf, "4t")`, the "unrecognised" bucket. A mixed order comes out
   `Youth S -> YM -> S -> Large -> 2XL -> 4T -> Universal`. Two consequences:
   the smallest run renders last, and the pattern-file sequence becomes
   YOUTH -> ADULT -> YOUTH, which kills the "each chunk opens only the file it
   needs" optimisation. Fix the rank first or keep both docs open.

B. **Accessories dedupe onto a YOUTH group.** `_expected_pattern_pieces`
   (`illustrator_automation.py:969`) dedupes by the alternatives key, and an
   accessory key carries no size, so Placket / Twill Tape / Tukdi are emitted
   ONCE against whichever group reached them first - a youth group after the
   youth-first sort. A naive two-way plan split would therefore check them
   against the youth file only. They need their own third "either file" bucket,
   which is also exactly the architect's rule. Verified: with the third bucket
   all three resolve out of the adult file.

C. **Toddler panels get the 3in ADULT LOCAL TAG.** `youthSizeKeys`
   (`automate_production.jsx:4638`) is `{yxs, ys, ym, yl, yxl}` only, so 1T-10T
   are cut from the youth pattern but tagged as adult. Pre-existing; this
   feature is what makes it visible.

D. **Youth 2XL / 3XL are not in the size map.** `_FRIENDLY_SIZE_MAP`
   (`illustrator_automation.py:801`) and `sizeCodes()`
   (`automate_production.jsx:11312`) stop at YXL. So `friendly("Youth 2XL")`
   returns the raw string unchanged, its alias list is just itself (the pattern
   piece would have to be named literally "Youth 2XL Front"), its folder is
   `Youth_2XL`, and it gets a 3in adult tag. `Y2XL` / `YXXL` are worse - and
   note `_size_rank` DOES understand them (strips the Y, ranks `(0, 5.0)`), so
   rank and friendly-label disagree on the same size.

E. **Which routing rule.** Loose ("friendly label starts with Y") got 0 wrong on
   all 59 cases but also routes `Yellow`, `Y` and any stray Y-text to the youth
   file. Strict (known youth code, or toddler code, or starts with the word
   "Youth") has 0 false positives but misses `Y2XL`/`YXXL`. Recommendation:
   strict, plus add Y2XL/Y3XL/YXXL to both size maps - that removes both
   problems at once.

F. **Hoodie pre-flight is file-global, not per-size.**
   `_pattern_has_hoodie_objects` (`illustrator_automation.py:638`) hunts for any
   "hood" + Left/Right + Border (+ Pocket) group anywhere in ONE file and
   returns yes/no. With two files it must run on both, or a youth file with no
   hood pieces passes on the adult file's hoods and the youth hoods go missing
   silently. Static analysis - the COM probe cannot run here.

### Explicit non-findings

- The `L <- [L, Large]` "collision" in the first run is not one: raw `L` and raw
  `Large` are the same size and both map to folder `L`.
- Stray whitespace (`"  Large  "`) already breaks a job today - `_friendly_size`
  returns it unchanged, so the folder becomes `__Large__` and the panel lookup
  misses - but the pattern-piece pre-flight catches it. Unrelated to this change.

## Outcome

- ✅ Impact: dual-pattern routing design validated against the project's real functions; 6 edge cases found, 2 of which (A, B) change the implementation plan. No project code touched.
- 🧪 Tests: 3 scratchpad scripts, all passing; 59 routing cases + a 27-requirement mixed-plan simulation + a wrong-slot swap check.
- 📁 Files: none in the project. Scripts live in this session's scratchpad.
- 🔁 Next prompts: decide on findings A (toddler rank) and D (Y2XL map entries) before implementing; then build the upload + validation half.
- 🧠 Reflection: AST-slicing the real helpers instead of re-implementing them is what surfaced A and B - a hand-written mirror of `_size_rank` would have "handled" toddler correctly and hidden the bug.

## Evaluation notes (flywheel)

- Failure modes observed: the first run reported an export-folder collision that was an artefact of the test feeding two raw spellings of the same size; had to distinguish test noise from a real defect before reporting.
- Graders run and results (PASS/FAIL): PASS - routing 59/59 with the loose rule, 57/59 with the strict rule (the 2 misses are finding D); mixed-plan resolution 27/27; wrong-slot swap correctly fails 24/27.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): add Y2XL/Y3XL/YXXL and a toddler branch to the two size maps in the scratchpad copies and re-run, to confirm A, C and D all close with one edit each.
