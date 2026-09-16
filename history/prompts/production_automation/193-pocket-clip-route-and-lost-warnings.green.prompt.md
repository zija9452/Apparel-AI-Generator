---
id: 193
title: Pocket clip route and lost warnings
stage: green
date: 2026-09-15
surface: agent
model: claude-opus-5
feature: production_automation
branch: main
user: zija9452
command: "90% yhn q stuck he" -> zip; "3xl 4xl 5xl ki pocket q clipped nhi hui"
labels: ["hoodie-pocket", "clipping-mask", "chunked-render", "warnings", "zip", "0.7.2", "0.7.3"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - Backend/scripts/automate_production.jsx
  - Backend/services/illustrator_automation.py
  - Agent/main.py
  - Frontend/my-app/app/home/page.tsx
  - Frontend/my-app/public/AIApparelAgent.zip
tests:
  - measured: deflate level 6 on a real order .ai - 40 MB -> 39.8 MB (0.5% saved), 18.6 MB/s
  - measured: live zip growth 4.7 MB/s, one core at 85%, 14 files / 8250 MB -> ~30 min
  - probed: the OPEN 3XL order doc via COM - '3XL Pocket' CLIPPED=false, design 2219x2762pt inside a 1591x924pt outline
  - probed: pattern.ai Pocket groups across all sizes - Medium/Large/XL/2XL carry a nested clipped group, XS/Small/3XL/4XL/5XL/6XL do not
  - syntax: node --check on a .js copy of automate_production.jsx - PASS after each edit
  - install: agent answered 0.7.2, then 0.7.3
---

## Prompt

Saving production_ready_order_YXS.ai (large file, this takes a few minutes)... ye idhr large file q likha a rha he

Cleaning up and generating Zip package... 90% yhn q stuck he ??

to .ai files q compressed ho rhi hen ? na hon , kis ne ki

ok , implement kr de , file zip me compress na ho

and us job me 3xl , 4xl , 5xl ki pocket q clipped nhi hui he , kia error he ? kia issue he us me ??

small or xs sahi ayen hen pocket , mjhe exact btao issue kia hua he ?? kia w group nhi the ?? lekin group to thr , thk se check kro , or hood warning add krte jao , start se usi ka na likho na ,

jb same he pattern to changes kis bt ki ?

ok , local pr kro agent nstall , pkg me rkho frontend k agent

## Response snapshot

Three findings, each measured rather than reasoned.

**1. "large file" was true, "few minutes" was stale.** production_ready_order_YXS.ai
really is 582 MB - order file size tracks the MOCKUP's 594.8 MB of embedded
rasters, not the garment size. After the pdfCompatible fix (PHR 190) a save is
63-117s, not the 5m40s the hardcoded string still promises.

**2. The 90% "hang" was a second compression.** Not stuck - the zip was growing
at ~4 MB/s with one core pinned. shutil.make_archive deflates, and the order
files are already compressed by Illustrator's own save. Measured on a real order
file: deflate saves 0.5% (42 MB out of 8250) for ~30 minutes of CPU. The user
asked whether to turn the .ai compression OFF instead; that is the wrong
direction - bigger files, slower saves, and the zip would then have something
compressible so the CPU cost comes straight back. Replaced make_archive with
_archive_stored (ZIP_STORED, same layout, allowZip64 for the 4 GB+ archive).

**3. The pocket bug was NOT the pattern.** First read said the pattern was at
fault because 3XL/4XL/5XL Pocket groups carry no clipping group. The user
corrected it: XS and Small came out CORRECT - and they have the same defect.
That correction is what found the real bug.

The route is chosen by ONE test: does the piece carry a size tag?

    XS / Small / 6XL   no tag -> skipped Paste in Back, fell through to the
                                 fallback, which BUILDS a real mask -> CORRECT
    3XL / 4XL / 5XL    a tag  -> took Paste in Back into an unclipped group, and
                                 because the paste "succeeded" clipGroup was set,
                                 so `if (!clipGroup)` skipped the fallback
                                 entirely                            -> UNCLIPPED

Paste in Back clips nothing by itself - the PATTERN's mask is what confines the
design. Identical patterns, opposite results, decided by a text label. Gated the
route on `patternClipFound` instead. The tag is rescued on the fallback path by
the `if (!pastedBehindLabel) bringPatternLabelsToFront(...)` call that already
exists.

**Why 3XL looked different from 4XL.** hoodie_warnings.txt listed only 4XL and
5XL. The writers are correct (they run once, in the final chunk, guarded by the
CHUNK EXIT block) - but the four warning ARRAYS were rebuilt empty at every
Illustrator restart and never carried in render_state.json, the way parmErrors
always has been. This job ran in 7 chunks, so only the last chunk's warnings
survived. XS, Small and 3XL had all raised the identical "no clipping group
found" warning and it was overwritten. Carried all four lists through the
checkpoint (hoodie, sleeve-match, back-label, placket) - the user asked for
hoodie; the other three had the same defect and the same two-line fix.

Released 0.7.2 (zip) and 0.7.3 (pocket + warnings), rebuilt the website package
(284 -> 287 KB, homepage updated), refreshed E:\AIApparelAgent and reinstalled.

## Outcome

- ✅ Impact: the 90% wait drops from ~30 min to disk speed; 3XL/4XL/5XL pockets take the route that already works for XS/Small; warnings from every chunk now reach the report instead of only the last one
- 🧪 Tests: deflate ratio measured on a real file, zip rate measured live, both pocket claims probed against the actual documents, node --check after each edit, agent answered 0.7.3
- 📁 Files: automate_production.jsx, illustrator_automation.py, Agent/main.py, home/page.tsx, AIApparelAgent.zip
- 🔁 Next prompts: re-run the 3XL/4XL/5XL order and confirm the pocket clips AND the size tag is still visible - that is the one thing code reading cannot settle
- 🧠 Reflection: the user's "small or xs sahi ayen hen" is what turned a wrong diagnosis into the right one. Two pieces with the SAME pattern and opposite results is a code bug by construction - the pattern cannot explain a difference it does not contain

## Evaluation notes (flywheel)

- Failure modes observed: I blamed the pattern and proposed the user edit six groups by hand, on evidence that could not support it - I had only looked at the pattern, and never asked why identical structures gave different results. The disconfirming case was already in the data (XS/Small/6XL all lack the clip too) and I read past it. Also predicted XS/Small were "at the same risk" off a code comment instead of checking.
- Graders run and results (PASS/FAIL): node --check PASS, alias/state-key comparisons PASS, live COM probes PASS. The pocket render itself NOT graded - needs a real run.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): when two sizes share a pattern structure but differ in output, diff the CODE PATH each took before touching the pattern - the debug log already prints the route ("piece group" vs "nested group" vs "[fallback]") and that line alone would have pointed straight at it
