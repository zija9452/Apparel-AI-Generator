---
id: 148
title: Size Tag Gap Reads Outline Instead Of Hardcode
stage: refactor
date: 2026-08-20
surface: agent
model: claude-opus-5
feature: production_automation
branch: main
user: zija9452
command: (direct request)
labels: ["local-tag", "size-tag", "visible-bounds", "stroke", "hardcode", "illustrator", "jsx"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Backend/scripts/automate_production.jsx
tests:
 - node --check on the modified JSX (PASS)
 - grep sweep confirming no `+ 1.5` half-stroke constants remain
---

## Prompt

isi trha size tag jo he use me bhi visible bounds use hua he ??

(follow-up) hn visible bounds kr do udhr bhi hardcoded hta kr

## Response snapshot

### What was actually there

`processLocalTagLabel` positions the size tag from the panel's true bottom-right corner,
found with `_smSampleOutline(baseShape, 64)` - which samples **path** geometry. The cut
outline straddles that path, so each of the three branches added half a stroke back by
hand:

| branch | right gap | up gap |
| --- | --- | --- |
| Full button | `2.5*72 + 1.5` | `2*72 + 1.5` |
| Hoodie | `1*72 + 1.5` | `1.5*72 + 1.5` |
| Normal jersey | `2.5*72 + 1.5` | `3*72 + 1.5` |

So the half-stroke was already compensated - just with a literal that is correct only
while `PATTERN_OUTLINE_PT` stays at 3, and silently wrong the moment it doesn't, with
nothing in the log to show it.

### A claim of mine that was wrong

I first flagged the tag's own reference as an inconsistency:

```js
var posRb = posClip ? posRefItem.geometricBounds : posRefItem.visibleBounds;
```

It is not. `findActiveClipPath` returns the item whose `.clipping` is true - a real
clipping mask - and a mask's own stroke is never drawn. So when a mask is present its
`geometricBounds` **is** the painted boundary, and `visibleBounds` is right only when
there is no mask. That is exactly the rule `_blPaintedBounds` applies. Nothing to change,
and I said so before touching it.

### The change

One reader, three call sites:

```js
var halfOutline = 0;
try { if (baseShape.stroked) halfOutline = baseShape.strokeWidth / 2; } catch (eSW2) {}
```

`+ 1.5` -> `+ halfOutline` in all three branches. Same code and same reasoning as
`placeBackLabel`'s neck reference (PHR 146), so the two features now measure the panel
edge the same way.

**Zero behaviour change today** - `halfOutline` evaluates to 1.5 on this job, because the
outline is 3pt. This buys correctness if the outline width ever moves, and removes a
constant that had no link back to the thing it was derived from.

## Outcome

- ✅ Impact: no visible change now; the size tag's gap can no longer drift out of step with `PATTERN_OUTLINE_PT`.
- 🧪 Tests: node --check PASS; grep sweep shows no `+ 1.5` half-stroke literals left in the file.
- 📁 Files: Backend/scripts/automate_production.jsx
- 🔁 Next prompts: end-to-end run covering PHR 146/147/148 together, then measure the size tag gap and the back-label offset by hand.
- 🧠 Reflection: worth noting the file already had this right in two different ways - the `+ 1.5` and the clip-aware `posRb` - it just had no shared vocabulary for "the painted edge". `halfOutline` and `_blPaintedBounds` are now that vocabulary, used identically in both features.

## Evaluation notes (flywheel)

- Failure modes observed: I asserted the clip-aware `posRb` line was an inconsistency before reading `findActiveClipPath`. It was deliberate and correct. Reading the helper first would have saved the user a wrong claim; the correction was made in the same turn, before any edit.
- Graders run and results (PASS/FAIL): node --check PASS.
- Prompt variant (if applicable): the user's two instructions ("visible bounds kr do" + "hardcoded hta kr") collapse into a single change here, because reading the stroke IS what makes the panel end a painted-edge measurement.
- Next experiment (smallest change to try): log `halfOutline` alongside the LOCAL-TAG-DIAG line so a non-3pt outline is visible in debug_log.txt.
