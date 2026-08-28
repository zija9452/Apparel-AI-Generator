---
id: 093
title: Implement Hoodie flow end to end
stage: green
date: 2026-08-11
surface: agent
model: claude-sonnet-5
feature: production_automation
branch: main
user: zija9452
command: N/A
labels: ["hoodie", "new-garment-type", "pocket", "border", "local-tag", "rename"]
links:
  spec: history/prompts/production_automation/092-hoodie-flow-spec-open-questions.spec.prompt.md
  ticket: null
  adr: null
  pr: null
files:
 - Backend/main.py
 - Backend/services/illustrator_automation.py
 - Backend/scripts/automate_production.jsx
 - Frontend/my-app/components/UploadForm.tsx
 - Frontend/my-app/components/ProductionPlan.tsx
tests:
 - node --check (via temp .js copy) on automate_production.jsx - PASS
 - python -m py_compile on main.py / illustrator_automation.py - PASS
 - npx tsc --noEmit on Frontend/my-app - PASS
 - Manual Illustrator verification pending (no automated visual test harness for this pipeline)
---

## Prompt

(Multi-turn feature build following spec clarification PHR 092. Key instructions across the turn, verbatim highlights:)

"jese full button jersey he , wese hi ek or field ani he , Hoodie ki jis me wese ek check box rkhna he , agr user ye on kre to wese hi nomal jersey ka flow hoga..." (full original spec in PHR 092)

"1. alg alg hen , 2. Left Hood , Right Hood pattern me or mockup me Outside hood, inside hood ( left and right hood mila kr ek outside/inside hood bnta he mtlb order me double copy krne hen...) 3. ... 4. hn pattern me he Border or hr front and back ka duplicate krna, ek hi border he... 5. hn aesa lge k design continue he... 6. ... 7. sb k liye yhi nam kr do Local Tag (mene ghlti se use size tag nam de dia tha) frontend backend naming mockup sb jga size tag ki jga local tag kr do , 8. ye sirf hm overlap ki wja se kren ge..."

"border ek hi rkh lena , bs front k neeche , wese bhi same hi hen , isi trha rib and cuff bhi" / "Cuff & Ribb ki bhi stroke remove krni he jese twill tape and tukdi ki hen or border, Hood" / "hood me, Outside hood and Hood outside dono applicable hon, isi trha inside me bhi" / "or hood group k andar just left and right likha ho tb bhi applicable hon" / "phase 5 me, 5mm gap kia, just front k andar hi horizontal center vertical bottom pr rkhna he pocket ko... phr jahn se continue chl rha tha k hr pattern jese ata he wese hi ye bhi rkha jaye ga" / "acha border jo he front and back ka ek jesa hi hoga t front k neeche 55 mm gap se border rkh dena front ka then back ka front ki copy le elna back me" / final AskUserQuestion answers: tag shift = 1.0in (closer to bottom), third fallback step (right-shift, max 0.5in) stays, Border design from mockup's own named group, missing named group = pre-flight pause / "sirf local nam accept hon" / "update kr do code me"

## Response snapshot

Implemented the full Hoodie feature end to end, in 9 tracked tasks:

