---
id: 111
title: Local tag shifted offset path noop
stage: explainer
date: 2026-08-17
surface: agent
model: claude-opus-5
feature: production_automation
branch: main
user: zija9452
command: chat
labels: ["local-tag", "pocket", "offset-path", "applyEffect", "redraw", "hoodie", "bug"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - (diagnosis only - no project files modified yet)
tests:
 - read-only COM probes reconstructing hoodieResolveLocalTagVsPocket for size Small
 - 4-way matrix isolating why applyEffect("Adobe Offset Path") no-ops
 - cross-checked against the 2026-08-12 verification run in scratchpad/pocket_test
---

## Prompt

ok , perefct lekin is job k logs dekhop , or btao k local size tag 0.5 inch niche q gya ?? jb k offset lene k bd wo local tag offset se nhi takra rha tha , to phr q ?

(follow-up) yr , mene offset official lgaya tha , scratchpad me dekho , ya phr records me , official way mile ga , wo thk a rha tha , C:\Users\scb\AppData\Local\Temp\claude\D--Zija-Yaseen-Web-development-AI-Apparel-Order-Generator , D:\Zija_Yaseen\Web development\AI-Apparel-Order-Generator\Backend\Production testing files, or dekho

## Response snapshot

Root cause: `officialInsetPolygon` (`automate_production.jsx:7095`) is missing the
`app.redraw()` that the original 2026-08-12 verification script had. Without it,
`executeMenuCommand("expandStyle")` runs before Illustrator materialises the live
effect, so nothing is expanded and the function returns the pocket's RAW outline.

4-way matrix on the real pocket path (both variables isolated):

| duplicate destination | app.redraw() after applyEffect | expanded typename | shrink W x H |
|---|---|---|---|
| `doc.layers[0]` | yes | GroupItem | **229.3 x 187.7** (real inset) |
| `doc.layers[0]` | no  | PathItem  | 0 x 0 |
| in place (inside the clipping group) | yes | PathItem | 0 x 0 |
| in place | no | PathItem | 0 x 0 |

BOTH conditions are needed. Production already duplicates to `orderDoc.layers[0]`
(`:7098`, correct) but never calls `app.redraw()` between `:7099` and `:7106`.
The working reference is
`scratchpad/pocket_test/compare_offset.jsx:174` (`app.redraw()` right after
`applyEffect`), whose recorded output in `inspect_out/offset_compare.txt` reads
`w=1007.1 h=647.9` - identical to the corrected probe here (1007.13 x 647.925).

Downstream damage: `applyEffect` never throws, so the `catch` fallback at `:7114`
can never fire. `insetPoly` comes back truthy-but-raw, and `:7143` therefore sets
`testMargin = 0`, switching OFF the whole 1-inch rule. The check degenerates to
"does the tag touch the pocket at all".

Measured for Small (job e0ce3379), tag at its intended 1in-left / 1.5in-up corner:

- panel true bottom-right corner = (-5290.127, 5556.869) in pattern space
  (= -2052.2, 2006.5 mm in order space - matches the job's LOCAL-TAG-DIAG line)
- tag box (3in x 1.8in clip path) = L -5579.627, T 5795.969, R -5363.627, B 5666.369
- pocket staged on Front = vis [-6749.58, 6392.44, -5511.84, 5555.37]
- correct -1in inset bbox = [-6634.11, 6275.79, -5626.98, 5627.87] (1007.13 x 647.93)
- tag vs CORRECT inset: **0 of 325 grid points** -> `deepestXInRect` returns null
- tag vs RAW outline at margin 0: 5 hits, deepest 10.404pt = **3.67mm**
- tag vs RAW outline at margin 1in (the fallback): 0 hits -> also CLEAR

So both correct paths agree the tag was already clear; only the broken path fires.
That 3.67mm graze triggered `localTagGroup.translate(0, -36)` (`:7153`) and dropped
the tag from 1.5in-up to 1.0in-up, which is what the job log records.

Correction issued: an earlier reply in this session claimed `applyEffect` is a no-op
on this Illustrator install. That was wrong - it was an artefact of the probe
duplicating the path in place (the placement path is itself a clipping path) and
skipping `app.redraw()`. The user's records were correct.

Proposed fix (not applied - awaiting go-ahead):
1. `app.redraw();` immediately after `probe.applyEffect(...)` at `:7099`.
2. Guard: if the expanded polygon's bbox has not shrunk on both axes, return null so
   the existing 1in depth test takes over - a silent no-op must not disable the margin.

Secondary (minor): `hoodieResolveLocalTagVsPocket` duplicates the Pocket piece at
`:7016` without `applyPatternOutlineStroke`, so the measurement copy stays at 1pt
while the Front is at 3pt - ~1pt (0.35mm) staging asymmetry in `dy`.

## Outcome

- ✅ Impact: Real root cause is a dropped `app.redraw()` during the port from the
  verification script into automate_production.jsx - affects every hoodie job's
  Pocket/Local-Tag decision, not just this one.
- 🧪 Tests: 5 read-only probes; temps removed, docs closed DONOTSAVECHANGES.
- 📁 Files: None modified.
- 🔁 Next prompts: Apply both fixes, re-run a hoodie job, expect the log to flip to
  "Local Tag already clear of the Pocket - not moved."
- 🧠 Reflection: Two probe defects produced a confident wrong answer. When a probe
  contradicts a recorded, previously verified result, the probe is the suspect -
  diff it against the recorded script before believing it.

## Evaluation notes (flywheel)

- Failure modes observed: (a) live effect silently not materialised without redraw;
  (b) truthy-but-wrong return value disabling a safety margin downstream;
  (c) my own probe reproducing neither the destination nor the redraw of the
  reference script, and me trusting it over the user's records.
- Graders run and results (PASS/FAIL): PASS after correction - corrected probe's
  inset (1007.13 x 647.925) matches the 2026-08-12 record (1007.1 x 647.9).
- Prompt variant (if applicable): N/A
- Next experiment (smallest change to try): add `app.redraw()` at :7100 and assert
  `insetW < srcW - 100 && insetH < srcH - 100` before returning.
