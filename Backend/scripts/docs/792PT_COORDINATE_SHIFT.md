# The 792pt coordinate shift — never read another document mid-layout

**Rule:** while the order document is being laid out, `automate_production.jsx`
must not read bounds from `patternDoc` or `mockupDoc`. Measure them *before*
the order document exists, cache the numbers, and read only the cache from
inside the item loop.

Breaking this rule does not throw. It silently moves pieces by exactly
**792pt** and the job still finishes and still exports.

---

## Why 792pt

Every new Illustrator document is created with the default **612 × 792pt**
Letter artboard. 792pt is that artboard's height, and it is the gap between the
order document's origin and the origin of any other open document.

Touching a foreign document's bounds mid-layout makes Illustrator report
coordinates in the *other* document's frame. The very next `piece.top = ...`
then lands the piece 792pt off its row.

Traced line by line on job **bdb2a7a6** (see the comment above
`prebuildPatternSizes`), watching one unchanged panel's reported top:

```
Found 'XL Back' in Pattern.        [panelTop = 7749]
Creating Instance: XL Back_Item1   [panelTop = 6957]   <- the foreign read
Placed pattern at Y:7749           [panelTop = 7749]   <- placed shifted
Searching for 'Placement Path'     [panelTop = 8541]   <- frame restored
```

The panel never moved. Only the number moved.

---

## How it shows up

Not as an error. As artwork that is wrong in a way that looks like a design
problem:

- Rows overlap; exports come out with a blank third and the panel cut off.
- On full-button jobs, the placket join reads Front-Left's drifted Y, pins the
  shared seam graphic there, and clips it into Front-Right — so **Front-Left
  looks correct and Front-Right has the design 792pt too high**, clipped at the
  top edge.

The tell in `debug_log.txt`:

```
SLOT SNAP [<size> Front Left_Item1]: piece had drifted 0pt across and
-792pt up out of its row slot during processing - moved back.
```

`0pt across` and exactly `-792pt up` is this bug, not a real drift.

---

## Why the existing safety nets do not save you

Three mitigations already exist, and none of them prevent this:

| Mitigation | What it does | Why it is not enough |
|---|---|---|
| Never recycle the default artboard (every piece gets a new one) | Stops the *first* piece landing 792pt out | Only covers artboard creation |
| `snapPieceToItsSlot` | Moves a drifted piece back to its row slot | Runs at **export time**, long after the placket join already captured the bad Y |
| `fitArtboardToPanel` | Re-fits the artboard to wherever the panel ended up | Same — too late, and it only fixes framing |

`snapPieceToItsSlot` logging "moved back" therefore does **not** mean the job is
fine. It means the shift happened.

---

## The correct pattern

Measure in the window before `app.documents.add()` creates the order document
(`automate_production.jsx` ~line 137):

```javascript
// Measured HERE, while the order document still does not exist.
prebuildPatternSizes();        // panel sizes  -> patternSizeCache
prebuildFullButtonScales();    // Back-driven scale + side-seam -> pmPrebuiltFullButton

updateStatus("Creating new Order file...", 45, false);
var orderDoc = app.documents.add(DocumentColorSpace.CMYK);
```

Then the item loop only ever reads the cache — `patternPieceHeightFor(name)`,
`pmPeekFullButtonScale(sizeLabel)`.

**Cache numbers, never object references.** `startNextOrderDoc` closes the
document on rollover, so any cached live item would point into a closed
document. Scale percentages and seam lengths in points survive; DOM objects do
not.

---

## Do not "fix" it by duplicating into the order document

That was the previous approach in `pmPeekFullButtonScale`: duplicate the pattern
panel and the mockup design into `orderDoc`, park them off-canvas, measure the
copies, delete them. It does avoid the 792pt shift — but it introduced a worse
bug, because it parked the copies at `(-50000, 50000)`:

- **±50000pt is far outside Illustrator's ~±16383pt canvas.**
- **Both shapes are clipping paths** whose parent group is clipped.

Together, `geometricBounds` on those copies returned **357.38 × 347.63in** for
the panel and **355.68 × 277.61in** for the design — against real values of
~27.85 × 36.07in and 22.68 × 32.10in. Identical for every size, so all five
sizes were handed the same **125.2%** instead of their own
100 / 102.4 / 106.4 / 110.2 / 112.4%.

Nothing caught it: 125.2% sits inside the 10–500% sanity band. The design came
out oversized on every panel, rode up past the shoulder line, and
`SHOULDER-ANCHOR` then reported `0 usable sample(s)` on all 28 panels because
there was no panel edge left above the band. Job **bb7c1b8c**.

(The same read had earlier produced 1082.9% on another job. `app.redraw()` was
added then; it did not address the cause.)

---

## Checklist before adding any measurement

1. Does it read `.geometricBounds` / `.visibleBounds` / `.width` / `.height`
   from `patternDoc` or `mockupDoc`? → move it into the prebuild window.
2. Are you tempted to duplicate-and-park instead? → don't; see above.
3. Does the cache hold DOM objects? → replace with plain numbers.
4. After a test run, grep the log:
   ```
   grep "SLOT SNAP" debug_log.txt      # any "-792pt up" = you broke it
   grep "PM-DIAG"   debug_log.txt      # abA and abB tops must match
   ```

`PM-DIAG` prints both front panels' bounds. On a healthy full-button job the
two tops are identical:

```
abA=[...,7747.43,...,5298.75]  abB=[...,7747.43,...,5298.75]   OK
abA=[...,8539.43,...,6090.75]  abB=[...,7747.43,...,5298.75]   792pt apart — broken
```
