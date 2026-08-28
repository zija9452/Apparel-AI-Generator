---
id: 011
title: Install job fonts into Windows
stage: green
date_iso: 2026-07-04
surface: agent
model: claude-fable-5
feature: production_automation
branch: main
user: zija-yaseen
command: fix
labels: [fonts, illustrator, windows, automation]
links: null
files_yaml:
 - Backend/services/illustrator_automation.py
tests_yaml:
 - Manual smoke test: install_job_fonts with missing folder returns 0
 - Manual round-trip test: copied Arial as ZZTEST_arial.ttf, verified file copied to %LOCALAPPDATA%\Microsoft\Windows\Fonts and HKCU Fonts registry value created, then cleaned up
prompt_text: "ok  , ise fix kro"
response_text: "Added install_job_fonts(job_dir) to Backend/services/illustrator_automation.py: scans the job's 'Document Fonts' folder (where main.py saves frontend-uploaded fonts), copies each .ttf/.otf/.ttc to %LOCALAPPDATA%\\Microsoft\\Windows\\Fonts, registers it as a per-user font under HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Fonts, loads it into the current session via AddFontResourceW, and broadcasts WM_FONTCHANGE. Called from run_illustrator_automation at 15% progress, before connecting to Illustrator and opening the pattern document, so Illustrator sees the fonts and no longer silently substitutes them. Note: an already-running Illustrator 2015 instance may need a restart to pick up newly installed fonts (logged as a warning)."
outcome: success
evaluation: implemented-and-smoke-tested
---
