---
id: 131
title: Side graphic anchor to seam
stage: plan
date: 2026-08-18
surface: agent
model: claude-opus-5
feature: production_automation
branch: main
user: zija9452
command: chat
labels: ["height-scaling", "side-seam", "naming-convention", "front-back", "plan"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - Backend/scripts/automate_production.jsx (read only - no edits yet, awaiting answers)
tests:
  - none yet (planning turn)
---

## Prompt

ok , height scaling me issue ye hota he k side k jo graphics hota he mockup me wo blkl side pr hota he alg design lekin heightr scaling me wo beech me eh jata he , to me un ka nam side rkh dun gi to tm use side me kr dena jese mockup me he , isse sb perfect a jaye ga , front jersey or back me hoga ye bs , thk he ? clear , edge case and plan share kro

## Response snapshot

PROBLEM (restated for confirmation). In height-only scaling
(`plan.design_scale_mode !== "both"` -> `SCALE_HEIGHT_ONLY`), the design is
resized uniformly by HEIGHT and then centered on the panel in BOTH axes -
`pmAlignAndScaleToHeight` (automate_production.jsx:5398). A graded panel is
relatively wider than the design, so after the height match a gap appears on
each side and any artwork that hugged the side seam in the mockup floats
inward, looking "beech me". User's proposal: name those items `side` in the
mockup; the script re-anchors them to their own seam.

PLAN (not implemented - waiting on the edge-case answers below).
- Hook point: immediately after `pmAlignAndScaleToHeight`, alongside
  `adjustSidePanelsToUnderarm` (automate_production.jsx:957), BEFORE
  `removeBasePaths` - the design's `base-path` is required.
- Geometry (generic, no hardcoded mm): compare the design's own silhouette
  (`designBasePath`) with the panel's `Placement Path` (`baseShape`).
    left-seam item  -> dx = panelLeft  - designBaseLeft
    right-seam item -> dx = panelRight - designBaseRight
  Same shape as the existing vertical underarm correction, but on X.
- Horizontal move ONLY. No resize, no vertical change (vertical already
  belongs to `adjustSidePanelsToUnderarm`).
- Log line per move: `SIDE-ANCHOR [<size> <part>]: '<name>' moved <n>mm to the
  <left|right> seam.`

EDGE CASES PUT TO THE USER (each with a recommendation, none assumed):
1. Name collision - the mockup already carries `Front side match` /
   `Back side match` / `Front Left side match` etc. for SIDE-SEAM MATCH
   (automate_production.jsx:6006-6030). Proposed rule: match ONLY the exact
   name `side` (plus `side 1`, `side 2`, `side left`, `side right`), and never
   anything containing `match`.
2. Auto-detect the seam (nearest edge in the mockup) when the name carries no
   left/right - recommended, keeps the naming burden at one word.
3. A single piece touching BOTH edges (e.g. a full-width band) cannot be fixed
   by a move - recommend skip + warning rather than a width stretch
   (distortion).
4. Full-button jersey Front-Left / Front-Right each have one real side seam and
   one placket edge - recommend anchoring only to the OUTER seam, never the
   placket.
5. Safety guards - skip + warning if the item does not hug an edge in the
   mockup, or if the required shift exceeds 15% of panel width (same guard
   style as SIDE-PANEL FIX's 15%-of-height rule).
6. A GROUP named `side` moves as one unit; no recursion into its children.
7. Feature is inert on `design_scale_mode: "both"` jobs (the design already
   fills the panel width there).
8. Scope: Front and Back only (+ Front-Left/Front-Right if #4 is confirmed).
   Sleeve, Neck, accessories untouched.
9. Multiple `side` items per panel are allowed; each detects its own seam.

RISKS: (a) an outward move may overlap centered artwork - no other art is
moved; (b) if the mockup silhouette is wider than the panel the shift reverses
sign, which the generic formula already handles; (c) a new naming rule means a
mis-named item silently skips, so every skip is logged.

## Outcome

- ✅ Impact: none yet - plan + edge-case questions delivered, implementation blocked on user's answers to 1-9
- 🧪 Tests: n/a (no code changed)
- 📁 Files: none modified
- 🔁 Next prompts: user answers 1-9 -> implement `anchorSideGraphicsToSeam()` next to `adjustSidePanelsToUnderarm`, then verify on a multi-size job with a `side`-named mockup item
- 🧠 Reflection: the horizontal twin of the underarm fix - height-only scaling preserves aspect, so whatever it does NOT stretch has to be re-anchored by name; asking about the `side match` name collision up front avoids breaking a shipped feature

## Evaluation notes (flywheel)

- Failure modes observed: side-seam artwork drifting inward on height-scaled Front/Back panels
- Graders run and results (PASS/FAIL): n/a (planning turn)
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): implement move-only anchoring for exactly-named `side` items on Front/Back, log every move and every skip
