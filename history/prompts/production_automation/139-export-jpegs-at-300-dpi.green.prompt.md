---
id: 139
title: Export JPEGs At 300 DPI
stage: green
date: 2026-08-20
surface: agent
model: claude-opus-5
feature: production_automation
branch: main
user: zija9452
command: (direct request)
labels: ["export", "jpeg", "resolution", "print", "illustrator"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Backend/scripts/automate_production.jsx
 - Backend/services/illustrator_automation.py
tests:
 - py_compile on Backend/services/illustrator_automation.py (PASS)
 - _stamp_jpeg_dpi on scratch copies of two real renders - both read back 300x300 dpi (PASS)
 - Baseline forensics on renders/ + user's reference print file M-03.jpg (PASS - see below)
 - Official docs verification: ExportOptionsJPEG property list / scale-to-dpi mapping / JFIF units field (PASS)
 - JPEG marker scan of an existing render - no APP2 ICC_PROFILE (documents the ICC gap)
 - Full end-to-end order run NOT executed (~7 min, needs Illustrator)
---

## Prompt

abhi jo export ho rhi hen jpegs , wo 96 resolution me ho rhi hen , use 300 resolution me kro export

(follow-up) pehle kis me ho rhi thi ?

(follow-up) "E:\Testing order\check_sh\Print\J&S Sample AI Order # ----\Full Button\M\M-03.jpg", is ka btao resolution ?

(follow-up) mtlb pattern k sizes change kr diye hen ? jb hm export krte hen illustrator se images to dpi 300 resolution option ata he , to hm wo rkh dete hen , to mjhe whi chahiye he bs

(follow-up) official check kro , isi trha hota he , official docs dekho

(follow-up) D:\export.JPG isi trha export hoti he ?? [screenshot of the JPEG Options dialog]

(follow-up) quality 5 medium hi kr do , baseline standard kr do,

(follow-up) official check kro , k kia aesa hihe , ya koi or method he ?

(follow-up) assigning profile jb nhi bnti jb hm document bnaty hen new ?? us wakt assign kr lete hen na ?

(follow-up) "D:\edit assign profile.JPG" edit me ja kr check kr skte hen assign profile me , mjhe yhi chhaiye he , working cmyk wala

## Response snapshot

**Baseline was 72 ppi, not 96.** `doc.exportFile` with `ExportOptionsJPEG` maps 1pt -> 1px at 100% scale = 72 ppi. Windows reports "96 dpi" only because Illustrator writes JFIF `units = 0` ("no units, aspect ratio only") and Windows falls back to its own 96 default. Verified three ways:

1. Header bytes of `renders/Medium_Front_Item1.jpg`: `FF D8 FF E0 00 10 | 4A 46 49 46 00 | 01 02 | 00 | 00 64 | 00 64` -> version 1.02, units `00`, density 100:100 (pure aspect ratio, no dpi).
2. Physical size sanity check: 1707x2204 px at 72 dpi = 602x777 mm (Medium front panel + bleed, correct); at 96 dpi it would be 451x583 mm and the neck rib only 343 mm long - too short for a neck opening.
3. User's own reference print file `M-03.jpg` = 7104x9871 px @ 300 dpi = **601.5 mm** wide, matching our 72-ppi render's **602.2 mm** to 0.1%. Confirms the artboard geometry was always right; only the pixel density was screen-res.

Two changes, both required - the scale alone leaves the file untagged, the tag alone shrinks the reported physical size:

1. `Backend/scripts/automate_production.jsx` - added `EXPORT_DPI = 300` / `EXPORT_SCALE_PCT = 300/72*100` (416.667%) next to `PATTERN_OUTLINE_PT`, and `exportResult()` now sets `opt.horizontalScale`/`opt.verticalScale` to it. Scale is the only dpi control `ExportOptionsJPEG` exposes - there is no `.resolution` property.
2. `Backend/services/illustrator_automation.py` - new `_stamp_jpeg_dpi(render_dir, dpi=EXPORT_DPI)` patches the 5 JFIF density bytes (units=1 dpi, X=Y=300) on every render just before `shutil.make_archive`. Raw byte patch, so the compressed pixels and the CMYK profile are untouched - re-saving through an image library would recompress and could convert the color space.

Result per Medium front panel: 1707x2204 px -> 7112x9183 px, reported as 300 dpi at the same 602x777 mm.

**Matching the hand-export dialog.** The user then sent a screenshot of the JPEG Options dialog they export with by hand, confirming `Resolution: High (300 ppi)` and two other settings the script did not match. Both changed in `exportResult()`:

- `qualitySetting` 80 -> **50**. The dialog slider is 0-10 and the scripting range is 0-100, so the dialog's "5 (Medium)" is 50. (Adobe documents the 0-100 range and a default of 30, but not the slider mapping - the x10 correspondence of the two ranges is the direct reading.)
- `optimization` -> **false** = "Baseline (Standard)". The property defaults to `true`, documented as "optimized for web viewing", which is Baseline Optimized; some print RIPs handle that worse.

Two dialog settings still cannot be matched from script, both verified against the official property list (`antiAliasing`, `artBoardClipping`, `blurAmount`, `horizontalScale`, `matte`, `matteColor`, `optimization`, `qualitySetting`, `saveAsHTML`, `typename`, `verticalScale`):

- Anti-aliasing "Type Optimized (Hinted)" - `antiAliasing` is a plain boolean, the type cannot be chosen.
- **Embed ICC Profile (U.S. Web Coated (SWOP) v2)** - no property exists. Marker scan of an existing render: APP0/APP12/APP14 present, no APP2 `ICC_PROFILE`.

**The ICC gap turned out to be a non-issue** - resolved, no code needed:

- The user pointed at `Edit > Assign Profile` = "Working CMYK: U.S. Web Coated (SWOP) v2" as what they want. The JSX already creates every order document with `app.documents.add(DocumentColorSpace.CMYK)` (jsx:131, :2594), and a new CMYK document takes the application's Working CMYK space automatically - i.e. it is already in exactly that state.
- Marker scan of the user's own production print file `M-03.jpg` shows **no ICC profile either** (APP13 Photoshop / APP1 XMP / APP14 Adobe, no APP2 `ICC_PROFILE`, no `acsp`, no "SWOP" string). Their real print workflow does not embed the profile, so neither should ours.
- If it is ever wanted, `C:\Windows\System32\spool\drivers\color\USWebCoatedSWOP.icc` (544 KB) exists on the machine and could be injected as APP2 chunks in `_stamp_jpeg_dpi`. Not done - not needed.

**Alternative export method considered and rejected.** `app.doScript()` playing a generated `.aia` Action is the only way to reach the dialog's Resolution field and ICC checkbox natively (see nathandietz/ExportDocAsJPEG, which encodes `imageRes = 0x0000012C` = 300). Rejected: the `.aia` format is undocumented hex blobs, breaks on non-ASCII paths, and needs load/unload per run - all for two settings we do not need.

Not touched: `Backend/scripts/render_orders.jsx` (also exports JPEG at default scale) - it is an unreferenced prototype with an `alert()` in it, nothing in the codebase calls it.

## Outcome

- ✅ Impact: Renders now ship at true print resolution and carry the dpi tag, so print software places them at the artboard's real physical size instead of ~4x. Quality/compression/color model/document profile all match the dialog the user exports by hand with, so a scripted render equals a manual one.
- 🧪 Tests: py_compile PASS; `_stamp_jpeg_dpi` on scratch copies PASS (both files read back 300x300 dpi); baseline forensics PASS; official-docs verification PASS; marker scans of both an existing render and the user's own print file PASS. No end-to-end order run.
- 📁 Files: Backend/scripts/automate_production.jsx, Backend/services/illustrator_automation.py
- 🔁 Next prompts: Ek real order chala kar confirm karna ke render 7112px @ 300dpi aa raha hai aur export time/zip size acceptable hai.
- 🧠 Reflection: "96 dpi" was a Windows artifact, not a setting. Reading the JFIF header bytes and cross-checking physical mm against a real print file caught it - scaling by 300/96 would have silently produced 216 ppi files that still looked "300 dpi" in Explorer.

## Evaluation notes (flywheel)

- Failure modes observed: Trusting the reported dpi would have given the wrong scale factor (312.5% instead of 416.667%). `System.Drawing` reports 96 dpi for any JPEG with JFIF units=0, so it cannot be used to read Illustrator export resolution.
- Graders run and results (PASS/FAIL): py_compile PASS; stamp round-trip PASS; reference-file width match PASS (601.5mm vs 602.2mm).
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): Run one order and compare the Front render's px/dpi/mm against `M-03.jpg`; check zip size (reference 70MP file is only 1.1MB, so flat vector art compresses well - large blow-up unlikely).
