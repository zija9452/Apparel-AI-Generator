---
id: 105
title: Hood 3mm Centre Gap And Center Rename
stage: green
date: 2026-08-15
surface: agent
model: claude-opus-5
feature: production_automation
branch: main
user: zija9452
command: (conversation)
labels: ["hoodie", "hood-centre-match", "scaling", "illustrator", "naming"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - Backend/scripts/automate_production.jsx
  - Backend/services/illustrator_automation.py
  - Frontend/my-app/components/UploadForm.tsx
  - Frontend/my-app/components/ProductionPlan.tsx
tests:
  - node --check on automate_production.jsx (copied to .js) - PASS
  - python -m py_compile on illustrator_automation.py - PASS
  - npx tsc --noEmit on Frontend/my-app - PASS
  - Brace-depth scope probe confirming SCALE/HCM constants and helpers share runAutomation's closure - PASS
---

## Prompt

"""D:\Zija_Yaseen\Web development\AI-Apparel-Order-Generator\Backend\uploads\63e1e1e2-b915-4935-89d6-4b767ffb371e""" is me jo hood me overlap logic he , wo direct 19mm ki he , lekin aesa na ho , direct wo 14mm ki kr do , and left and right hood panel me jitna gap he utna or plus kr do

Follow-ups in the same session:

- "us ko phr 3 mm gap kr do , agr zero or negative hen to , agr 3mm se zyada he to 3mm kr do , agr 3mm se km se he to 3mm kr do , bs right wale k thora right move krna hoga , ek jesa rhe na sb me"
- "pehle plan to share kro k hoga kia ?"
- "mockup me nam rkhe the na , k hood ka kon sa left and kon right he , to nam se check nhi hota kiia ye ??"
- "nhi , mirror logic nhi he , illustrator me nam dioye hue hen mene , wo use krne hen , or left panel and right panel nam se dhoond kr in dono ka gap dekh kr right wale ko move krna he , bs"
- "or jo pehle dono ko 90 degree reflect krna he ??"
- "Pehle jo hood me hood center match he nam , us ko mene Center krna he , ACenter kr do , ta k easy or chota word yad rhe , lekin ye hood k andar hoga left and right me , or full button front left and right ka center al;g hoga , mismatch to nhi kren ge ye ?/"
- "nhi , jb full button hoga center to mopckup me hood wala nhi hjoga , to ye issue nhi he , rehne do , or update kr do nam center pr"
- "hood jo he wo grouped hua ata he pattern file se , to move krna 3 mm gap maintain krna , clipped krna ?? koi issue to nhi hota , tm ungroup kr k clipped krwa kr again clipped kr wa do"

## Response snapshot

Replaced the hood centre-match's blind `HCM_OVERLAP_PT = 19mm` with an earned decomposition:

```js
var HCM_SEW_PT = 14 * SM_MM;
var HCM_GAP_PT = 3 * SM_MM;
var HCM_OVERLAP_PT = HCM_SEW_PT + HCM_GAP_PT; // 17mm
```

New `hcmNormaliseHalfGap()` slides the **Right-named** half until the two halves sit exactly 3mm apart, so the gap half of the correction is a constant instead of a per-size measurement. Left/Right come from the designer's Illustrator names (`hoodieFindSides`), per explicit instruction - no measured/mirror inference. Measured on the placement paths' `geometricBounds`, and the piece GROUP translates so tags travel with it.

Per-size effect on this job's pattern: Small 2.3mm -> +0.7mm right; XL 7.0mm -> -4.0mm left; 2XL 3.9mm -> -0.9mm left. All land at 3.0mm.

Critical sequencing: the move is wired into `hoodieBuildVariant` **before** w/h are measured and before `dupHood` is placed. Moving a half after that measurement would push it past its own artboard edge and the export would silently lose the overhang (Small's +0.7mm). `patternSides`/`hoodBases` were hoisted above the bounds measurement to make this possible, keeping the "captured before the design is pasted" invariant intact.

Also renamed the mockup object convention from `"Right side match"`/`"Left side match"` to a single `"Center"` on both halves - the same word the full-button placket match uses. Safe because every lookup is scoped to one panel's own pasted design (`hcmFindNamed` walks a hood half; `pmCollectSeamArt` walks a front panel), and the user confirmed a full-button jersey and a hoodie never share one mockup. The document-wide `_mockup_has_center_object` pre-flight was deliberately left alone on the user's explicit call.

Answered three design questions without code change: the "90 degree reflect" is Illustrator's Reflect-dialog Angle 90 (a vertical-axis mirror, not a rotation) and is orthogonal to the gap work - mirroring a half about its own placement-path centre leaves that path's bounding box identical, so 3mm survives both the flip and the flip-back. And no ungroup/regroup is needed: group children translate in place (existing `hcmReflectAbout` already does exactly this), the move happens before any clip mask exists, and ungrouping would destroy the `dupHood` handle the artboard/export depends on.

## Outcome

- ✅ Impact: hood centre overlap is now 17mm on every size with a guaranteed 3mm panel gap, replacing a flat 19mm applied blind to gaps that ranged 2.3-7.0mm. Mockup naming reduced to one short word, `Center`.
- 🧪 Tests: JSX, Python and TypeScript syntax/type checks all pass. No Illustrator run yet - the feature needs the Hood Center Design Match checkbox ON, and this job's previous run had it OFF (no `HOOD CENTRE MATCH` lines in `renders/debug_log.txt`).
- 📁 Files: 4 changed - the JSX (constants, new helper, wiring, log), the Python pre-flight (scoped `center` lookup + messages), and two frontend components' instruction text.
- 🔁 Next prompts: run a job with Hoodie + Hood Center Design Match ON and confirm the log reads `halves sit 3mm apart (expected 3mm)`; decide whether Inside Hood should get the same 3mm normalisation (currently Outside only).
- 🧠 Reflection: the artboard-sequencing trap was the real risk here, not the arithmetic - a correct 3mm gap applied one step too late would have silently cropped Small's export rather than failing loudly.

## Evaluation notes (flywheel)

- Failure modes observed: initial implementation measured which half sat on the right instead of trusting the designer's names; corrected after the user clarified the pattern has no mirror weirdness. A stale "19mm" also survived in the frontend copy and had to be chased separately from the constant.
- Graders run and results (PASS/FAIL): node --check PASS; py_compile PASS; tsc --noEmit PASS; scope-chain probe PASS; leftover-old-name grep PASS (only the intentional Front/Back side-seam names remain).
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): run one size through the JSX repro harness inside pattern.ai to confirm the 3mm gap and 17mm overlap before spending a full ~7-minute production run.
