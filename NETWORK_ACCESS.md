# Network Access

Why the site opens on the office networks and nowhere else, how that is
enforced, and what to do when it needs changing.

Written 2026-08-31. The code is `Frontend/my-app/proxy.ts`.

---

## 0. Why this exists

Three things in this system are reachable over a network. Two were already
locked before today:

| | Reachable at | Locked by |
|---|---|---|
| Cloud API | `apparel-cloud-api-…run.app` | `CLOUD_API_KEY`, constant-time compare |
| Local agent | `127.0.0.1:8765` on the designer's PC | pairing token, loopback bind, `Host` check |
| **The website** | `jns-apparel.vercel.app` (was `apparel-ai-generator.vercel.app` until 2026-09-02) | **nothing — it was a public URL** |

The site being open was not a data leak; there is nothing behind it worth
stealing. It was a **bill and a denial of service**. `/api/plan` attaches
`CLOUD_API_KEY` server-side for whoever asks, so anyone who found the URL could
spend the Gemini quota and leave the designers looking at 503s.

This document is about closing that third row.

---

## 1. How IP addresses actually work

Skip this if it is already familiar. Everything after it depends on it.

### The three words this rests on

**IP — Internet Protocol.** The rulebook every machine on the internet uses to
address and deliver messages. An "IP address" is just an address written in
that format. Two versions are in use: **IPv4**, four numbers like
`39.34.163.45`, and **IPv6**, the longer hexadecimal form like `2a02:1234::1`.
Both appear here, which is why the code handles each.

**ISP — Internet Service Provider.** The company that sells the connection and
physically carries the traffic. PTCL, Jazz and Connect Communications are the
three ISPs in this office. An ISP owns a block of public addresses and **lends**
one to each customer's router. That word — lends — is the whole reason a
network can stop working on its own one morning.

**NAT — Network Address Translation.** Literally: translating one address into
another. It is the router's job of swapping the private address for the public
one as traffic leaves, and swapping it back as replies return.

NAT exists because **IPv4 ran out of addresses.** The format allows about 4.3
billion of them, and there have long been far more devices than that. Rather
than give every phone and PC its own public address, an entire home or office
is put behind a single one and the router keeps track of who asked for what.
That shortage, decades old, is the reason one allowlist entry can cover a whole
office — the constraint turned out to be convenient.

### There are two kinds of address, and only one of them travels

```
        THE OFFICE                                   THE INTERNET
  ┌────────────────────────────────┐
  │  PC-1   192.168.1.5            │
  │  PC-2   192.168.1.6            │          ┌────────────────┐
  │  PC-3   192.168.1.7  ┌───────┐ │          │     VERCEL     │
  │  Phone  192.168.1.8  │ROUTER │─┼─────────►│                │
  │                      └───────┘ │          │ sees ONE       │
  │   ▲ private addresses    ▲   ▲ │          │ address for    │
  │     (room numbers)       │   │ │          │ all of them:   │
  │                          │   │ │          │ 39.34.163.45   │
  │           inside face ───┘   └─── outside face             │
  │           192.168.1.1        39.34.163.45                  │
  └────────────────────────────────┘          └────────────────┘
```

A **private address** — `192.168.x.x`, `10.x.x.x` — is a room number. It means
something inside one building and nothing outside it. Every office on earth has
a `192.168.1.5`; they do not collide because none of them ever leaves home.

A **public address** — `39.34.163.45` — is the street address of the building.
There is exactly one of it in the world.

### The router has two faces, and swaps one for the other

When PC-1 asks Vercel for a page, the router strips the private address off the
request, writes its own public address on instead, and notes in a table that
the reply belongs to `192.168.1.5`. When the reply comes back it consults the
table and hands it to the right machine. This is **NAT**.

> An office switchboard works the same way. Twenty people, twenty extensions,
> one number the outside world can dial. The receptionist remembers which call
> belongs to which extension.

### Two consequences, and the whole design rests on them

**① A website never sees a private address.** `192.168.1.5` does not survive
the router. Putting it in an allowlist would accomplish nothing — the value
being compared against never arrives.

