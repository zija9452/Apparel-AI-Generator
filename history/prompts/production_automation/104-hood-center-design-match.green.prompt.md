---
id: 104
title: Hood Center Design Match
stage: green
date: 2026-08-13
surface: agent
model: claude-opus-5
feature: production_automation
branch: main
user: zija9452
command: (conversational)
labels: ["hoodie", "hood", "seam-match", "reflect", "frontend-checkbox", "pre-flight"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Frontend/my-app/components/UploadForm.tsx
 - Frontend/my-app/components/ProductionPlan.tsx
 - Backend/main.py
 - Backend/services/illustrator_automation.py
 - Backend/scripts/automate_production.jsx
tests:
 - scratchpad/test_hcm.jsx (51 assertions, 51 PASS on a pristine pattern.ai)
 - scratchpad/probe_hood_geo.jsx (ground-truth hood geometry, pattern + mockup)
 - node --check on the modified automate_production.jsx (SYNTAX OK)
 - python -m py_compile on main.py + illustrator_automation.py (OK)
 - npx tsc --noEmit on the frontend (clean)
---

## Prompt

ab frontend me hooie me ek or checkbox rkhna he hoodie center design match , or jb hoodie on me center design me ye match kre to , krna ye he k outside hoodie k dono parts ko front and right wale ko 90 degree pr reflect krna he , or jo Front/Back side-seam matchJoins a design that crosses the torso side seam so it lines up across Front and Back (14mm simulated sewing overlap). Name the shared design "Front side match" + "Back side match"for one seam only (Front's right edge to Back's left edge), or use "Front Left side match" / "Front Right side match" with matching "Back Right side match" / "Back Left side match" names to match both side seams independently. Missing all of these name pairs pauses the job before it starts or jo is me logic he whi lga deni he , bs hoodie me hm us ko hood right side match and hood back side match kahen ge , ye mention bhi kr dena frontend pr , or reflect krne k bd 19mm overlap then saame yhi logic k design ko us pr la kr cut and clip jo logic he

(follow-up, mid-turn) complete k bd again 90 degree reflect kr dena dono ko , ta k apni asal position me wapis a jayen wo

(clarification, after a rejected AskUserQuestion) Hood pr hon ge , agr hoodie on he hoodie center design match k sath , to ye nam Outside hood pr hon ge , Nam hoga Right side match , left side match hoga , outside hood me do group hoty hen . ek left ka and ek rught ka , us pr hon ge

## Response snapshot

New nested frontend checkbox `hoodie_center_design_match` (under Hoodie, default OFF) that joins a
design crossing the hood's centre seam across the OUTSIDE Hood's two halves. Inside Hood is
deliberately untouched.

Flow per size, inside `hoodieBuildVariant` after both halves' designs are pasted and clipped and
before the artboard is cut: reflect both halves 90 degrees (vertical axis) -> run the seam join
(19mm simulated overlap, centre + clip into both, remove both originals) -> reflect both back.

Naming, scoped to the mockup's "Outside Hood": `"Right side match"` inside its Right child (the
source of truth, its artwork survives) and `"Left side match"` inside its Left child (the artist's
imprecise copy, removed once the corrected one is clipped in) - the same roles
`"Front side match"`/`"Back side match"` play in SIDE-SEAM MATCH.

**Measured first, per the previous session's lesson.** `probe_hood_geo.jsx` on the real files:
the pattern's halves lie Left-then-Right, equal widths, gaps 6.6pt/2.3mm (Small), 19.8pt/7mm (XL),
11.2pt/3.9mm (2XL); the mockup's "Hood Outside" has Left/Right children 917.2pt wide, 4.1pt apart,
and no "side match"-named object exists yet (so the new pre-flight will correctly pause this job).
Recorded in a comment: `SS_OVERLAP_PT`'s 19mm decomposes as 14mm sewing + the 5mm row-flow gap
between Front and Back, and that second half does NOT transfer here - the hood halves are children
of one group on one artboard, and their real gap is none of 5mm. 19mm is used as instructed, as its
own `HCM_OVERLAP_PT` constant, and the measured gap is logged per size so it can be re-judged.

**Reimplemented rather than reused.** `ssJoinOneSeam` reports through `pmWarn` ->
`placketMatchWarnings`, which is only written out for a FULL_BUTTON job, so every warning from a
plain hoodie job would have been silently dropped. The `hcm*` copy reports into `hoodieWarnings`.
This also follows the precedent `ssClipIntoPanel` sets for `pmClipIntoPanel`.

Three defects the harness caught before any of this shipped:

