---
id: 199
title: Womens Size Ladder
stage: green
date: 2026-09-17
surface: agent
model: claude-opus-5
feature: production_automation
branch: main
user: zija9452
command: (direct request)
labels: ["sizes", "womens", "pattern-lookup", "jsx", "sorting", "docs", "xlsx"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Backend/scripts/automate_production.jsx
 - Backend/services/illustrator_automation.py
 - Backend/main.py
 - Frontend/my-app/components/UploadForm.tsx
 - Frontend/my-app/app/docs/page.tsx
 - Frontend/my-app/public/Pattern_Naming_Reference.xlsx
 - Backend/scripts/docs/Pattern_Naming_Reference.xlsx
tests:
 - scratchpad/test_py.py - 266 checks, python size table
 - scratchpad/test_jsx.js - 435 checks, the SHIPPED .jsx pulled apart and run in node
 - scratchpad/test_hard.py - 520 checks, adversarial + 4223-cell four-way parity fuzz
 - scratchpad/verify_xlsx.py - 499 checks, workbook promises vs code, styling preserved
 - node --check on the bundle; py_compile; tsc --noEmit; eslint app components
---

## Prompt

ok , add these in pattern naming sizes , W-XS, W-S, W-M, W-L, W-XL, W-2XL , W-YL,
W-YXS, W-YXXS, W-YS, W-YM, W-YXL, and excel me kis trha pass hon ge ?? ye women k
hen , excel me is trha a skte hen Women Large , Women L , W Large , W-M , WM ,
spece or hyphens hon beeche me space ki jga , to abhi kis trha se handle hpti he
state excel ki , k wo samjh jata he , or ye add krne hen

(followed, over the same turn, by: "kia flow hoga?", "or agr pattern me Women
Adult Large likha ho to kis me fall kre ga ye?", "or excel me Women Youth large
hua to?", "isi trha Adult Large ho, or, Small Med??", "Size he adult Med??",
"SMALL: S, SM: S, ye q remove kia", "scartchpad me test kr lo, sb ek hi dafa, hr
trha se", "act like u r a professional tester, and real world testing kro", "alg
testing kro, hard", "test kese kiye hen? btao test cases dikhao")

## Response snapshot

Twelve women's sizes added end to end: **W-XS W-S W-M W-L W-XL W-2XL** cut from
the adult pattern .ai, **W-YXXS W-YXS W-YS W-YM W-YL W-YXL** from the youth one.

The label is the code, as it is for youth - panels are named `W-M Front`, never
`Women Medium Front`. One canonical label then decides four things: which pattern
file is searched, which panel names are probed, where the group sorts in the
plan, and the LOCAL TAG width (3in for W-XS..W-2XL, 2.5in for the W-Y codes).

**Excel side.** The separator never mattered and still does not - `W-M`, `W M`,
`WM`, `W.M` are one key. On top of that `Women` / `Womens` / `Women's` / `Ladies`
/ `W` are all read, the size word may be spelled out (`Women Large`, `W Med`),
and the age word is optional on EITHER side: `Women Adult Large`, `Adult Women
L`, `Women Youth Medium`, `Youth Women Small`. Parsed on the FLAT string, not the
space split, because "Women's Large" splits as head `WOMEN` + rest `SLARGE`,
which no head rule can read. Every prefix that fits is tried rather than the
longest, or `WOMENSMALL` reads as `WOMENS` + `MALL` and answers nothing.

Four places carry a size table and all four now agree: `automate_production.jsx`,
`illustrator_automation.py` (pre-flight), `main.py` (plan order), and
`UploadForm.tsx` (which upload to insist on).

### Three bugs the tests found, none of them women's-specific

1. **`_size_rank` stripped four characters** (`" -_."`), so a cell carrying a
   non-breaking space or an en dash - what a paste out of a PDF or Word
   autocorrect leaves - was unreadable to the sorter while `getFriendlySize` read
   it perfectly. The group rendered under the right size but sorted into the
   unknown bucket at the very end, which is exactly the youth -> adult -> youth
   file sequence its own docstring warns about. Now `[^a-z0-9]`, the same
   expression the other three use.

2. **`_norm_size` had its own alias table** covering a dozen adult spellings and
   nothing else, so `Adult Large` vs `Large`, `Youth Small` vs `YS`, `Toddler 4`
   vs `4T`, `AM` vs `Medium` each failed to pair. That key is what
   `_enforce_personalization` uses to find a group's Excel rows, and a miss is a
   silent `continue` - every player in that size ends up wearing the first
   player's name. The table is gone; the key is `_size_rank` itself, which
   already reads every family.

3. **`_MONTH_RE` was missing its `m?`.** The toddler pattern beside it has always
   had `t?`, so `Toddler 4T` worked while `Infant 6M` - the spelling
   `_size_aliases` itself generates - did not, and sorted after every adult size.

### One gap closed, one deliberately left open

`getFriendlySize` only consulted its word table on what FOLLOWED an age word, so
`Adult Med` always worked and a bare `Med`, `Lg`, `X-Large` or `XXLarge` never
did - the cell passed straight through and the run went looking for a panel
called "Med Front". The abbreviations were already in `RENAME_SIZE_WORDS`, so the
same sheet renamed its size tags correctly while failing to find the piece to
rename. Now they resolve, which also gets `Youth Lg` -> `YL` for free.

`SM` is deliberately NOT in that table. It is the one genuinely ambiguous
abbreviation: `S/M` for a combined garment and `Sm` for Small flatten to the same
string, and answering that with Small would cut the wrong panel in silence.

### Known ambiguity, resolved in favour of the size

`Women S` and the possessive `Women's` both flatten to `WOMENS`. A cell holding
only the word "Womens" therefore reads as W-S. A guard against that also killed
`Women S`, which is a spelling a customer really types; a bare "Womens" carries
no size at all and is wrong either way.

## Outcome

- Impact: women's orders run end to end instead of pausing at the first panel;
  three silent-wrong-output bugs on the EXISTING ladder are closed
- Tests: 1720 checks green across four suites, plus node --check / py_compile /
  tsc / eslint. The JSX suite pulls its functions out of the shipped file by
  brace matching, so it tests what Illustrator runs, not a copy
- Files: the four size tables, the docs size chart, both copies of
  `Pattern_Naming_Reference.xlsx` (Size Prefixes, Size Tag Words, Read Me, and a
  worked-example section on Pattern Names)
- Next prompts: the adult pattern .ai must actually carry `W-M Front` etc. before
  a women's order will render - the job pauses with every tried name in the log
  if not. `_norm_size` now also merges two plan groups whose sizes are spelled
  differently, which is correct but is a behaviour change on non-women orders
- Reflection: the round-trip invariant (every name the lookup probes must itself
  resolve back to that size) is what makes the two halves provably agree, and it
  is worth more than any number of hand-written cases

## Evaluation notes (flywheel)

- Failure modes observed: a hand-written character list standing in for "strip
  punctuation" (twice, in two different files); a regex missing the optional unit
  its sibling had; a private alias table that silently opts out of every size
  family added after it was written
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): grep for every place that normalises
  a size and assert they produce the same answer for the same cell - the
  four-way parity check over 4223 cells found more than the curated table did
