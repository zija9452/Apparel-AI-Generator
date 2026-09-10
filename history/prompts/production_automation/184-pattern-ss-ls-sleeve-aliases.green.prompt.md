---
id: 184
title: Pattern SS LS sleeve aliases
stage: green
date: 2026-09-10
surface: agent
model: claude-opus-5
feature: production_automation
branch: main
user: zija9452
command: (direct request)
labels: ["sleeve", "pattern-lookup", "aliases", "debug-log", "hoodie", "pocket-clip"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Backend/scripts/automate_production.jsx
 - Backend/services/illustrator_automation.py
tests:
 - node --check on automate_production.jsx (copied to .js) - PASS
 - python -m py_compile Backend/services/illustrator_automation.py - PASS
 - Evidence read from the real job: C:\Production\Hoodie\Hoodie\debug_log.txt, hoodie_warnings.txt, production_plan.json, XS\XS5-XS7.jpg
---

## Prompt

C:\Production\Hoodie\Hoodie\debug_log.txt kia issue aye hen is me ??or pattern me mene XS LS (long sleeve k liye ) nam rkha tha , mckup me LS support krta he , Pattern me bhi kre , or pocket pr kia clip nhi he ??

(follow-ups in the same exchange)
"E:\Clipping Path.JPG" is pocket me Jo jersey front ka clipping path he , wo delete hota , to jersey ka white effect na ata , or export to thk hua he . LS ka kia hua?
mene XS LS dia tha , mtlb long sleeve , to ye bhi aese supportt kre , short sleeve k liye XS SS , long sleevek liye XS LS (mtlb xs size ki long sleeve)
or pocket k liye Front ka clipping Path bn hi q rha he , ? us ka pocket ka cli[pping path he , bs wo thkhe na ,

## Response snapshot

Diagnosed the job from its own artefacts, then fixed the one real code defect.

**The sleeve was never built.** debug_log:125
`CRITICAL: Could not find 'XS Long Sleeve' in Master Pattern document (tried: XS, Adult XS, AXS). Skipping.`
The pattern piece is called `XS LS`. Root cause: `findPatternPanel` varied only the
SIZE half of the name, never the PART half - `resolvePartLabel` maps
`sleeve-long -> "Long Sleeve"` and that single label was all that was ever probed.
The MOCKUP side has understood `SS`/`LS` for a long time (`getSourceView`
lines ~9942-9974), so the two sides disagreed and a designer naming both files the
same short way lost a whole panel silently.

Fix - `partLabelAliases()` beside `findPatternPanel`, plus a Python mirror
`_part_label_aliases()` so the pre-flight cannot be stricter than the renderer:
- `Long Sleeve` -> `LS`, `Full Sleeve`, `Sleeve LS`
- `Short Sleeve` -> `SS`, `Half Sleeve`, `Sleeve SS`
- `Right/Left Sleeve` -> side-first/side-last plus both abbreviations

Deliberately STRICTER than the mockup side: length-aware, no cross-length match and
no bare `Sleeve` fallback. Picking the wrong mockup DESIGN is caught on screen;
cutting a long sleeve from a short-sleeve PATTERN piece is fabric in the bin.
Loop order is PART-outer/SIZE-inner with the canonical name first, so every pattern
that resolves today resolves to the identical piece.
Also taught the bare `"sleeve"` probe in `resolvePartLabel` the two abbreviations
(still returning the CANONICAL label, so cache/artboard/instance names are
unchanged), and made the CRITICAL log print BOTH halves it tried - the old line
listed only size aliases, which is exactly the information that was not useful.

**Other findings, reported not fixed (all pattern/mockup data, not code):**
- `XS Border` exported solid black. The mockup's `Border` group holds only a
  `remove` tag and a `Base-path`; both are stripped by design, leaving an empty
  design group, so `hoodiePasteDesign`'s clip block is skipped by its own
  `pageItems.length > 0` guard - silently, with no log and no warning.
- `Outside Hood Left` has no `base-path` while `Right` does, so the two halves take
  their panel colour from different places.
- Pocket warning `no clipping group found around the piece's outline`: `XS Pocket`
  carries no designer-built clipping group, so `clipHost` fell back to the piece
  group. Per the code's own note (job f6b1c036) `clipped=true` alone confines
  nothing - which is the white jersey silhouette the user saw in the .ai. The JPG
  is still correct because the artboard is fitted to the pocket.
**Second code change, same exchange - the pocket's duplicate `<Clipping Path>`:**
The Front's base shape was duplicated into the pocket purely to carry the flat
panel colour, in BOTH routes (`stageGroup` at 12700 for Paste-in-Back, and
`frontColorCopy` at 12748 for the fallback). That base shape is also the Front's
own clipping mask, so the copy landed in the pocket group as a second
`<Clipping Path>` beside the pocket's real one - the white jersey silhouette the
user screenshotted. On the user's instruction ("base color pocket k path ko de do"):
the colour now goes onto the pocket's OWN placement path via `fillShapeSolid`, and
both routes carry the design alone. One path holds the colour, one holds the clip.

That is how every other panel already works (`Panel base filled from design ...`
in the main loop, `hoodiePasteDesign` for Hood/Border) - the duplicate was the odd
one out. It also removes the white-fill problem the Paste-in-Back note records, and
the stale-bounds trap at 12823/12839 is unaffected: the artboard is measured from
`pocketBaseShape`, never through the clip group. Added `hoodieShapeFill()` to read
the source colour, because `fillColor` on a CompoundPathItem reads back plausibly
while painting nothing.

## Outcome

- ✅ Impact: (1) `XS LS` / `XS SS` now resolve, in both the renderer and the
  pre-flight; zero change for patterns using the full words, since the canonical
  name is still tried first against every size alias. (2) The pocket no longer
  carries a duplicate jersey-silhouette `<Clipping Path>`; its colour comes from
  its own outline instead.
- 🧪 Tests: syntax checks PASS on both files. NOT re-run through Illustrator - that
  needs the user's pattern. The Paste-in-Back route in particular is the
  empirically-tuned one (its comment records measured white-coverage percentages
  per size) and should be eyeballed on a pocket that HAS a designer-built clip.
- 📁 Files: 2 changed.
- 🔁 Next prompts: re-run the Hoodie job and confirm `XS LS` resolves; decide whether
  the empty-design case (Border) should warn instead of exporting a silent flat colour.
- 🧠 Reflection: the debug log named only the size aliases it tried, which sent
  attention to size spelling when the part spelling was the problem. Logging both
  halves is what makes the next occurrence self-diagnosing.

## Evaluation notes (flywheel)

- Failure modes observed: renderer and pre-flight can drift apart - the fix had to
  land in both files at once or the pre-flight would pause jobs the renderer could
  have completed. `_expected_pattern_pieces` states that rule in its own comment.
- Graders run and results (PASS/FAIL): syntax PASS both files. Illustrator render
  NOT graded.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): warn when a pasted design ends up empty
  after `remove`/`base-path` stripping, so a solid-colour Border is never silent.
