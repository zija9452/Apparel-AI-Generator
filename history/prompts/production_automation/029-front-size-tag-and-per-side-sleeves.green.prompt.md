---
id: 029
title: Front size tag and per-side sleeves
stage: green
date: 2026-07-08
surface: agent
model: claude-fable-5
feature: production_automation
branch: main
user: zija9452
command: none
labels: ["illustrator", "pattern", "size-tag", "sleeves", "right-left", "mockup"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - Backend/scripts/automate_production.jsx
tests:
  - node --check on JSX copy (syntax OK)
  - Full end-to-end run on a copy of job 1397e67f (scratchpad testjob) - PASSED
---

## Prompt

Dekhna k q front panel me size tag nhi a rha he , jb back em to a rha he , niche jo size tag hota he Medium text ka , or sleeve aese bhi to hota he k dono sleeve alg alg design ki hoti hen , to right sleeve or lefy sleev ebhi alg alg aye, yani agr jitni test print (mockup me sleeve hen utni hi ayen order me bhi ek size ki , or us pr jese likha hua he Short sleeve right , ya short sleeve left , isi trha likha aye . tags pr , lekin pattern me jo text he us pr to Medium likha he bs , to how I resolve this.

Follow-ups (verbatim):
- "pehle plan to discuss krte k kr kia rhe ho"
- "or pattern file read kr lo , us me he tag , jese back me he , wo fix he"

## Edge-case decisions (user-confirmed via AskUserQuestion)

1. Per-side sleeve tag text: "<Size> <PartLabel> <Side>" e.g. "Medium Short Sleeve Right".
2. Mockup me sirf EK sleeve design ho to current behavior (ek print, tag "Medium").
3. Front-tag fix location (code vs pattern file) - unanswered; recommended code fix applied.

## Root causes (verified by inspecting pattern.ai via COM)

1. Front tag: pattern me naam "Medium Front" bare PathItem par hai; uska UNNAMED
   parent GroupItem hi "Medium" tag rakhta hai. findAnywhere path lauta deta tha,
   is liye duplicate me tag nahi aata. Back me poora group named hai.
2. Sleeves: plan sirf generic "sleeve-short" deta hai; getSourceView ko pehla
   match "Short Sleeve Right" milta tha - Left design kabhi print nahi hota tha.

## Response

Implemented in automate_production.jsx:
- Bare-path promotion: agar named pattern item GroupItem nahi aur uska unnamed
  parent group usi panel ko wrap karta ho (bounds 15% tolerance) to parent
  group use hota hai (size tag saath aata hai). Generic - har size/panel.
- mockupHasBothSleeveSides(): Right+Left dono designs milen to har generic
  sleeve item Right/Left pair me expand (qty split, half each, min 1).
- Per-side source lookup: part_name + "-right"/"-left" -> getSourceView targets
  "Short Sleeve Right"/"Left" groups.
- renameSizeTags(): duplicate pattern me exact size-label text ("Medium") ko
  "Medium Short Sleeve Right"/"Left" me rewrite karta hai.
- Instance/artboard names: "Medium Short Sleeve Right_Item1" etc.

Verification (testjob copy of job 1397e67f): Medium_Front_Item1-6 me bottom
"Medium" tag strip present; Medium_Short_Sleeve_Right_Item1.jpg (wings design,
tag "Medium Short Sleeve Right") aur Medium_Short_Sleeve_Left_Item1.jpg
(reaper design, tag "Medium Short Sleeve Left") - designs mockup sides se
match. Log lines: "Pattern name was on a bare path...", "Expanded
'sleeve-short' (Medium) into Right + Left...", "Size tag text updated...".
