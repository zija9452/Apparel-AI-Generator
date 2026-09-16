---
id: 191
title: Pre-flight ignored part label aliases
stage: green
date: 2026-09-15
surface: agent
model: claude-opus-5
feature: production_automation
branch: main
user: zija9452
command: bug report - "9 pattern pieces not found" on a pattern that has them
labels: ["preflight", "pattern-pieces", "sleeve-aliases", "false-positive", "dual-pattern"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - Backend/services/illustrator_automation.py
tests:
  - manual: _expected_pattern_pieces probed against a pool of {Small LS, XL LS, YXS LS, Small Front, M SS, Twill Tape, XL Rib & Cuff} - every abbreviated sleeve now resolves FOUND, a genuinely absent YXS Rib & Cuff still reports MISSING, Universal Twill Tape unchanged
---

## Prompt

9 pattern pieces from the order were not found in the pattern file . Automation paused

The order sheet asks for these panels, but the pattern file has no group with that name. The name the automation looks for is built from the row's size and part, e.g. size 2XL + part front → 2XL Front.

•
"XS Long Sleeve" (or "Adult XS Long Sleeve", "AXS Long Sleeve") - needed for size XS, part 'sleeve-long'
•
"Small Long Sleeve" (or "Adult Small Long Sleeve", "S Long Sleeve", "Adult S Long Sleeve", "AS Long Sleeve") - needed for size S, part 'sleeve-long'
•
"Medium Long Sleeve" (or "Adult Medium Long Sleeve", "M Long Sleeve", "Adult M Long Sleeve", "AM Long Sleeve") - needed for size M, part 'sleeve-long'
•
"Medium Rib & Cuff" (or "Adult Medium Rib & Cuff", "M Rib & Cuff", "Adult M Rib & Cuff", "AM Rib & Cuff") - needed for size M, part 'cuff'
•
"Large Long Sleeve" (or "Adult Large Long Sleeve", "L Long Sleeve", "Adult L Long Sleeve", "AL Long Sleeve") - needed for size L, part 'sleeve-long'
•
"Large Rib & Cuff" (or "Adult Large Rib & Cuff", "L Rib & Cuff", "Adult L Rib & Cuff", "AL Rib & Cuff") - needed for size L, part 'cuff'
•
"XL Long Sleeve" (or "Adult XL Long Sleeve", "AXL Long Sleeve") - needed for size XL, part 'sleeve-long'
•
"XL Rib & Cuff" (or "Adult XL Rib & Cuff", "AXL Rib & Cuff") - needed for size XL, part 'cuff'
•
"2XL Long Sleeve" (or "Adult 2XL Long Sleeve", "XXL Long Sleeve", "Adult XXL Long Sleeve", "AXXL Long Sleeve", "A2XL Long Sleeve") - needed for size 2XL, part 'sleeve-long'
•
"2XL Rib & Cuff" (or "Adult 2XL Rib & Cuff", "XXL Rib & Cuff", "Adult XXL Rib & Cuff", "AXXL Rib & Cuff", "A2XL Rib & Cuff") - needed for size 2XL, part 'cuff'
•
"3XL Long Sleeve" (or "Adult 3XL Long Sleeve", "A3XL Long Sleeve", "XXXL Long Sleeve", "Adult XXXL Long Sleeve", "AXXXL Long Sleeve") - needed for size 3XL, part 'sleeve-long'
•
"4XL Long Sleeve" (or "Adult 4XL Long Sleeve", "A4XL Long Sleeve", "XXXXL Long Sleeve", "Adult XXXXL Long Sleeve", "AXXXXL Long Sleeve") - needed for size 4XL, part 'sleeve-long'
•
"5XL Long Sleeve" - needed for size 5XL, part 'sleeve-long'
•
"YXS Long Sleeve" (or "Youth XS Long Sleeve") - needed for size YXS, part 'sleeve-long'
•
"YXS Rib & Cuff" (or "Youth XS Rib & Cuff") - needed for size YXS, part 'cuff'
•
"YS Long Sleeve" (or "Youth S Long Sleeve") - needed for size YS, part 'sleeve-long'
•
"YM Long Sleeve" (or "Youth M Long Sleeve") - needed for size YM, part 'sleeve-long'
•
"YL Long Sleeve" (or "Youth L Long Sleeve") - needed for size YL, part 'sleeve-long'
•
"YXL Long Sleeve" (or "Youth XL Long Sleeve") - needed for size YXL, part 'sleeve-long'
Recommended: open the pattern file in Illustrator, check the spelling of these group names (spaces and capitals don't matter, the words do), then upload a new job. Continuing renders everything else and simply leaves these pieces out of the order file.

Continue without these pieces
 mene sb pattern names diye hen , phr ye aesi waning q ?? kia ye dono patterns dekhta he ?? phr warning detaa he ??

(follow-up, mid-turn)
or long sleeve ko LS likha he , jese Small LS , XL LS , to ye supported he bhi code me , phr bhi warnings q ??

## Response snapshot

Two separate answers, and only one of them is a bug.

**Does it read BOTH pattern files?** Yes. `_find_missing_pattern_pieces` calls
`_split_requirements_by_file` first, opens each `.ai` once, and judges each
requirement against the file it will actually be rendered from - adult sizes
against the adult file, YXS-YXL/1T-10T/1M-12M against the youth file,
size-independent accessories against either. Both files were scanned; the youth
entries in the warning came from the youth scan, the adult ones from the adult
scan. That part is working.

**Why the false alarm:** PHR 184 added `partLabelAliases()` to the renderer
(`Long Sleeve` also answers to `LS` / `Full Sleeve` / `Sleeve LS`) and wrote the
Python mirror `_part_label_aliases()` so the pre-flight could not end up
stricter than the renderer. The mirror was never called. `_expected_pattern_pieces`
still built its name list as `expand([_PART_LABEL_MAP.get(part, part)])` - the
canonical label only. So `findPatternPanel` happily reaches "Small LS" at render
time, while the pre-flight demanded "Small Long Sleeve" and paused the job over a
sleeve that was sitting in the pattern all along. Every `sleeve-long` row in the
warning is this bug; a dead helper that reads as if it were wired up is why it
survived review.

Fix in `_expected_pattern_pieces`: a new `expand_aliases()` crosses every part
alias with every size alias, used for the bare-`sleeve` branch and the general
branch. It deliberately does NOT apply to accessories or `Universal`, because
`findPatternPanel`'s size-independent branch looks those up by their bare label
with no aliases at all - offering aliases there would make the pre-flight LOOSER
than the renderer, which passes a job that then silently drops the piece.

Part aliases multiply with size aliases (a long sleeve now has 20 accepted
spellings), so `_describe_missing_piece` now prints the first six and counts the
rest instead of emitting a twenty-name bullet nobody reads.

**Still genuinely missing:** the `cuff` rows (M, L, XL, 2XL, YXS). `Rib & Cuff`
has no aliases on the pattern side in either language, so the pre-flight and the
renderer agree exactly - if those panels are spelled "M Cuff" or "M Rib" in the
file, the render skips them too. Asked the user what the pattern actually calls
them rather than guessing an alias list into the renderer.

## Outcome

- ✅ Impact: orders whose pattern spells sleeves "Small LS"/"XL LS" no longer pause on a pre-flight that the renderer would have sailed through; 13 of the 19 reported pieces in this job were false alarms
- 🧪 Tests: manual probe of `_expected_pattern_pieces` against an abbreviation-only name pool - all abbreviated sleeves FOUND, absent cuff still MISSING, Universal accessory unchanged
- 📁 Files: Backend/services/illustrator_automation.py
- 🔁 Next prompts: decide the `Rib & Cuff` spelling question; if the pattern really says "Cuff"/"Rib", add it to BOTH `partLabelAliases` and `_part_label_aliases` in the same change
- 🧠 Reflection: a mirror helper is only a mirror once something calls it - the docstring in `_expected_pattern_pieces` asserted the abbreviation behaviour that the code below it never implemented

## Evaluation notes (flywheel)

- Failure modes observed: a two-file change (JSX + Python) landed the helper in both files but the CALL SITE in only one. Syntax checks and reading the docstring both say "done". The only thing that catches it is exercising the Python function against a name pool that uses the alias.
- Graders run and results (PASS/FAIL): manual alias probe PASS. Illustrator render NOT graded.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): a tiny table test that feeds `_expected_pattern_pieces` one pool per accepted spelling in `partLabelAliases`, so the two lists cannot drift again
