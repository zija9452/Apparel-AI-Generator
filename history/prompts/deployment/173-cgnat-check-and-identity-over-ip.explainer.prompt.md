---
id: 173
title: CGNAT check and identity over IP
stage: explainer
date: 2026-09-01
surface: agent
model: claude-opus-5
feature: deployment
branch: main
user: zija9452
command: (chat) DDNS viability, approach rejection, manager report
labels: ["network-access", "cgnat", "ddns", "duckdns", "google-sso", "beyondcorp", "manager-report"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Frontend/my-app/node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md (read)
 - scratchpad/access-memo.html (created, published as artifact)
tests:
 - none (network diagnosis + design discussion; no code written)
---

## Prompt

Sequence of exchanges after PHR 172, condensed:

1. "abhi me kia krun , k jis k pas Jns Marketing ka jo net he wo hi ho to hi meri vercel app chle ? ya aesa possible nhi he ? qk ip to roz change ho rhi hen"
2. "option 1 without c fallback"
3. "or is ko or explain kro , k free hi rhe ,"  /  "plan share kro"
4. "ok , pehle jns ka check kro"  /  "abhi j&s Marketing pr hi he"
5. "pehle non-technical me samjhao k hua kia he , or kia he ye , kese hoga , work kis trha krta he , short me"
6. "ok , or req kese jaye gi is org pr ?? local pc se ? ya vercel se ?? vercel se ssr kr do , k khud chli jaye , qk local pc ek din jis me code he bnd rha to baki sb k liye mala hoga"
7. "lekin updater install usi ko mile ga na jis k pas pehle hoga access"
8. "ye thk nhi he yr approach , kch or btao , in dono k ilawa ?? hm kia vercel se nhi kr skte ?"
9. "real world me kis trha solve kia jata he ye scenaerio , wo log kia krte hen ??"
10. "mjhe manager ko report krni he , he is a non-technical , me kese samjhaun ey bt , or are u sure k e ab use nhi hota ?? to systenm abhi bhi to ip hi hoty hen na"

## Response snapshot

### The CGNAT check — measured, not assumed

On `J&S Marketing` (PC private `192.168.2.129`, gateway `192.168.2.1`, public `182.189.64.215`):

```
hop 1   192.168.2.1        Linksys E1200 (wifi router)
hop 2   192.168.100.1      Huawei GPON ONT (PTCL modem)
hop 3   182.189.64.1       PTCL gateway - PUBLIC, same /24 as our public IP
hop 4+  221.120.249.233 -> 202.70.157.142 -> 10.253.x.x -> Google
```

**No `100.64.x.x` anywhere -> no CGNAT.** DDNS was viable on this line.

The trace also exposed **double NAT**: the public IP sits on the modem, not the
Linksys. So DDNS on the E1200 would have published `192.168.100.x`, a private
address Vercel never sees. This is the kind of thing only a trace shows.

Device fingerprints: `192.168.2.1` -> `WWW-Authenticate: Basic realm="E1200"`;
`192.168.100.1` -> `/Cuscss/`, `RndSecurityFormat.js` = Huawei HG8145 family.

### Two design errors I made and corrected mid-thread

1. **"Put the DuckDNS updater in `install-agent.ps1`."** Wrong. That ships the
   update token to every designer's machine. A laptop taken home would run its
   scheduled task, publish the *home* address, and simultaneously let that house
   in and lock the office out — with no error anywhere. The user caught the shape
   of this before I did. The constraint is not who is trusted; it is **which
   machine physically leaves the building**.
2. **"IP-based gating isn't used any more."** Too absolute. IP allowlisting is
   alive wherever the address is stable — AWS security groups, database
   allowlists, partner APIs, WAF rules. What was abandoned is IP as the *primary*
   identity check for *people* on *dynamic consumer lines*. The correct sentence:
   **IP works when the address is stable; ours is not.**

   Note: `NETWORK_ACCESS.md` §10 already states this principle for Cloud Run
   ("Vercel's egress addresses are not fixed on this plan"). The same reasoning
   applied to the website was simply not carried across.

### Why Vercel cannot send the DDNS update

DuckDNS derives the address from the request's source. A request from Vercel
publishes Vercel's address. The explicit `ip=` parameter exists, but Vercel does
not know today's office address — which is the original question. Circular.
Something inside the office must speak; that is structural, not a design choice.

### Where it landed

User rejected every in-office-updater variant. Reframed around the real threat,
which `NETWORK_ACCESS.md` §0 already states: no data worth taking, the loss is
Gemini quota burn and designers on 503s.

Recommended **Google Sign-In restricted to an email allowlist** — the BeyondCorp
answer, identity rather than network. It defeats the user's earlier objection to
a shared access code: per-person identity, individually revocable, nothing
written down. OAuth client fits in the existing GCP project
`gen-lang-client-0222340998`. Free, server-side, no daily maintenance,
IP-independent. Plus a rate limit on `/api/plan` as depth.

Built a non-technical decision memo for the manager and published it as an
artifact: what happened, why the address changed (with the verified before/after
table), whether this was a mistake, what is actually being protected, four
options, recommendation, and the three asks.

## Outcome

- ✅ Impact: DDNS proven viable then set aside; double NAT found; approach moved from network-identity to person-identity; manager memo delivered
- 🧪 Tests: none — no code written this turn
- 📁 Files: `scratchpad/access-memo.html` published; no repo files modified
- 🔁 Next prompts: implement Google Sign-In (verify Auth.js against bundled Next 16 docs first, per `AGENTS.md`); rate-limit `/api/plan`; refresh `ALLOWED_IPS` + redeploy as the stopgap; capture `PTCL FF`'s current address
- 🧠 Reflection: the trace was worth more than any amount of reasoning — it killed the router-DDNS plan and found the double NAT in one command. Measure the network before designing against it

## Evaluation notes (flywheel)

- Failure modes observed: proposing a credential-distribution design without asking which machines leave the premises; over-broad claim about IP filtering being obsolete
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): before any auth design, write down where each secret ends up and which of those locations can walk out of the building
