---
id: 011
title: Size Order And Named Export Folders
stage: refactor
date: 2026-08-24
surface: agent
model: claude-opus-5
feature: production_automation
branch: main
user: zija9452
command: (direct request)
labels: ["size-order", "export-folders", "job-name", "pd.ai", "frontend"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Backend/main.py
 - Backend/services/illustrator_automation.py
 - Backend/scripts/automate_production.jsx
 - Frontend/my-app/components/UploadForm.tsx
tests:
 - Manual: _sort_size_groups over 20 mixed size labels (youth/adult/A-prefix/numeric/Universal)
 - Manual: _safe_job_name over spaces, punctuation, reserved names, path traversal, 80-char input
 - node --check on automate_production.jsx (syntax)
 - npx tsc --noEmit on Frontend/my-app (clean)
---

## Prompt

explore my project , and is me pd.ai file me pehle sb se chota size aye, phr usse bara , isi trha loop . jese YXS , YS, YM , YL, YXL, XS, Small , Medium , Large, XL, 2XL, 3XL and so on ... agr in me se beech ka koi size na ho to us k bd wala size a jaye , or exporting me abhi renders ka folder bnta he , renders ki jga frontend me input rkho k me kia nam dena chahun gi , wo rkho , or exporting me Pehle us size ka folder bnao , jese Large me L ka folder bnao , or us me Large k sb patterns rkho ,or universal ka koi folder nhi hoga wo direct render (frontend user name folder) me export kr dena ,  isi trha sb sizes me , or job name bhi wo ho jo frontend me de user renders ka or job folder ka name same ho ,clear ??

## Response snapshot

Four edge cases were confirmed with the user before implementing: duplicate job names get a `-2`/`-3` suffix (never overwrite); size folders use short codes (S/M/L/2XL/YM); unknown sizes sort after known ones and Universal is always last; the job-name field is required.

Implementation:

1. **Size order (`Backend/main.py`)** — new `_SIZE_SEQUENCE` ladder plus `_size_rank()` / `_sort_size_groups()`. Rank buckets: youth (0) → adult (1) → unrecognised (2, numeric sizes in numeric order) → `Universal` (3). Handles `Large`/`L`/`AL`/`XXL`/`Youth Medium` spellings. Sort is stable, so equal-rank groups keep Excel order. Called LAST in `/jobs/upload` (after every `_enforce_*`, which is what appends the Universal group) and again in `/jobs/resume` so old saved plans re-sort. The pd.ai file lays pieces out in plan-group order, so this alone fixes the sheet order.

2. **Job name (`Backend/main.py`)** — required `job_name` form field. `_safe_job_name()` maps anything outside `[A-Za-z0-9-]` to `_` (the name is both a folder and a URL path segment), caps at 60 chars, guards Windows reserved device names. `_unique_job_dir()` returns `(job_id, job_dir)` with a `-2`, `-3` … suffix on collision. `job_id` is now the name, so every status/download URL and the zip name carry it; `uuid` import dropped.

3. **Render folder (`Backend/services/illustrator_automation.py`)** — `render_dir` is now `job_dir/<job name>` instead of `job_dir/renders`. `_stamp_jpeg_dpi()` walks sub-folders (renders are no longer flat). `make_archive` now uses `root_dir=job_dir, base_dir=<job name>` so the zip unpacks into one named folder.

4. **Per-size export folders (`Backend/scripts/automate_production.jsx`)** — new `sizeFolderCode()` (Small→S, Medium→M, Large→L; XS/XL/2XL/youth codes already short) and `exportFolderFor()`, which creates the sub-folder on first use and falls back to the render root if creation fails. All six `exportResult(...)` call sites now pass `exportFolderFor(sizeLabel)` instead of `outputDir`. `Universal` returns the root, so accessories land beside the .ai files and logs. The folder cache hangs off the function object, not a `var`: the first export happens in the main loop ~7700 lines above the declaration, where a plain `var` would still be hoisted-undefined.

5. **Frontend (`UploadForm.tsx`)** — required "Job name" input in section 01 with a hint about sanitisation and the `-2` suffix.

## Outcome

- ✅ Impact: pd.ai now reads smallest → largest size; every render is filed under its size code inside a job-named folder; one user-typed name drives the job folder, render folder, job id and zip.
- 🧪 Tests: size sort verified over 20 mixed labels → `YXS → YS → YM → Youth Medium → YL → YXL → XS → Small → M → Large → AL → XL → 2XL → XXL → 3XL → 4XL → 38 → 40 → Free Size → Universal`; name sanitiser verified (`../evil` → `evil`, `CON` → `CON_job`); JSX and TS syntax clean. No end-to-end Illustrator run yet.
- 📁 Files: 4 changed (2 backend Python, 1 ExtendScript, 1 React component).
- 🔁 Next prompts: run one real order and confirm the size folders + zip layout on disk.
- 🧠 Reflection: asking the four edge cases up front (collision, folder codes, unknown-size placement, required field) removed every guess from the implementation.

## Evaluation notes (flywheel)

- Failure modes observed: `var exportFolderCache = {}` next to `exportResult` would have thrown on the first export (declaration sits far below the main loop) — moved onto the function object.
- Graders run and results (PASS/FAIL): size-order table PASS, name-sanitiser table PASS, `node --check` PASS, `tsc --noEmit` PASS.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): a real job run to confirm Illustrator's `Folder.create()` behaviour under the new render path.
