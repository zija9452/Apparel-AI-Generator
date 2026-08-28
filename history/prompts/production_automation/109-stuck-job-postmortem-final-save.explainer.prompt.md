---
id: 109
title: Stuck job postmortem final save
stage: explainer
date: 2026-08-17
surface: agent
model: claude-opus-5
feature: production_automation
branch: main
user: zija9452
command: chat
labels: ["postmortem", "watchdog", "saveAs", "illustrator", "performance"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - (analysis only - no files modified)
tests:
 - none (log/artifact forensics on Backend/uploads/7f73d7e6-4d4f-4ef9-860b-b8299c5d346c)
---

## Prompt

D:\Zija_Yaseen\Web development\AI-Apparel-Order-Generator\Backend\uploads\7f73d7e6-4d4f-4ef9-860b-b8299c5d346c dekho q stuck hua tha is job me kia error tha

## Response snapshot

Koi JSX error nahi tha — job final `.ai` save par slow tha aur watchdog ne 10 min ka rule laga kar Illustrator kill kar diya.

Evidence:
- `renders/debug_log.txt` ki aakhri line: `11:26:19 Attempting to save final AI file...` — uske baad kuch nahi.
- Sab 27 parts (Small/XL/2XL) render ho chuke the; `hoodie_warnings.json` aur `back_label_warnings.json` dono `{"warnings":[]}`; job root par koi `error_log.txt` nahi.
- `status.json` ka last real update 11:26:19 (`Saving AI file...`, 95%) tha; watchdog ne theek 10 min baad 11:36 par error status likha.
- Stall point: `Backend/scripts/automate_production.jsx:1395` — `orderDoc.saveAs(saveFile, new IllustratorSaveOptions())`.
- Proof ke ye hang nahi, genuinely slow hai: job `372ba14b` (same 92MB mockup) mein wohi save `16:47:33 → 16:55:46` yani **8m13s** laga aur **533 MB** ka `production_ready_order.ai` bana.

Matlab save phase akela hi 8-12 min le sakta hai, aur us dauran koi status heartbeat nahi hai — watchdog ke liye poora save "no progress" lagta hai. PHR 108 mein kiya gaya 20-min bump exactly isi ko cover karta hai.

Optional speed-ups (user ki call, abhi implement nahi kiye):
1. `IllustratorSaveOptions.pdfCompatible = false` — 533MB file ka bara hissa embedded PDF stream hai; band karne se size/time dono girte hain, magar phir file InDesign/Acrobat mein direct place nahi hogi.
2. Save ke dauran periodic status heartbeat — watchdog ko real stall aur slow save ka farq maloom ho.

## Outcome

- ✅ Impact: Root cause confirm — watchdog false-positive on a legitimately slow 8-12 min `saveAs`, not a code bug.
- 🧪 Tests: None — forensic read of debug_log.txt, status.json, warnings files, aur doosre jobs se comparison.
- 📁 Files: None modified.
- 🔁 Next prompts: `pdfCompatible=false` try karna, ya save-phase heartbeat add karna.
- 🧠 Reflection: Ek kamyab job ke log se comparison ne turant sabit kar diya ke save slow hai, hang nahi — warna 20-min bump bhi andhera teer hota.

## Evaluation notes (flywheel)

- Failure modes observed: Watchdog ek aisi long-running phase ko stall samajhta hai jis mein koi progress signal nahi.
- Graders run and results (PASS/FAIL): N/A
- Prompt variant (if applicable): N/A
- Next experiment (smallest change to try): `pdfCompatible = false` ke sath ek run — save time aur output size measure karna.
