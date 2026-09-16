---
id: 189
title: Two Pattern Files Implementation
stage: green
date: 2026-09-14
surface: agent
model: claude-opus-5
feature: production_automation
branch: main
user: zija9452
command: (conversation)
labels: ["dual-pattern", "youth-adult", "792pt", "pre-flight", "agent-version", "packaging"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Frontend/my-app/components/UploadForm.tsx
 - Frontend/my-app/app/home/page.tsx
 - Frontend/my-app/public/AIApparelAgent.zip
 - Agent/main.py
 - Backend/main.py
 - Backend/services/illustrator_automation.py
 - Backend/scripts/automate_production.jsx
tests:
 - scratchpad/test_two_pattern_files.py (new - 0 failures; found 1 real bug)
 - scratchpad/test_month_toddler_ladder.py (re-run, 0 failures)
 - scratchpad/test_youth_routing.py, test_preflight_split.py (re-run, no regression)
 - node --check on automate_production.jsx; ast.parse on all three Python files
 - npx tsc --noEmit on the frontend (clean)
 - live agent: /agent/health = 0.7.0, /jobs exposes both pattern fields
---

## Prompt

ok implement kr do or 792pt error nhi aye ga ?

(mid-turn) frontend me pkg bna kr rkho , or install kro local agent ko local pr
"""powershell -ExecutionPolicy Bypass -File "E:\AIApparelAgent\install-agent.ps1" -CloudApi "http://localhost:8000""""

(mid-turn) or version change kia tha ?

## Response snapshot

### The 792pt question, answered from the code

The shift is not caused by reading a non-active document - `prebuildPatternSizes()`
(`:219`) already reads pattern bounds while the MOCKUP is the active document
(opened at `:158`). It is caused by reading foreign-document bounds WHILE THE
ORDER DOCUMENT IS BEING LAID OUT. The second pattern file is therefore opened,
warmed and pre-measured before `app.documents.add()` (`:223`), and no new bounds
read happens after that line. The rule holds unchanged.

### Changes

**`Backend/services/illustrator_automation.py`**
- `is_youth_pattern_size()` / `pattern_files_needed()` - the one place that
  decides adult vs youth, shared by the upload validation and the pre-flight.
- `_split_requirements_by_file()` - three buckets, not two. The third exists
  because an accessory's key carries no size, so `_expected_pattern_pieces`
  dedupes it onto whichever group reached it first (a youth one, after the
  smallest-first sort); a two-way split would hunt the Placket only in the youth
  file.
- `_scan_pattern_for_names()` extracted so each file is scanned once;
  `_find_missing_pattern_pieces()` now takes both paths and judges each
  requirement against the file it will actually be rendered from.
- `run_illustrator_automation()` takes `pattern_youth_ai_path`, resolves
  `primary_pattern_path` / `pattern_is_youth_only`, runs the hoodie pre-flight
  against EVERY pattern file the order uses, and passes `patternYouthPath` +
  `patternIsYouthOnly` to the JSX.

**`Backend/scripts/automate_production.jsx`**
- Document roles at the top; the second file opened and warmed right after the
  first, before the mockup and long before the order document.
- `isYouthPatternSize()` + `patternDocFor()`; all 10 `findAnywhere(patternDoc, …)`
  call sites routed through it. Accessories try adult then youth.
- Every fallback ends at `patternDoc`, so a single-file order is unchanged.

**`Agent/main.py`, `Backend/main.py`** - both pattern fields optional, validated
against the plan's sizes, saved as `pattern.ai` / `pattern_youth.ai`, both paths
threaded through start and resume. `AGENT_VERSION` 0.6.2 -> 0.7.0.

**`UploadForm.tsx`** - two FileDrops, neither required; `patternFilesNeeded()`
checked between the plan and the upload so a missing file costs no transfer; the
youth file explicitly excluded from the cloud planner's form.

### The bug the tests found

`check()` judged the accessory bucket from whichever pool had survived, so when
the ADULT scan failed and the youth scan succeeded, accessories that live in the
adult file were reported missing - pausing a job over an unreadable pattern,
which is the one thing every check in that module refuses to do. Fixed: a bucket
goes unjudged if ANY file it could be answered from failed to scan, and the pool
list is built only from files the order actually has (so a single-file order
still checks its accessories normally).

One test expectation was also wrong rather than the code: in a youth-only order
whose youth file does not carry the Placket, the accessory IS genuinely missing
and must be reported. Corrected, and the positive case added.

### Packaging and install (done)

- `build-agent-package.ps1 -ForWebsite` -> `Frontend/my-app/public/AIApparelAgent.zip`
  (282 KB). The home page quoted 268 KB; updated to 282 KB.
- `build-agent-package.ps1 -Destination E:\AIApparelAgent`, then
  `install-agent.ps1 -CloudApi "http://localhost:8000" -NoPause`. `-NoPause` was
  added because this shell has no interactive stdin and the script ends in
  `Read-Host`.
- Installed clean: "Agent is answering. Version 0.7.0." - the installer's own
  version comparison, which is what would have caught a stale agent holding 8765.
- Live `/jobs` schema confirms `pattern_ai` + `pattern_youth_ai` present, with
  `required` = job_name, plan_json, mockup_ai only.
- The `automate_production.jsx.bak` in the E: package is NOT build junk:
  `_sync_automation` (`Agent/main.py:376`) writes it before replacing the JSX, so
  it proves that folder had synced before.

## Outcome

- ✅ Impact: one job can now render adult and youth sizes from their own graded .ai files, replacing the two-separate-jobs workflow. Agent 0.7.0 built, installed locally against localhost:8000, and answering.
- 🧪 Tests: 4 scratchpad suites (0 failures), JSX + Python syntax, tsc clean, live endpoint schema verified. The new suite found a real scan-failure bug before any of this ran.
- 📁 Files: 7 (4 code, 1 copy fix, 1 built zip, 1 version bump).
- 🔁 Next prompts: run a real mixed youth+adult order end to end; then decide whether to open only the file each chunk needs, now that the sequence is one youth block then one adult block.
- 🧠 Reflection: the 792pt answer came from reading what the existing pre-measure already does rather than from the rule as stated in the comments - the comments say "non-active document", the code shows the real boundary is the order document's creation.

## Evaluation notes (flywheel)

- Failure modes observed: the first version of the split pre-flight treated "scan failed" as "scan returned nothing" for the shared-accessory bucket only - the single-file buckets were already safe, so the defect was invisible except in the mixed-file case the stub test constructed.
- Graders run and results (PASS/FAIL): PASS - is_youth_pattern_size 39/39; pattern_files_needed 6/6; bucket split 3/3; _find_missing_pattern_pieces 9/9 including both scan-failure paths and the swapped-file case.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): a real mixed order through the installed 0.7.0 agent, watching debug_log.txt for the two "Name index built" lines and confirming neither reports a multi-second (non-active) build.
