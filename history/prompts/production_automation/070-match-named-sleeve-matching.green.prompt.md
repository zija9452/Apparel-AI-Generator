---
id: 070
title: MATCH-named sleeve matching with fallback
stage: green
date: 2026-07-18
surface: agent
model: claude-fable-5
feature: production_automation
branch: main
user: zija9452
command: none
labels: ["sleeve-match", "naming-convention", "illustrator", "full-band-designs"]
links:
  spec: null
  ticket: null
  adr: suggested (match-layer-naming-convention) - not yet created
  pr: null
files:
  - Backend/scripts/automate_production.jsx
tests:
  - node --check parse (passed)
  - runtime verification pending: next job with MATCH_black named shapes
---

## Prompt

(Series of Roman-Urdu messages designing the feature, ending with:)
"mtlb bs mjhe black wale shape ko nam dena he , Matching ka ? front back sleeve pr ,
sb jga ?? or purane me red shape ko ?? isi trha na ?? pehle check kre k nam he ya
nhi agr na ho to current jo logic chl rhi he us pr fallback kr de"
[mid-turn] "continue" / "kia nam rkhahe is me layer ka ?? jis ki matcing kr rhe hen"

## Response

MATCH-named sleeve matching implemented in automate_production.jsx:

- `_smCollectNamedArt(design)`: koi bhi item jis ka naam "match" se shuru ho
  (case-insensitive; "Matching", "MATCH_black"). Named GROUP = one unit.
- `_smLargestChildPath`: ab GroupItem support (largest filled member naapta he).
- `_smMeasureAlongEdge(..., firstBoundary)`: named mode me D = corner se PEHLI
  color boundary (entry ya exit dono count) - full-band designs (black top +
  gradient base) ke liye. Legacy union-exit semantics untouched.
- `smMeasureBodyD`: named art mile to wohi naapta he (rec.named store), warna
  purani `_smCollectSideArt` geometry - user-requested fallback.
- `smApplyNamedMatch`: sleeve V dono cap sides ko chhoota he is liye dono
  sides ka correction average kar ke EK combined move; har step ke baad dono
  sides re-verify; dono +/-1mm me na aayen to art wapas + warning.
- Body named + sleeve unnamed -> warning + geometry fallback try.
- Naam ki recommendation user ko: `MATCH_black` (ya koi bhi "match..." naam),
  front design, back design, dono sleeve designs me - 4 shapes.
