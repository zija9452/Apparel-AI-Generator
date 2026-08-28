---
id: 088
title: Multi-unit armhole match sleeve matching, designed and implemented
stage: green
date: 2026-08-07
surface: agent
model: claude-sonnet-5
feature: production_automation
branch: main
user: zija9452
command: none
labels: ["illustrator", "sleeve-match", "armhole-match", "multi-unit", "pre-flight", "frontend"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - Backend/scripts/automate_production.jsx
  - Backend/services/illustrator_automation.py
  - Backend/main.py
  - Frontend/my-app/components/UploadForm.tsx
  - Frontend/my-app/components/ProductionPlan.tsx
tests:
  - node --check (via .js copy, extension workaround) - passed
  - python -m py_compile on illustrator_automation.py/main.py - passed
  - runtime verification pending: next job run in Illustrator
---

## Prompt

(Roman Urdu/English mixed, multi-turn design-then-implement conversation,
continuing from 087's size-group-label/sleeve-pairing work)

"kl k session last me hm sleeve logic implement kr rhe the  wo ki thi"

"ok , again discus kr lety hen , sleeve side sam match ki ogic btao abhi ki
current \"??Side–sleeve design matchingAlign side-panel designs across the
armhole seam so the body and sleeve meet exactly when sewn. Parts that
can't be matched are rendered normally and reported at the end. is me jo
hota he"

"ok , great , ab issue ye he k , sirf ek hi design bhi nhi hot , kbhi kbhi
multiple design hoty hen . to jo bhi match krne hodesign armhle k top se
bottom tk use ek group me rkh dun gi or group ka nam hoga armhole match ,
us me unit 1, unit 2 , unit 3 .... is trha name rkh dun gi same logic
sleeve pr bhi group hoga armhole match and unit1 , unit 2 , unit 3 .... ,
ab yhi logic rkhni he k jersey pr -77 ka inset le kr andar ki trf jese abhi
ho rha he , us ka distance dekho , pehle top se dekho . Agr armhole top pr
unit na ho wo empty se start ho rha ho to dekho k us k first unit tk kitna
distance a rha he , jese d abhi measure ho rha he , usi trha d nikalo , or
phr armhole k bottom se jese abhi d a rha he first unit tk wo nmikalo ,
mtlb armhole k top and bottom dono jga se nikalo d whn tk jhn tk fisrt unit
na ajaye (first unit mtlb k wo unit 3 , 4 bhi ho skta he  or unit 1,2 bhi ,
mtlb jo pehla unit mile) ab dekho k dono d me se sb se kam kia he , agr ek
d ka ans=-5 or dusre ka ans=4 ho to distance 4 kam hua , minus ko hta kr
dekhna , or jo km ho d , whn se measure krna start krna k fisrt unit tk
measure kr lia , fisrt and second unit tk kitna distance he ya distance
nhi he to second unit ka d kia he ... and last me agr tm ne armhole top se
start kia ho to armhole k bottom tk bhi koi design continue ho to use chor
dena , isi trha agr top se start kr rhe ho to sleeve k center se measure
krna strt hoga , or agr bottom se (jo k abhi implement he code ) to sleeve
kl corner se dekhnahoga , edge cases discuss kr lo , pehle plan discuss
kro ,. or explain kro is me kia issues aye ge , or facts pr bt kro k is
trha match kre ga armhole or sleeve ?"

"1. bottom seam corner kese nikl rhahe ?? or distance ki jga unit dekho ,
agr armhole k tope se unit a rha he ya d nikalte hue unit pehle kam
distance pr agya , ya  bottom pr armohole stat hi unit se ho rha he to wo
kam man lia jaye ga na ,"

"E:\\2XL_Front_Item2.jpg ye blue circles dekho , ye hen armhole top ka or
bottom ka inset 7mm lena he" [image: shoulder-corner and underarm-corner
circled in blue on a Front panel render]

"D:\\...\\27ad40b6.../Medium_Front_Item1.jpg kch design aese hi jo left se
right tk chl rhe hen , to sleeve me bhi ek hi hon ge ,. kch aese hen jo
lleft and right pr alg alg chl rhe hen , D:\\...\\fac872c5.../2XL_Front_Item1.jpg
to ye alg alg hon ge , mtlb k armhole match , uniot left 1 , unit right 1 ,
isi trha sleeve me bhi , or agr left and right na ho to mtlb ye ek hi
design jo left se right tk ja rha ho" [2 images]

"3. sb unit un ki d k according alg alg indeppendently fix krna hen , ta k
sb perfect ayen . qk sb ka alg alg d nikalen ge , to sleeve pr usi k
according set kr skte hen , jese abhi set ki logic he , uper niche right
left move and resize"

"4. purana overwrite kr do na , match wali logic armhole ki , Jo k
Match_black kch is trha he , , 5. exact matching hogii armhole match case
insensitive rkhna , or unit1 bhi ho skta he or unit 1 bhi"

"ab mjhe plan btao , or flow btao k kese hoga , or do example bhi do k ye
ayen to kese solve hoga ?/ jese mene do pics di hen"

"kia parts sleeve me sepaarat ? or kia flag kia he , koi hal;lucination
nhi , edge case discus kr lo"

"armhole side sleeve logic me agr jersey pr aesa design ho jo left alg and
right alg ho to sleeve pr chahe wo left ho ya right ya ek hi ho , us me ek
hi sleeve k do corners hoty hen ek laft wala ek right wala .
D:\\...\\fac872c5.../3XL_Short_Sleeve_Item1.jpg jese is me ek red patti
left anmd ek right pr he , mtlb left and right ka mtlb tha k ek hi sleeve
me desgn cntinue nhi he blke left and right pr he
D:\\...\\27ad40b6.../XL_Short_Sleeve_Item1.jpg ye center ek ka he" [2
images]

