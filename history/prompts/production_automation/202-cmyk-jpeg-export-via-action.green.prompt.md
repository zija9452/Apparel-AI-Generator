---
id: 202
title: CMYK JPEG export via Illustrator action
stage: green
date: 2026-09-18
surface: agent
model: claude-opus-5
feature: production_automation
branch: main
user: zija9452
command: /login (ad-hoc investigation)
labels: ["export", "cmyk", "illustrator", "jsx", "agent-version", "rendering"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Backend/scripts/automate_production.jsx
 - Backend/services/illustrator_automation.py
 - Agent/main.py
 - Frontend/my-app/public/AIApparelAgent.zip
 - Backend/scripts/tests/test_export_cmyk.py
 - Backend/scripts/tests/export_jpeg_cmyk_action.py
 - Backend/scripts/tests/compare_to_manual.py
 - Backend/scripts/tests/find_hairlines.py
 - Backend/scripts/tests/find_seam_lines.py
 - Backend/scripts/tests/find_seam_lines_big.py
 - Backend/scripts/tests/seam_align.py
 - Backend/scripts/tests/seam_locate_crop.py
 - Backend/scripts/tests/seam_compare_crop.py
 - Backend/scripts/tests/seam_export_matrix.py
 - Backend/scripts/tests/probe_seam.py
 - Backend/scripts/tests/probe_seam_artboards.py
 - Backend/scripts/tests/probe_seam_objects.py
 - Backend/scripts/tests/probe_export_options.py
 - Backend/scripts/tests/probe_tiff_defaults.py
 - Backend/scripts/tests/probe_doc_names.py
 - Backend/scripts/tests/probe_jpeg_dpi_source.py
 - Backend/scripts/tests/cmyk_jpeg_roundtrip.py
tests:
 - node test_jsx.js - 435/435 passed
 - test_py.py - 266/266 passed
 - test_hard.py - 520/520 passed
 - test_export_cmyk.py - exact filename / CMYK / no stray files, all PASS
 - compare_to_manual.py - 119,261,340 pixels, max difference 0 vs the manual export
---

## Prompt

explore my whole project , and the isssue is ye job run ki thi """E:\5XL-TESTING_WITH_JPEGS""" is k sb sizes okay ayen hen , lekin back ki illustrator file open ki , to us ne ek line di he blue defect ki manual exporting krne me , or jpegs software se cmyk me bnen na , ye rgb me q aye hen export ??E:\production_ready_order_5XL-04.jpg see this blue line , ye q a rhi he , is kia i file open kro , or exporting kro , or jo is software se exporting ho rhi he wo rgb preview ki he jpegs ki , jb k mjhe to cmyk chahiye he na , E:\5XL-TESTING_WITH_JPEGS\5XL-TESTING_WITH_JPEGS\production_ready_order_5XL-04.jpg  ye cmyk he jo mene manual exporting ki illustrator file open kr k , E:\5XL-TESTING_WITH_JPEGS\5XL-TESTING_WITH_JPEGS\5XL2.jpg ye rgb preview he software wali exporting ,

(follow-ups, verbatim)
- or wo line q a rhi he ?? illustrator file me nhi he export jpeg krwane pr wo line a rhi he blue color ki , q ??
- mene yellow markup se highlight kr di he , udhr he blue line , or illustrator open kro , dekho k ai file me nhi he wo line , exporting me q a rhi he
- kia hua he , kia issue he ? q ho rha he aesa ??
- kia issue he ?? software exporting rgb ki krrha he , jb wo cmyk ki kre ga , to us me bhi ye line aye gi
- ISSUE KIA HE ?? BACK K MOCKUP KO EXPORTY KRWAYA WO LINE NHI HE , BUT 5XL ME HI Q A RHI HE ?
- KIA ISSUE HE BEHIND THIS ??
- ISSUE KIA A RHA HE ??
- OR ABHI JO TM ON OFF EXPORT KI HEN , WO BHI RGB PR HI HEN ,. , Q?? CM,YK EXPORTING KRNI HEN
- WEB SEARCH KRO , MJHE EXPORTING JPEG ME HI KRNI HE , JB FILE CMYK KI HE , TO PHR JPEG BHI CMYK ME  DE, EXPORT ME OPTION HOTA HE RGB YA PHR CMYK KA
- JB HM JPEG SELECT KRTE HEN EXPORTING ME , TO US K BD OPTION ATY HEN MANUAL ME jpEG OPTION US ME iMAGE COLOR MODEL KA DROPDOWN HOTA HE JIS ME OPTION HOTY HEN RGB , CMYK , GRAYSCALE , TO WHN SE JUST CMYK SELECT KRNA HE , JUST , ISE WEB SERCH KRO , OR IS KI EXPORTING KR K DIKHAO
- MANUAL ME KIA PROCESS HE , OR MANUAL WALA CODE K THROUGH KES EHOGA , WANTS JUST SAME OUTPUT
- HAIRLINE KO CHORO ABHI , PEHLE YE BTAO EXPORTING JPEG ME CMYK ME HO RHI HE ??
- "E:\seam_test\mANUAL 5XL BACK EXPORT.jpg" ISSE COMPARE KRO , YE MENE MANUAL EXPORT KRWAYI THI , OR ISE CODE ME IMPLEMENT KR DO PROCESS KO
- OR YE JPEG CMYK BNNE KA PROCESS KIA HE ? FLOW KIA HE ? NON-TECHNICAL
- powershell -ExecutionPolicy Bypass -File "E:\AIApparelAgent\install-agent.ps1" -CloudApi "http://localhost:8000" AGENT VERSION CHANGE KR K LOCAL PR INSTALL KR DENA PKG FRONTEND ME RKH DENA BNA KR

## Response snapshot

Two separate defects were reported together and turned out to be unrelated.

**1. Every JPG was RGB.** `automate_production.jsx:11323` set
`opt.imageColorSpace = ImageColorSpace.CMYK`. Reflection on the operator's own
Illustrator 19.0.0 showed `ExportOptionsJPEG` has exactly 12 properties and
`'imageColorSpace' in opt` is `false`. ExtendScript creates a plain JS property
on the wrapper, which then READS BACK as CMYK - a false positive, no error, no
log line, wrong output on every job ever run. Adobe's scripting guide confirms
the property does not exist.

Fix: `exportResult()` now writes a throwaway `.aia` action carrying the Export
dialog's settings as raw little-endian bytes, then `loadAction` / `doScript` /
`unloadAction` / delete. The action drives the real dialog, which is the only
thing that reaches the Image Color Model dropdown. Exported into a private temp
folder because "Use Artboards" makes Illustrator append the artboard name; the
single file produced is then moved to the exact target name. Old `exportFile`
path kept as a loud fallback so a broken action cannot cost a whole order.

**This took three attempts and the first two shipped.** The technique as
published by nathandietz/ExportDocAsJPEG writes a 100-byte settings parameter.
Illustrator 19.0.0 wants 104, with `localizedName "Export"` rather than "Export
As", and DISCARDS a parameter of the wrong length in silence - the export still
runs, still writes the file where asked, and uses whatever the Export dialog was
last set to. On this machine that was CMYK/300, set by the operator's own manual
export an hour earlier, so the 100-byte version was pixel-identical to their
file and looked finished. The first real job ran against a fresh Illustrator,
inherited the factory default, and wrote RGB at 72 dpi - worse than the RGB at
300 it replaced. 0.7.6 turned the route off; 0.7.7 is the working one.

The correct bytes came from asking Illustrator to record the manual export as an
action and reading what it wrote itself. That is the only source of truth here;
the published layout is wrong for this version and no amount of reasoning about
it would have helped.

Side effects, both verified: the action route is ~4x FASTER (13.5s vs 55s on a
10230x11658 panel, matching Adobe's own report that scripted JPEG export is an
order of magnitude slower than the dialog), and dpi is not lost - these files
carry 300.0 x 300.0 in the APP13 Photoshop ResolutionInfo block instead of
APP0/JFIF. `_stamp_jpeg_dpi()` updated so it no longer reports that as a fault.

**2. The blue hairline.** Measured, not guessed: the marked column is a
1-pixel spike at 100% Cyan with ~40% Cyan either side - the panel's base ink
showing through a 1px hole in the flattened design, not a drawn line. The
operator's markup file was a CROP of the render, not a downscale, so the column
only lined up after solving the crop offset by FFT correlation (dx=3598,
dy=4084), putting it at x=5229 of the full render.

  | render | colour | width | hairline |
  |---|---|---|---|
  | manual Export As JPEG | CMYK | 10230 | YES - x=5229, x=7760, y=8001 |
  | scripted exportFile | RGB | 10229 | no |
  | scripted TIFF CMYK 300dpi | CMYK | 10231 | no |

So CMYK is NOT the cause - the operator's worry that "CMYK karenge to line
aayegi" does not hold. The action export is pixel-identical to their manual
file, hairline included, which proves the defect belongs to the Export As
pipeline for this artwork and not to hand-clicking. Left open at the operator's
request ("HAIRLINE KO CHORO ABHI"); `ANTI_ALIASING = 2` is isolated as a single
named constant because Type Optimized is the prime suspect and Art Optimized
is the next thing to try.

An earlier claim in this session - that the software render also had seams at
x=4749/7795 - was wrong and was corrected: those are ordinary design edges. The
first detector only asked "differs from both neighbours"; requiring the two
neighbours to RESEMBLE EACH OTHER separates a hairline from an edge.

Agent bumped 0.7.4 -> 0.7.5, packaged to
`Frontend/my-app/public/AIApparelAgent.zip` (297 KB) and to `E:\AIApparelAgent`,
installed locally against `http://localhost:8000`.

## Outcome

- ✅ Impact: renders are CMYK for the first time, ~4x faster, and byte-comparable to the operator's manual export
- 🧪 Tests: 435 + 266 + 520 existing checks pass; new `test_export_cmyk.py` runs the SHIPPED function against a real order .ai
- 📁 Files: 2 production files changed (`automate_production.jsx`, `illustrator_automation.py`), agent version bumped, 17 probe/test scripts added
- 🔁 Next prompts: decide the anti-aliasing setting for the hairline; re-run a full multi-size order to confirm the action route under `flushExports` at scale
- 🧠 Reflection: two of the three attempts PASSED their tests and were wrong. Both times the test was "ask for CMYK, check it is CMYK" on a machine already in a CMYK state. The only test that ever distinguished anything was asking for something DIFFERENT - CMYK/300, RGB/150, Grayscale/600 in one session - and requiring the output to follow each time. On any API that can silently fall back to ambient state, a matching result is not evidence.

## Evaluation notes (flywheel)

- Failure modes observed: (a) a write-only property that reads back its own assigned value, indistinguishable from success; (b) an action parameter of the wrong LENGTH discarded in silence, the export then inheriting the GUI's last-used settings - passed on a warm machine, shipped RGB/72 on a cold one; (c) a seam detector that conflated 1px artifacts with design edges and produced a confidently wrong table; (d) assuming the operator's markup file shared the render's coordinate system when it was a crop; (e) trusting a published implementation's byte layout instead of having the application emit its own.
- Graders run and results (PASS/FAIL): test_jsx.js PASS (435), test_py.py PASS (266), test_hard.py PASS (520), test_export_cmyk.py PASS, discriminator test PASS (CMYK/RGB/Gray all followed), pixel compare vs manual PASS (0 of 119,261,340 different)
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): set `ANTI_ALIASING = 1` (Art Optimized) in `exportJpegViaAction`, re-export artboard 1 of the 5XL order, and re-run `find_hairlines.py` on the result.
