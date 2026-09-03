---
id: 171
title: Stripes match standalone checkbox
stage: green
date: 2026-09-03
surface: agent
model: claude-opus-5
feature: production_automation
branch: main
user: zija9452
command: (chat) give the full-button "Front/Back stripes match" a global scope
labels: ["full-button-jersey", "stripes-match", "shoulder-match", "hoodie", "checkbox", "scope-widening"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Backend/scripts/automate_production.jsx (FRONT_BACK_MATCH flag, item-loop call sites, pmMeasureShoulderTarget, pmApplyBackShoulderMatch comments, pmShoulderTargetDist comment, back-label clearance gate)
 - Backend/main.py (job_options: new front_back_stripes_match form field; _build_plan: plan_dict key)
 - Frontend/my-app/components/UploadForm.tsx (new top-level Toggle; nested one left untouched)
 - Backend/scripts/docs/FULL_BUTTON_JERSEY.md (sections 2 and 5)
tests:
 - node --check on a .js copy of automate_production.jsx - PASS
 - no Illustrator run (a live job was exporting on the machine; not disturbed)
---

## Prompt

ok , so the issue is , jo feature full button me stripes match ka he , use full button k ilawa global scpe bhi dena he , normal jerseys k liye , plan and edge cases discuss??

(follow-up 1) Front/Back stripes match | Aligns the Back stripes design to the position of Front
Left's / Right's stripes. | A shape whose name starts with Match_, present on both Front Left and
Back. Front Left is measured, Back is adjusted. If the name is missing the job still runs and Back is
left alone. , full button ki ye logic chahiye he global me

(follow-up 2) ye ek normal jersey he , global me dale ga to chahe full button ho ya hoodie sb me
chlna chahiye he wo feature , qk kisi group k andar nhi rkha ja rha he ye feature, and whi logic aye
gi k stripe ko match krna he ek hiside ki kafi hogi , blkl whi logic chaiye he , or back label jis
trha adjust hota he chunks me niche jata he k overlap na kre, whi logic rkhni he bs

(follow-up 3) full button se remove nhi krna he , us em wese hi rhe , bs global pr bhi krna he

(follow-up 4) flow btao k kia hoga ?? Match_left and Match_right , or bck pr Match_back hoga ?? to
normal jersey me work kre ga

## Response snapshot

Decisions taken from the user, verbatim:
- ONE shoulder is measured and applied to both of Back's shoulders - "ek hi side ki kafi hogi, bilkul
  wahi logic". No two-target / left-right-mapping variant.
- Scope is truly global: normal jersey, hoodie AND full button. "kisi group k andar nhi rkha ja rha".
- The back-label clearance behaviour (label down in capped chunks, then Match_ up, then re-match) must
  come along - "whi logic rkhni he bs".
- The existing NESTED checkbox is NOT removed and NOT changed - "full button se remove nhi krna he".

Implementation (5 files):

1. `automate_production.jsx` - `FRONT_BACK_MATCH` now reads
   `plan.front_back_stripes_match === true || (FULL_BUTTON && plan.full_button_front_back_match === true)`.
   The old key stays ANDed with FULL_BUTTON exactly as every call site used to do individually, so no
   existing job or saved plan.json changes behaviour; the new key is ungated.
2. Item-loop call sites: added `else if (FRONT_BACK_MATCH && isFront(...))` so a one-piece front is
   measured, and lifted the Back apply out of the `else if (FULL_BUTTON && ...)` chain into its own
   `if (FRONT_BACK_MATCH && isBack(...))`. Placed before the SIDE_SEAM_MATCH block so the Front is
   measured while its design is still untouched.
3. `pmMeasureShoulderTarget` gained `partLabel` (logs only) and `isSplitFront`. The corner is still
   the panel's LEFT bound in both cases. The one geometric change: the walk looking for the `Match_`
   crossing is capped at `panelW * 0.5` on a one-piece front instead of `panelW` - a whole front has a
   second shoulder across the neckline that a full-width walk can wrap onto, returning a plausible but
   badly wrong distance. Half a whole front is the same physical reach a split half already gets, so
   full-button behaviour is bit-for-bit unchanged.
4. Back-label clearance gate `FULL_BUTTON && FRONT_BACK_MATCH` -> `FRONT_BACK_MATCH`: the collision it
   resolves is caused by the resize SHOULDER-MATCH just did, so it must run wherever that runs.
5. `main.py` new `front_back_stripes_match` form field + plan key; `UploadForm.tsx` new top-level
   Toggle placed beside `front_back_side_match`, nested one left exactly as it was; docs updated.

Flow answer for the user's naming question (`Match_left` + `Match_right` on Front, `Match_back` on
Back): works. `pmFindMatchLines` is prefix-only on the raw lowercased name, so Front collects BOTH
shapes into one list; the walk starts at the LEFT shoulder and is capped at half the panel width, so
it reaches `Match_left` and never `Match_right` - the second name is harmless, not a conflict. Back
collects `Match_back` alone and the 2x2 solver (uniform scale + horizontal shift) drives both of
Back's shoulder distances to the single Front number. Requirement flagged: `Match_back` must be ONE
shape spanning both shoulders, and each measured shape must actually CROSS its shoulder stitch line or
the measurement returns null and the panel is skipped with a warning.

## Outcome

- ✅ Impact: The stripes-match logic is now available on every garment type behind its own top-level
  checkbox, with the full-button path provably untouched (old key still ANDed with FULL_BUTTON, and the
  travel cap only changes for one-piece fronts).
- 🧪 Tests: `node --check` on a `.js` copy - PASS. No Illustrator run: a live export job was running on
  the machine and the standing rule is never to disturb one.
- 📁 Files: 4 edited + this PHR. No behaviour removed anywhere.
- 🔁 Next prompts: Run one normal-jersey job with `Match_left`/`Match_right` on Front and `Match_back`
  on Back, then check `debug_log.txt` for the `SHOULDER-MATCH-DIAG` line (it now prints the walk cap)
  and the `BACK-LABEL` clearance lines. Consider a pre-flight for the `Match_` name if misses turn out
  to be common - deliberately left soft for now, per the user's own quoted description.
- 🧠 Reflection: The user's "bilkul wahi logic" was the useful constraint: it removed the two-target /
  left-right-mapping design entirely, and what was left was almost pure plumbing plus exactly one real
  geometric difference - the neckline the split front never had. Worth noting the flag is now reached
  by two checkboxes on purpose rather than by promoting one, which is what kept the change additive.

## Evaluation notes (flywheel)

- Failure modes observed: none at build time. One latent hazard closed on the way through: with the
  per-call-site `FULL_BUTTON &&` gates removed, a stray `full_button_front_back_match=true` on a
  non-full-button job would have silently enabled the feature - hence the explicit AND in the flag.
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): on the first real normal-jersey run, compare the
  `SHOULDER-MATCH-DIAG` Front distance against a hand measurement in Illustrator before trusting the
  Back resize - that single number is what the whole feature hangs on.
