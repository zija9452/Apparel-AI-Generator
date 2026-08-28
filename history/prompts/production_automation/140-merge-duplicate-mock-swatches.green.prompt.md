---
id: 140
title: Merge Duplicate MOCK Swatches
stage: green
date: 2026-08-20
surface: agent
model: claude-opus-5
feature: production_automation
branch: main
user: zija9452
command: (direct request)
labels: ["swatches", "spot-color", "illustrator", "jsx", "cleanup"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Backend/scripts/automate_production.jsx
tests:
 - node --check on the modified JSX (PASS)
 - swatch_merge_test.js - 51 checks over the real functions, mocked Illustrator DOM (PASS)
 - no_mock_prefix_test.js - 47 checks, "what if the MOCK_ prefix is never applied" (PASS)
 - Forensics on a shipped production_ready_order.ai confirming the duplicate pairs (PASS)
 - Swatch inventory of the job's real mockup.ai / pattern.ai / reference.ai (PASS)
 - Full end-to-end order run NOT executed (~7 min, needs Illustrator)
---

## Prompt

jb production ai file bnti he to us me ek jese do swatches hoty ehn , e.g. MOCK_123 and 123, dono ki same values hoti hen , to ab is me ek hi values hon , ye extra explicitly mock na bnen , or usi se direct link hon

(follow-up) plan share kro pehle kia kro ge

(follow-up) to start se hi agr hm mock_ na bnayen to link nhi hoa ? yes or no ?

(follow-up) ok , recommended

(follow-up) test bhi kro ek scartchpad pr size

## Response snapshot

**Reproduced on a shipped file first.** `Backend/Production testing files/99160ddb-.../renders/production_ready_order.ai` declares four custom colors where two inks exist:

```
%%DocumentCustomColors: (186) %%+ (MOCK_186) %%+ (base-color)
%%CMYKCustomColor: 0 1 0.9 0 (186)
%%+ 0 1 0.9 0 (MOCK_186)          <- duplicate ink
%%+ 0 0 0 1 (MOCK_base-color)     <- duplicate ink
%%+ 0 0 0 1 (base-color)
```

`MOCK_186` is also in the XMP `PlateNames` and appears as `/Separation/MOCK_186/DeviceCMYK` in the PDF stream, i.e. real artwork still pointed at the alias - it was not merely an orphan swatch.

**Mechanism.** `automate_production.jsx:112` prefixes every mockup swatch with `MOCK_` so a design duplicated into the order doc cannot silently adopt the ink of an order-doc swatch that shares its name (Illustrator matches pasted swatches by NAME, not by value). Illustrator carries that alias into the order document with the art. `getOrCreateSpot` then created a SECOND, clean-named spot and relinked art to it, leaving the alias in the panel. Every later paste re-introduced the alias, so one survived to save time.

**Asked whether dropping the MOCK_ prefix entirely would break linking - it would not** (cross-document `duplicate()` creates the swatch locally and links the art to it; the alias sitting in the order doc's own plate list proves it). Rejected anyway: the prefix is the only thing preventing a silent wrong-color when a mockup swatch name collides with a differently-inked order/pattern swatch. Merging was chosen over removing the prefix - same end result for the user, protection kept, far smaller diff.

Three changes, all in `Backend/scripts/automate_production.jsx`:

1. **`spotKey(name)`** (new) - compares swatch names across the `MOCK_` prefix and across formatting, so an alias and the real swatch are one ink.
2. **`getOrCreateSpot`** - now MOCK_-insensitive. When only the alias exists it is **renamed in place** instead of getting a clean-named twin. A rename keeps every item already referencing the swatch linked to it; a new swatch would not.
3. **`unifyMockSwatches(doc, walkArt)` + `relinkAliasArt(doc, aliases)`** (new), called from two places:
   - `mergeAndCleanupSwatches` end, `walkArt=false` - the cheap pass. `deepReLink` has just moved the design off its aliases, so they are dropped (or renamed when no twin exists yet). Scans `doc.swatches` only; no artwork walk. This is what keeps the pre-save pass a no-op.
   - `saveOrderDoc` top, `walkArt=true` - the net. Any alias a later paste re-introduced gets its remaining artwork re-pointed at the real swatch (paths, strokes, compound paths + their children, text `characterAttributes`, PluginItem/mesh items and their children, sublayers) before the alias swatch is removed. Tint is carried over; the unfilled/unstroked guard from `applySpot` is repeated so a phantom `GrayColor(0)` can never bake into a real fill.

Covers the overflow files too - `saveOrderDoc` is the single save path for `production_ready_order.ai` and `production_ready_order_2.ai`.

Worst case of an item the walk misses: Illustrator keeps the ink and drops only the name, so it becomes a process color at identical CMYK - never the no-fill of the vanishing-badge bug.

**Testing.** `scratchpad/swatch_merge_test.js` slices the four functions out of the shipping `.jsx` at run time (so it tests the real source, not a copy) and runs them against a mocked Illustrator DOM where a Spot and its Swatch share one name, `swatch.remove()` drops it from both collections, and an unfilled path returns a phantom gray. 51 checks across 10 suites, all green - including T7, which rebuilds the exact four-swatch panel from the shipped file and asserts it collapses to `186` + `base-color` with the artwork still a SpotColor on the surviving spot, and T10, which walks the full paste -> re-add -> save cycle.

## Correction: what the MOCK_ prefix actually buys

An earlier answer in this session claimed the prefix prevents a silent wrong-color
on a name collision. **That was overstated** - suites B and C of
`no_mock_prefix_test.js` print the same final ink either way. The prefix protects
the paste, but `processSubColor` immediately resolves on the MOCK_-STRIPPED name
(`officialSpots[cleanName]`, jsx:1833 + the lookup at ~2010), so the order
document's swatch wins regardless. The prefix buys a legible debug log, not a
different printed result.

Added because of that finding: `inkLabel()` + a "SWATCHES: name clash" log line, so
a merge that changes an ink is visible instead of silent.

And the collision is structurally impossible in this pipeline anyway:

| premise | verified |
| --- | --- |
| Order doc starts with zero swatches | `clearOrderDocSwatches` strips all but `[None]`/`[Registration]`, called at jsx:135 and jsx:2595 |
| All named colors come from the mockup | `mockup.ai` XMP: exactly `186`, `base-color`. `pattern.ai` / `reference.ai` (byte-identical, md5 `64ccfe33…`): **zero** named swatches, plates are CMYK only |
| One name cannot hold two values in a document | Illustrator enforces unique swatch names per document |

So dropping the prefix entirely would also work (suites A/D/F: no duplicates, one
spot object per ink, spots stay SPOT, no dangling links, stable across 25 pastes).
Not done - it is a second change to the same scarred code path for an identical
end state, and it would cost the mockup-origin marker in the debug log.

## Outcome

- ✅ Impact: The saved order file now lists one swatch per ink. No `MOCK_` name reaches the file, values are unchanged, and artwork links directly to the single real swatch while keeping its spot identity.
- 🧪 Tests: `node --check` PASS; 51/51 unit checks PASS; shipped-file forensics PASS. No end-to-end order run (needs Illustrator, ~7 min).
- 📁 Files: Backend/scripts/automate_production.jsx
- 🔁 Next prompts: Ek real order chala kar swatch panel dekhna - sirf `186` aur `base-color` hone chahiye, koi `MOCK_` nahi; debug_log mein "SWATCHES:" line check karna.
- 🧠 Reflection: The alias appearing in the order doc's OWN plate names was the decisive evidence - it proved cross-document paste links art locally, which answered the "would dropping MOCK_ break the link" question from the file itself instead of from assumption.

## Evaluation notes (flywheel)

- Failure modes observed: The first instinct - delete the orphan alias - would have been wrong; the alias was still in use by real artwork, so deleting without re-pointing would have downgraded those items to process color. Reading the plate names/PDF separations rather than just the swatch list caught it.
- Graders run and results (PASS/FAIL): node --check PASS; unit suite 51/51 PASS; T7 reproduction of the shipped panel PASS.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): Run one order; if `debug_log.txt` shows the pre-save pass doing real work ("re-pointed N item color(s)"), find which paste site skipped `mergeAndCleanupSwatches` and add the cheap pass there instead.
