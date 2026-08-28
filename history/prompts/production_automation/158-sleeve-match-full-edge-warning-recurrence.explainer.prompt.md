---
id: 158
title: Sleeve match full edge warning recurrence
stage: explainer
date: 2026-08-22
surface: agent
model: claude-opus-5
feature: production_automation
branch: main
user: zija9452
command: (chat)
labels: ["sleeve-match", "full-edge", "warning", "SM-COV", "open-item"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Backend/uploads/8fcab6ee-352b-4140-99ec-818eaabd7bc4/renders/debug_log.txt (read only)
 - Backend/uploads/8fcab6ee-352b-4140-99ec-818eaabd7bc4/sleeve_match_warnings.json (read only)
tests:
 - none (log analysis only)
---

## Prompt

Side sleeve matching skipped on 3 parts

These parts were rendered without matching, so please check them manually before printing.

•
Large Large Short Sleeve: Large Short Sleeve 'unit 1': body covers the full armhole but the sleeve does not - rendered without matching
•
XL XL Short Sleeve: XL Short Sleeve 'unit 1': body covers the full armhole but the sleeve does not - rendered without matching
•
2XL 2XL Short Sleeve: 2XL Short Sleeve 'unit 1': body covers the full armhole but the sleeve does not - rendered without matching ye error pehle bhi aye the , kese fix kiye the ? again yhi a rha he , q ??

## Response snapshot

**It was never fixed.** `PENDING.md` §3 carries it as an open item; the earlier work
added only the `SM-COV` **diagnostic** so the cause would be visible in the log. Git
history confirms no commit ever touched it (the whole SLEEVE-MATCH feature is still
uncommitted working-tree code).

Job 8fcab6ee's `renders/debug_log.txt` now spells the cause out:

```
Small  : [back Small]  'unit 1': D = 29.6mm (armholetop anchor)      <- fine
Medium : [back Medium] 'unit 1': D = 30.4mm (armholetop anchor)      <- fine
Large  : 'unit 1': covers the full edge. SM-COV from=bottom startedInside=true samplesInside=35/35
XL     : ... same          2XL : ... same
[Large Short Sleeve] native 'unit 1': left=32.6mm(armholetop) right=33.1mm(armholetop)
```

On the bigger sizes the back's band sits low enough that the **underarm corner lands
inside it** (`startedInside=true`), so the bottom-anchor walk reads 35/35 samples
covered -> body = `full`. The sleeve's own copy of the band does NOT cover its
underarm (32.6mm away), so sleeve != `full`, and `:6484` fires the warning.

**Code-level root cause** - `_smMeasureUnitD`, `automate_production.jsx:5678`:

```js
if ((hasB && mB.full) || (hasT && mT.full) || (hasA && mA.full)) {
    return { full: true, cov: _cv, covFrom: _which };   // discards everything else
}
```

Any ONE anchor reading `full` poisons the whole target, even though the
`armholetop` candidate had a perfectly usable finite D (~32mm, matching the
sleeve's 32.6mm). Small/Medium escaped only because their bottom anchor was not
full, so `best` fell through to armholetop at `:5695`.

Proposed 3-line fix offered (not implemented): take the `full` verdict only when no
finite candidate survives - compute `best` first, prefer it, fall back to `full`.
Asked the user which guard to use for a genuinely full-covering band (5%-of-panel-height
floor on the armholetop D, or straight finite-wins).

## Outcome

- ✅ Impact: recurrence explained with log evidence; the "how did we fix it before" premise corrected - it was diagnosed, never fixed
- 🧪 Tests: none (analysis of an existing run)
- 📁 Files: none modified
- 🔁 Next prompts: implement the `:5678` finite-wins change once the user picks the guard; then re-run Large/XL/2XL
- 🧠 Reflection: the `SM-COV` diagnostic added last time paid for itself - the cause was readable straight off the log with no new instrumentation

## Evaluation notes (flywheel)

- Failure modes observed: a short-circuit that returns a verdict instead of a measurement throws away a good sibling measurement; per-size band geometry means the short-circuit only trips on some sizes, which makes it look intermittent
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): log ALL three candidates (bottom / armholetop) with their full-flags on one line, so "which anchor won and why" needs no source reading
