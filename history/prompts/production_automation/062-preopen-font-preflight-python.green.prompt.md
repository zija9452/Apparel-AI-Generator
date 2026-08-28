---
id: 062
title: Pre-Open Font Preflight In Python
stage: green
date: 2026-07-16
surface: agent
model: claude-fable-5
feature: production_automation
branch: main
user: zija9452
command: none
labels: ["fonts", "illustrator", "preflight", "bugfix"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Backend/services/illustrator_automation.py
 - Backend/scripts/automate_production.jsx
tests:
 - test_preflight.py (scratchpad): XMP extract + _find_missing_fonts against job 2ec448ee mockup -> correctly reports ['NationalChampion-Medium'] missing with 0 docs open
 - py_compile syntax check on illustrator_automation.py -> OK
---

## Prompt

ok fix this

## Response snapshot

Moved the missing-font pre-flight from the JSX (which ran AFTER app.open and
was permanently blinded by Illustrator registering substituted fonts in
app.textFonts under their original names) into Python, running right after the
clean-slate document close and BEFORE the pattern/mockup are opened, when zero
documents are open and getByName is honest. Added _find_missing_fonts(app,
font_names) which probes via a tiny DoJavaScript snippet returning the missing
subset. On detection it writes the same status.json shape the JSX used
({font_missing: true, missing_fonts: [...]}) so the existing frontend pause UI
and the /resume endpoint (continue -> ignore_missing_fonts, retry ->
force_font_refresh) work unchanged. Removed the dead JSX font-check block, the
xmpFontNames/ignoreMissingFonts injections, and the now-dead post-JSX
font_missing status re-read in Python. Probe failure degrades gracefully
(warning + continue). Verified against the exact job that previously slipped
through: NationalChampion-Medium now reported missing.

## Outcome

- ✅ Impact: Missing fonts now actually pause the job with a frontend warning instead of silently substituting.
- 🧪 Tests: Live COM test on job 2ec448ee mockup fonts -> MISSING detected; syntax check passed.
- 📁 Files: Backend/services/illustrator_automation.py, Backend/scripts/automate_production.jsx
- 🔁 Next prompts: Restart backend to load changes; optionally extend check to pattern.ai/reference.ai XMP fonts.
- 🧠 Reflection: State-dependent API (app.textFonts) must be queried before the operation under test mutates that state.

## Evaluation notes (flywheel)

- Failure modes observed: none in verification; probe wrapped in try/except for COM flakiness.
- Graders run and results (PASS/FAIL): PASS (real missing font detected on the previously-failing input).
- Prompt variant (if applicable): null
- Next experiment (smallest change to try): Run the full job through the UI and confirm the amber missing-font pause appears, then retry after installing the font.
