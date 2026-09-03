---
id: 172
title: Rib cuff stroke overhang fix
stage: green
date: 2026-09-03
surface: agent
model: claude-opus-5
feature: production_automation
branch: main
user: zija9452
command: (chat) why is the sleeve rib lower than the mockup
labels: ["bug", "sleeve", "rib-cuff", "stroke", "bounds", "preserve_sleeve_rib_distance"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Backend/scripts/automate_production.jsx (rib/cuff alignment block inside the isSleeve && PRESERVE_RIB_DISTANCE branch)
tests:
 - node --check on a .js copy - PASS
 - numeric verification against the measured mockup and order file - new value 2.876in vs mockup target 2.875in (0.001in error); old value 1.960in (0.915in low)
 - read-only Illustrator COM probe of the live mockup + production_ready_order_2.ai (no document opened, none closed, nothing modified)
 - scratchpad/rib_test.jsx - real XL Short Sleeve Left built from the SAME two inputs the job uses (panel from the pattern doc, design from the mockup doc), rib block run twice (old formula vs fixed), both exported to JPG - PASS
---

## Prompt

C:\Production\Knuckle_Headz_Mint\Knuckle_Headz_Mint\2XL\2XL_Short_Sleeve_Left_Item1.jpg check this , and is me jo sleeve pr black rib design wo niche a rha he , count us ne strokes nhi ki hen , check mockup and production files.

(follow-up) lekin mockup me us rib pr stripes bhi hen yr , to phr ? us mockup k muqabil niche kr dia he use production me

(follow-up) illustrator me open kr k check kro , mockup ko bhi or ai production fil;e ko bhi , kia mistake hui he , or kia change tha

(follow-up) mjhe jese mockup me he , exact chahiye he na production k hr size me , yhi krta he na rib ?? to hua q nhi ?

## Response snapshot

The user was right about the cause on first guess: strokes were not counted.

**Root cause.** In the `isSleeve && PRESERVE_RIB_DISTANCE` block, the rib is MEASURED with
`rp.geometricBounds` (stroke EXCLUDED) but POSITIONED with `rp.top`, which - like `.left` - is
`visibleBounds[1]` and INCLUDES the stroke. Assigning the geometric distance to a visible property
puts the rib's PAINTED top where its unpainted path was meant to sit, so the whole band lands
`strokeWidth / 2` too low on every size and its bottom is clipped away by the panel.

**Evidence, measured not inferred (read-only Illustrator COM probe of the already-open documents):**

mockup `Mint Jersey Ai File.ai`, `Short Sleeve Left` - a CLIPPED group, so its own bounds are the
pre-clip extent (38.4in); the real panel is its `base-path` child (10.608in, 3pt cut stroke):

| mockup "rib" (one PathItem) | value |
|---|---|
| geometric top above panel bottom | 1.938in |
| geometric height | 1.959in |
| **strokeWidth** | **131.9pt (1.832in)** |
| painted top above panel bottom | **2.854in** |
| painted height | **3.791in** |

`debug_log.txt` printed `Rib/cuff line matched to test print: 1.96in from bottom, 1.96in tall` - both
numbers geometric, both correct, and both silent about the 1.83in of paint around them.

finished `production_ready_order_2.ai`, artboard 24 `2XL Short Sleeve Left_Item1`: the same path,
`geoH=1.959in sw=131.9pt` (height and stroke correctly preserved), but `visTop` 1.957in above the
artboard bottom against the mockup's 2.854in - **0.90in low, = half the stroke**. Confirmed
independently by scanning the exported JPG (painted band top at 1.960in, and the mint gap between the
two black bands showing no pinstripes because the displaced rib now covers them).

That also empirically proves `.top` is visible-bounds based: the code assigned 1.96in and the PAINTED
top, not the geometric one, landed there.

**Fix** (one statement plus the read that feeds it):

```js
var rbAfter = rp.geometricBounds, rvAfter = rp.visibleBounds;
var strokeTopOverhang = rvAfter[1] - rbAfter[1];
if (!(strokeTopOverhang > 0)) strokeTopOverhang = 0;
rp.left = baseShape.left - sideMargin;
rp.top = patternBottom + origDistFromBottom + strokeTopOverhang;
```

`origDistFromBottom` stays geometric and stays divided by `ribScaleY`, because only the GEOMETRY was
ever stretched - `resize` passes `lineScale = 100`, and the stroke measured 131.9pt in the mockup AND
in the finished order file, so it is never scaled. The overhang is therefore added back at full size
after the un-stretch. Read after the resize so it cannot go stale, and zero for an unstroked rib,
which reproduces the old behaviour exactly.

The log line now prints the painted top and painted height alongside the geometric ones, so the next
occurrence is visible in `debug_log.txt` instead of hiding behind two correct-looking numbers.

**Verification (arithmetic):** mockup painted rib top sits 2.875in above the panel's painted bottom
(2.854in above its geometric bottom, whose painted edge is 0.021in lower). Old code produced 1.960in.
New code produces 1.960 + 0.916 = 2.876in - a 0.001in error.

**Verification (end-to-end render).** `scratchpad/rib_test.jsx` builds a real XL Short Sleeve Left from
the same two inputs the job uses - the `XL Short Sleeve` group out of the pattern document and the
`Short Sleeve Left` group out of the mockup - runs `alignAndScale` and then the rib block twice, with
`strokeTopOverhang` forced to 0 for the OLD run, clips, and exports both to JPG. Scale came out
`scaleH = 103.68%`, one rib path found, `sw = 131.9pt`, `origDist = 1.944in`, `overhang = 0.916in`:

| | OLD | NEW | mockup |
|---|---|---|---|
| painted rib top above panel bottom | 1.944in | **2.860in** | 2.875in (painted datum) / 2.854in (geometric) |
| painted rib height | 3.791in | 3.791in | 3.791in |

The test panel's cut path carries a 1pt stroke (the pattern file's own) rather than production's 3pt,
so its painted bottom is 0.007in below its geometric one: 2.860 - 0.007 = **2.853in vs the mockup's
2.854in**. Pixel-scanning the two exports agrees - NEW gives bands at 2.867 / 2.393 / 1.947in against
the mockup's 2.873 / 2.407 / 1.957in, OLD gives 1.947 / 1.473 / 1.027in.

