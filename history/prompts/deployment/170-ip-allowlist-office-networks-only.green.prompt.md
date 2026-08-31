---
id: 170
title: IP Allowlist Office Networks Only
stage: green
date: 2026-08-31
surface: agent
model: claude-opus-5
feature: deployment
branch: main
user: zija9452
command: implement network restriction on the Vercel site
labels: ["security", "deployment", "vercel", "proxy", "ip-allowlist", "nextjs-16"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - Frontend/my-app/proxy.ts (new)
  - Frontend/my-app/.env
  - Frontend/my-app/.env.example
  - DEPLOYMENT_PLAN.md
tests:
  - 12-case HTTP matrix against `next start` with forged IP headers - all pass
  - 8-case CIDR matrix (IPv4 /24 and IPv6 /48, including boundaries) - all pass
  - XSS escape check on the IP echoed into the block page - escaped
  - `npx next build` - compiles, TypeScript clean, `ƒ Proxy (Middleware)` registered
  - `npx eslint proxy.ts` - clean
---

## Prompt

I want k idhr k ilawa koi open na kr ske vercel ki site bhi complete , fallback page dikha den ge k ap ko access nmhi he is ip pr , ab aty hen ip pr , to mjhe ip hi chhaiye he , mbl or hotspot pr block hone den , ab btao ip se kese implement kr sktay hen ??

(followed by, in the same session: "pehle plan share kro , or mjhe wifi ki ip kahn se nikalni hogi ??" · "office me multiple pcs hen , or multiple 5 wifi lge hen, me hahti hun in wifi se connect hon pc to hi chle app otherwise na chle , short me btao k best tareeka kia he phr is ko krne ka ?? ya nhi ho skta ye ?" · "agr 2 pc me ek wifi connect he to same rhe gi na ip ??" · the two `ifconfig.me/ip` results)

## Response snapshot

Verified before writing anything, per the Authoritative Source Mandate:

1. **Vercel's IP headers.** `x-forwarded-for`, `x-vercel-forwarded-for` and
   `x-real-ip` all carry the client's public IP, and Vercel "overwrite[s] the
   X-Forwarded-For header and do[es] not forward external IPs… to prevent IP
   spoofing." So the value cannot be forged by the caller.
2. **Next 16's convention.** `middleware.ts` is deprecated and renamed to
   `proxy.ts`; the export must be named `proxy`; it runs on the Node.js runtime.
   Confirmed both in the online docs and in this repo's own
   `node_modules/next/dist/docs/` (which `Frontend/my-app/AGENTS.md` demands be
   read first), plus `PROXY_FILENAME = 'proxy'` in the installed package.

**Built `Frontend/my-app/proxy.ts`** — public IP must appear in `ALLOWED_IPS`
or the request gets a 403. Single addresses and CIDR ranges, IPv4 and IPv6.
No `matcher`, so it covers pages, `/api`, `_next/static` and the agent
installer in `public/`. HTML block page for navigations, JSON 403 for `/api/*`,
`no-store` on both. Empty `ALLOWED_IPS` blocks everything, so a forgotten gate
fails shut. The block page prints the IP it saw, which *is* the setup
procedure for the remaining networks.

**The bug the tests caught.** The first version compared the IP as a string
against `"127.0.0.1"` / `"::1"`. `next start` reports loopback as
`::ffff:127.0.0.1`, so the local dev server 403'd itself — test 5 of 12 failed.
Rewritten to match `127.0.0.0/8` and `::1/128` on the parsed bytes, reusing the
same CIDR code as the allowlist.

**Answered along the way:** two PCs on one wifi share one public IP (NAT), so
one entry covers a whole office regardless of PC count; `192.168.x.x` is
useless because Vercel never sees it; the five office wifis turned out to be
separate internet lines (`39.34.163.45` Connect Communications, `154.198.107.184`
PMCL/Jazz), so they need one entry each.

## Outcome

- ✅ Impact: the Vercel site and `/api/plan` are no longer open to anyone with the URL; the last unlocked surface in the system is closed
- 🧪 Tests: 12-case HTTP matrix + 8-case CIDR matrix + XSS escape + build + lint, all passing; one real bug found and fixed by them
- 📁 Files: `proxy.ts` new; `.env`, `.env.example`, `DEPLOYMENT_PLAN.md` updated
- 🔁 Next prompts: collect the remaining three wifi IPs, set `ALLOWED_IPS` in Vercel, redeploy, and confirm from a blocked network
- 🧠 Reflection: the loopback bug would have shipped invisibly — it only appears on a built server, never in `next dev` reasoning, and it locks the developer out of their own machine

## Evaluation notes (flywheel)

- Failure modes observed: string-comparing an IP address instead of parsing it; `::ffff:` forms defeat every equality check written against the plain form
- Graders run and results (PASS/FAIL): PASS — 12/12 HTTP, 8/8 CIDR, build, eslint
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): after the Jazz line runs for a week, check whether its IP has moved; if it has, that network needs a CIDR range or the access-code fallback that was declined
