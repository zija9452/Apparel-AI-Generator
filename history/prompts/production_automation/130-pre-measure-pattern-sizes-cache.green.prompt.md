---
id: 130
title: Pre measure pattern sizes cache
stage: green
date: 2026-08-18
surface: agent
model: claude-opus-5
feature: production_automation
branch: main
user: zija9452
command: chat
labels: ["root-cause", "792pt-drift", "cross-document-bounds", "canvas-overflow", "half-jpeg"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - Backend/scripts/automate_production.jsx
tests:
  - "node --check (jsx copied to .js) - PASS"
  - "instrumented mini-job (scratchpad/repro_job) - line-by-line panel top proved the 792pt jump lands on the pattern-doc bounds read"
  - "live job 7f1fc7c8 - logs 'PATTERN SIZES: pre-measured 20 panel(s) before the order document was created.'"
---

## Prompt

scratchpad se dekh lo ab ye , or ye bhi k jo jitna up jaye usi position pr wais ajaye
(earlier in the same thread: "revert q krna he dhoondo k ho q rha he , fix kro ise",
"d chain me koi isue nhi he , secon .ai file ka jo code he , us me issue hoga",
"ye 792 pt kis wja se uper ja rha he ??")

## Response snapshot

ROOT CAUSE (proved, not guessed). The instrumented run printed the panel's top on
every log line:

    Found 'XL Back' in Pattern.          [panelTop=7749]
    Creating Instance: XL Back_Item1     [panelTop=6957]   <- pattern-doc bounds read
    Duplicating pattern object ...       [panelTop=6957]
    Placed pattern at X:-5544 Y:7749     [panelTop=7749]   <- placed in the shifted space
    Searching for 'Placement Path' ...   [panelTop=8541]   <- artboards.add restored it

Reading `visibleBounds` of an item that lives in pattern.ai while the order document
is active shifts every reported coordinate by the gap between the two documents'
origins - exactly 792pt, the height of the default Letter artboard a new document is
born with. The piece is then positioned in that shifted space, `artboards.add()` puts
the space back, and the piece ends up 792pt above its own artboard: half JPEG, and it
overlaps the row above.

The canvas-overflow work added those mid-layout reads (`patternPieceHeight`,
`estimateSizeGroupHeight` needed a height BEFORE placing the piece). The old code
never read pattern-doc bounds - it duplicated first and measured in the order
document - which is why this pattern rendered correctly on 17 Aug and why the user
was right that D-CHAIN was innocent.

FIX: `prebuildPatternSizes()` walks `plan.production_groups` once and caches every
panel's width/height (`patternSizeCache`) while the order document still does not
exist, called immediately before `app.documents.add()`. The item loop and
`estimateSizeGroupHeight` now read only that cache - pattern.ai is never measured
mid-layout again. Cache is declared without an initialiser and filled lazily, because
the function runs at line ~128 while the declaration sits at line ~2520 (same `var`
hoisting rule already documented for `_nameIndexes`).

Kept as defence in depth, both generic (they correct whatever the actual drift is, no
hardcoded 792):
- `snapPieceToItsSlot` - moves a piece that drifted during processing back into the
  exact row slot the layout gave it, logging how far it had gone.
- `fitArtboardToPanel` - re-fits the artboard onto the panel outline through
  Illustrator's own `fitArtboardToSelectedArt`, rejecting a fit >20% off.
- every piece gets its OWN added artboard (the default artboard is no longer recycled
  for the first piece, and is removed at save time) - that recycling is why the first
  piece and the Necks were the only ones NOT drifting.

The temporary PANEL DRIFT TRACER added to `log()` for the diagnosis was removed.

## Outcome

- ✅ Impact: 792pt drift removed at the source; the overflow check keeps working, at zero cost during layout
- 🧪 Tests: node --check PASS; instrumented mini-job pinned the exact line; live job logs the pre-measure and continues normally
- 📁 Files: Backend/scripts/automate_production.jsx
- 🔁 Next prompts: confirm a full run logs no "SLOT SNAP" / "ARTBOARD FIT" lines; decide whether the three Hoodie artboard/export sites should get the same snap+fit
- 🧠 Reflection: the cost of a "cheap" measurement was not time, it was the coordinate space it silently switched - measure in the document you are placing into, or measure before that document exists

## Evaluation notes (flywheel)

- Failure modes observed: half JPEGs, overlapping rows, first piece and Necks unaffected (they took different code paths)
- Graders run and results (PASS/FAIL): syntax PASS; instrumented repro PASS (cause located); live pre-measure PASS
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): none - watch a full multi-size run for a single SLOT SNAP line, which would mean some other step still moves pieces
