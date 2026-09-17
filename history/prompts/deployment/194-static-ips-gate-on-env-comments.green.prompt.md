---
id: 194
title: Static IPs Gate On Env Comments
stage: green
date: 2026-09-17
surface: agent
model: claude-opus-5
feature: deployment
branch: main
user: zija9452
command: (direct request)
labels: ["deployment", "networking", "ip-allowlist", "env", "documentation"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Frontend/my-app/.env
tests:
 - none (comment-only change; no code path touched)
---

## Prompt

mene ip static k li hen jo env me hen abhi do  or ip gate on kr lia he , env comments update kr do

(follow-up mid-turn) ptcl he company , isi trha kia connect communication bhi he ??

## Response snapshot

Rewrote the two stale comment blocks in `Frontend/my-app/.env`. The values were
already correct (`IP_GATE=on`, `ALLOWED_IPS=203.135.50.223,59.103.139.38`); only
the prose around them was from the 2026-09-01 dynamic-IP incident and still said
the gate was off and the addresses stale.

**`IP_GATE` block** — now says ON since 2026-09-17, safe only because both lines
are static; keeps the 2026-08-31/09-01 breakage as the reason it exists; the
"how to switch it" instructions now point at turning it *off*, and keep the
build-time inlining warning (a Vercel dashboard edit does nothing without a
redeploy).

**`ALLOWED_IPS` block** — new SSID→address table:

| SSID | Address | Routing ASN |
|---|---|---|
| PTCL FF | `203.135.50.223` | AS17557 PTCL |
| J&S Marketing / J&S 2.4GHZ | `59.103.139.38` | AS132165 Connect Communications |

Jazznet1 recorded as deliberately dropped (line no longer used). Added a warning
not to "correct" the ISP labels from RDAP.

**Correction made during the turn:** the first RDAP lookup returned PTCL for
*both* addresses and I reported that. Wrong for the J&S line — `59.103.128.0/18`
is *registered* to PTCL but *routed* by Connect Communications. `ipinfo`
(routing ASN) is authoritative for "which company sold us the line"; RDAP
(registry allocation) is not. This is the second time the same trap has hit this
project.

Answer to the follow-up: yes — Connect Communications is its own ISP company
(AS132165), independent of PTCL (AS17557). It just uses IP space registered to
PTCL, which is why whois/RDAP misreports it.

## Outcome

- ✅ Impact: `.env` comments now match reality; the next person reading them is
  told the gate is live, which two lines are allowed, and why the ISP label
  cannot be taken from RDAP
- 🧪 Tests: none run — comment-only edit, no executable change
- 📁 Files: `Frontend/my-app/.env` (two comment blocks rewritten; values
  unchanged)
- 🔁 Next prompts: fix the now-wrong header in `Frontend/my-app/proxy.ts:2`
  ("IT IS CURRENTLY SWITCHED OFF"); refresh `NETWORK_ACCESS.md` §7 and
  `AUTH_PLAN.md`; add an `IP_GATE` entry to `.env.example`, which has none;
  confirm `IP_GATE` + `ALLOWED_IPS` are set in Vercel and redeploy
- 🧠 Reflection: asked the user which line each static IP belonged to instead of
  inferring it from the address — correct call, since the address block would
  have pointed at the wrong ISP

## Evaluation notes (flywheel)

- Failure modes observed: RDAP-derived ISP name contradicting the routing ASN,
  on a brand-new address, exactly as recorded after the 2026-09-01 incident;
  documentation comments outliving the state they describe by 16 days
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): when any IP is written into a doc or
  env file, run `curl -s https://ipinfo.io/<ip>/json` first and never RDAP alone
