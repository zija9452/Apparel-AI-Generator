---
id: 169
title: Restrict App To Selected Networks
stage: explainer
date: 2026-08-31
surface: agent
model: claude-opus-5
feature: deployment
branch: main
user: zija9452
command: explore + explain network-restriction options
labels: ["security", "deployment", "vercel", "middleware", "access-control"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - (none yet - explainer only)
tests:
  - (none yet - explainer only)
---

## Prompt

explore my whole project , and mjhe aesi logic add krni he k sirf mere hi selected network pr ye application run ho , jo m select krun bs unhi pr , to ye kese possible he ?? k me ip de dun wifi ki ?? wifi ki if to sb wifi ki alg hoti he , or multiple pc me ek hi same wifi connect ho to same rhe gi IP? Ya me kese or better way me kr skti hun ise ? is me koi database nhi he , an hi explicit koi auth lgani he ,

## Response snapshot

Explored the whole project. Three network-facing surfaces exist, and only one
of them is actually open:

| Surface | Where | State today |
|---|---|---|
| Vercel site + `/api/plan` | `https://apparel-ai-generator.vercel.app` | **OPEN to the world.** `app/api/plan/route.ts` adds `CLOUD_API_KEY` server-side for *any* visitor, so a stranger can spend the Gemini quota |
| Cloud Run `/plan` | `apparel-cloud-api-...run.app` | Locked — `CLOUD_API_KEY`, constant-time compare (`Backend/main.py:193`) + CORS |
| Local agent `:8765` | designer's PC | Locked — loopback bind, pairing token, `Host` check (`Agent/main.py:200,216`) |

So the gate only needs to go on the Vercel front door. There is no
`middleware.ts` in `Frontend/my-app` today, which is exactly where it belongs.

**On the IP question, what is true:**
- Same WiFi, many PCs → **one shared public IP** (NAT). One allowlist entry
  covers the whole office. The user's intuition is correct.
- `192.168.x.x` is useless — Vercel never sees it, only the router's public IP.
- The real defect: home/office public IPs are **dynamic**. A router reboot or
  ISP lease renewal changes it, locking out everyone at once with no way to fix
  it from outside except a redeploy. Static IP is a paid ISP add-on.
- CGNAT (common with PK ISPs) puts many customers behind one public IP — the
  allowlist would then admit strangers too.
- Home / mobile hotspot working = blocked.

**Recommended (no DB, no login UI):** one `middleware.ts` on Vercel with two
conditions read from env vars — IP allowlist (zero friction on office WiFi)
**OR** a one-time access code that sets an HMAC-signed httpOnly cookie
(`/?code=XXXX`), which survives an IP change. Same shape as the agent pairing
token that already works.

Edge cases raised for the user to decide before implementing: whether the
installer download page must stay public, whether to gate the whole site or
only `/api/plan`, and whether the office IP is static.

## Outcome

- ✅ Impact: mapped the only genuinely open surface; corrected the IP model (NAT = shared, but dynamic + CGNAT are the killers); proposed IP-allowlist OR signed-cookie middleware
- 🧪 Tests: none — explainer only
- 📁 Files: none changed
- 🔁 Next prompts: implement `Frontend/my-app/middleware.ts` once the three edge-case questions are answered
- 🧠 Reflection: the site being public is not a data leak, it is a Gemini bill and a DoS on the designers — that framing decides how strict the gate needs to be

## Evaluation notes (flywheel)

- Failure modes observed: an IP-only allowlist would have silently locked the whole office out on the next router reboot
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): add `middleware.ts` gating `/api/plan` first, leave pages open, and watch whether anything else needs it
