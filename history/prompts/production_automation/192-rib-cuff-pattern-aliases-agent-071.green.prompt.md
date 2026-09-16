---
id: 192
title: Rib Cuff pattern aliases agent 0.7.1
stage: green
date: 2026-09-15
surface: agent
model: claude-opus-5
feature: production_automation
branch: main
user: zija9452
command: "code me dekho kia support krta he" + agent update/version/zip/install
labels: ["rib-cuff", "pattern-aliases", "agent-release", "0.7.1", "preflight"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - Backend/scripts/automate_production.jsx
  - Backend/services/illustrator_automation.py
  - Agent/main.py
  - Frontend/my-app/app/home/page.tsx
  - Frontend/my-app/public/AIApparelAgent.zip
  - RELEASE.md
tests:
  - manual: _expected_pattern_pieces against a mixed-spelling pool (Medium Cuff, Large Cuff, XL Rib and Cuff, YXS Rib, 2XL Cuff & Rib) - all FOUND, an absent Small Cuff still MISSING
  - automated: JSX and Python alias lists extracted by regex and compared element by element - MIRROR MATCH True
  - syntax: node --check on a .js copy of automate_production.jsx - PASS
  - install: install-agent.ps1 -CloudApi http://localhost:8000 - agent answered "Version 0.7.1"
---

## Prompt

code me dekho kia support krta he ?? Pattern me aese he , Medium Rib & Cuff and Medium Cuff ,

(follow-up, mid-turn)
agent ko update kro or version change kro , or kg bna kr frontend me rkho , install kro local pr agnet """powershell -ExecutionPolicy Bypass -File "E:\AIApparelAgent\install-agent.ps1" -CloudApi "http://localhost:8000""""

## Response snapshot

What the code supported, read out of the source rather than guessed:

PATTERN side - `partLabelAliases` (automate_production.jsx) had branches for the
sleeves only; `Rib & Cuff` fell through to `return [partLabel]`. Names are
compared with every non-alphanumeric stripped, so the accepted set was exactly
`ribcuff`: "Rib & Cuff", "Rib&Cuff", "Rib Cuff". NOT "Cuff" (`cuff`), NOT "Rib"
(`rib`), and NOT "Rib and Cuff" - the spelled-out "and" survives normalization
as letters while "&" does not.

MOCKUP side - `getSourceView`'s `ribTargets` has accepted all six spellings for
a long time. So a pattern naming the panel "Medium Cuff" found its DESIGN and
not its PANEL: the cuff was dropped from the order with one CRITICAL log line.

That closes the original warning: the sizes whose cuffs were spelled
"Rib & Cuff" passed, the ones spelled "Cuff" (M, L, XL, 2XL, YXS) failed. Those
were NOT false alarms - unlike the sleeve rows, the renderer would have skipped
them too.

Asked two edge cases before writing anything (both answered):
  1. When a size carries BOTH "Medium Rib & Cuff" and "Medium Cuff" - user chose
     "Cuff" to win. That makes Rib & Cuff the ONE part where the canonical name
     is not probed first, against the ordering rule documented right above it,
     so the exception is written down where the rule is.
  2. Bare "Rib" accepted too, matching the mockup list.

Final probe order, both sides identical:
`["Cuff", "Rib", "Rib & Cuff", "Rib and Cuff", "Cuff & Rib", "Cuff and Rib"]`

Checked before shipping that the resolved panel name is safe to change: every
cuff-specific behaviour (`ribCuffSleeveBySize` anchoring, the 5mm stack under
its sleeve, the stray-stroke cleanup) keys off `item.part_name`, never the
panel's name; and `patternSizeCache` is keyed by the CANONICAL `patternTargetName`
on both write and read, so an aliased match still measures into the right slot.

Also fixed the "matched by alias" log test, which compared loop INDICES
(`i > 0 || p > 0`). With "Cuff" probed at p === 0 that would have called the
aliased match canonical and stayed silent on the one line a reader needs. Now
compares against the canonical spellings themselves.

Release: AGENT_VERSION 0.7.0 -> 0.7.1 (both fixes ship inside the package, not
through the JSX manifest, so install-agent.ps1 must refuse to leave 0.7.0
running). Rebuilt the website zip (282 -> 284 KB, homepage figure updated),
refreshed E:\AIApparelAgent in place - the builder never wipes, so the .venv and
pairing token survived - and ran the installer. Agent answered 0.7.1.

## Outcome

- ✅ Impact: a pattern spelling cuffs "Medium Cuff" now renders them instead of dropping them silently; combined with 191, both halves of the original 19-piece warning are resolved
- 🧪 Tests: mixed-spelling probe PASS, JSX/Python mirror comparison PASS, node --check PASS, live install reported 0.7.1
- 📁 Files: automate_production.jsx, illustrator_automation.py, Agent/main.py, home/page.tsx, AIApparelAgent.zip, RELEASE.md
- 🔁 Next prompts: commit + Vercel redeploy so designers get the 0.7.1 zip; re-run the failing order to confirm the pause is gone
- 🧠 Reflection: the question "what does the code support" was worth answering literally - the normalization table (`Rib and Cuff` fails, `Rib&Cuff` passes) is not something either side's comments state, and it is the part a designer cannot guess

## Evaluation notes (flywheel)

- Failure modes observed: RELEASE.md already carried a trap named "Pre-flight renderer se sakht na ho" AND a table claiming the SS/LS mirror shipped on 2026-09-10. Both were true on paper while the call site was missing. A doc that records intent as completion hides exactly the bug it warns about - added the "helper likh dena kaafi nahi, usay call bhi karna hai" note there.
- Graders run and results (PASS/FAIL): alias-mirror regex comparison PASS, mixed-spelling probe PASS, node --check PASS. Illustrator render NOT graded - needs the real order re-run.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): make the mirror comparison in this PHR a real test file, so JSX and Python alias lists cannot drift again without something going red
