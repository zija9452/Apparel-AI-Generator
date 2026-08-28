---
id: 143
title: Neck Logic And Leftover Base Shape
stage: explainer
date: 2026-08-20
surface: agent
model: claude-opus-5
feature: production_automation
branch: main
user: zija9452
command: (direct question)
labels: ["neck", "base-path", "mockup-data", "diagnosis", "illustrator", "jsx"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - (none - diagnosis only, no code changed)
tests:
 - debug_log.txt of the swatchcheck run (58 panels) - per-part base-path audit
 - Visual check of 2XL_Neck_Item1.jpg (duplicate outline confirmed)
---

## Prompt

Neck ki logic btao k kia he is me ?? neck duplicate q a rhi hen ?? base-path hen to delte ho na , q nhi ho rha he ?? or base-color kese ata he ? jese front me hota he , sb wesa hi he ?/

## Response snapshot

### Neck logic (same main loop as every other part)

| step | code | neck-specific? |
| --- | --- | --- |
| `part_name "neck"` -> pattern group `"<Size> Neck"` | `resolvePartLabel` jsx:3036 | no |
| mockup lookup `["Neck","neck","NECK","collar","Rib"]` | `getSourceView` jsx:8017 | targets only |
| `isNeck` flag | jsx:950 | - |
| panel base fill from the pasted design | `getDesignBaseFill` jsx:7807 | no |
| scale | `pmAlignAndScaleToHeight` (SCALE_HEIGHT_ONLY) | **no** - the old neck-only two-axis stretch was removed on instruction, jsx:341-349 |
| `smartContrast(pastedPattern, baseShape.fillColor)` | jsx:1435 | **yes** - pattern-side text flipped white/black against the panel colour (that white "2XL" in the render) |
| `rebuildTextFrames(pastedPattern)` | jsx:1442 | **yes** - pattern brand text rebuilt or it silently fails to render at export |

So there is no separate "neck engine" left. Only the two text touch-ups above.

### Why the neck comes out doubled

Not a code bug and not a swatch issue - **the mockup's Neck group has no path named `base-path`.**

Audited across the whole swatchcheck run (58 panels):

| part | fill source in the log | base-path removed |
| --- | --- | --- |
| front (35), back (7), sleeve-short (7) | `('base-path', SpotColor)` | 50 removed |
| **neck (7), twill-tape (1)** | `(largest filled path, SpotColor)` | **0 removed** |

The two sets line up exactly. `getDesignBaseFill` has a fallback - named `base-path`, **else the largest filled path** (jsx:7847-7850). `removeBasePaths` has no such fallback: it is an exact name match on `base-path` / `base_path` / `basepath` (jsx:2522). So on the neck the silhouette donates its colour to the panel and then **stays in the artwork**, scaled on top of the panel it just coloured. Same fill, so only its 3pt stroke shows - the thin inner outline in `2XL_Neck_Item1.jpg`.

Alignment shows the same split: front logs `Placement reference: found path named 'base-path'`, neck logs only `Aligning using first path reference` - it fell through to first-in-z-order (jsx:3464-3478).

### base-color: identical code, different path chosen

One function for every part, `getDesignBaseFill`. Front resolves to `'base-path'`, neck resolves to `largest filled path`. The colour is copied AS-IS (spot / CMYK / gradient), so the ink is right either way - only the *which item* differs, and that is what decides whether the shape is later deleted.

### Fix options (not applied - user's call)

1. **Name it in the mockup** - call the neck silhouette `base-path`. Zero code risk, and it fixes all three at once: fill source, alignment reference, removal. Matches how front/back/sleeve already work.
2. **Code**: have `getDesignBaseFill` return the item it used and delete that same item after scaling. Riskier - twill-tape's mockup design IS a bare path (jsx:7834), so its "largest filled path" is the whole artwork; deleting it would erase the design, not a leftover.

## Outcome

- ✅ Impact: Duplicate neck outline root-caused to missing `base-path` naming in the mockup, with a per-part audit proving the correlation is exact (8 unnamed -> 8 not removed).
- 🧪 Tests: swatchcheck debug_log.txt per-part audit; visual confirmation in 2XL_Neck_Item1.jpg.
- 📁 Files: none changed.
- 🔁 Next prompts: decide between the mockup rename (recommended) and the code-side change; if code, twill-tape needs a carve-out.
- 🧠 Reflection: The fill-source string already in the log (`'base-path'` vs `largest filled path`) was a complete diagnostic and nobody had read it as one. The asymmetry is that one function has a fallback and its partner does not.

## Evaluation notes (flywheel)

- Failure modes observed: The obvious first guess was a removeBasePaths name-normalisation gap (three functions, three different name rules). The log ruled it out - the neck design has no such name at all, normalised or not.
- Graders run and results (PASS/FAIL): per-part log audit PASS (8/8 correlation).
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): log the NAME of the item `getDesignBaseFill` picked when it falls back to "largest filled path", so an unnamed silhouette is visible in the log without a render check.