**② Every device behind one router shares one public address.** Two PCs or
twenty, one wifi band or both, a repeater or a mesh node — all of it leaves
through the same public address. One allowlist entry covers the lot.

That second point is why this approach is practical at all. It is also why the
unit that matters is the **internet line, not the wifi**: five SSIDs on three
lines need three entries.

### The public address is rented, not owned

It belongs to the ISP, which leases it to the router. A lease can be renewed
with a different value — after a reboot, after an outage, at the ISP's
convenience. That is a **dynamic** IP, and it is what most connections have.

A **static** IP is one the ISP contracts never to change, usually for a fee.

This is the single weakness of everything below: when a lease changes, that
network loses access until the new address is registered.

---

## 2. Where the gate sits

`Frontend/my-app/proxy.ts` runs on Vercel's server before anything else —
before a page renders, before a route handler is reached, before a file is
served.

**The file is named `proxy.ts`, not `middleware.ts`.** Next 16 deprecated the
`middleware` convention and renamed it; the exported function must be called
`proxy`, the file sits beside `app/`, and it runs on the Node.js runtime. This
is not a preference — a file named `middleware.ts` is the deprecated path, and
a function not named `proxy` is not picked up at all.

**There is deliberately no `matcher`.** Without one it runs on *every* request:
pages, `/api/plan`, `_next/static` bundles, and `public/AIApparelAgent.zip`. A
blocked visitor gets nothing at all — not the interface, not the JavaScript,
not the agent installer.

---

## 3. How a request is judged

```
  request arrives
       │
  ┌────▼──────────────────────────────────────────────────────┐
  │ ① Vercel stamps the real public IP onto the request        │
  │    and DISCARDS any the caller sent themselves             │
  ├───────────────────────────────────────────────────────────┤
  │ ② proxy.ts runs                                            │
  ├───────────────────────────────────────────────────────────┤
  │ ③ read the address            proxy.ts:57                  │
  │    x-vercel-forwarded-for → x-real-ip → x-forwarded-for    │
  ├───────────────────────────────────────────────────────────┤
  │ ④ parse it into bytes         proxy.ts:130                 │
  ├───────────────────────────────────────────────────────────┤
  │ ⑤ loopback? 127.0.0.0/8 or ::1/128  → allow   proxy.ts:183 │
  ├───────────────────────────────────────────────────────────┤
  │ ⑥ in ALLOWED_IPS?             proxy.ts:141                 │
  └────┬──────────────────────────────┬───────────────────────┘
      yes                            no
       │                              │
  request proceeds              403 + explanation page
```

### Why the header cannot be faked

Vercel sets `x-forwarded-for`, `x-vercel-forwarded-for` and `x-real-ip` itself.
Its documentation is explicit: *"we currently overwrite the `X-Forwarded-For`
header and do not forward external IPs. This restriction is in place to prevent
IP spoofing."*

So a visitor who sends `x-forwarded-for: 39.34.163.45` does not get in — Vercel
throws their value away before `proxy.ts` ever sees it. **This was tested**: a
request carrying a forged allowed address was still refused.

`x-vercel-forwarded-for` is read first because `x-forwarded-for` is the only one
of the three that a proxy placed in front of Vercel could overwrite.

### Why the address is parsed, not string-compared

One machine can be written several ways. `39.34.163.45` and
`::ffff:39.34.163.45` are the same host; `2a02:1234:0000::1` and `2a02:1234::1`
are the same address. A string comparison sees four different values.

So every address — the visitor's and every allowlist entry — is converted to
its raw bytes and compared numerically.

**This is not theoretical.** The first version of this file compared loopback
as a string against `"127.0.0.1"`. `next start` reports loopback as
`::ffff:127.0.0.1`, so the local dev server refused itself. The test caught it;
reading the code did not.

Parsing is also what makes **CIDR ranges** work: `203.0.113.0/24` matches the
whole range, `2a02:1234:5678::/48` likewise. Useful if an ISP ever moves a
connection around within a block.

### Why loopback is always allowed

`127.0.0.0/8` and `::1/128` pass unconditionally. Vercel always reports a
public address, so nothing from the internet can land in those ranges — and
without the exemption, `npm run dev` locks the developer out of their own
machine.

