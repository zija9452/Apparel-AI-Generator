---
id: 160
title: Measured glyph collision guard
stage: green
date: 2026-08-22
surface: agent
model: claude-opus-5
feature: production_automation
branch: main
user: zija9452
command: (chat)
labels: ["kerning", "stroke", "collision-guard", "createOutline", "text-replacement", "dynamic"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Backend/scripts/automate_production.jsx
tests:
 - node --check on a .js copy of automate_production.jsx - PASS
 - scratchpad run_guard_test.py against job 8fcab6ee's real mockup.ai - PASS on 8 numbers
---

## Prompt

to kerning me count bhi thk kro mockup se , or order me implement me bhi .

(follow-ups: "mera tolerance kia he is me ??" / "hn , sirf overlap r merge na kre is trha , thora to gap rkhen visual me" / "mtlb k mockup ka gap rkho exactsame , us k bd agr merge overlap ho to loosen krna he thora sa bs" / "is ko dynamic rkhna he k stroken bhi merge na hon" / "ye dynamic hoga ?? agr koi or font opr koi number or koi article hua to perfect aye ga ?" / "complete dynamic he ? koi font size, weight, article , kerning hui to perfect aye ga ?")

## Response snapshot

**Scope, as the user narrowed it:** the mockup's hand-kerning stays EXACTLY as the
designer set it. The guard only steps in where carrying that value onto different
glyphs makes the paint merge, and then only loosens - never tightens a clean pair.

**Why the old guard could never work.** Two measurements were needed and each is
blind on its own:

- `tf.visibleBounds` is ADVANCE-based, not ink-based. Proof was already sitting in
  PHR 145's own data (`kern_overlap_out.json`): `W(AB)-W(A)-W(B)` came back at
  exactly `-37.5` on seven different digit pairs. An ink gap cannot be identical
  across pairs with different side bearings. That session read the constant as
  "says nothing about collision"; it is in fact the PAINT OVERHANG, which is why it
  was constant.
- `createOutline()` gives true per-glyph ink boxes but DROPS the appearance -
  probed: `visibleBounds === geometricBounds`, `stroked === undefined`,
  overhang/side 0 on every outlined glyph.

Together: `paintedGap = inkGap - overhang`. Validated against the finished 300 DPI
JPEG of job 8fcab6ee - predicted 0.71pt for '77' and 20.4pt for '87', measured off
the pixels 1.0 and 22.3.

**Everything is measured; the guess that would have broken on another font was
caught by the test.** The first implementation assumed one kerning unit = size/1000.
The test showed the real slope is **0.885pt/unit** where that predicts 1.011 (the
text carries a horizontal scale). Replaced with a loop that measures the slope from
what the first nudge actually achieved, re-measures, and corrects - converges in 2
rounds, warns in the log if 4 rounds still fall short.

New in `automate_production.jsx`:

| piece | measured from |
| --- | --- |
| `measurePaintOverhang` | `W(A)+W(B)-W(AB)` on a scratch duplicate, kerning forced to 0 |
| `measureGlyphInkGaps` | `createOutline()` on a duplicate placed on layer 0 |
| slope (pt per kerning unit) | the first correction round's actual result |
| floor | `max(0.25 x overhang, 0.005 x size)` |

The duplicate goes to `doc.layers[0]` deliberately: a copy made in place stays inside
the design's clipping mask and reports cropped bounds (the mockup's own '25' reads
891.6pt clipped vs 918.1pt free).

**Test, against the real mockup, helpers extracted from the shipping file by
brace-matching so it cannot drift:**

```
measured paint overhang = 42.9pt  ->  floor = 10.7pt
 '25'  16.7pt  untouched            '87'  22.3pt  untouched
 '88'  15.4pt  untouched            '47'  17.6pt  untouched
 '77'   0.7pt  -40 -> -28  -> 11.4pt      '12'   3.8pt  -40 -> -32  -> 10.8pt
 '11'   3.8pt  -40 -> -32  -> 10.8pt      '78'  -6.2pt  -40 -> -20  -> 11.5pt
 '100'  3.8/15.4pt  -> -32/-40  -> 10.8/15.4pt      (per-gap: one fixed, one left)
 '777'  0.7/0.7pt   -> -28/-28  -> 11.4/11.4pt
 '789' -6.2/10.7pt  -> -20/-39  -> 11.5/11.6pt
 '7'    fewer than 2 glyphs - guard skips
RESULT: PASS
```

The mockup's own placeholder '25' is untouched, so the guard never overrules the
designer on the string they actually kerned.

**The one judgement number, stated as one:** the `0.25` ratio. Bracketed by this
job's artwork rather than picked - clean pairs measure 15.4/16.7/17.6/22.3pt, merged
pairs -6.2/0.7/3.8pt, leaving a 4-15pt empty band; 0.25 x 42.9 = 10.7pt sits in it
near the low end (smallest correction that still clears, which is what was asked).

## Outcome

- ✅ Impact: '77', '12', '11' and '78' stop merging; every clean pair including the placeholder is left byte-identical to the designer's intent
- 🧪 Tests: node --check PASS; guard test PASS on 12 values (1, 2 and 3 digit) against the real mockup. NOT yet run as a full job.
- 📁 Files: `Backend/scripts/automate_production.jsx` (measurePaintOverhang, measureGlyphInkGaps, MIN_PAINTED_GAP_OF_OVERHANG/OF_SIZE, the collision loop in applyTextSpacing, `live[]` tracking in applyAll)
- 🔁 Next prompts: run a real job and read the new "spacing guard" lines; confirm the ~1 extra outline op per number does not stretch the ~28 min run; decide whether the now-redundant width-based `MAX_GAP_TIGHTEN` guard should come out

### Everything hardcoded, in full

| value | where | what it is |
| --- | --- | --- |
| `0.25` | `MIN_PAINTED_GAP_OF_OVERHANG` | the only real judgement number - floor as a share of the measured overhang |
| `0.005` | `MIN_PAINTED_GAP_OF_SIZE` | only reachable when there is no outline at all; loses to `Math.max` otherwise |
| `4` | `MAX_ROUNDS` | loop cap, not tuning - converges in 2, then logs CHECK BY EYE |
| `size / 1000` | slope opening guess | replaced by the measured 0.885 after round 1. This one WAS a hidden assumption; the test caught it |
| `1` | minimum `add` | stops a zero-step loop |
| `0.01` | float epsilon | |
| `2` | `items.length < 2` | fewer than two glyphs cannot collide |
| `-1`, `wAB`, `0.05`, `10` | sanity bounds | any trip makes the guard skip, leaving the designer's value untouched |
| `0` | kerning during overhang measurement | deliberate - isolates the appearance |
- 🧠 Reflection: the earlier session's discarded constant was the answer to this bug all along - a measurement labelled "useless" is worth re-deriving before trusting the label

## Evaluation notes (flywheel)

- Failure modes observed: (1) size/1000 as the kerning slope is wrong by 12% here and would be wrong differently on any other styled text - only the test caught it; (2) a duplicate made in place inherits the clipping mask and reports cropped bounds; (3) `createOutline()` silently drops appearance, so its gaps are ink, not paint
- Graders run and results (PASS/FAIL): run_guard_test.py PASS (8/8, both directions - clean pairs unchanged, merged pairs cleared)
- Prompt variant (if applicable): scope moved from "reproduce the mockup's gap exactly" to "keep the mockup's kerning, only loosen collisions" mid-implementation
- Next experiment (smallest change to try): a 3-digit value ("100") through the same harness, asserting each gap is solved independently
