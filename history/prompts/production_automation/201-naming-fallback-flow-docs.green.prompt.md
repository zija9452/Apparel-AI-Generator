---
id: 201
title: Naming Fallback Flow Docs
stage: green
date: 2026-09-17
surface: agent
model: claude-opus-5
feature: production_automation
branch: main
user: zija9452
command: (direct request)
labels: ["docs", "naming", "fallback", "ux", "tests"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Frontend/my-app/app/docs/page.tsx
 - Backend/scripts/tests/ (12 harnesses + README.md, moved out of the session scratchpad)
tests:
 - npx tsc --noEmit (clean)
 - npx eslint app components (clean)
 - served /docs fetched and grepped for all six new headings - all present
 - headless screenshot of the rendered Flow and Probe components, reviewed
 - the whole suite re-run from its new home - 266 / 435 / 520 / 83
---

## Prompt

ye sb add bhi kr dena docs me , for future remembrance k lioye

(then, correcting where: "docs dekho page he frontend me , us me he naming
pattern ki or mockup ki , nine chapters hen , us me naming fllback add krne the ,
or flow to btao , kia kia ccept ho jaye ga ," and then "mjhe to samjha do pehle ,
meri samjh nhia rha he , in a non-technical")

## Response snapshot

The docs page listed, per name, which other spellings are accepted. What it never
said was the **order** - what the job tries, and what happens when nothing
matches. That is the difference between "my layer name is wrong" and "my layer
name is being read as something else", and it is the question a designer actually
has.

Two new components in `app/docs/page.tsx`:

- **`Flow`** - a numbered resolution order. Used where the question is not "what
  is this name" but "what does the job try, and in which order, before it gives
  up".
- **`Probe`** - the real list of names one lookup walks, with the one that hit
  marked. Not written by hand: it is the output of PHR 200's run against a real
  pattern file.

Three sections added:

1. **Chapter 04, "How a name is resolved"** - the five steps every mockup lookup
   takes: punctuation dropped, the per-name match rule (exact / starts with /
   contains), abbreviations and either word order, the object-Note channel for
   `side` and `shoulder`, and finally the `LOGO` fallback. The existing warning
   about that fallback now has the flow above it explaining how a name reaches it.

2. **Chapter 05, "How a cut piece is found"** - the five steps on the pattern
   side, plus the worked `Probe`: an order row reading `Women Large`, the sixteen
   names tried for its Front, and `Women Large Front` marked as the one that
   matched at position 6. Followed by a warn Note making the contrast explicit -
   **the pattern side has no fallback at all.** A missing piece pauses the job
   and logs every name tried, because cutting the wrong shape is fabric in the
   bin.

3. **Chapter 05, "The size tag inside the piece"** - the four-step rename chain,
   which was documented nowhere. Step 3 is the one added in PHR 200: anything the
   order sheet itself would be read as this size, so a piece tagged with its own
   full prefix (`Women Youth Large`) is understood without that spelling being
   listed. Ends with what the log says when none of the four matches, and that
   the piece is still cut and exported correctly either way.

### Also done

The twelve size harnesses were living in a session scratchpad that gets wiped.
They are now `Backend/scripts/tests/`, with the hardcoded `D:\...` root replaced
by a path relative to each file, and a README that opens with the thing worth
remembering: the size string is parsed in FOUR places and a disagreement between
them is silent wrong output, never an error.

`verify_xlsx.py` compared the workbooks against a pre-change backup that only
existed in the scratchpad; that section is now skipped when the backup is absent,
so the part that matters - does the sheet promise what the code does - runs
anywhere. 499 checks there become 83 without the backup, by design.

## Outcome

- Impact: the two silent-failure modes a designer can actually hit are now
  written down as flows, not buried in a Notes column - the mockup's LOGO
  fallback, and the pattern side's refusal to substitute anything
- Tests: tsc and eslint clean; the served page grepped for every new heading;
  the rendered Flow and Probe screenshotted and reviewed; the whole suite re-run
  from its new home in the repo
- Files: `app/docs/page.tsx`, and `Backend/scripts/tests/`
- Next prompts: Chapter 04's per-name tables still say the match rule in prose in
  the Notes column. A dedicated "Match" column, the way the .xlsx already has
  one, would make step 2 of the new flow readable at a glance
- Reflection: the user asked for the explanation before the code - "mjhe to
  samjha do pehle". Worth reading as a note on the docs themselves: the courier
  looking for a name plate is what made it land, and none of that framing is on
  the page

## Evaluation notes (flywheel)

- Failure modes observed: documenting WHAT a name is without documenting WHAT
  HAPPENS WHEN IT IS WRONG - the tables were complete and still did not answer
  the only question a stuck designer has
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): generate the `Probe` list at build
  time from `sizeAliases` instead of pasting it, so the docs cannot drift from
  the lookup they claim to show
