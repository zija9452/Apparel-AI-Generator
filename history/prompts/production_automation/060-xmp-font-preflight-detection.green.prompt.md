---
id: 060
title: XMP Font Preflight Detection
stage: green
date: 2026-07-16
surface: agent
model: claude-fable-5
feature: production_automation
branch: main
user: zija9452
command: none
labels: ["fonts", "font_missing", "xmp-metadata", "stFnt-fontName", "preflight", "NationalChampion"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Backend/services/illustrator_automation.py (modified - _extract_ai_xmp_font_names(), re import, xmpFontNames injected into script_args)
 - Backend/scripts/automate_production.jsx (modified - pre-flight also runs xmpFontNames through checkFontName/getByName)
 - Backend/uploads/426d1caf.../renders/debug_log.txt (evidence - "Font check passed" despite missing font)
 - Backend/uploads/dc0b98fe.../renders/debug_log.txt (evidence - same)
tests:
 - _extract_ai_xmp_font_names verified on both real job mockups -> ['Myriad-Italic','MyriadPro-Bold','NationalChampion-Medium']
 - full end-to-end pending: re-run a job with NationalChampion missing, expect frontend pause
---

## Prompt

isi order me ye font missing tha , or chl gya order user ne dia hi nhifonts folder me silent mode pr illustrator me chl gya he , warning nhi ayi he  """NationalChampion Medium*"""

(follow-up: user pointed to recent job dc0b98fe-f352-4842-b685-cf860472d49c)

## Response snapshot

Root cause of the silent pass: the JSX pre-flight reads
characterAttributes.textFont per character, but for a MISSING font Illustrator
(silent mode) either throws on that read - swallowed by catch(eCh){} - or
returns the substituted font. So the check can never see exactly the fonts that
are absent. Both jobs logged "Font check passed" while their mockup XMP
(stFnt:fontName) plainly declared NationalChampion-Medium, which was neither
installed nor in the uploaded Document Fonts.

Fix (hybrid, per user's answers - mockup only, false alarms acceptable):
1. Python: _extract_ai_xmp_font_names() regexes stFnt:fontName entries out of
   the mockup .ai bytes; list is injected into the bundle as
   `var xmpFontNames = [...]` (json.dumps for safe quoting).
2. JSX pre-flight: after the per-character scan, every xmpFontNames entry goes
   through the existing checkFontName() -> app.textFonts.getByName(). Using
   Illustrator as the authority avoids false positives on Adobe-bundled fonts
   (Myriad Pro lives in Adobe's private font dir, not the Windows registry).
   Missing names land in the same missingFonts -> font_missing status ->
   existing frontend amber warning + Run Again / Continue anyway buttons.

Verified extraction on both real mockups: NationalChampion-Medium captured.
Warned user: Myriad-Italic may also appear in the warning on next run (legacy
text in the mockups); Continue anyway covers it.

## Outcome

- ✅ Impact: Missing mockup fonts now pause the job and show on the frontend even though per-character reads cannot see them.
- 🧪 Tests: extraction verified against 2 real jobs; full pause flow needs one live re-run.
- 📌 Follow-up: if Myriad-Italic false-alarms on every mockup, consider a small ignore-list of legacy Adobe substitution artifacts.
