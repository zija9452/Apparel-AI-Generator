---
id: 141
title: Remove MOCK Swatch Prefix
stage: refactor
date: 2026-08-20
surface: agent
model: claude-opus-5
feature: production_automation
branch: main
user: zija9452
command: (direct request)
labels: ["swatches", "spot-color", "illustrator", "jsx", "simplification"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Backend/scripts/automate_production.jsx
tests:
 - node --check on the modified JSX (PASS)
 - remove_prefix_test.js - 35 checks, full paste/relink/save chain both regimes (PASS)
 - no_mock_prefix_test.js - 47 checks (PASS)
 - swatch_merge_test.js - 51 checks (PASS)
 - Swatch inventory of the job's real mockup.ai / pattern.ai (PASS)
 - REAL end-to-end order run in Illustrator, job 99160ddb inputs, 1694s (PASS)
 - Byte forensics on both produced .ai files vs the shipped one (PASS)
---

## Prompt

ek test ye bhi kro , start se mock_ prefix lgao hi nhi , or phr kro , dekho k usi spot se link ho rhe hen , duplicate bhi nhi hon ge , or koi error to nhi ? spot bhi rhen ge ?? ye test kro scartchpad me pehle

(follow-up) hm jb new docum,ent bnaty hen to us me sb swatches delete kr dete hen , aesa hihe ?? or saray colors mockup se hi aty hen , or ek file me double name k diff val wale color nhi hoty na

(follow-up) pehle test kro k kese hty ga , then pd file me implement klrna

## Response snapshot

The user's three premises were checked before touching anything, and all three hold:

| premise | evidence |
| --- | --- |
| The new order document has every swatch deleted | `clearOrderDocSwatches` keeps only `[None]`/`[Registration]`; called at jsx:135 and jsx:2595 |
| Every named color comes from the mockup | `mockup.ai` XMP: exactly `186`, `base-color`. `pattern.ai` / `reference.ai` (byte-identical, md5 `64ccfe33…`): **zero** `xmpG:swatchName`, plates Cyan/Magenta/Yellow/Black only |
| One document cannot hold two same-named colors | Illustrator keeps swatch names unique per document |

Together those make the name clash the prefix guarded against structurally impossible
in this pipeline - and `processSubColor` resolves any clash on the MOCK_-stripped
name anyway (`officialSpots[cleanName]`, jsx:1833), so the prefix never changed an
ink, only the debug log.

**Dry run before the edit.** `scratchpad/remove_prefix_test.js` slices `spotKey`,
`inkLabel`, `getOrCreateSpot`, `unifyMockSwatches`, `relinkAliasArt` **and the real
`mergeAndCleanupSwatches`** out of the shipping `.jsx` and drives the full
paste -> relink -> save chain under both regimes against a mocked Illustrator DOM
(including the scratch-group/Expand path applySpot's "Level 5" text fallback needs).
35 checks, all green:

- P2/P4 - prefix removed: the swatch panel holds exactly `186` + `base-color` after
  every one of 30 pastes. It never reaches 3. Artwork references exactly 2 spot
  objects, all `colorType = SPOT`, no dangling cross-document links, no exceptions.
- P1 - prefix on: the trail shows the old cost plainly, `paste:4 -> merge:2` on every
  panel, i.e. an alias created and cleaned up once per design.
- **P3 - equivalence**: same swatch table, same swatch count, and every painted item
  in every pasted design resolves to the same ink, tint and swatch name either way.
- P5 - a mockup swatch named `Mocha` (the `.replace(/^mock/, "")` in processSubColor
  mangles its key to `"a"`): no stray swatch, no duplicate - the mangled key misses
  `officialSpots`, then `getOrCreateSpot` finds the real swatch by name and
  self-corrects. Identical with the prefix on, so it is not a removal risk.
- P6 - the merge code left in place returns 0 and logs nothing on a normal job.

**The change.** The isolation block (old jsx:106-117) is gone, replaced by a note
recording why. The MOCK_ handling from PHR 140 is deliberately KEPT as a guard for a
mockup that already carries such names; P6 shows it costs one swatch scan and stays
silent otherwise. Comments on `getOrCreateSpot` and the alias helpers were rewritten -
they described a mechanism that no longer exists.

Left alone on purpose: the `.replace(/^MOCK_/, "")` strips at jsx:2035/2050/7864
(no-ops now, still correct for the guard), and the `.replace(/^mock/, "")` key mangle,
which P5 proves self-corrects.

## Real Illustrator run - confirmed

(follow-up prompt: "illustrator me real job run kr k check krlo")

One full order driven through Illustrator on job 99160ddb's own inputs, output into a
scratch job directory. 1694s, 60 JPEGs, two order files (the layout overflowed, so the
`startNextOrderDoc` path was exercised too). Byte forensics on the products:

| | shipped file (prefix on) | this run (prefix removed) |
| --- | --- | --- |
| `%%CMYKCustomColor` | `186`, **`MOCK_186`**, **`MOCK_base-color`**, `base-color` | `186`, `base-color` |
| XMP plates | …, `186`, `base-color`, **`MOCK_186`** | …, `base-color`, `186` |
| XMP swatches | 4 | 2 |
| PDF separations | `186`, **`MOCK_186`**, `base-color` | `186`, `base-color` |
| `MOCK_` byte occurrences | **7** | **0** |

Both `production_ready_order.ai` and `production_ready_order_2.ai` are clean.

The decisive detail: **`grep -c "SWATCHES:" debug_log.txt` = 0.** The merge pass never
had anything to do, so the duplicate is gone at the root rather than cleaned up after -
which is what the dry run predicted (suite P2's `paste:2 merge:2` trail).

Also re-confirmed in the same run, from PHR 140's export work: `Medium_Front_Item1.jpg`
went from 1635x2284 px with JFIF `units=0` (no density recorded) to **6821x9525 px @
300x300 dpi**, at the same physical width (576.8 mm -> 577.5 mm, 0.1%).

Pre-existing and not caused by this change: 4 `Could not find 'WM …' in Master Pattern`
lines - the shipped job's log has the same 4.

## Separate defect found, reported not fixed

P8: `processSubColor`'s name-match branch builds `new SpotColor(); sc.spot = …` and
never copies `c.tint`, so a path drawn at **50% tint of a spot comes back at 100%** -
it would print at full strength. Verified identical with the prefix on and off, so it
is pre-existing and unrelated to this change. `relinkAliasArt` (PHR 140) does copy the
tint. Out of scope; needs the user's call.

## Outcome

- ✅ Impact: One ink = one swatch, linked directly, with the scaffolding removed rather than cleaned up after. No alias is created, so none has to be merged away; the swatch panel is correct at every step of the run instead of only at save time.
- 🧪 Tests: `node --check` PASS; 133 checks across three suites PASS (35 + 47 + 51); real-file swatch inventory PASS; **real Illustrator run PASS** - 7 MOCK_ occurrences -> 0, both order files clean, zero `SWATCHES:` log lines.
- 📁 Files: Backend/scripts/automate_production.jsx
- 🔁 Next prompts: Tint loss in processSubColor - user's call whether to fix (one line in three places).
- 🧠 Reflection: The user's own three premises were the proof. Checking them against `clearOrderDocSwatches` and the XMP swatch lists of the real inputs turned "probably safe" into "structurally impossible to clash", which is what justified deleting the guard instead of merging around it.

## Evaluation notes (flywheel)

- Failure modes observed: My earlier claim that the prefix prevents a silent wrong-color was wrong, and the test caught it - suites B/C print the same ink either way. Asserting the expected-but-unverified behaviour is what surfaced it; a weaker test would have shipped the wrong rationale. The same run also caught the tint loss, which no assertion had been written for until an equivalence fingerprint compared every item.
- Graders run and results (PASS/FAIL): node --check PASS; remove_prefix_test 35/35 PASS; no_mock_prefix_test 47/47 PASS; swatch_merge_test 51/51 PASS.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): Run one order. If the panel is clean, decide whether to fix the tint loss in processSubColor (one line: copy `c.tint` onto the new SpotColor).
