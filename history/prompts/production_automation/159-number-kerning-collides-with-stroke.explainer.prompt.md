---
id: 159
title: Number kerning collides with stroke
stage: explainer
date: 2026-08-22
surface: agent
model: claude-opus-5
feature: production_automation
branch: main
user: zija9452
command: (chat)
labels: ["kerning", "stroke", "text-replacement", "overlap-guard", "typography"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Backend/uploads/8fcab6ee-352b-4140-99ec-818eaabd7bc4/renders/*.jpg (read only)
 - Backend/uploads/8fcab6ee-352b-4140-99ec-818eaabd7bc4/renders/debug_log.txt (read only)
tests:
 - PIL pixel scan of 5 Back renders at 300 DPI - white-outline gap measured per number
---

## Prompt

"D:\Zija_Yaseen\Web development\AI-Apparel-Order-Generator\Backend\uploads\8fcab6ee-352b-4140-99ec-818eaabd7bc4\renders\Small_Back_Item2.jpg" ye dekho number 77 ki kerning mil rhi he ., q??, kia ye stroke ki wja s eus pr lgi ? stroke count hoti he distance me ?

## Response snapshot

**Measured, not estimated.** Renders are 300 DPI, so 1pt = 4.167px. Horizontal pixel
scan across the top bar of "77" (`Small_Back_Item2.jpg`):

```
Y (left 7) ...3365      yellow ink ends
K 3366..3409   44px     black keyline
W 3411..3454   44px     white outline
   3455..3458   4px     the only real gap
W 3459..3502   44px     white outline (right 7)
K 3503..3546   44px     black keyline
Y 3548...               yellow ink starts
```

- yellow-to-yellow gap: 183px = **43.9pt**
- outline paint alone (black 10.6pt + white 10.6pt, both sides): **42.2pt**
- what is left: **1.7pt** -> touching

So 42 of the 44pt is stroke. **But the stroke is counted nowhere:**

1. `character.kerning` is a 1/1000-em offset on the glyph ADVANCE. Illustrator lays
   out the outline and paints the stroke afterwards, centred on it - it never feeds
   back into layout.
2. The overlap guard (`automate_production.jsx:8661-8670`) does read `visibleBounds`,
   which includes the stroke, but it SUBTRACTS before-vs-after widths, so the stroke
   constant cancels:
   `tightenPerGap = (928-892)/1 = 36pt` vs `maxTighten = (928/2)*0.15 = 69.6pt`.
   36 < 69.6, guard silent at half its threshold while the digits collide. The code's
   own comment at `:8606-8608` already says an ink-gap calculation "comes out constant
   across every digit pair and says nothing about collision".

**Root cause:** the mockup placeholder is `'25'`, hand-kerned -40 em. That is a fixed
~36pt shift on EVERY pair (`gapValue` repeats the placeholder's gap, `:8630-8635`),
but each digit pair's natural sidebearing differs. Same job, same -36pt:

| number | white-to-white gap | verdict |
|---|---|---|
| 87 | 22.3pt | clean |
| 77 | **1.0pt** | touching |
| 12 | **7.0pt** | touching |

Secondary contributor: the design is scaled to ~91% by
`pmAlignAndScaleToHeight` (`:6625`) with `changeLineWidths = 100`, i.e. strokes keep
their absolute weight while glyphs shrink - outlines come out ~10% fatter relative to
the glyphs than in the mockup. Affects every number equally, so it is not what
separates 87 from 77.

## Outcome

- ✅ Impact: collision explained with measured numbers; both of the user's questions answered (yes the stroke causes the look, no it is not counted)
- 🧪 Tests: PIL scan across 5 Back renders; comparison sheet built and sent
- 📁 Files: none modified
- 🔁 Next prompts: decide the fix - measure the real per-glyph ink gap (duplicate + `createOutline()` on a throwaway copy gives per-glyph `visibleBounds` including stroke; `TextRange` itself has no bounds) and ease kerning until the gap clears, vs. simply lowering `MAX_GAP_TIGHTEN` (blunt - would loosen 87 too)
- 🧠 Reflection: PHR 145 measured the ceiling on ONE pair ("78") and generalised it; the ceiling is per-pair, and the stroke stack is what makes the per-pair spread matter

## Evaluation notes (flywheel)

- Failure modes observed: a guard written on total-width deltas is structurally blind to the quantity it is guarding (per-pair ink gap); a constant em kerning carried across different glyph shapes is not a constant visual result
- Graders run and results (PASS/FAIL): pixel measurement PASS (reproducible, 300 DPI -> pt conversion exact)
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): on a throwaway `tf.duplicate()`, run `createOutline()` and read adjacent glyph `visibleBounds` - confirm the gap it reports matches the 1.7pt measured from the JPEG
