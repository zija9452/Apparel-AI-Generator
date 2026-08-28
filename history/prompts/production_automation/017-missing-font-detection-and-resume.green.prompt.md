---
id: 017
title: Missing font detection and resume flow
stage: green
date_iso: 2026-07-07
surface: agent
model: claude-fable-5
feature: production_automation
branch: main
user: zija-yaseen
command: implement
labels: [fonts, preflight, pause-resume, frontend, fastapi, illustrator]
links: null
files_yaml:
 - Backend/scripts/automate_production.jsx (modified - font pre-flight check after mockup open)
 - Backend/services/illustrator_automation.py (modified - ignore_missing_fonts/force_font_refresh flags, pause detection)
 - Backend/main.py (modified - POST /jobs/resume/{job_id} endpoint)
 - Frontend/my-app/components/ProductionPlan.tsx (modified - missing-fonts warning card with actions)
tests_yaml:
 - none (manual verification: run a job whose mockup uses a font not on the PC)
prompt_text: "ok , or agr aesa font ho , jo download na hua ho pc me , or fonts folder me bhi na den hm or adobe pr warning to silent mode me hoti he , to design kharab hoga hmara , hmy kese pta chle gaa?? to usi wakt frontend pr dikhana chahiye he k ye font missing he , ap k pc me nhi he install or ap ne jo fonts diye hen us me bhi nhi he , to ye font ka nam he , pehle install kr len ya isi trha default pr agy process kr dun autopmation ? ya ek option ye bhi k kia ab kr lia he download ?? run krun agy ki automation"
response_text: "Built the full missing-font guard: (1) JSX scans every character of every mockup text frame right after the mockup opens, checks each font name against app.textFonts, and on any miss writes status.json with font_missing:true plus the font names, closes the mockup, and exits before anything renders; (2) Python passes ignoreMissingFonts into the bundle, detects the pause after DoJavaScript, closes the pattern doc and stops without zipping; force_font_refresh restarts Illustrator so manually installed fonts load; (3) new POST /jobs/resume/{job_id} accepts action 'retry' (fonts installed - restart Illustrator and re-run) or 'continue' (skip the check, accept default substitution) and re-launches run_illustrator_automation from the saved production_plan.json; (4) ProductionPlan.tsx shows an amber paused card listing the missing font names with 'I've installed them - Run Again' and 'Continue with default font anyway' buttons."
outcome: success
evaluation: implemented-pending-user-test
---