**A consequence worth knowing:** the gate never fires on `localhost`. Opening
`localhost:3000` works even with `ALLOWED_IPS` empty. Local testing therefore
proves nothing about the gate; see §6 for how to test it properly.

---

## 4. What a blocked visitor gets

| Path | Response |
|---|---|
| A page | `403` and an **Access restricted** HTML page showing the address seen |
| `/api/*` | `403` and JSON, so a `fetch()` gets the shape it expects rather than HTML |
| Both | `Cache-Control: no-store` |

**The page carries its own styling inline.** The gate blocks `_next/static`
too, so a page that linked to a stylesheet would render as bare text.

**`no-store` is not decoration.** Without it the CDN could hand an allowed
visitor's cached page to a blocked one, and a cached `403` would outlive the
`ALLOWED_IPS` change made to clear it.

**The page prints the address on purpose.** That *is* the setup procedure —
§5. The string it shows is exactly what `proxy.ts` compares against, which no
"what is my IP" site can promise. Telling a stranger their own address leaks
nothing; any website can.

---

## 5. Running it

### Where the list lives

| Location | Purpose |
|---|---|
| `Frontend/my-app/.env` | Local development only. **Gitignored** — it never reaches GitHub or Vercel |
| **Vercel → Settings → Environment Variables → `ALLOWED_IPS`** | The real one. This is what the deployed site reads |

Nothing is hardcoded. `proxy.ts:40` reads `process.env.ALLOWED_IPS` and nothing
else, so adding an office is a setting, not a code change.

Format: comma separated, single addresses or CIDR ranges, IPv4 and IPv6.

```
ALLOWED_IPS=39.34.163.45,154.198.107.184,203.0.113.0/24
```

### Adding a network

1. Connect a PC to that wifi.
2. Open the site. The **Access restricted** page prints the address.
   (Or run `Invoke-RestMethod ifconfig.me/ip` — but the page is authoritative.)
3. Append it to `ALLOWED_IPS` in Vercel.
4. **Redeploy.** The value is inlined at build time; changing the setting alone
   does nothing until the site is rebuilt.

If the address printed is already in the list, that wifi shares a line with one
already registered and needs no entry.

### When a network suddenly stops working

Almost always a changed lease. Same procedure: open the site on it, read the
new address off the page, replace the old entry, redeploy. About a minute.

> **Replace the entry. Do not just add the new one.**
>
> A public address is lent, not owned. When a lease ends, the ISP is free to
> hand that same address to **a different customer**. A stale entry left in the
> list keeps admitting whoever holds that address now:
>
> ```
> today      39.34.163.45 → this office        → listed   ✅
>            ↓ the lease changes
> tomorrow   39.34.163.45 → someone else       → still listed  ⚠️
>            this office  → a new address      → locked out
> ```
>
> You end up outside and a stranger ends up inside, and nothing reports it —
> there is no error to notice. The stranger still needs the URL, so this is
> unlikely rather than impossible, but the cost of avoiding it is one deletion.
>
> A **static IP** is the only permanent answer: contracted never to change, and
> never reassigned to anyone else.

### `ALLOWED_IPS` unset

Blocks everything. A forgotten gate must fail shut, not open. The failure is
self-repairing — the page names the address to add.

---

## 6. Testing it

Because loopback is exempt, browsing `localhost` proves nothing. Send the
header a real visitor would arrive with (locally it is not stripped):

```powershell
# expect 403
curl.exe -s -o NUL -w "%{http_code}`n" -H "x-vercel-forwarded-for: 8.8.8.8" http://localhost:3000/