"ab again proper plan share kro shortt me"

"ok , implement kr do , or update kr dena frontend me k armhole match and
unit 1 , 2 ka bta dena , or side sleeve matching ki jga armhole side
sleeve metaching rkhna , or agr ye check box on ho or mockup me aese koi
na mle group name ya layer name to rok dena jese abhi pause krte hen ,
code me he , or agr match na kre to frontend me end nme show krte hen na
warning me k ye match nhi kia manually dekh len , wo bhi wesa hi rkhna"

[mid-implementation] "dono sides ki dekhne ki need hi nhi hogi jerey pr
front ki left and right , sirf right dekh lena , dusre wala usi k jesa
hota he , isi trha sleeve me bhi same hi rkhna , or back ki d nikalne ki
ned nhi , front ki right side wali hi sb jga apply ho jaye gi"

## Response snapshot

Explored the existing SLEEVE-MATCH implementation (single "match"-prefix
named-art mode + geometric fallback, one shared D per size averaged from
whichever body panel measured first) and the established pre-flight-pause
pattern used by CENTER_MATCH/PATTERN_MATCH/SIZE_TAG/SIDE_SEAM_MATCH
(_mockup_has_*_object in illustrator_automation.py, status.json flags,
resume/cancel UI in ProductionPlan.tsx).

Iteratively designed, with the user, a multi-unit naming/matching scheme:
an "armhole match" group containing "unit1"/"unit N" (continuous, applies
to both corners) or "unit left N"/"unit right N" (independent per corner)
children, on both body and sleeve designs. Verified via real render images
(Waialua = continuous corner-to-corner pattern; a jersey's Short Sleeve
piece with two separate red bands = tagged-per-corner case) that "left"/
"right" always means a PANEL's own two corners (not "which arm"), so
sleeve and body use identical naming/logic - no special-casing. Added a
mirrored TOP corner (shoulder/cap-apex, walking down) alongside the
existing BOTTOM corner (underarm, walking up) so every unit independently
measures from whichever end it's nearer to. Mid-implementation the user
simplified the measurement scope: only Front's right armhole is ever
measured (Front-Left/Back/both sleeve corners are assumed mirror-symmetric
and reuse that single result) - Back is never opened for this at all.

Implemented in Backend/scripts/automate_production.jsx (~700 lines,
replacing the old MATCH-prefix/geometric-fallback SLEEVE-MATCH section):
- `_uaWalkDown` (mirrors `_uaWalkUp`) + `_smFindCorners` extended to return
  `Ltop`/`Rtop` alongside the existing `L`/`R`.
- `_smNorm`/`_smFindArmholeGroup`/`_smCollectUnits`/`_smSortByDistance`/
  `_smGetUnitSets`/`_smUnitsForSide`: naming parser and geometry-based
  (not name-number-based) body<->sleeve unit ordering.
- `_smMeasureFromSA` extracted as the shared "walk A, find in/out
  transitions" tail; `_smMeasureAlongEdge` (bottom) refactored onto it,
  `_smMeasureFromTop` (new mirror) added; `_smMeasureUnitD` picks
  whichever end (top/bottom) is closer, per unit.
