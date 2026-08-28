---
id: 100
title: Border size tag buried under the pasted design
stage: green
date: 2026-08-13
surface: agent
model: claude-opus-5
feature: production_automation
branch: main
user: zija9452
command: (direct request)
labels: ["hoodie", "border", "size-tag", "z-order", "clipping-mask", "illustrator-jsx"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Backend/scripts/automate_production.jsx
tests:
 - Read-only structure dump of Small/XL/2XL Border in pattern.ai - all three are [outline (clipping mask), tag group [TextFrame, background box]], tag text "Small" / "X-Large" / "2X-Large"
 - Illustrator harness replicating hoodiePasteDesign's clip block on the real Border piece - z-order confirmed as [0] design_clip_group, [1] outline, [2] tag; light pixels before fix = 0, after fix = 2115 (tag + box visible)
 - node --check on automate_production.jsx (syntax)
---

## Prompt

sb me , front back me ?? sb me ?

to border me q nhi a rha he

## Response snapshot

**Which pieces actually had the problem** (checked against the pattern, not assumed):
Front, Back, Long Sleeve, Rib & Cuff and Hood all carry a tag AND show it. Only
Pocket (fixed in PHR 099) and **Border** were missing theirs.

**Correction to an earlier claim in this session:** I first reported the Small
Border tag as empty. A clean read shows it is `"Small"` (len 5); XL is
`"X-Large"`, 2XL is `"2X-Large"`. The first read had failed silently.

**Why Border loses it.** Every Border piece is:
```
Border group (clipped=true)
  [0] PathItem   1573x396  clipping=true    <- the mask
  [1] GroupItem  [ TextFrame "Small", 188x14 background box ]
```
`hoodiePasteDesign` (automate_production.jsx:6120) inserts the design with
`clipGroup.move(baseShape, ElementPlacement.PLACEBEFORE)` - in FRONT of the
outline. Final z-order, confirmed in the harness:
`[0] design_clip_group  [1] outline  [2] tag`. The Border design is a solid hem
band covering the whole piece, so it paints straight over the tag. Measured: 0
light pixels in the export.

The main per-item loop produces the exact same stacking at line 928 but then
calls `bringPatternLabelsToFront` at line 1102, which is why Front/Back/Sleeve/
Rib & Cuff all keep their tags. `hoodieBuildBorder` never went through that loop.

**Fix:** one call added to `hoodieBuildBorder` after `clearAllStrokes` -
`bringPatternLabelsToFront(dupBorder, dupBorder, null)`. Plain container works
here because `design_clip_group` is a direct child (unlike the Pocket, which
needed the clipHost hunt). The shared `hoodiePasteDesign` is deliberately NOT
touched, so Hood - which uses the same helper and already renders its tags - is
unaffected. Safe before the artboard: `bw`/`bh` are measured at the top of the
function, so a z-order change cannot alter the export size.

Verified on the real Border piece: 0 light pixels before, 2115 after, with
"Small" and its white box visible. XL/2XL Border are structurally identical.

## Outcome

- ✅ Impact: Border exports now carry their size tag, closing the last piece that was silently dropping it.
- 🧪 Tests: structure dump of all three Border pieces; before/after harness export on the real piece; syntax check. Not yet re-run through the full pipeline.
- 📁 Files: Backend/scripts/automate_production.jsx (bringPatternLabelsToFront call in hoodieBuildBorder)
- 🔁 Next prompts: re-run the job and confirm Pocket + Border tags in the renders.
- 🧠 Reflection: worth auditing every piece against the pattern rather than fixing only the one that was reported - and worth re-reading a value that came back empty before repeating it.

## Evaluation notes (flywheel)

- Failure modes observed: reporting a silently-failed property read as fact; assuming only the reported piece was affected.
- Graders run and results (PASS/FAIL): light-pixel count PASS (0 -> 2115); z-order assertion PASS (design above outline above tag).
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): after the next full run, diff every render for a visible tag so a buried label is caught automatically instead of by eye.
