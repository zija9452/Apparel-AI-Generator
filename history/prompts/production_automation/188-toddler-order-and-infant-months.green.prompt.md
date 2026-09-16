---
id: 188
title: Toddler Order And Infant Months
stage: green
date: 2026-09-14
surface: agent
model: claude-opus-5
feature: production_automation
branch: main
user: zija9452
command: (conversation)
labels: ["size-ladder", "toddler", "infant-months", "local-tag", "size-rank", "aliases"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Backend/main.py
 - Backend/services/illustrator_automation.py
 - Backend/scripts/automate_production.jsx
tests:
 - scratchpad/test_month_toddler_ladder.py (new - 0 failures, 62 assertions)
 - scratchpad/test_youth_routing.py (re-run, no regression)
 - scratchpad/test_preflight_split.py (re-run, no regression)
 - node --check on automate_production.jsx (passes)
 - ES3 reserved-word scan on the new JSX vars (clean)
---

## Prompt

order thk kro toddlers ka , or us me month bhi add kr do 1M ,.... 12M

(follow-up) toddler ko size tag youth wala mile

Architect's answers to the two clarifying questions: LOCAL TAG box for toddler
(1T-10T) and months (1M-12M) = 2.5in, the same as youth; month pattern pieces
live in the YOUTH .ai file alongside toddler.

## Response snapshot

### What was broken

`_size_rank` (`Backend/main.py`) had no toddler branch and no notion of months.
`4T` fell through `_size_code`, failed both the 'y' and 'a' prefix rules, and
then `float("4t")` raised - landing it in the "unrecognised" bucket, which sorts
AFTER every adult size. So the smallest garments in an order rendered last, and
for the youth/adult pattern split the file sequence interleaved
(youth -> adult -> youth) instead of running each file once.

### Changes

**`Backend/main.py`**
- New `_MONTH_RE` / `_TODDLER_RE` and `_infant_rank()`. Both families are matched
  in either word order ("6M", "6 Months", "Month 6", "4T", "Toddler 4",
  "4 Toddler") and return the NUMBER, because these ladders sort numerically - a
  string sort puts "10m" before "2m".
- `_size_rank` re-banded: 0 months, 1 toddler, 2 youth, 3 adult, 4 unrecognised,
  5 Universal, 6 empty. Months/toddlers are tested before the code/prefix rules,
  which cannot read them. The rank tuple is only ever used as a sort key
  (`_sort_size_groups`), never compared to a literal, so re-banding is safe.

**`Backend/services/illustrator_automation.py`**
- `_FRIENDLY_SIZE_MAP`: added 1M..12M, mapping to themselves like the youth and
  toddler codes.
- `_friendly_size`: MONTH/MONTHS/MO/INFANT/BABY head words; a TRAILING age-word
  branch for "6 Months"/"4 Toddler" where the number is the head; and a no-space
  regex for "6MO"/"6MONTHS"/"MONTH6".
- `_size_aliases`: month aliases ("6 Months", "6 Month", "Month 6", "Infant 6M"),
  and the `shorts` exclusion widened from `^[0-9]+T$` to `^[0-9]+[TM]$` so a 1M
  panel is no longer also probed as "Adult 1M"/"A1M".

**`Backend/scripts/automate_production.jsx`** (mirrors the Python, as the file
pairs demand)
- `sizeCodes()`: added 1M..12M.
- `getFriendlySize`: the same month/trailing-word/no-space branches.
- `sizeAliases`: month aliases, and the same `^[0-9]+[TM]$` exclusion.
- `youthSizeKeys` block (the LOCAL TAG width): was an exact-key lookup over the
  five youth codes, so toddler and month silently took the adult 3in box. Now
  `/^[0-9]+t$/` and `/^[0-9]+m$/` sit beside the key lookup, so both families get
  the 2.5in youth tag.
- `sizeToAbbrev`: `/^[0-9]+[tm]$/` passthrough. Toddler and month used to return
  null, log "no abbreviation for size" and keep the mockup's original tag letter;
  they are now their own tag letter, exactly like the youth codes.

### Verified

Ladder now sorts
`1M -> 6 Months -> 12M -> Toddler 2 -> 4T -> 10T -> Youth XS -> YM -> YXL ->
XS -> S -> Large -> 2XL -> 38 -> Universal -> ''`
and the pattern-file sequence in a mixed order collapses to YOUTH -> ADULT, one
block each. 15 month spellings resolve; `M`/`Medium`/`AM`/`Adult M`/`38`/`2XL`
unchanged; adult, youth and toddler alias lists byte-identical to before; no two
sizes share an export folder.

### Still open (NOT fixed - not in scope of this request)

Youth 2XL / 3XL, and the `Y2XL` / `YXXL` spellings, are still absent from both
size maps: `friendly("Youth 2XL")` returns the raw string, its only alias is
itself (the pattern piece would have to be named literally "Youth 2XL Front"),
its folder is `Youth_2XL`, and it gets a 3in adult tag. `_size_rank` DOES
understand them, so rank and friendly-label still disagree on those sizes.

### Deployment note (three different paths)

- `automate_production.jsx` auto-syncs to each PC between jobs via
  `/automation/manifest` - `_jsx_manifest()` serves `*.jsx` only.
- `illustrator_automation.py` does NOT: it is bundled into the agent zip
  (`Agent/build-agent-package.ps1:60`, whose own comment says to rebuild after
  any change to it). Designers need the new package.
- `Backend/main.py` is the cloud half - `_size_rank` runs there, so the new
  ORDER needs a cloud redeploy.

Practical consequence: with only the JSX synced, a sheet writing the canonical
"6M" still works (old and new `_friendly_size` agree on that spelling), but a
sheet writing "6 Months" would make the un-updated agent's pre-flight demand a
"6 Months Front" panel and pause the job.

## Outcome

- ✅ Impact: toddler sizes sort in their own numeric band ahead of youth instead of after every adult size; infant months 1M-12M added end to end (ladder, size map, aliases, export folder, 2.5in LOCAL TAG, tag letter); toddler now gets the youth tag it was missing.
- 🧪 Tests: new ladder suite 0 failures; both earlier suites re-run with no regression; JSX syntax and ES3 reserved-word scan clean.
- 📁 Files: `Backend/main.py`, `Backend/services/illustrator_automation.py`, `Backend/scripts/automate_production.jsx`.
- 🔁 Next prompts: decide whether to close Youth 2XL/3XL the same way; then build the dual-pattern-file upload half (PHR 186).
- 🧠 Reflection: re-banding the rank tuple was only safe because a grep confirmed it is used solely as a sort key - had any call site compared it to a literal, renumbering would have broken silently.

## Evaluation notes (flywheel)

- Failure modes observed: two "MISMATCH" lines in the re-run of the older suite were stale test mirrors, not code defects - the harness read `youthSizeKeys` as an object literal and could not see the new regex clauses beside it. Fixed in the harness; a reader who trusted the first re-run would have concluded the tag fix had not landed.
- Graders run and results (PASS/FAIL): PASS - ladder suite 0/62 failures; month spellings 15/15; adult/youth/toddler alias regression 3/3 identical; folder-collision check clean.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): add Y2XL/Y3XL/YXXL to `_FRIENDLY_SIZE_MAP` and `sizeCodes()` and re-run the routing suite - the strict routing rule's 2 remaining misses should both close with that one edit.
