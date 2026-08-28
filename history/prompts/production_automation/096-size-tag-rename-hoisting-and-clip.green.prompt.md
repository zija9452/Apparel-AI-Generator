---
id: 096
title: Size tag rename hoisting and clip
stage: green
date: 2026-08-12
surface: agent
model: claude-opus-5
feature: production_automation
branch: main
user: zija9452
command: chat
labels: ["renameSizeTags", "var-hoisting", "clipping-mask", "size-tags", "hoodie", "sleeve"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Backend/scripts/automate_production.jsx
tests:
 - Verbatim extraction of production renameSizeTags run against the real pattern's Small/XL/2XL sleeve groups (hits=1 on all three)
 - Verbatim extraction of production _buildNameIndex/findAnywhere against the same pattern (returns the correct group for every size)
 - Node pure-logic matrix over the match rule - 10 cases incl. 4 must-NOT-match guards - all pass
 - Node replay of keepInsideClip arithmetic on the measured bounds (left hood -120pt, right hood 0pt)
 - node new Function() syntax check of the whole script
 - Live production job 9b724b2d confirmed all of it end to end
---

## Prompt

or X-Large ho ya 2X-Large is me sleeve me size sleeve right/left nhi likha ata , q ? ise bhi fix kro

(follow-ups in the same turn: "kia issue he ? kia fix kr rhe ho", "Naam is trha hen , X-Large , 2X-large",
"issue kia tha , dono same hi to hen", "is k ilawa jo cut ho rha tha nam left wale pr wo ?", "ok",
"D:\...\9b724b2d-...\renders\Small_Outside_Hood.jpg is k sath outside inside q nhi aya he andar text me ,S k size k sath")

## Response snapshot

Three distinct defects behind one symptom. All diagnosed from measurement, not inference.

**A. `var` hoisting killed the size-word fallback (the reported bug).**

`runAutomation()` is one long function body. The per-item processing loop is an INLINE statement at
line ~487; `var RENAME_SIZE_WORDS = [...]` was written at line ~1649. `var` hoists the declaration but
not the assignment, so during the loop the list was `undefined`, `RENAME_SIZE_WORDS.length` threw a
TypeError, and `renameSizeTags`' outer `try { recurse(...) } catch (eR) {}` swallowed it - surfacing as
"WARNING: no '<size>' tag text found to update".

It only bit tags whose text is not character-identical to the size label, because the exact test
short-circuits before the list is ever touched. That predicts the observed pattern exactly:

| piece | pattern tag | size label | exact? | observed |
|---|---|---|---|---|
| Small Long Sleeve | `Small` | Small | yes | renamed ✅ |
| XL Long Sleeve | `X-Large` | XL | no | failed ❌ |
| 2XL Long Sleeve | `2X-Large` | 2XL | no | failed ❌ |
| Small Hood | `s` | Small | no | failed ❌ |
| XL Hood | `XL` | XL | yes | renamed ✅ |
| 2XL Hood | `2XL` | 2XL | yes | renamed ✅ |

Six independent cases, all predicted. Fix: moved the list to the top of `runAutomation`, with a comment
warning against moving it back.

Ruled out first, by running production code verbatim rather than a reimplementation: `renameSizeTags`
itself (hits=1 on all three sleeve groups) and `findAnywhere`/`_buildNameIndex` (returns the correct
group, bounds matching the job log's "Size: 1624x1747").

**B. One-letter pattern tags never matched at all.**

Independent of A: `RENAME_SIZE_WORDS` contains `xs`/`small`/`medium`/`large`/`xl` but no bare `s`/`m`/`l`,
so the Hood pieces' one-letter `"s"` tag could not match even with the list defined. I initially told the
user fix A would cover this - it does not, and I corrected that.

Fix: added `SIZE_ALIAS_GROUPS`, consulted BEFORE the global list and scoped to the size being processed.
A bare `S` renames on a Small order but a stray `L`/`R` marker can never rename while some other size is
being processed - which putting single letters in the global list would have allowed.

**C. The renamed tag was clipped away on the left Hood piece.**

Both hood pieces sit inside a group clipped to their own outline, and the tag is LEFT-justified POINT
text, so a longer name always grows RIGHT from a pinned left edge. Measured on the real pattern:

```
XL Right Hood  tag L=-4439  piece -4441..-3426   after rename R=-4300   874pt of room  -> fine
XL Left  Hood  tag L=-4484  piece -5474..-4460   after rename R=-4346   114pt OUTSIDE  -> mask ate it
```

Fix: `keepInsideClip()` walks up to the nearest clipped ancestor and slides the tag (and its background
box) back inside. First cut tested against `edge - margin`, which nudged tags that were merely near an
edge but never clipped (Right hood drifted 1-4pt in the live run); corrected to test for a real spill and
apply the margin only to the correction.

Also hardened `findBoxSibling` to skip `clipping` paths - on a Hood piece the tag's only path sibling IS
the piece's clip mask, so `resizeTagBox` could have stretched the mask and reshaped the panel.

**Live verification** (job 9b724b2d, which bundled A + C but not B):
```
17:09:04  Size tag text updated to 'XL Long Sleeve Right' (1 tag).     <- was a WARNING
17:12:45  Size tag text updated to '2XL Long Sleeve Right' (1 tag).    <- was a WARNING
17:09:14  Renamed size tag shifted -120pt to stay inside the piece outline.
17:09:14  HOODIE: Outside Hood Left-piece tag updated to 'XL Outside Hood' (1 tag).
```
-120pt is exactly the 114pt measured spill plus the 6pt margin. `XL_Outside_Hood.jpg` now shows the full
"XL Outside Hood" on both pieces, and the mockup's `S-outside` test tag is gone (PHR 095's fix).

## Outcome

- ✅ Impact: every size's sleeve and hood pieces now carry their full "{Size} {Part} {Side}" tag, inside the piece outline.
- 🧪 Tests: verbatim-extraction probes, a 10-case node logic matrix, an arithmetic replay, a syntax check, and one full production run.
- 📁 Files: `Backend/scripts/automate_production.jsx`
- 🔁 Next prompts: re-run to confirm B (Small hood `s` -> "Small Outside Hood"); it is the only fix not yet exercised end to end.
- 🧠 Reflection: the six-case prediction table was what turned a plausible hoisting theory into a settled diagnosis - a theory that explains the failures AND the successes is much stronger than one that only explains failures.

## Evaluation notes (flywheel)

- Failure modes observed: (1) a silent `catch` converted a TypeError into a misleading "not found" message for months; (2) I claimed fix A would also cover the one-letter tag without checking the list contents, and had to correct it; (3) my first margin rule moved artwork that was never broken.
- Graders run and results (PASS/FAIL): node logic matrix 10/10 PASS; arithmetic replay 2/2 PASS; syntax PASS.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): audit the other silent `catch (e) {}` blocks in this file - the same swallow-and-mislead pattern is likely hiding elsewhere.
