---
id: 112
title: Offset path redraw fix
stage: green
date: 2026-08-17
surface: agent
model: claude-opus-5
feature: production_automation
branch: main
user: zija9452
command: chat
labels: ["local-tag", "pocket", "offset-path", "redraw", "hoodie", "fix"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Backend/scripts/automate_production.jsx
tests:
 - scratchpad harness that extracts the patched functions verbatim from source and runs them against job e0ce3379 (Small Front + Small Pocket) -> "not moved"
 - full-file parse check via new Function() -> PARSE OK (469383 chars)
---

## Prompt

fix kese krun ?? kia error he , scratchpad pr test kr pehle  jldi bs front hi kr lo

## Response snapshot

Fixed `officialInsetPolygon` (`automate_production.jsx:7095`), two changes:

1. **`app.redraw()` after `applyEffect`** (and after `expandStyle`). This is the
   actual bug - a live effect is only materialised on a redraw, so `expandStyle`
   was expanding un-rendered artwork and silently doing nothing. No exception, so
   the `catch` fallback never fired and the RAW outline came back looking like a
   valid inset, which set `testMargin = 0` and disabled the whole 1in rule.
   The line existed in the original verification script
   (`scratchpad/pocket_test/compare_offset.jsx:174`) and was lost on port.
2. **Shrink guard** - the returned polygon is trusted only if it is at least 100pt
   narrower AND shorter than the source. A genuine -1in inset takes >=144pt off
   each axis (229 x 188 measured on this pocket), so a 0pt no-op can never again
   pass itself off as an inset; it falls through to the existing depth test.
   Also moved `app.activeDocument = orderDoc` above `applyEffect` so the redraw
   materialises the effect in the right document.

Verification (scratchpad, functions extracted verbatim from the patched source by
brace-matching so the real code is what runs - not a copy):

```
HOODIE: Small Pocket/Local-Tag check using Illustrator's Offset Path -1in.
HOODIE: Small Local Tag already clear of the Pocket - not moved.
```

- inset bbox 1007.13 x 647.925 vs source 1236.384 x 835.667 -> shrink 229.3 x 187.7
- matches the 2026-08-12 record exactly (`inspect_out/offset_compare.txt`: w=1007.1 h=647.9)
- `deepestXInRect` -> null, so `tagMoved = false` (was: shifted 0.5in down)
- fallback cross-check: raw outline at margin 1in also returns null (same verdict)
- cost: 605ms per size
- No regression possible on XL/2XL (previously "not moved"): the inset is a strict
  subset of the raw outline that was being tested before, so hit count can only drop.
- Whole file re-parsed clean: PARSE OK (469383 chars).

## Outcome

- ✅ Impact: Small hoodies stop getting a 0.5in local-tag drop they never needed;
  the 1in stitching-margin rule actually applies for the first time.
- 🧪 Tests: Scratchpad harness against real pattern.ai (verdict flipped), full-file
  parse check. No pipeline run yet.
- 📁 Files: Backend/scripts/automate_production.jsx
- 🔁 Next prompts: Run a real hoodie job and confirm debug_log.txt shows
  "Local Tag already clear of the Pocket - not moved." for Small.
- 🧠 Reflection: The guard matters as much as the redraw - the original design
  treated "no exception" as "it worked", which is what let a silent no-op quietly
  disable a safety margin for months.

## Evaluation notes (flywheel)

- Failure modes observed: live effect not materialised without redraw; truthy-but-wrong
  return disabling a downstream margin; a bug visible on one size only (Small), which
  made it read as job-specific rather than systematic.
- Graders run and results (PASS/FAIL): PASS - verdict "NOT MOVED", shrink 229 x 188,
  inset dims match the independently recorded 2026-08-12 measurement.
- Prompt variant (if applicable): N/A
- Next experiment (smallest change to try): assert the same shrink guard on any other
  applyEffect/expandStyle use added later.