1. **Rename Size Tag -> Local Tag everywhere** - frontend checkbox/label/warning UI, main.py Form field + plan_dict key + resume ignore-flag, illustrator_automation.py pre-flight scan function/status field, automate_production.jsx (`SIZE_TAG_ON`->`LOCAL_TAG_ON`, `processSizeTagLabel`->`processLocalTagLabel`, `"sizetag"`->`"localtag"` normalized match, all "SIZE TAG"/"SIZE-TAG" log/comment strings). Deliberately did NOT touch `renameSizeTags`/`RENAME_SIZE_WORDS`/`resizeTagBox` - a genuinely separate, unrelated mechanism (the pattern's own baked-in per-side sleeve tag text, e.g. "Medium" -> "XL Short Sleeve Right"), confirmed by reading its own comments before editing. Only "LOCAL TAG" is now accepted (no backward-compat with old mockups, per explicit instruction).

2. **Cuff & Rib stroke removal** - added `isRibCuff` flag (nPartName contains "cuff" or "rib") to the existing accessory-stroke-clear condition (`if (isAcc || isPatti || isRibCuff) clearAllStrokes(pastedDesign);`), same mechanism as Twill Tape/Tukdi/Patti, general fix (not Hoodie-scoped).

3. **Hoodie checkbox plumbing** - UploadForm.tsx checkbox (independent of Full Button Jersey), main.py `hoodie: bool = Form(False)` -> `plan_dict["hoodie"]`, automate_production.jsx `HOODIE_ON` flag. No separate pass-through needed in illustrator_automation.py - the whole plan_dict is written to production_plan.json and read wholesale by the JSX.

4. **Pre-flight naming validation** - `_pattern_has_hoodie_objects`/`_mockup_has_hoodie_objects` in illustrator_automation.py (same DoJavaScript-probe pattern as `_mockup_has_pattern_object` etc.), gated pause block, `hoodie_layer_missing` status field, `ignore_hoodie_warning` resume flag, ProductionPlan.tsx warning UI. Naming flexibility built in per explicit instruction: "Left"/"Right" alone OR with a "Hood" qualifier in either word order all match; "Outside Hood"/"Hood Outside" and "Inside Hood"/"Hood Inside" both match.

5. **Outside/Inside Hood build** - new HOODIE post-pass (runs once after the main per-item loop, not folded into it - Hood/Border/Pocket aren't simple single-shape design pastes). Duplicates the pattern's whole "{Size} Hood" group twice (once per variant), keeping Left/Right in their own pattern-relative positions (no invented geometric join - open question from PHR 092 was superseded by later instructions, never explicitly resolved, so the safe default of "preserve pattern's own relative positions" was kept), pastes each side's design from the mockup's matching Outside/Inside Hood side, clears strokes, places as a normal flowed item.

6. **Border** - single instance (Front's and Back's are identical, per explicit correction - no separate Back duplicate), positioned 55mm below Front's own finished position (same left edge), own artboard, anchored (does not consume the row-flow).

7. **Pocket** - staged on Front (h-center/v-bottom against Front's own bounds) purely to clip Front's already-finished base color + design UNMOVED into the pocket's outline (continuation look), then the whole clipped result relocated into the normal row-flow (no custom gap rule, per explicit correction of an earlier "5mm gap" misreading).

8. **Hoodie-specific Local Tag offset** - added a third branch (`else if (HOODIE_ON)`) in `processLocalTagLabel`'s positioning logic, alongside the existing FULL_BUTTON (2.5in/2in) and normal-jersey (2.5in/3in) branches: 1in right / 1.5in bottom, independent gap. `processLocalTagLabel` now returns `tagGroup` so the caller can cache it into `hoodieFrontBySize[sizeLabel].localTagGroup` for the overlap recipe.

9. **Pocket/Local Tag overlap recipe** - only runs when a size has both a Pocket and a Local Tag. Computes a 1in-inward measurement-only inset of the pocket's outline (throwaway, same pattern as SLEEVE-MATCH's -7mm seam-line inset), bbox-checks it against the Local Tag's bounds via the existing `rectsIntersect`. If overlapping: shift tag 0.5in toward the bottom edge (1.5in -> 1.0in offset) and recheck; if still overlapping: shift tag right by the exact overlap amount capped at 0.5in and recheck; if STILL overlapping after both steps, push a runtime warning to `hoodie_warnings.json/.txt` (a live geometric warning, not a pre-flight pause, since this can only be discovered once Front/Pocket/Tag are all actually measured during the run - consistent with how SLEEVE-MATCH's "does not reach the seam" is also a live warning).

All new state (`hoodieFrontBySize`, `hoodieWarnings`) follows the exact existing precedent set by `ssQueue`/`sleeveMatchWarnings` (per-size object-ref caching during the main loop, consumed by name later - no coordinate snapshots, bounds always read fresh).

## Outcome

- ✅ Impact: New "Hoodie" checkbox adds Outside Hood, Inside Hood, Border and a design-continuation Pocket on top of the normal Front/Back/Sleeve flow, independent of Full Button Jersey. "Size Tag" is now "Local Tag" everywhere (breaking rename - old mockups must rename their group). Cuff & Rib now get the same stroke cleanup as Twill Tape/Tukdi/Patti/Border/Hood, for every garment type.
- 🧪 Tests: Syntax/type checks only (node --check, py_compile, tsc --noEmit) - all PASS. No automated visual test harness exists for this ExtendScript pipeline (consistent with every prior geometry PHR in this feature). **Needs a real job run with a Hoodie-enabled pattern+mockup to visually confirm**: Hood merge appearance, Border position/design, Pocket continuation alignment, and the overlap recipe's actual behavior on a real Local Tag + Pocket pairing.
- 📁 Files: Backend/main.py, Backend/services/illustrator_automation.py, Backend/scripts/automate_production.jsx, Frontend/my-app/components/UploadForm.tsx, Frontend/my-app/components/ProductionPlan.tsx.
- 🔁 Next prompts: Run a real Hoodie job (pattern with "{Size} Hood"/"Pocket"/"Border" groups, mockup with "Outside Hood"/"Inside Hood"/"Border" groups) and check hoodie_warnings.txt plus the rendered JPGs for Outside/Inside Hood, Border and Pocket.
- 🧠 Reflection: This is the largest single-session feature build in this project's PHR history - built as a self-contained post-pass (not folded into the generic per-item loop) specifically because Hood/Border/Pocket need cross-item state (Front's finished position/design) that the generic per-item dispatch has no precedent for sharing, unlike SIDE_SEAM_MATCH's simpler in-place Front/Back pairing.

## Evaluation notes (flywheel)

- Failure modes observed: None yet - untested against a real Illustrator file. The most likely failure points on first real run: (1) `findAnywhere`'s depth-3 index cap missing "{Size} Hood"/"Pocket"/"Border" if they're nested deeper than Front/Patti in the customer's actual pattern file, (2) the Border 55mm-below-Front artboard overlapping a later row's artboard in the master .ai view (each artboard still exports its own correctly-clipped JPG independently, but the combined-view file may look visually messy), (3) the Pocket clip producing an empty/blank window if Front's design has no opaque content at exactly the pocket's body position.
- Graders run and results (PASS/FAIL): N/A (no automated grader for this codebase).
- Prompt variant (if applicable): N/A.
- Next experiment (smallest change to try): Run the smallest possible real Hoodie job (one size only) and read hoodie_warnings.txt first - it will immediately surface any naming-mismatch or overlap-recipe issue before spending time visually inspecting JPGs.