# expect 200
curl.exe -s -o NUL -w "%{http_code}`n" -H "x-vercel-forwarded-for: 39.34.163.45" http://localhost:3000/
```

Restart the dev server after editing `.env`; the value is read at startup.

### What was verified on 2026-08-31

Against a real `next start`, not by reading the code:

| | |
|---|---|
| 12 / 12 | HTTP cases — allowed address, neighbouring address `.46`, `::ffff:` form, IPv6 stranger, unparseable input, `/docs`, static asset, installer zip |
| 8 / 8 | CIDR cases — IPv4 `/24` and IPv6 `/48`, including both boundaries |
| ✅ | Forged `x-forwarded-for` carrying an allowed address — still refused |
| ✅ | `/api/plan` from a blocked network returns JSON, not HTML |
| ✅ | The address is HTML-escaped before being written into the page |
| ✅ | `next build` clean, `ƒ Proxy (Middleware)` registered, `eslint` clean |

The loopback bug in §3 was found by case 5 of the twelve.

---

## 7. The networks

| SSID | Address | ISP |
|---|---|---|
| `J&S Marketing` | `39.34.163.45` | AS132165 Connect Communications |
| `J&S 2.4GHZ` | `39.34.163.45` | the other band of that same router |
| `Jazznet1` | `154.198.107.184` | AS45669 PMCL / Jazz |
| `PTCL FF` | `39.53.236.91` | AS17557 PTCL |
| *one more* | to be checked | |

Five wifis, three lines, three entries.

---

## 8. What this costs, stated plainly

- **A changed lease locks a network out.** Three lines is three chances of it.
  The fix is a minute, but it is a minute of someone noticing first. Static IPs
  from each ISP would end this permanently.
- **A released address can be handed to someone else.** The addresses are the
  ISP's, on loan. An entry left in the list after that network moved on will
  admit whichever customer holds it next — silently, with no error anywhere.
  This is the one failure here that is worse than an outage, because an outage
  announces itself. Always *replace* a changed entry, never merely add to it.
- **It gates by address, never by ISP.** The ISP names recorded in §7 are notes
  for a human deciding whether a line is likely to be stable; `proxy.ts` has no
  idea who provides a connection. Filtering by ISP is not an option anyway —
  allowing "PTCL" would allow several million Pakistani households.
- **Mobile data, hotspots and working from home are blocked.** Chosen
  deliberately, not an oversight.
- **A shared public address would admit strangers.** If an ISP ever puts this
  connection behind CGNAT, the entry covers other customers too. To check: if
  the router's own WAN address is `100.64.x.x` or private while `ifconfig.me`
  reports something else, the address is shared.
- **An access-code fallback was declined.** A one-time code in a signed cookie
  would survive a lease change and allow work from home. It was considered and
  rejected in favour of IP-only. Reopen it only if lease changes become
  frequent enough to be a nuisance.

## 9. The other abbreviations used here

| | Stands for | What it actually is |
|---|---|---|
| **IP** | Internet Protocol | The addressing rules of the internet. "An IP" is an address written that way |
| **ISP** | Internet Service Provider | The company selling the connection — PTCL, Jazz, Connect Communications. It *lends* the public address to the router |
| **NAT** | Network Address Translation | The router swapping the private address for the public one on the way out, and back on the way in. Exists because IPv4 ran out of addresses |
| **SSID** | Service Set Identifier | The wifi's name — `PTCL FF`, `Jazznet1`. Just a label someone typed into the router; it says nothing about which line it is |
| **WAN** | Wide Area Network | The router's outward-facing side, the one holding the public address. Its opposite is the LAN, the office side |
| **CIDR** | Classless Inter-Domain Routing | The `/24` notation for a whole block of addresses. `203.0.113.0/24` means "all 256 addresses beginning `203.0.113.`" |
| **CGNAT** | Carrier-Grade NAT | The same trick applied a second time, by the ISP, across many customers at once — so one public address covers strangers as well as you |
| **CDN** | Content Delivery Network | Vercel's global cache of copies of the site. Relevant here only because a cached page must never be handed to the wrong visitor — hence `no-store` |
| **DoS** | Denial of Service | Making something unusable for its real users. The risk with an open `/plan`: exhaust the quota and the designers get 503s |
| **AS / ASN** | Autonomous System (Number) | An ISP's identifier on the internet. `AS17557` is PTCL. Useful for telling which company an address belongs to |

## 10. Do not put an IP allowlist on Cloud Run

Its only caller is Vercel, and Vercel's egress addresses are not fixed on this
plan. An allowlist there would break the planner for everyone. `CLOUD_API_KEY`
already covers it, and the key never leaves the Vercel server — see
`Frontend/my-app/app/api/plan/route.ts`.
