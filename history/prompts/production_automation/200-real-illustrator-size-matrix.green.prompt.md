---
id: 200
title: Real Illustrator Size Matrix
stage: green
date: 2026-09-17
surface: agent
model: claude-opus-5
feature: production_automation
branch: main
user: zija9452
command: (direct request)
labels: ["testing", "illustrator", "com", "sizes", "pattern-lookup", "end-to-end"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Backend/scripts/automate_production.jsx
tests:
 - scratchpad/make_real_order.py - a real .xlsx through the shipped parser + sorter + resolver
 - scratchpad/build_pattern_ai.py - two real .ai pattern files built in Illustrator CC 2015 over COM
 - scratchpad/probe_pattern_ai.py - 42 lookups, the real alias chain against the real .ai
 - scratchpad/probe_size_tags.py - 24 size tags, renameSizeTags' own four tests, read-only
 - scratchpad/full_matrix.py - 2817 lookups, 31 sizes x 201 spellings x 14 parts + 3 accessories
 - the four earlier suites re-run after the JSX change - 266 / 435 / 520 / 499, node --check clean
---

## Prompt

ek real excel sheet bnao , or dekho k kia kese nam pick krta he ,or ek real
illustrator pr naming rkho

(then: "jusr women nhi all over teting krni he , sb kiii")

## Response snapshot

Built a real customer sheet, built real pattern files, and ran the SHIPPED chain
against both - nothing mocked.

**The sheet.** `Womens_Order_Test.xlsx`, written in the same shape as
`public/Standard_Order_Template.xlsx`, deliberately spelling one size four ways
across its rows, then read by the real `parse_order_excel`, ordered by the real
`_size_rank`, resolved by the real `_friendly_size`. 15 rows -> 14 distinct size
cells -> 10 canonical labels; plan order came out `youth.ai -> adult.ai`, each
file opened exactly once.

**The pattern files.** Two .ai documents created in Illustrator CC 2015 over COM,
with only SOME panels carrying the canonical name - the rest named the way a
designer who has not read the docs would name them. Then the real
`sizeAliases` x `partLabelAliases` chain was run against the real GroupItems,
indexed with `findAnywhere`'s own key:

| Excel cell | Illustrator group it found | how |
|---|---|---|
| `Women Large` / `women large` / `W-L` | `Women Large Front` | alias #6, all three |
| `Women's Medium` / `W M` / `Ladies M` | `W-M Front` | canonical |
| `Women's Medium` | `W-M SS` | alias #17 - size AND part abbreviated |
| `Women Adult 2XL` | `Adult Women 2XL Front` | alias #13 - age word first |
| `Women Adult 2XL` | `Women Adult XXL Back` | alias #8 - XXL for 2XL |
| `Youth Women Small` | `Youth Women Small Front` | alias #11 |

36/42 resolved; the six misses were parts I never drew, which is the correct
pause.

**Then the whole system, not just women's.** `full_matrix.py` builds both files
with the canonical name for EVERY panel - adult XS-4XL, youth YXS-YXL, toddler
1T/4T/10T, months 1M/6M/12M, the women's adult and youth ladders, crossed with
all 14 parts (Front, Back, Neck, both sleeve lengths, per-side sleeves, Rib &
Cuff, Front Left/Right, Patti, Hood, Border, Pocket) plus the three Universal
accessories - then looks up 201 Excel spellings against them.

**2817/2817 resolved. Worst case 33 probes for a hit.**

### One gap found and closed

`renameSizeTags` decided with three tests: the tag text equals the label, or it
is in that size's `SIZE_ALIAS_GROUPS` entry, or it is in the global
`RENAME_SIZE_WORDS`. A piece tagged with its own panel prefix - `Women Youth
Large` on a W-YL piece, `Adult Women 2XL` on a W-2XL one - matched none of them,
so the tag kept its old text and the run logged "no '<size>' tag text found".

A hand-written alias list will always lag the parser, so the parser is now asked
directly: a fourth test accepts any text `getFriendlySize` reads as THIS size.
Still scoped - a tag naming some other size resolves to that size and fails, just
as it fails the group test. 16/24 tags renamed before, 21/24 after; the three
that remain are truncated strings the generator made up, not real tag text.

### Also verified, and fine

Three spellings of one size can produce three separate production groups. They
do NOT collide on export: `exportFileCounters` (jsx:11243) is keyed by the
CANONICAL label and is one map for the whole run, so all three write into `W-M/`
as `W-M1, W-M2, W-M3`.

## Outcome

- Impact: the chain is now proven against real Illustrator DOM names rather than
  against a model of them, across every size family the system has
- Tests: 2817 + 42 + 24 Illustrator lookups, plus the four earlier suites re-run
  green after the JSX change (266 / 435 / 520 / 499) and `node --check` clean
- Files: `automate_production.jsx` only - the fourth test in `renameSizeTags`
- Next prompts: the harnesses are in the session scratchpad, not the repo. Worth
  keeping `full_matrix.py` somewhere durable - it is the only test that touches
  real Illustrator
- Reflection: Illustrator was launched by the script and left running with zero
  documents; only documents this session created were ever opened or closed

## Evaluation notes (flywheel)

- Failure modes observed: a probe script that reimplements the logic it is
  testing silently reports the OLD behaviour after the real code changes - the
  size-tag probe had to be re-synced by hand before it showed the fix
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): build the panel index over a document
  that is NOT active and time it - the 125ms-per-read penalty is the one thing
  this harness sidesteps by activating each doc first
