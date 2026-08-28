---
id: 013
title: Diagnose Silent Kerning Collision Guard
stage: refactor
date: 2026-08-24
surface: agent
model: claude-opus-5
feature: production_automation
branch: main
user: zija9452
command: (direct request)
labels: ["kerning", "collision-guard", "diagnostics", "logging", "numbers"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Backend/scripts/automate_production.jsx
tests:
 - Pixel measurement of S/Small_Back_Item2.jpg ('77') and L/Large_Back_Item1.jpg ('78') at 300 dpi
 - Keyline-overhang measurement distinguishing the two candidate causes
 - node --check on automate_production.jsx
 - ES3 reserved-word sweep
---

## Prompt

D:\Zija_Yaseen\Web development\AI-Apparel-Order-Generator\Backend\uploads\M101_Round_Neck-2\M101_Round_Neck-2\S\Small_Back_Item2.jpg ye kerning ka kia concept he , 77 still merge ho rha he . space kitna he beech me , visible bounds ko rkh kr jitna gap visible bounds me mockup me he utna hi ananchahiye he na

(follow-up) D:\Zija_Yaseen\Web development\AI-Apparel-Order-Generator\Backend\uploads\M101_Round_Neck-2\M101_Round_Neck-2\L\Large_Back_Item1.jpg ye bhi merge kr rha he dekho

(follow-up) kia issue tha ?? kia fix kia he ??

## Response snapshot

**Measured from the finished 300 dpi renders (1px = 0.24pt = 0.0847mm):**

| Render | painted gap between glyphs |
|---|---|
| `S/.../Small_Back_Item2.jpg` ('77') | 0.48pt = **0.17mm**, held from 3% to 22% down the digits |
| `L/.../Large_Back_Item1.jpg` ('78') | **-0.24pt** - one connected bright run, the keylines overlap |

**The guard never acted.** The whole 921-line `debug_log.txt` contains
`- spacing: carried 1 gap(s) from mockup onto '77' (width 928 -> 892pt)` but
NOT ONE `- spacing guard:` line, for any size or any number.

**Why that was undiagnosable:** `applyTextSpacing`'s collision guard had five
unlogged `return`s (no active doc / no type size / overhang unmeasurable /
outline failed / glyph-count mismatch) AND a silent all-clear path
(`tooTight.length === 0` -> `break` with `touched` false). Two completely
different causes - "bailed before measuring" and "measured and thought it was
fine" - produced byte-identical silence.

**Narrowing it without another run:** measured the white keyline in the render
at 10% down the '77': white-to-white 0.48pt, yellow-to-yellow (= what
`createOutline` sees, since it drops the appearance) 43.68pt, so the real paint
overhang is 43.2pt / 21.6pt per side - matching the code's own note of "~21pt a
side". Then:

* overhang read correctly -> paintedGap = 43.68 - 43.20 = 0.48pt vs a
  0.25 x 43.2 = 10.8pt floor -> the guard FIRES and logs. It did not.
* overhang read as ~0 -> paintedGap = 43.68 - 0 = 43.68pt -> reads perfectly
  healthy, guard stays silent. **This matches the observed output exactly.**

So the leading candidate is `measurePaintOverhang` returning ~0 on this mockup
(the duplicate probe not carrying the white keyline appearance), with the
earlier bail paths still possible.

**Changed:** every exit of the guard now logs - a `guardBail(why)` helper on all
five returns plus the `pairs.length === 0` case, and a new all-clear branch that
prints the same numbers as the acting branch (painted gaps, floor, measured
overhang, glyph count, type size). No behaviour change; the guard still decides
exactly what it decided before.

**Also answered:** the user's "shouldn't it just be the mockup's visibleBounds
gap" - `tf.visibleBounds` is ADVANCE-based, proven by the code's own probe where
`W(AB)-W(A)-W(B)` came back at exactly -37.5 on seven different digit pairs. It
cannot see ink, which is why per-glyph gaps go through `createOutline()`. And
the mockup placeholder's glyphs are not '77'/'78', so "the mockup's gap" is not
automatically safe once the shapes change.

## Outcome

- ✅ Impact: the next run's log will name the cause in one line instead of saying nothing.
- 🧪 Tests: pixel measurements above; `node --check` clean; ES3 reserved-word sweep clean. The merge itself is NOT yet fixed.
- 📁 Files: 1 changed (`Backend/scripts/automate_production.jsx`).
- 🔁 Next prompts: re-run one size, read the `spacing guard:` line, then fix the named cause.
- 🧠 Reflection: a guard whose failure and whose success look identical from outside cannot be debugged - logging the all-clear path mattered as much as logging the bails.

## Evaluation notes (flywheel)

- Failure modes observed: silent early-returns hid a non-functioning guard across a whole job; the render itself turned out to be a better measuring instrument than the log.
- Graders run and results (PASS/FAIL): pixel measurement PASS (two candidate causes separated), `node --check` PASS, reserved-word sweep PASS.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): if the log says overhang ~0, measure the overhang off the outlined copy's own bounds instead of the duplicate-probe widths.
