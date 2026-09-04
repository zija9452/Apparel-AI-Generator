---
id: 178
title: Team Name Proportional Scale
stage: green
date: 2026-09-04
surface: agent
model: claude-opus-5
feature: production_automation
branch: main
user: zija9452
command: (chat request)
labels: ["team-name", "scaling", "illustrator", "designer-tags", "checkbox", "6xl"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Backend/scripts/automate_production.jsx
 - Backend/main.py
 - Frontend/my-app/components/UploadForm.tsx
tests:
 - scratchpad probes 1-7 against the real pattern.ai / mockup.ai - PASS (65.72% on all 7 sizes, 0.00pp error)
 - full production pipeline, 6XL front+back, team_name_scale on - PASS (49.4% -> 65.7%)
 - node --check on automate_production.jsx - PASS
 - tsc --noEmit on Frontend/my-app - PASS
 - full pipeline with the flag OFF (visual before/after pair) - FAILED to run, COM RPC error, not retried
---

## Prompt

"E:\Testing order\File\KNUCKLEHEADZ BOOSTER ORDER\Ai File\Mint Jersey Ai File.ai" , is me team name he layer ka nam , to pattern ki width note krni he , or dekhna he k ye kitna width pr he mockup me , or hr size me utna hi percent rkhna he , filhal wo chota lg rha he , or wo team name proportionally scaling pr jaye ga . or ye bhi k full button me kis trha handle hoga phr ye ??

Follow-ups: global checkbox chahiye; "Team name / team name / teamname" sab chalein; naam Attributes NOTE me bhi ho sakta hai; full-button me naam center hota hai to pehle resize ho; 6XL front pe test karo; pehle plan batao phir scratchpad me test; output .ai aur JPEG bhi do; resize width+height dono proportionally; top wahi rahe, resize neeche se ho.

## Response snapshot

### The problem, measured

`design_scale_mode: "height"` fits the design by HEIGHT only, and patterns grade
wider faster than they grade taller. So the team name holds its height but covers
less and less of the panel as sizes go up. Measured on this job's own pattern
(geometric widths, all 7 sizes):

    Small 64.7%  Medium 60.8%  Large 57.6%  XL 55.9%  2XL 52.5%  3XL 50.9%  6XL 49.4%

### The fix

    P      = teamW / silhouetteW          the mockup ratio
    target = P x panelW
    k      = target / teamW_now     ->    k = panelW / silhouetteW_now

The team name's own width cancels, so the correction is just the width gap the
height fit left behind - the same gap SIDE-ANCHOR closes by translating. Nothing
from the mockup has to be re-opened: the whole design was scaled uniformly, so the
ratio is still the mockup's own. No cross-document read, so no 792pt exposure.

**Geometric bounds are load-bearing.** `resize(..., lineScale = 100, ...)` never
scales a stroke, so a VISIBLE width is (geometric x scale + a constant overhang)
and the visible ratio is NOT invariant under the fit. This job's team name carries
37.67pt of overhang - enough to land a visible/visible version ~1pp low on 6XL
(67.13% instead of 68.18%). Geometric bounds scale exactly. This also matches
`pmFitBounds` (automate_production.jsx:4350), which is already geometric.

### Changes

1. `automate_production.jsx` - `TEAM_NAME_SCALE = (plan.team_name_scale === true)`,
   declared with the other flags in the hoisted block.
2. `automate_production.jsx` - `scaleTeamNameToPanel()` + `teamNameFullFrontWidth()`,
   added next to `_tagOf`, which they reuse: NAME first, then Attributes NOTE.
   Regex `^teamname[0-9]*$`, so "Team name" / "teamname" / "TEAM_NAME" /
   "team name 2" all match. A matched GROUP is taken whole and not descended into,
   so a tagged parent and tagged child cannot both scale the same artwork.
   Uniform resize (no distortion), TOP EDGE PINNED (captured and restored through
   `.top`, so the name grows downward and never creeps toward the neck),
   horizontally centred on the panel. No cap - overflow is logged in mm and the
   clip trims it, per explicit instruction.
3. `automate_production.jsx` - called at the SIDE-ANCHOR/SHOULDER-ANCHOR window
   (before `removeBasePaths`, before the clip, before the placket join), but
   deliberately OUTSIDE the front/back gate: it acts wherever the tag is.
4. Full-button: `baseShape` is only half the front there, so scaling to it would
   halve the name. Both halves resolve the FULL front width from
   `patternSizeCache` (minus its 10pt outline allowance), so both get one `k` and
   the two halves of the name line up across the placket. If that width was never
   cached it refuses and logs, rather than shipping a halved name.
5. `main.py` - `team_name_scale` added to the shared Form declaration, the options
   dict, and `plan_dict`. Standalone, not gated on garment type.
6. `UploadForm.tsx` - a global "Team name keeps its width" Toggle.

### Verification

Scratchpad probes against the real `pattern.ai` / `mockup.ai`, then the real
pipeline end to end:

    size    panelGeoW   fit%     NOW%     k%       AFTER%   err
    Small   1452.43     98.36    64.65%   101.66   65.72%   0pp
    6XL     2487.09     128.76   49.42%   132.98   65.72%   0pp

Real pipeline, 6XL, flag on:
`TEAM-NAME [6XL front]: 'Team name' resized 133% (49.4% -> 65.7% of this panel's width) and centred.`
`TEAM-NAME [6XL back]: no artwork named or noted 'team name' in this design - nothing to scale.`

### Two things found along the way

- **This pattern's panel groups change reported HEIGHT when moved** - `6XL Front`
  reads 2836.11pt in place and 3431.89pt after a `translate()`, width unchanged.
  Every panel must be measured BEFORE it is repositioned. Cost one wrong probe run.
- The mockup's `Team name` group contains the `Front Number` ("99") as well as the
  lettering, so both scale together. Confirmed by the user as the wanted behaviour.

## Outcome

- ✅ Impact: tagged team-name artwork holds the mockup's width % on every size,
  behind a global checkbox; off by default, so untouched forms are unchanged.
- 🧪 Tests: probes + a real 6XL pipeline run PASS; `node --check` and `tsc --noEmit`
  PASS. The flag-OFF comparison run failed with a COM RPC error and was not retried.
- 📁 Files: 3 changed (JSX, main.py, UploadForm.tsx).
- 🔁 Next prompts: (a) re-run the OFF job for a visual before/after pair;
  (b) exercise the full-button branch - this job is not full-button, so
  `teamNameFullFrontWidth` has never executed against a real split front.
- 🧠 Reflection: the visible/visible formula looked exact on paper and was ~1pp off
  in Illustrator; only measuring it on all 7 sizes exposed the non-scaling stroke.

## Evaluation notes (flywheel)

- Failure modes observed: non-scaling strokes breaking a ratio that is invariant in
  theory; panel bounds changing on translate; an artboard framed on the design's
  box instead of the panel's, putting the piece off-crop.
- Graders run and results (PASS/FAIL): per-size error vs the mockup ratio - PASS
  (0.00pp on all 7).
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): run a full-button job and confirm both
  halves receive the same k.
