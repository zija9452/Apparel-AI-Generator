---
id: 142
title: Preserve Spot Tint Across Relink
stage: green
date: 2026-08-20
surface: agent
model: claude-opus-5
feature: production_automation
branch: main
user: zija9452
command: (direct request)
labels: ["spot-color", "tint", "illustrator", "jsx", "color-accuracy"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Backend/scripts/automate_production.jsx
tests:
 - node --check on the modified JSX (PASS)
 - remove_prefix_test.js - 44 checks incl. new P8/P9 tint suites (PASS)
 - no_mock_prefix_test.js - 47 checks (PASS)
 - swatch_merge_test.js - 51 checks (PASS)
 - Real Illustrator run NOT repeated after this edit (~28 min)
---

## Prompt

tint kia mtlb ?

(follow-up) to perecnt q dekhna , jb number exact he to wo khud nhi hota kia ??

(follow-up) ok kr do

## Response snapshot

Found while building the equivalence fingerprint for PHR 141 (suite P8): a path drawn
at **50% tint of a spot came back at 100%** - right swatch, wrong strength.

**Why it happened.** Tint is a property of the ITEM, not of the swatch. The swatch holds
the recipe (`186 = 0/100/90/0`); each item separately records how much of it to lay down.
Every relink route built a **fresh** `SpotColor`, and a fresh one starts at 100, so the
item's own percentage was silently discarded. Copying the swatch reference correctly is
not enough - the per-item tint has to be carried too.

Five sites, all of them constructing a SpotColor from a spot reference:

| site | route |
| --- | --- |
| `processSubColor` name match | the common case - order doc already holds the spot |
| `processSubColor` CMYK-direct | spot re-created from the source ink |
| `resolveInkForOrderDoc` | ink read straight off a mockup item |
| text replacement, fill | spot restored by name after the text is rebuilt |
| text replacement, stroke | same |

The text-replacement pair needed two extra variables (`savedFillTint`,
`savedStrokeTint`) - it saves the spot by NAME and rebuilds later, so there was nowhere
for the percentage to survive. Every assignment is wrapped in try/catch, matching the
surrounding style, so a color object that does not expose `.tint` cannot break the job.

`relinkAliasArt` (PHR 140) already copied the tint; it is now consistent with the rest.

**Zero-risk by construction:** when artwork is drawn at full strength the copied value is
100, which is what the fresh object already had. It can only change behaviour where a
tint below 100 exists - exactly the case that was broken.

New coverage in `scratchpad/remove_prefix_test.js`:

- **P8** - flipped from documenting the defect to asserting the fix: 50% survives, and
  full-strength items still read 100.
- **P9** - every route at once: fill at 100/50/25%, a 60% stroke, 40% text, all preserved;
  swatch panel still one entry per ink and everything still `colorType = SPOT`. Plus the
  alias-merge route holding a 35% tint.

## Outcome

- ✅ Impact: A spot drawn at less than full strength now prints at the strength it was drawn at. Previously any tinted shade came out at 100% - a wrong colour with no warning anywhere in the log.
- 🧪 Tests: `node --check` PASS; 142 checks across three suites PASS (44 + 47 + 51). The real Illustrator run from PHR 141 predates this edit and was not repeated.
- 📁 Files: Backend/scripts/automate_production.jsx
- 🔁 Next prompts: Optional - one more real order run to see the fix end-to-end. Only meaningful if the mockup actually uses a tint below 100%, which could not be determined from the file bytes (the art lives in `%AI12_CompressedData`).
- 🧠 Reflection: The bug was invisible to every existing check because the swatch NAME and the CMYK numbers were both correct - only the amount was wrong. It surfaced only once the test compared a full per-item fingerprint (name + ink + tint) instead of just the swatch panel.

## Evaluation notes (flywheel)

- Failure modes observed: Byte-level forensics could not answer whether the user's mockups actually use tints - the art is inside `%AI12_CompressedData` and the streams that did inflate were the ICC profile and thumbnails. Said so rather than inferring from the two readable streams; the honest answer was "open it and look at the Color panel".
- Graders run and results (PASS/FAIL): node --check PASS; remove_prefix_test 44/44 PASS; no_mock_prefix_test 47/47 PASS; swatch_merge_test 51/51 PASS.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): Add a debug_log line when a tint below 100 is carried across, so a real run reports whether tints exist in the job at all.
