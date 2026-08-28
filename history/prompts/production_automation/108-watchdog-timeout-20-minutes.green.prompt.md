---
id: 108
title: Watchdog timeout 20 minutes
stage: green
date: 2026-08-17
surface: agent
model: claude-opus-5
feature: production_automation
branch: main
user: zija9452
command: chat
labels: ["watchdog", "timeout", "illustrator", "automation"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Backend/services/illustrator_automation.py
tests:
 - none (single constant change; watchdog message derives minutes from the constant)
---

## Prompt

Error: Job stuck - no progress for 10 minutes, Illustrator was closed. Check renders/debug_log.txt for the last step. is ka time brha kr 20 minutes kro

## Response snapshot

Watchdog stale threshold ko 10 min se 20 min kiya:

- `Backend/services/illustrator_automation.py:19` — `WATCHDOG_STALE_SECONDS = 600` → `1200`
- Line 18 ka comment "user-approved: 10 min" → "20 min"

Error message (line 1156) `WATCHDOG_STALE_SECONDS // 60` se minutes derive karta hai, is liye khud-ba-khud "20 minutes" dikhaye ga — koi alag edit nahi chahiye. Watchdog thread ka 15s poll interval (line 1072) waisa hi hai; sirf stale-threshold barha hai. Frontend mein koi mirrored timeout nahi mila.

## Outcome

- ✅ Impact: Long-running JSX (bara name index / heavy render) ab 20 min tak bina status update ke chal sakta hai before Illustrator force-kill.
- 🧪 Tests: None run — one-line constant change.
- 📁 Files: Backend/services/illustrator_automation.py
- 🔁 Next prompts: Agar 20 min bhi kam pade to per-part status update JSX mein aur granular karna behtar hoga (constant barhane ke bajaye).
- 🧠 Reflection: Message already parameterized tha, so single source of truth ne double edit se bacha liya.

## Evaluation notes (flywheel)

- Failure modes observed: None.
- Graders run and results (PASS/FAIL): N/A
- Prompt variant (if applicable): N/A
- Next experiment (smallest change to try): JSX se index-build phase ke dauran periodic status heartbeat likhwana, taake watchdog ko real stall aur slow work ka farq pata chale.
