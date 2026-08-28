---
id: 149
title: Hood Stops Counting Stroke Allowance
stage: refactor
date: 2026-08-20
surface: agent
model: claude-opus-5
feature: production_automation
branch: main
user: zija9452
command: (direct request)
labels: ["hood-center-match", "side-seam-match", "placket-match", "stroke", "consistency", "illustrator", "jsx"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Backend/scripts/automate_production.jsx
tests:
 - node --check on the modified JSX (PASS)
 - constant replay - overlap stays 19.00mm, matching SS_OVERLAP_PT exactly
---

## Prompt

or full button me overlap me kia he ?? wese hi side seam match and hood match me he ??

(follow-up) full button ki logic jesi he vsible bounds and stroke ki , wesi hi hood match me or side seam match me he ? yes or no ?

(follow-up) full button blkl thk he , or zero gap me wo stroke ko count krta he ??

(follow-up) full button thk he blkl , aesa hi hona chahiye he , side seam bhi aesa hi he ?? or hood bhi ??

(follow-up) to hood se 3pt hta do , wo na copunt kr eise

## Response snapshot

### The audit

| seam | placement gap | overlap built from | stroke counted? |
| --- | --- | --- | --- |
| Placket (`PM_OVERLAP_PT`) | zero VISIBLE gap, so paths sit 3pt apart | constant 2.25in, no gap term | **no** |
| Side seam (`SS_OVERLAP_PT`) | layout's 5mm VISIBLE, so paths sit 6.06mm apart | constant 14 + 5 = 19mm | **no** |
| Hood (`HCM_*`) | `HCM_GAP_PT` visible, tuned so paths sat exactly 5mm | **measured** path gap, 14 + 5 = 19mm | **yes** |

All three place on visible edges (`pWidth` comes from `pastedPattern.visibleBounds`, and
`.left` is visible-based too). The placket and side seam then both ignore
`PATTERN_OUTLINE_PT` when they simulate the sewn slide - each leaves exactly 3pt
(1.06mm) uncounted. The hood was the only one that counted it, by setting
`HCM_GAP_PT = 5mm - PATTERN_OUTLINE_PT` and then measuring the real path-to-path
distance rather than rebuilding it from constants.

### The change

Per explicit instruction, the hood now behaves like the other two:

```js
var HCM_GAP_PT = 5 * SM_MM;              // was 5 * SM_MM - PATTERN_OUTLINE_PT
...
var overlapPt = HCM_SEW_PT + HCM_GAP_PT; // was HCM_SEW_PT + gapPt (measured)
```

`gapPt` is still measured, but only as a diagnostic - it is the self-check that
`hcmNormaliseHalfGap`'s slide actually took, and the log line now prints the measured
gap, the constant, and the difference between them, so the 1.06mm this deliberately
leaves on the table stays visible in `debug_log.txt` rather than disappearing.

Stale comments in the same area were corrected while there: several still said "3mm"
after `HCM_GAP_PT` had already become 3.94mm, and two warning strings hardcoded "3mm"
into user-facing text. They now read the constant.

### Numbers

| | before | after |
| --- | --- | --- |
| `HCM_GAP_PT` (visible gap) | 11.17pt / 3.94mm | **14.17pt / 5.00mm** |
| path-to-path gap | 5.00mm | **6.06mm** |
| `overlapPt` | 19.00mm (measured) | **19.00mm (constant)** |
| stroke uncounted | 0 | **1.06mm** |

The overlap value itself does not move - both routes land on 19mm, the same number
`SS_OVERLAP_PT` uses. What changes is the physical gap on the sheet and, with it, where
the hood's centre design lands: 1.06mm off, matching the placket and side seam.

## Outcome

- ✅ Impact: one behaviour across all three seams. The hood's centre design now carries the same 1.06mm offset the other two already carried, instead of being the only precise one.
- ⚠️ Deliberate regression in accuracy, requested and confirmed: this is exactly what the measuring was added to avoid. Recorded in the code comments so nobody "fixes" it back without knowing it was a choice.
- 🧪 Tests: node --check PASS; constant replay confirms overlap stays 19.00mm.
- 📁 Files: Backend/scripts/automate_production.jsx
- 🔁 Next prompts: end-to-end run covering PHR 146-149, then check the hood centre seam by hand.
- 🧠 Reflection: I called the placket "clean" one turn before finding it has the same 3pt gap the side seam has - the user's question "zero gap me wo stroke ko count krta he??" is what exposed it. Zero gap is on PAINTED edges, so the paths are 3pt apart and the overlap formula has no term for it.

## Evaluation notes (flywheel)

- Failure modes observed: (1) Called full-button overlap "saaf" without checking how the zero-gap placement measured; `pWidth` comes from `visibleBounds`, so the paths never touch. Corrected in the next turn. (2) Comments in the hood block had drifted from the constant they described ("3mm" for a 3.94mm value) - literals repeated in prose go stale silently, so they now interpolate `HCM_GAP_PT`.
- Graders run and results (PASS/FAIL): node --check PASS.
- Prompt variant (if applicable): the user drove this by asking for a yes/no comparison across three features, then chose consistency over precision once the comparison was on the table.
- Next experiment (smallest change to try): if the 1.06mm ever shows up at a sewn seam, the cheapest correct fix is the reverse of this - give all three a shared `+ PATTERN_OUTLINE_PT` term rather than only the hood.
