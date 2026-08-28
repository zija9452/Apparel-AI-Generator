---
id: 150
title: Fix Hood Center Match Copy
stage: green
date: 2026-08-21
surface: agent
model: claude-opus-5
feature: production_automation
branch: main
user: zija9452
command: none (direct request)
labels: ["frontend", "copy", "hoodie", "hood-center-match", "docs-accuracy"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Frontend/my-app/components/UploadForm.tsx
tests:
 - none (copy-only change; verified against Backend/scripts/automate_production.jsx constants and Backend/services/illustrator_automation.py preflight)
---

## Prompt

explore frontend , or ise short kro , """
Hood center design match
Joins a design that crosses the hood's center seam so it lines up across the Outside Hood's two halves. The two halves are first set to a standard 3mm gap — whatever gap the pattern drew is normalized by moving the Right half — and then joined with a 17mmsimulated sewing overlap (14mm sewing + the 3mm gap), identical for every size. Both halves are reflected 90° before matching so their center-seam edges meet, then reflected back, so the exported cut pieces keep the pattern's own shape and orientation; only the Right half's position on the sheet shifts, by the small amount the 3mm gap needs.
In the mockup's "Outside Hood" group, name the shared design "Center" inside its Right half and "Center" inside its Lefthalf — the same short word on both. The Right half's copy is the one that's kept and re-centered across the seam. Missing either one pauses the job before it starts. Inside Hood is not touched. Only usable with Hoodie.""" , and is ki logic dekho k yhi he automation me ? or perfect likho short me

(follow-up, mid-turn) easy roman urdu me samjhao , kia he ?

## Response

Verified the checkbox copy at `Frontend/my-app/components/UploadForm.tsx:353` against the JSX.

Mismatches found:
- Copy said **3mm gap**; code is `HCM_GAP_PT = 5 * SM_MM` (5mm) — `automate_production.jsx:457`.
- Copy said **17mm overlap**; code is `HCM_SEW_PT + HCM_GAP_PT` = 14 + 5 = **19mm** — `automate_production.jsx:9294`.
- Copy said "Inside Hood is not touched"; the *design match* is Outside-only (correct), but `hcmNormaliseHalfGap` runs for **both** hoods and is **not** gated on the checkbox — `automate_production.jsx:9165-9171`.

Verified as correct (left unchanged):
- Right-named half is the one that moves — `:9219`
- reflect → match → reflect-back with the reflect-back in `finally` — `:9301-9332`
- Right half's "Center" is source of truth, Left's own copy removed — `:9321-9323`
- missing either "Center" pauses the job pre-run — `illustrator_automation.py:1075-1083`
- pause-banner copy in `ProductionPlan.tsx:333-348` carries no numbers, so it stayed as-is.

Copy rewritten with 5mm/19mm, then (on follow-up) shortened again to two short spans: the reflect/reflect-back mechanism and the gap-runs-regardless note were dropped as internal detail, and "Inside Hood is not touched" became **"Inside Hood is not matched"** - accurate, since `hcmNormaliseHalfGap` does touch it.

Gap history confirmed from PHRs 105 -> 136 -> 137 -> 149 (3mm -> 3mm visible -> 3.94mm -> 5mm), each step on the user's own instruction; the last one (PHR 149, "hood se 3pt hta do") is what made it a flat 5mm. So 3mm is genuinely gone, not a regression.

## Outcome

- [x] Numbers in the UI now match the JSX constants
- [x] Inside Hood behaviour stated accurately
- [x] Copy shortened (two spans, ~half the previous length)
