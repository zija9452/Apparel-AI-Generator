---
id: 145
title: Carry Mockup Kerning Onto Replacement
stage: green
date: 2026-08-20
surface: agent
model: claude-opus-5
feature: production_automation
branch: main
user: zija9452
command: (direct request)
labels: ["kerning", "tracking", "text-replacement", "illustrator", "jsx", "typography"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Backend/scripts/automate_production.jsx
tests:
 - kern_probe.jsx - read the real placeholder off the job mockup (API discovery)
 - kern_probe2.jsx - 6-step write-back matrix (A-F), all conclusive
 - kern_test.jsx - 14 assertions with applyTextSpacing injected verbatim from the shipping file (ALL PASS)
 - kern_visual.jsx - before/after JPEG comparison
 - node --check on the modified JSX (PASS)
 - remove_prefix_test.js 44 / no_mock_prefix_test.js 47 / swatch_merge_test.js 51 (ALL GREEN)
---

## Prompt

D:\...\Backend\uploads\5df0f67e-d8ae-45f4-87dd-9a6335c2ef37 , IS ME FONT ME DEFAULT DISTANCE A RHA HE 12 K BEECH , JESE DEFAULT DISTANCE HOTA HE FONT KA , lekin mockup me distance adjust kia jata he , mtlb Alt+ arroww se 1 and 2 k beech cursor rkh kr click kro to beech ka defaul;t distance kam kr dete hen hm , lekin pd me to default hi arha he , dekho 23 mockuop ka , or pd file ka numbers ,

(follow-up) dynamic kro , k kitni kerning tracking he , agr ek value ho m,ockup me to default jaye , agr mockup me do hen to dekho k kitna space he , utna hi rkho , or agr 3 hen to 2 k beeck ka diff 3 me bhi dal do , and so on... pehle plan share kro , then implemnetation

(follow-up) official metghod dekh lena , oficial apply krna or scartchpad me ek test kr lena back ka , k perfect a rha he ya nhi

(follow-up) edge cases discuss kr lena

(follow-up) letters pr kis trha apply ki jaye gi ye kerning ??? us pr bhi krni he

## Response snapshot

### The defect

`replaceInContainer` assigns `tf.contents = value` (jsx:8271). That resets **all**
per-character formatting - which is why the code already restores fill, stroke,
strokeWeight, size and font right after. Spacing was never in that list: `kerning`
appeared **0 times** in the whole 9,830-line file, and `tracking` only inside
`rebuildTextFrames`. So a designer's Alt+Arrow tightening in the mockup was silently
discarded and every number printed at the font's default gap.

### API, established by probing rather than assumed

| property | result |
| --- | --- |
| `characterAttributes.kerning` | **`undefined`** - the documented object has no such property |
| `characters[i].kerning` | **works** - value sits on the char AFTER the gap; **throws** where the pair was never hand-adjusted |
| `characterAttributes.tracking` | read-write, as documented |
| `kerningMethod` | stayed `AUTO` even with a manual value present |

Write-back matrix on the real mockup ("25", hand-kerned **-40**):

| test | result |
| --- | --- |
| A: after `contents = "78"` | kerning gone - **defect reproduced** |
| B: write with method left AUTO | 819.76 -> 788.82pt ✅ |
| C: `NOAUTOKERN` first, then write | identical 788.82 - **the extra step is unnecessary** |
| D: `tracking` on char[0] | identical 788.82 - equivalent lever for a single gap |
| F: 3 digits, both gaps | 1211.06 -> 1149.18 ✅ |

### The fix

New `applyTextSpacing` (jsx, above `replaceInContainer`), called **before** the
fit-to-mockup block - kerning changes `visibleBounds`, which is exactly what the fit
measures to decide shrink and re-center.

- save: one entry per gap, `null` where the pair was untouched
- apply: gap i takes gap i; a longer value repeats the last hand-set gap
- **word gaps skipped** - a gap touching a space keeps the font's own spacing
- **overlap guard** (`MAX_GAP_TIGHTEN = 0.15`): tightening per gap is capped at 15% of one
  character's average advance; past that all gaps ease by the same factor. The ceiling was
  first guessed at 0.30 and then **measured and corrected**: rendering "78" down a kerning
  ladder gave -40 clean, -100 touching, -160 clearly overlapped (0.075 / 0.189 / 0.302 of
  advance), so 0.30 permitted visible overlap. An ink-gap calculation cannot settle this -
  `visibleBounds` includes the stroke, which makes `w(AB) - w(A) - w(B)` come out at a
  constant -37.5 for every digit pair
- `rebuildTextFrames` also carries kerning now - it too builds a fresh frame

A gap the designer never touched needs no action at all: it was rendering at the font's
auto kerning and the replacement inherits that for free. That collapsed the planned
geometric-measurement fallback entirely.

### Verified

14/14 assertions, with `applyTextSpacing` extracted by brace-matching from the shipping
file so the test cannot drift from the code:

```
placeholder '25' hand-kerning per gap: [-40]
  PASS  carry onto '78'      got=[-40]
  PASS  carry onto '12'      got=[-40]
  PASS  single char no crash '4' gaps=[]
  PASS  carry onto '789'     got=[-40,-40]        (repeat rule)
  PASS  carry onto 'SMITH'   got=[-40,-40,-40,-40] (letters)
  PASS  word gap skipped     'AB CD' got=[-40,null,null,-40]
  PASS  <each> lost it before the fix / width tightened
```

## Outcome

- ✅ Impact: Hand-kerning set in the mockup now survives onto the production file, for numbers and names alike. Previously every replaced text printed at the font's default gap with nothing in the log to show it.
- 🧪 Tests: 14/14 new assertions PASS; node --check PASS; 142 existing checks still green. mockup.ai byte-identical on disk after all probing.
- 📁 Files: Backend/scripts/automate_production.jsx
- 🔁 Next prompts: a real end-to-end run to see it in a finished panel (~28 min) - not run, the change is verified at the unit level against the real mockup.
- 🧠 Reflection: The official reference was **wrong-by-omission** here - it documents `kerningMethod` and `tracking` but not `kerning`, which is the only property that actually holds the designer's nudge. Probing the real file settled in two minutes what the docs could not.

## Evaluation notes (flywheel)

- Failure modes observed: (1) First geometric probe reported `defaultWidth == actualWidth` and looked like "no kerning present" - the zeroing had been written to `characterAttributes.kerning`, which silently does nothing. Zeroing must go through `characters[i].kerning`. (2) The visual export first rendered blank: `src.duplicate()` keeps the copy inside the design's clipping mask, so moving it to empty canvas clipped it away - duplicate onto `doc.layers[0]` instead. (3) `Array.join()` renders `null` as empty string, producing `[,]` and invalid JSON.
- Graders run and results (PASS/FAIL): kern_test 14/14 PASS; node --check PASS; remove_prefix 44 PASS; no_mock_prefix 47 PASS; swatch_merge 51 PASS.
- Prompt variant (if applicable): scope moved mid-implementation from numbers-only to numbers+letters; the space-skip rule was added at that point.
- Next experiment (smallest change to try): log the carried per-gap values in a real run so it is visible whether other mockups use tracking rather than kerning.
