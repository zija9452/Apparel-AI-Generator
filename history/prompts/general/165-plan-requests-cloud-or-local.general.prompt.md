---
id: 165
title: Plan requests cloud or local
stage: general
date: 2026-08-29
surface: agent
model: claude-opus-5
feature: none
branch: main
user: zija9452
command: (chat question)
labels: ["env", "routing", "cloud-run", "local-dev"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - (none - read-only inspection)
tests:
 - (none)
---

## Prompt

mjhe ye btao , abhi req local se direct cloud pr jayen gi .ya local pr ?? qk env me cloud connect he , jb k locla hona chahiye he local pr to

## Response snapshot

Traced the request path through `Frontend/my-app/lib/api.ts:15-16`,
`Frontend/my-app/app/api/plan/route.ts:30-56`, and `Frontend/my-app/.env:13-27`.

Two independent halves:

1. Planning (Excel -> plan). Browser never calls the cloud directly. It POSTs to
   the site's own `/api/plan`; that route handler runs on the Next server and
   forwards to `process.env.CLOUD_API` with `x-api-key`. `.env` currently has
   `CLOUD_API=https://apparel-cloud-api-434863957551.asia-south1.run.app`, so
   even during `npm run dev` on localhost the plan call lands on Cloud Run.
   Local backend on :8000 receives nothing.
2. Rendering (.ai files, 135MB pattern, 334MB zip). Always
   `NEXT_PUBLIC_AGENT_URL=http://localhost:8765`, browser -> local agent
   directly. Unaffected by CLOUD_API - never cloud, by design.

To point planning at the local backend: set `CLOUD_API=http://localhost:8000`
and leave `CLOUD_API_KEY` empty (`Backend/main.py:200-201` skips auth when the
key is unset), then restart the dev server - Next reads `.env` only at boot.

## Outcome

- ✅ Impact: Clarified that only the planning hop is cloud-bound; the heavy
  rendering hop is and always was localhost.
- 🧪 Tests: none (read-only)
- 📁 Files: none modified
- 🔁 Next prompts: switch `.env` to the local backend if local plan testing is
  wanted
- 🧠 Reflection: `.env.example` already ships the local values; the live `.env`
  had been switched to Cloud Run during deployment and never switched back.

## Evaluation notes (flywheel)

- Failure modes observed: easy to assume "localhost dev = localhost backend"
  when the proxy route hides the upstream target
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): n/a