1. **The re-clip was a guaranteed no-op.** `hcmClipIntoPanel` copied `ssClipIntoPanel`'s
   direct-children-only lookup for `design_clip_group`. That is right for the main loop (which adds
   the clip group straight onto the pasted pattern group) but wrong here: `hoodiePasteDesign` does
   `clipGroup.move(baseShape, PLACEBEFORE)`, so the clip group lands beside the placement path, and
   on these hood halves that is one level down. Harness: "no clip group" on all six halves. Fixed
   with a recursive `hcmFindClipGroup`.
2. **The failure reason was swallowed.** Added `hcmLastClipError`, surfaced in both warnings - it is
   what turned "could not re-clip" into finding (1).
3. **Null half would throw.** `hcmProcessOutsideHood` dereferenced `patternSides.left.typename`.
   `hoodieBuildVariant` already guards, so it cannot fire today, but the throw would have aborted the
   whole size's hood build instead of warning.

`hcmReflectAbout(item, axisX)` takes an explicit axis rather than relying on
`Transformation.CENTER`, because artwork is clipped in BETWEEN the two reflects and that changes the
group's bounding box. The harness proves the guard is load-bearing: the plain
`Transformation.CENTER` round trip drifts 500pt under the same conditions, the axis-anchored one
returns exactly.

## Outcome

- ✅ Impact: hood centre-seam designs line up across the Outside Hood's two halves; cut pieces come
  out in their original orientation (reflect is an exact round trip, and the reflect-back sits in a
  `finally` so a thrown join can never ship a mirrored piece). Pre-flight pauses the job when the
  name pair is missing, scoped inside Outside Hood's own Left/Right halves.
- 🧪 Tests: `test_hcm.jsx` - **51/51 PASS** on a pristine `pattern.ai`, running the shipped `hcm*`
  functions extracted verbatim. Covers reflect mechanics (bbox preserved, x -> 2a-x exactly, a real
  mirror not a translate, round trip exact with artwork added in between, plus the drift control);
  the full cycle on all three real sizes (both halves restored to the exact original position, both
  originals removed, both clip groups gained the corrected copy and stayed clipped, and the copy's
  centre matching an independently computed combined-sewn-centre to 0.01pt on the source half and
  minus one overlap on the destination half); and six guards (missing source name, bailed-out join
  still reflecting back and deleting nothing, the 50%-of-panel-width sanity guard, a bare-path half,
  a half whose design never pasted, a null half).
- 📁 Files: frontend checkbox + pause panel, `main.py` form field (ANDed with `hoodie`),
  `illustrator_automation.py` pre-flight + `ignore_hood_center_match_warning`, and the JSX feature.
- 🔁 Next prompts: no end-to-end pipeline run covers this yet - it also still needs PHR 102's hood
  smart-contrast fix and PHR 103's Border/Rib layout fix confirmed in real renders. The mockup has
  no "Right side match"/"Left side match" objects yet, so a real test needs the artist to add them.
- 🧠 Reflection: measuring the hood geometry before writing anything made `isLeft` a measured value
  instead of a guess, and made the 19mm caveat concrete rather than hypothetical.

## Evaluation notes (flywheel)

- Failure modes observed: copying a sibling feature's helper wholesale carried over an assumption
  (clip group is a direct child) that does not hold in the new caller - and because the helper
  swallowed its exception, it failed silently. Surfacing the reason found it in one run.
- Harness hazards that cost real time: `pattern.ai` stays open between runs, and test duplicates
  keep the source's name, so `findAnywhere` silently resolved to a previous run's already-mutated
  artifact (92 real top-level items had grown to 130). Every trustworthy result needs the document
  closed with DONOTSAVECHANGES first and every temp renamed on creation. Also `.name`, `.typename`
  and `.pageItems` all throw `1346458189 ('PARM')` on some items in these files, and
  `layer.pageItems` is recursive while a group's is not - a naive walk over the 92MB mockup took
  1030s. Recorded in [[jsx-repro-harness-in-pattern-doc]].
- Graders run and results (PASS/FAIL): test_hcm.jsx 51/51 PASS; node --check SYNTAX OK;
  py_compile OK; tsc --noEmit clean.
- Not re-run after the final edit: moving `var hcmLastClipError` from the helpers section to the
  init block (the file's own stated convention). It is a hoisted `var` in the same function scope
  either way, no extracted function body contains its declaration, and `node --check` passes -
  but Illustrator had degraded into throwing 'PARM' on a bare `pathItems.rectangle` by then, and
  restarting it was refused: an unrelated document (job 63e1e1e2's `production_ready_order.ai`)
  reported `saved=false`, and discarding someone else's unsaved work is not worth a re-run.
- Next experiment (smallest change to try): once the artist adds the two named objects, run one
  real job and measure whether 19mm or 14mm + the measured per-size gap lines the seam up.
