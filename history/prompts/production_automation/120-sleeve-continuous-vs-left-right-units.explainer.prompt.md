---
id: 120
title: Sleeve continuous vs left right units
stage: explainer
date: 2026-08-18
surface: agent
model: claude-opus-5
feature: production_automation
branch: main
user: zija9452
command: chat
labels: ["sleeve-match", "explainer", "continuous-unit", "left-right-units", "limitation"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - Backend/scripts/automate_production.jsx (read only - 3258-3315, 3943-4005, 4522-4628)
tests:
  - none (explanation only)
---

## Prompt

sleeve matching me , agr top pr zero distance pr unit hoga to top se measure kr le ga ek hi unit , isi trha bottom pr zero distance pr ek hi unit higa t measure kr le ga , jesey pr to measure kr lia , ab issue sleeve ka he , kch me sleeve pr design left and right side hoty hen alg alg , or kisi me ek hi shape hota he jo left and right side hota he , to ye kese handle hota he , non-technical easy l;anguage me btana

## Response snapshot

Explained in plain Hinglish, plus flagged one real limitation.

Decision is purely by NAME inside the "armhole match" group (_smCollectUnits,
jsx:3258-3271): a name containing "left"/"right" after "unit" is tagged; anything
else is "continuous".

CASE A - one shape crossing both corners ("unit 1"):
handled as ONE rigid piece. Solved against the LEFT corner only (jsx:4556-4558),
and the single shift/resize carries the right side along. Reason documented at
4542-4555: forcing both corners at once (2x2 solve) let the corners pull in
opposite directions - an 8mm ribbon fix once triggered a 28mm secondary shift.
After matching, BOTH sides are re-measured and written to the log
("VERIFY after match: left=... right=... L/R differ by Xmm", jsx:4588-4596), so
any residual asymmetry is visible without reopening the file.

CASE B - genuinely different left/right pieces ("unit left 1"/"unit right 1"):
each side is solved independently against its own corner (jsx:4605-4627).
Mixed case: if only one side is tagged, the untagged (continuous) units are used
for the other side (_smUnitsForSide, jsx:3312-3315; sleeve side loop, jsx:4609).

LIMITATION SURFACED: the body is measured on the BACK panel's RIGHT armhole only
(jsx:3960 `_smUnitsForSide(sets, "right")`). If the body's units are left/right
tagged, only "unit right 1" gets a stored target - the body's left armhole is
never walked. So the sleeve's "unit left 1" finds no entry in rec.byName and hits
the warning at jsx:4615 ("no unit named ... found on the body reference -
rendered without matching"). Genuinely-different left/right designs are therefore
matched on the RIGHT side only today; the left side renders as drawn.
Offered (not yet done): also walk the body's left armhole when left-tagged units
exist, so both sides get their own target.

Also noted: stale comment at jsx:3295 still says pre-flight guarantees the group
"in the mockup's Front view" - should read Back view after PHR 119's fix.

## Outcome

- ✅ Impact: user understands both sleeve cases; a real matching gap for left/right-tagged designs is now on record
- 🧪 Tests: none (read-only explanation)
- 📁 Files: none modified
- 🔁 Next prompts: implement left-armhole measurement for left-tagged units; fix the stale Front-view comment at jsx:3295
- 🧠 Reflection: the "measure right armhole only" simplification is safe for mirrored art but silently caps the left/right-tagged case - worth stating in the UI copy too

## Evaluation notes (flywheel)

- Failure modes observed: left-tagged sleeve units can never find a body target under the current right-armhole-only measurement
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): in smMeasureBodyD, when sets.left is non-empty, also measure the body's LEFT corner and store those units under their own names