Illustrator document count and names were identical before and after the run (3 -> 3): the test only
ever created its own documents and closed only those, per the standing never-close-open-docs rule.

Side note recorded because it contradicts an in-conversation assumption: the mint gap between the two
black bands carries no pinstripes in the MOCKUP either. It looked like a regression only because the
displaced rib had moved that plain gap up into the striped area. Position was the whole defect.

## Outcome

- ✅ Impact: `preserve_sleeve_rib_distance` now actually delivers what it promises - the mockup's rib
  position reproduced on every size - instead of being half a stroke width low on all of them.
- 🧪 Tests: `node --check` PASS; numeric check against measured mockup/order values PASS (0.001in).
  Not yet run through Illustrator - the finished job was left untouched.
- 📁 Files: 1 source file. The delivered Knuckle_Headz_Mint output is NOT retro-fixed; every sleeve in
  that job still carries the 0.90in drop and needs a re-run to correct.
- 🔁 Next prompts: re-run one size of Knuckle_Headz_Mint and check the new log line reports painted top
  ~2.87in, then confirm the pinstripes run through the mint gap again.
- 🧠 Reflection: The log was the trap. It printed two numbers that were individually true and together
  described only a third of the object - a 1.96in path wearing 1.83in of paint. Any check that
  compared the log against the mockup's PATH would have passed. What broke the tie was reading
  `visibleBounds` and `geometricBounds` side by side on the same item.
- 📋 ADR: not suggested - a defect fix inside an existing feature, no architectural choice.

## Evaluation notes (flywheel)

- Failure modes observed: (1) measure-with-geometric / set-with-visible mismatch, the actual bug;
  (2) a clipped group's `geometricBounds` reporting its pre-clip extent (38.4in vs the real 10.6in
  panel), which made the first probe return nothing and had to be worked around by measuring against
  the group's own `base-path`; (3) JPG mtimes are useless as evidence here - the pixel scan was.
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): audit the other places that pair a `geometricBounds` read
  with a `.top`/`.left` write - the same mismatch would be invisible anywhere the art happens to be
  unstroked today and would appear the day a designer adds a stroke.
