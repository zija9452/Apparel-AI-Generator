---
id: 163
title: Per-label clip host resolution
stage: green
date: 2026-08-22
surface: agent
model: claude-opus-5
feature: production_automation
branch: main
user: zija9452
command: (chat)
labels: ["patti", "neck", "size-tag", "clipping-mask", "extendscript", "bringPatternLabelsToFront"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Backend/scripts/automate_production.jsx
 - PENDING.md
tests:
 - scratchpad harness verify_label_clip.jsx against the job's own pattern.ai - 6 sizes x 6 parts x 2 variants - 30 SAME / 56 FIXED / 0 REGRESSION / 0 labels left at document root
 - node --check on a .js copy of automate_production.jsx - PASS
---

## Prompt

scratchpad pr verify kro wk size k sb patterns pr ye logic implement krne se , fix perfect ajaye to implement kr dena

(context: "kia plan he , kese resolve hoga ??", "neck pr bhi to he label; ? wo bhi to clipped he , to ye q nhi ?")

## Response snapshot

### The change

`bringPatternLabelsToFront` resolved the label destination ONCE per piece, scanning the
piece group's DIRECT children for `design_clip_group`. That assumed "one piece = one
clipping group". Replaced with a per-label resolver:

```js
function labelClipHost(item) {          // nearest clipped ancestor of THIS label
    var p = item.parent;
    for (var g = 0; p && g < 12; g++) {
        if (p.typename !== "GroupItem") return null;
        if (p.clipped) {
            for (var c = 0; c < p.groupItems.length; c++)
                if (p.groupItems[c].name === "design_clip_group") return p.groupItems[c];
            return p;
        }
        p = p.parent;
    }
    return null;
}
```

and the move site's fallback no longer relocates anything to the document root - a label
with no clipped ancestor stays where the pattern put it and is only raised above its own
siblings. `targetParent` is now unread (kept in the signature for the four call sites).

### Verification - scratchpad, all sizes

`verify_label_clip.jsx` runs inside the job's own `pattern.ai`, on DUPLICATES only,
replaying the real pipeline shape (`findPlacementPath` -> build `design_clip_group`
exactly like `:1283-1288`) and then running `bringPatternLabelsToFront`'s own label
detection and ancestor climb verbatim. Destinations are COMPUTED, not performed, so the
harness is read-mostly. Two variants per piece: design present, and design empty (the Neck
case in job 8fcab6ee).

| result | count |
| --- | --- |
| SAME (no behaviour change) | 30 |
| FIXED (document root -> inside a clip) | 56 |
| REGRESSION | 0 |
| labels still landing at the document root | 0 |

Front / Back / Front Left / Front Right / Short Sleeve / Neck resolve to the EXACT same
group as before, every size - so their exports should come out byte-identical. Every spill
past the mask is <= 0.36pt, the same amount Front and Back already tolerate today, so no
nudge was added.

Patti structure per size, straight from the pattern (this is what broke the old lookup):

```
YS/Small/Large/XL/2XL Patti  clipped=false -> two clipped=true strip groups
Medium Patti                 clipped=false -> 2 loose tag groups + two clipped=true strips
```

Medium Patti is the only piece where no clipped ancestor exists at all; it is what the new
in-place fallback is for.

### Two harness bugs caught and fixed mid-run

1. The stand-in design was created at the document origin, which inflated the piece's
   `visibleBounds` and therefore `cArea` - loosening the 10% guard in the ancestor climb
   and producing bogus "climbed to a whole strip" results on YS and 2XL Patti. Fixed by
   building the dummy over `baseShape`'s own bounds.
2. Spill was rounded to whole points, so a flush edge read as a 1pt spill. At 2 decimals
   every real spill is 0.36pt or less.

## Outcome

- Impact: Patti's two size tags and the Neck's tag stay inside their piece and get clipped like every other part; nothing leaves the piece for the document root any more
- Tests: harness 30 SAME / 56 FIXED / 0 REGRESSION / 0 root; node --check PASS. NOT yet run as a full Illustrator job
- Files: automate_production.jsx (labelClipHost + move site + dead `dest` removed), PENDING.md (new section 2c, section 3 bullet resolved)
- Next prompts: one real full-button job - confirm Front/Back/Sleeve exports are unchanged, both Patti tags render clipped inside their own strip, and the Neck tag is inside the piece
- Reflection: the old lookup failed silently and the JPG still looked plausible, so the bug survived a long time; the harness's value was proving the 36 unchanged cases, not the 56 fixed ones

## Evaluation notes (flywheel)

- Failure modes observed: assumption "one piece = one clipping group"; document-root fallback orphaning labels out of their piece
- Graders run and results (PASS/FAIL): PASS - 0 regressions across 6 sizes x 6 parts x 2 variants
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): re-run job 8fcab6ee and diff Small_Front_Left_Item1.jpg against the current one - it must be identical
