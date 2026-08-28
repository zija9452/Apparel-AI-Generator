---
id: 126
title: ExtendScript chained ternary left tag bug
stage: green
date: 2026-08-18
surface: agent
model: claude-opus-5
feature: production_automation
branch: main
user: zija9452
command: chat
labels: ["sleeve-match", "extendscript", "engine-bug", "ternary", "root-cause"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - Backend/scripts/automate_production.jsx
tests:
  - "live ExtendScript probe (Illustrator CC 2015, engine 4.5.6): chained vs parenthesized vs if/else"
  - "live mockup probe before/after: 'unit left 1' TAG=right -> TAG=left"
  - "node --check - PASS"
  - "repo-wide scan for other chained ternaries (automate_production.jsx, render_orders.jsx, json2.jsx, python-embedded probes) - none broken"
---

## Prompt

yr left to thk tha na , sleeve k left wala left hoga , or right wala right hoga , to left wala q kharab hua , mockup check kro ,

## Response snapshot

ROOT CAUSE FOUND - an ExtendScript engine defect, not a naming mistake.

Probed the real mockup live via COM (guarded: reuse an already-open doc, close only
if this probe opened it). Sleeve group `Short Sleeve > armhole match` holds
`unit righ 1` (cx=-3342, the right shape) and `unit left 1` (cx=-4218, the left
shape) - names and positions agree. But the tag computed for `unit left 1` came
out **right**, even though the probe printed
`rest=<left1>  rest.indexOf('left')=0  ===0? true`.

Isolated it: ExtendScript 4.5.6 (Illustrator CC 2015) parses a chained conditional
LEFT-associatively. Live results:

    true  ? 'A' : false ? 'B' : 'C'   ->  'B'     (standard JS: 'A')
    false ? 'A' : true  ? 'B' : 'C'   ->  'B'
    a ? 'L' : (b ? 'R' : 'C')         ->  'L'     (parens fix it)
    if / else if / else               ->  'L'     (also fine)

i.e. `a ? X : b ? Y : Z` evaluates as `(a ? X : b) ? Y : Z`.

Impact on `_smCollectUnits` (jsx:3273): for a left unit, a=true -> inner value
'left' -> truthy -> tag became **"right"**. So EVERY "unit left N" was matched
against the sleeve's RIGHT corner, where its artwork does not reach - producing the
"artwork does not reach the seam" warnings in job 2f1c8f92. "unit right N" was
unaffected only by accident (a=false -> b=true -> truthy -> "right"), and untagged
units fell through to "continuous" correctly.

Fix: replaced the chained ternary with explicit if/else, plus a comment recording
the engine behaviour so nobody "simplifies" it back.

Scan for the same pattern elsewhere: automate_production.jsx (multiline regex) -
all other hits are either separate ternaries in one statement or already
parenthesized (jsx:893-896, 2913, 4149, 4340, 4494, 5113, 6543); render_orders.jsx -
none; json2.jsx:21 - two separate parenthesized ternaries; the Python-embedded JSX
probes in illustrator_automation.py - none. This was the only broken one.

Verified after the fix by re-running the mockup probe with if/else logic:
`unit left 1` -> TAG=left, `unit righ 1` -> TAG=continuous, `unit 1` (Back) ->
continuous. `node --check` PASS.

Still outstanding for the user: the `unit righ 1` typo ("right" missing its t) -
it stays "continuous" and cannot resolve to the body's "unit 1", so it needs
renaming in the mockup before its side will match.

Side observation: the Front view's "armhole match" group contains only MATCH_red
paths and NO unit items - so the Front-scoped pre-flight removed in PHR 119 would
have blocked this job outright. Back-scoping was necessary, not cosmetic.

## Outcome

- ✅ Impact: left-tagged sleeve units now go to the left corner; explains all "does not reach the seam" warnings
- 🧪 Tests: live engine probe, live mockup probe (before/after), node --check, repo-wide pattern scan
- 📁 Files: automate_production.jsx (_smCollectUnits)
- 🔁 Next prompts: user renames "unit righ 1" -> "unit right 1", re-runs the job, checks the VERIFY lines
- 🧠 Reflection: a "0 === 0 is true but the ternary still took the other branch" contradiction is the signature of an engine-level parsing difference - worth probing the engine directly instead of re-reading the source

## Evaluation notes (flywheel)

- Failure modes observed: ES3 engine parses chained ternaries left-associatively; static hand-tracing could never explain the log, only a live probe could
- Graders run and results (PASS/FAIL): engine probe PASS (defect reproduced), mockup probe PASS (tag corrected), node --check PASS
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): log each unit's tag next to its native pre-match line so a future mismatch is visible in debug_log without a probe