- `smMeasureBodyD` rewritten: gated on `isFront(partName)` only, measures
  every unit on the right armhole independently, stores
  `sleeveMatchD[sizeLabel] = { units: [...], fromPart }`.
- `_smSolveUnit` (new, unifies the old single-side slide loop and the old
  2-axis MATCH-named solve into one generic N-target slide+resize solver)
  + `smApplyOneUnit` (tagged, 1 target) + `smApplySleeveMatch` rewritten
  to branch continuous (2-axis dual-target per unit) vs tagged
  (independent per-corner, same shared target list mirrored to both
  sides) + `_smWarnOverlaps` (post-match bounding-box overlap warning).
- Removed (superseded): `_smCollectSideArt`, `_smCollectNamedArt`,
  `_smWalkArc` (was already dead), `smApplyNamedMatch` (merged into
  `_smSolveUnit`).

Backend/services/illustrator_automation.py: added
`_mockup_has_armhole_match_objects` (scoped to the mockup's Front view
only, matching the new Front-only measurement rule - same
open/probe/close-via-DoJavaScript pattern as `_mockup_has_pattern_object`),
wired as a new pre-flight block (`armhole_match_layer_missing` status
flag) plus `ignore_armhole_match_warning` param.

Backend/main.py: wired `ignore_armhole_match_warning` into the
`/jobs/resume/{job_id}` background task call, read from
`last_status.get("armhole_match_layer_missing")`.

Frontend/my-app/components/UploadForm.tsx: renamed the checkbox label
"Side–sleeve design matching" -> "Armhole side sleeve matching", added
help text describing the "armhole match"/"unit 1, 2"/"unit left/right"
naming convention and the Front-right-only/mirrored measurement rule.

Frontend/my-app/components/ProductionPlan.tsx: added an
`armhole_match_layer_missing` pause/resume block mirroring the existing
Center/Pattern/Side-Seam Match ones (Continue-without / Stop Execution).
The existing `sleeve_match_warnings.txt`/`.json` end-of-job warning
mechanism (`smWarn` -> `sleeveMatchWarnings[]`) was left untouched per the
user's explicit instruction - it already covers per-unit warnings with no
shape change needed.

## Outcome

- ✅ Impact: ARMHOLE SIDE SLEEVE MATCHING now supports multiple
  independent design units per size (previously only one shared design),
  each measured from whichever end (shoulder/top or underarm/bottom) it's
  nearest to, matched independently on the sleeve via slide + up-to-25%
  proportional resize, with a hard pre-flight pause (matching the existing
  Center/Pattern/Size-Tag convention) when the checkbox is on but no
  "armhole match" group exists on the mockup's Front view.
- 🧪 Tests: node --check (.js copy) PASS, python -m py_compile PASS. Not
  yet run inside Illustrator against a real multi-unit job.
- 📁 Files: Backend/scripts/automate_production.jsx,
  Backend/services/illustrator_automation.py, Backend/main.py,
  Frontend/my-app/components/UploadForm.tsx,
  Frontend/my-app/components/ProductionPlan.tsx.
- 🔁 Next prompts: run a real job with (a) a continuous corner-to-corner
  unit, (b) tagged unit-left/unit-right pieces, and (c) a top-anchored
  unit (design nearer the shoulder than the underarm) to confirm the new
  top-corner walk, per-unit independent solve, and mirrored Front-right ->
  everywhere-else application all produce correct placements; check
  sleeve_match_warnings.txt for the new per-unit message format.
- 🧠 Reflection: this was a long iterative plan-then-implement session (7+
  rounds of the user refining the spec with real render images before any
  code was written) - matches [[ask-edge-cases-dont-assume]]. The user
  twice mid-session simplified scope (panel corner semantics via the two
  Short-Sleeve images; Front-right-only measurement) after I had already
  designed for the more complex case - worth remembering that this user
  iterates the spec live against real production files rather than
  spec'ing everything upfront.

## Evaluation notes (flywheel)

- Failure modes observed: none yet - runtime verification pending.
- Graders run and results (PASS/FAIL): node --check PASS, py_compile PASS.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): run one job covering a
  continuous unit + a tagged left/right pair + a top-anchored unit, and
  inspect debug_log.txt for "SLEEVE-MATCH" per-unit D/anchor lines plus
  sleeve_match_warnings.txt for any unexpected warnings.
