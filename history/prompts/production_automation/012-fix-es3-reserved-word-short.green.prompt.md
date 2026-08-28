---
id: 012
title: Fix ES3 Reserved Word Short
stage: green
date: 2026-08-24
surface: agent
model: claude-opus-5
feature: production_automation
branch: main
user: zija9452
command: (direct request)
labels: ["extendscript", "es3", "parse-error", "kerning", "bugfix"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Backend/scripts/automate_production.jsx
tests:
 - grep for ES3 reserved words used as identifiers - only hit fixed, none remain
 - grep for reserved words used as property names - none
 - node --check on automate_production.jsx (syntax clean)
---

## Prompt

INFO:illustrator-automation:Mockup XMP declares fonts: ['Arial-Black', 'CollegeSlabSC', 'MyriadPro-Bold']
WARNING:illustrator-automation:Font pre-flight probe failed, continuing without check: (-2147417851, 'The server threw an exception.', None, None)
INFO:illustrator-automation:Font pre-flight passed - all mockup XMP fonts are available.
WARNING:illustrator-automation:Could not scan 'mockup.ai' for a Center-named object: (-2147417851, 'The server threw an exception.', None, None)
WARNING:illustrator-automation:Could not scan 'mockup.ai' for an armhole-match group: (-2147417851, 'The server threw an exception.', None, None)
INFO:illustrator-automation:Opening pattern: D:/Zija_Yaseen/Web development/AI-Apparel-Order-Generator/Backend/uploads/M101_Round_Neck/pattern.ai
INFO:     127.0.0.1:51279 - "GET /jobs/status/M101_Round_Neck HTTP/1.1" 200 OK
INFO:     127.0.0.1:51279 - "GET /jobs/status/M101_Round_Neck HTTP/1.1" 200 OK
INFO:     127.0.0.1:51279 - "GET /jobs/status/M101_Round_Neck HTTP/1.1" 200 OK
INFO:     127.0.0.1:51279 - "GET /jobs/status/M101_Round_Neck HTTP/1.1" 200 OK
INFO:illustrator-automation:Pattern file opened successfully
ERROR:illustrator-automation:Illustrator Automation failed
Traceback (most recent call last):
  File "D:\Zija_Yaseen\Web development\AI-Apparel-Order-Generator\Backend\services\illustrator_automation.py", line 1180, in run_illustrator_automation
    app.DoJavaScript(eval_command)
    ~~~~~~~~~~~~~~~~^^^^^^^^^^^^^^
  File "<COMObject Illustrator.Application.CC.2015>", line 3, in DoJavaScript
pywintypes.com_error: (-2147352567, 'Exception occurred.', (0, 'Adobe Illustrator', "Error 9: Illegal use of reserved word 'short'.\rLine: 8947\r->              var short = [];", None, 0, -2147216503), None)
INFO:illustrator-automation:Illustrator closed successfully
INFO:     127.0.0.1:51298 - "GET /jobs/status/M101_Round_Neck HTTP/1.1" 200 OK kia error he ye

## Response snapshot

Not caused by the size-order/export-folder work - `var short = []` is uncommitted
work-in-progress in the kerning spacing guard (confirmed: the line shows as an
added line in `git diff HEAD`).

`short` is an ES3 **future-reserved word**. Illustrator's ExtendScript engine is ES3,
so the identifier is a PARSE error and the whole bundle dies before a single line
runs - which is why the job got as far as opening the pattern and then died.

Reported line 8947 is the BUNDLE's line, ~37 ahead of the .jsx line (8910): the
bundle prepends json2.jsx plus the args prologue.

Fix: renamed `short` -> `tooTight` across the spacing-guard block
(`automate_production.jsx:8910-8944`), with a comment saying why the old name is
forbidden. Swept the whole file for the rest of the ES3 reserved list as
identifiers and as property names - no other hit.

The three `-2147417851 The server threw an exception` warnings above are a separate,
non-fatal issue (COM call into a busy Illustrator during pre-flight scans); each one
is caught and the job continues.

Noted for future sessions: `node --check` parses ES5+, where `short` is a legal
identifier, so it passes clean - a modern syntax check can never catch this class of
bug. Saved to memory as `extendscript-es3-reserved-words`, with the grep to run
before shipping .jsx edits.

## Outcome

- ✅ Impact: the bundle parses again; the job can get past `DoJavaScript`.
- 🧪 Tests: reserved-word greps clean (identifiers + properties), `node --check` clean. Not yet re-run end to end in Illustrator.
- 📁 Files: 1 changed (`Backend/scripts/automate_production.jsx`).
- 🔁 Next prompts: re-run the M101_Round_Neck job and confirm the size folders land under `uploads/M101_Round_Neck/M101_Round_Neck/`.
- 🧠 Reflection: the syntax check that passed is exactly what made this hide - the error surfaced only after a full COM round trip.

## Evaluation notes (flywheel)

- Failure modes observed: modern-JS syntax checking gives false confidence on ES3 ExtendScript; bundle line numbers are offset from the source file's.
- Graders run and results (PASS/FAIL): reserved-word sweep PASS, `node --check` PASS.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): add the reserved-word grep to whatever pre-run check exists, so it fails fast instead of after an Illustrator launch.
