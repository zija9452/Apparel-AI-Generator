---
id: 082
title: Fix placket-match var hoisting crash
stage: green
date: 2026-07-22
surface: agent
model: claude-sonnet-5
feature: production_automation
branch: main
user: zija-yaseen
command: debug
labels: [placket-match, bug, hoisting, base-path, clip-mask, regression]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Backend/scripts/automate_production.jsx (fixed - moved `var placketMatchD = {}` / `var placketMatchWarnings = []` from the helper-functions section, which runs AFTER the main loop, up to right after FULL_BUTTON's setup, alongside the equivalent sleeveMatchD/sleeveMatchWarnings declarations)
tests:
 - node --check on the edited .jsx - syntax pass
 - root-caused against a real customer job's debug_log.txt (Backend/uploads/07c4053d-8053-4ba9-baf3-94f9a4e30eb0/renders/debug_log.txt) showing "Error in instance: XL Front Right_ItemN -> undefined is not an object" right after PLACKET-MATCH's call site
---

## Prompt

D:\Zija_Yaseen\Web development\AI-Apparel-Order-Generator\Backend\uploads\07c4053d-8053-4ba9-baf3-94f9a4e30eb0 ye bnaya he , dekho is me , meri to nhi a rha he samjh order file read kro , or btao kia hua he is me ??or ye front panel me double double panel q a rhehen ?? or logo bhi door he q ?

[follow-up mid-turn] to sirf sleeve nh ,bhs front k dono panel.

[follow-up mid-turn] kia base path delete nhi hua ?? or j content graphics tha wo pattern me cli[p nhi hua ?

## Response snapshot

Investigated the user's real job (07c4053d). production_plan.json showed 2 personalized "front"/"back" entries (2 players) - the doubled Front-Left/Front-Right Item1/Item2 files are structurally normal (2 players -> 2 of each), not a bug. But debug_log.txt showed the REAL problem: `Error in instance: XL Front Right_Item1 -> undefined is not an object` (and identically for Item2), thrown immediately after "MATCH FOUND in Mockup: Front Right" - i.e. inside the new PLACKET-MATCH code path added in [[081]], before `removeBasePaths` and before the clip-mask setup both later in that same per-item block. User independently guessed the exact symptom before I finished explaining: base-path never deleted, design never clipped into the pattern shape - confirmed correct.

Root cause: `var placketMatchD = {}` and `var placketMatchWarnings = []` were declared inside the "HELPER FUNCTIONS" section of automate_production.jsx, which is textually AFTER the main per-item loop and the end-of-run warnings-file write-out, all within the same `runAutomation()` function body. JS/ExtendScript hoists the variable NAME (so `placketMatchD` exists, but as `undefined`) but the actual `= {}`/`= []` assignment only executes when the interpreter's linear top-to-bottom flow reaches that line - which happens only AFTER the main loop finishes, too late for the main loop's own use. So throughout the whole main loop, `placketMatchWarnings` was `undefined`; the first `pmWarn(...)` call (triggered here because this job's mockup has no "Match_" reference line at all, so `pmApplyFrontRight` hit its "no match line found" branch) tried `placketMatchWarnings.push(msg)` on `undefined`, threw, propagated out through pmApplyFrontRight's own catch (which also calls pmWarn and threw again), and escaped to the main per-item try/catch (`catch (eInstance) { log("Error in instance..."); }`) - aborting that Front-Right instance immediately after design-paste, skipping `removeBasePaths`, SLEEVE-MATCH, size-tag processing, `bringLogosToFront`, and critically the clip-mask setup - leaving the design fully unclipped and the base-path un-removed, which is exactly what the user saw ("logo door", "double panel").

Fix: moved both declarations to right after `FULL_BUTTON`'s setup (alongside the existing `sleeveMatchD`/`sleeveMatchWarnings`/`smBodyTried`, which were already correctly placed there) - now initialized before the main loop runs, matching the working pattern already used for SLEEVE-MATCH's own state. `node --check` reconfirmed syntax. Front-Left renders in this job were unaffected (its own early-return branch uses plain `log()`, not `pmWarn()`, so it never hit the crash) - only both Front-Right renders (Item1, Item2) are corrupted and need a re-run once the user re-submits.

Also clarified for the user mid-turn: PLACKET-MATCH only ever touches Front-Left/Front-Right - it never calls or affects SLEEVE-MATCH or any sleeve code path (confirmed via grep, zero overlap).

## Outcome

- ✅ Impact: fixes a crash that silently corrupted every full-button-jersey job's Front-Right output whenever `pmWarn` was reached during the main loop (which happens whenever no "Match_" line is found, or any other warning branch fires) - a real, already-shipped regression from [[081]], caught on the user's very next real job.
- 🧪 Tests: node --check pass; root-caused directly against the real job's debug_log.txt (exact matching error text and call-site position).
- 📁 Files: Backend/scripts/automate_production.jsx.
- 🔁 Next prompts: user needs to re-run job 07c4053d (or resubmit the same order) to get corrected Front-Right output; separately, this job's mockup apparently has no "Match_Front Left/Right" reference lines at all (unlike the earlier test file), so PLACKET-MATCH will still be a no-op there either way - only the crash is fixed, not a "no match line" situation (that's expected/fine, not a bug, for mockups that don't use this naming convention).
- 🧠 Reflection: a bare `var x = {}` sitting among a long run of `function foo(){}` declarations is easy to place wrong in a huge single-function ExtendScript file, because function declarations ARE fully hoisted (making it *look* like ordering doesn't matter) while plain var assignments are NOT - state variables for any new feature must go in the same early block as existing state (SM_ON/FULL_BUTTON/sleeveMatchD), never inside the "HELPER FUNCTIONS" section, however natural it feels to keep them near the functions that use them.

## Evaluation notes (flywheel)

- Failure modes observed: assumed "declared near where it's used" was safe organization in a single giant function body; ExtendScript/JS var-hoisting semantics silently made that false. Live-document DoJavaScript testing in [[081]] didn't catch this because that test only exercised the read-only measurement functions directly, never the real per-item loop + end-of-run write-out sequence where the bug actually lived.
- Graders run and results (PASS/FAIL): syntax PASS; root-cause confirmed against real failure log (exact match).
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): for any new top-level state variable added to this file, place it in the existing "state declarations" block up top and grep for `var .*= (\{\}|\[\])` placement before considering a change done, rather than trusting a read-only unit-style test alone.
