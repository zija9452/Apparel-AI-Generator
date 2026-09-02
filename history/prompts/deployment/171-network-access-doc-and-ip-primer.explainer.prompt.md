---
id: 171
title: Network Access Doc And IP Primer
stage: explainer
date: 2026-08-31
surface: agent
model: claude-opus-5
feature: deployment
branch: main
user: zija9452
command: explain how IP works, then document all of it
labels: ["documentation", "networking", "nat", "ip-allowlist", "deployment"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - NETWORK_ACCESS.md (new)
  - DEPLOYMENT_PLAN.md (section 7 condensed to a summary + pointer)
tests:
  - none - documentation only; the gate itself was verified in PHR 170
---

## Prompt

ok , or lekin ye ip work kese krti he , ye samjh nhi a rha he , or ye sb docs me dal dena ,

## Response snapshot

Two things asked for: the IP concept itself, which had not landed, and all of it
written down.

**The primer.** The missing piece was that there are *two kinds of address* and
only one of them travels. A private address (`192.168.1.5`) is a room number -
real inside one building, meaningless outside, and it does not survive the
router. A public address (`39.34.163.45`) is the street address of the whole
building. The router holds both: a private face inside and a public face out.
On the way out it strips the private address off the request, writes its own
public one on, and remembers in a table whose reply it is - NAT. Explained with
an office switchboard: twenty extensions, one number the outside world dials.

Two consequences carry the whole design:

1. A website **never** sees a private address, so allowlisting `192.168.x.x`
   would compare against a value that never arrives.
2. Every device behind one router shares one public address, so **one entry
   covers a whole office** - and the unit that matters is the *internet line*,
   not the wifi. Five SSIDs turned out to be three lines.

And the weakness that follows from it: the public address is leased from the
ISP, not owned, so a dynamic lease can change and lock a network out.

**The document.** New `NETWORK_ACCESS.md` at the repo root, nine sections: why
the gate exists at all (a bill and a DoS, not a data leak), the IP/NAT primer,
where the gate sits and why the file is `proxy.ts`, how a request is judged,
what a blocked visitor gets, the setup and repair runbook, how to test it given
that loopback is exempt, the network table, and what the approach costs
including the access-code fallback that was declined.

`DEPLOYMENT_PLAN.md` section 7 was cut back from a full account to a summary
table plus a pointer, so the two do not drift apart.

## Outcome

- ✅ Impact: the mechanism is now explainable without me in the room; the primer answers "why can't I just use 192.168.1.5" before it is asked
- 🧪 Tests: none - documentation only
- 📁 Files: `NETWORK_ACCESS.md` new; `DEPLOYMENT_PLAN.md` condensed
- 🔁 Next prompts: check the fifth wifi, set `ALLOWED_IPS` in Vercel, redeploy, confirm from a blocked network
- 🧠 Reflection: the confusion was never about the code - it was that "the IP of the wifi" sounds like one thing and is actually two. Leading with the two-kinds-of-address distinction, before any mention of the gate, is what made it land

## Evaluation notes (flywheel)

- Failure modes observed: explaining the gate's flow three times without ever explaining what a public IP *is*; the flow was clear each time and the underlying question stayed unanswered
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): consider a short "Access restricted - what to do" entry in the in-app `/docs` Troubleshooting section, for designers rather than maintainers
