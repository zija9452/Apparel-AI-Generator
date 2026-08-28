---
id: 087
title: Size-group labels, forced size row-break, short-sleeve pairing
stage: green
date: 2026-07-29
surface: agent
model: claude-sonnet-5
feature: production_automation
branch: main
user: zija9452
command: none
labels: ["illustrator", "artboard-layout", "order-file", "sleeve-pairing", "size-label"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - Backend/scripts/automate_production.jsx
tests:
  - node --check (via .js copy, extension workaround) - passed
  - runtime verification pending: next job run in Illustrator
---

## Prompt

(Roman Urdu/English mixed, multi-turn conversation)

"explore my whole project an PHR records . us me jo production file bnti he , jis
me ana chahiye he pattern se text , qk pattern me hota he text jese k agr wo Large
size (L) chl rha ho to ata he L likha hua text to wo copy kre production file me
rkhe , jb tk L k sizes chl rhe hen wo hi logic rhe k 5 mm ka gap horizontal pr or
15 mm ka gap vertical pr , lekin jb dekhe k ye size khata hogyahe or Medium (m)
shuru ho o pattern se copy kre ya khud likh de , qk size to pta hi he excel se ata
he wo likh de , or 15mm ka gap a jaye or next line se start ho , jese k text ek hi
line m,e ior size khatam hon epr dusri line , isi trha short sleeve hon to el
sleeve k niche hi dusri sleeve a jaye or qk jga waste hoti he phr , or neck jo he
front and back k top pr aye 5 mm gap pr center m,e , is trha \"\"\"E:\\Capture.JPG\"\"\"
, pehle plan discuss krna then imlement"

[clarification] "yr meri instruction bhi to dekho , or wo ai file ka screenshot
tha , wrna wo alg alg independent artboard hi hen ,"

[clarification] "E:\\Capture.JPG aesa M jo highlit he , wo size tag se alg he"

"ab btao implement kia kro ge ?? kee alignments ay gi sb ki ??  position . or gap ?"

"ok"

[on Neck anchoring question] "neck ek hi hoti he ek size me k neck hoti he , to
pehle wala front back k pr rkh lena"

"agr mushkil he to neck ko normal chlne do , ek k bd ek , chor do ise"

[mid-implementation] "acha sleeve jb hort hon tb hi ek k neeche ek , or agr full
ho ya koi or si to 5mm gap se normal flow" (x2, restated)

"isse pattern to klharab nhi hon ge ?"

## Response snapshot

Explored automate_production.jsx's existing artboard-tiling loop (part-major:
every part_name's full quantity is placed before moving to the next part) and
prior PHRs (064-070) documenting the 5mm horizontal / 1000pt vertical gap
history. Flagged that literal per-shirt Neck-above-Front/Back anchoring would
require restructuring the loop from part-major to unit-major (high risk given
~90 PHRs' worth of FULL_BUTTON/SLEEVE_MATCH/PLACKET_MATCH state built on the
current order) - user confirmed Neck is one-per-size, not one-per-shirt, and
told me to drop that requirement entirely (normal flow, no anchoring).

Implemented three scoped changes in automate_production.jsx:

1. `refContext.vSpacing` changed from 1000pt to 15mm (`15 * 2.83465`), used for
   both normal row-wrap-on-overflow and the new forced size-change wrap.
2. New `lastSizeLabel` tracking in the main group loop: when the running size
   changes, force `currentX = -7500` + vSpacing-gap wrap (even if the row had
   room left), then call new `placeSizeGroupLabel(sizeLabel)` which drops a
   large standalone text (200pt, via `sizeToAbbrev`, black CMYK, ArialMT with
   fallback) at the row's top-left and advances currentY past it (5mm gap) -
   independent of the existing tiny per-panel `processSizeTagLabel` tag.
3. Short-sleeve pairing: `pmLastSleevePanel` tracks an unpaired Short Sleeve
   instance; the next Short Sleeve of the same size stacks directly below it
   (5mm gap) instead of flowing into the next column, consuming zero extra row
   width (restores `preFlowX`/`preFlowY` after, folds the pair's combined
   height into `rowMaxHeight`). Gated strictly on "short"/"half" in the
   resolved part label/name - Long/Full sleeves and every other part keep the
   normal 5mm side-by-side flow, per explicit instruction.

Confirmed to the user this only changes positioning math + adds one new text
frame per size in the Order doc - never touches the master pattern document
(only ever duplicated, never mutated).

## Outcome

- ✅ Impact: Order-file layout now groups by size (forced break + visible size
  label) and nests short-sleeve pairs compactly; Neck and all other parts
  unchanged.
- 🧪 Tests: node --check syntax pass only (extension workaround) - not yet run
  inside Illustrator against a real job.
- 📁 Files: Backend/scripts/automate_production.jsx
- 🔁 Next prompts: run a real job with mixed sizes + short sleeves to visually
  confirm the label placement, row-break, and sleeve stacking look right;
  adjust label font size/style if it doesn't read well against real pattern
  proportions.
- 🧠 Reflection: user rejected the AskUserQuestion tool twice in this thread -
  prefers plain-text back-and-forth over structured multi-choice prompts for
  this kind of design discussion.

## Evaluation notes (flywheel)

- Failure modes observed: none yet - runtime verification pending.
- Graders run and results (PASS/FAIL): node --check PASS.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): run one job covering 2+ sizes with
  short sleeves and inspect debug_log.txt for the new "Size-group label" and
  "SLEEVE-PAIR" log lines plus the resulting artboard coordinates.
