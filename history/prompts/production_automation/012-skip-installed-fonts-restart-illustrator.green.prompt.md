---
id: 012
title: Skip installed fonts, restart Illustrator
stage: green
date_iso: 2026-07-04
surface: agent
model: claude-fable-5
feature: production_automation
branch: main
user: zija-yaseen
command: fix
labels: [fonts, illustrator, windows, automation, restart]
links: null
files_yaml:
 - Backend/services/illustrator_automation.py
tests_yaml:
 - _read_font_names parses arial.ttf ('arial') and arialbd.ttf ('arial bold' + localized names)
 - _get_installed_font_names returned 3131 registered fonts incl. 'arial' and 'arial bold'
 - install_job_fonts skipped a renamed copy of Arial (matched by internal font name, returned 0)
prompt_text: "but the issue is k that agr illustrator open hi rha to fonts load nhi hon ge , or production me ghlt font a ajye ga , jo k ghlt he , ise fix kis trha kren ?? k agr open ho to illustrator close ho jaye ?? or hr font install krne ki need nhi , jo bs hmare pc me nhi hen wo install ho jayen"
response_text: "Two fixes in Backend/services/illustrator_automation.py: (1) install_job_fonts now parses each uploaded font's internal name table (_read_font_names, TTF/OTF/TTC 'name' table, nameIDs 1/4/16) and compares against fonts registered in Windows (HKLM + HKCU Fonts registry via _get_installed_font_names) — fonts already on the PC are skipped, matched by real font name not filename. (2) If any font was newly installed, _close_illustrator_if_running() quits a running Illustrator instance via COM (UserInteractionLevel=-1 to suppress dialogs), waits up to 30s for it to exit, and the existing connect loop relaunches it fresh so the new fonts are loaded. If no new fonts were needed, running Illustrator is left untouched."
outcome: success
evaluation: implemented-and-tested
---
