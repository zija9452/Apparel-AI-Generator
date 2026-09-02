/** The front door: only the office networks get past this file - when it is
 *  switched on. IT IS CURRENTLY SWITCHED OFF; see IP_GATE below.
 *
 *  WHY IT EXISTS. The other two halves of this system are already locked:
 *  Cloud Run sits behind CLOUD_API_KEY, and the agent behind a pairing token
 *  on loopback. The Vercel site was the one door still standing open - and
 *  behind it is /api/plan, which attaches CLOUD_API_KEY server-side and spends
 *  real Gemini quota on every call. The loss from an open site is not data,
 *  there is none worth taking; it is that a stranger who found the URL could
 *  burn all five keys in an afternoon and leave the designers on 503s.
 *
 *  WHAT IT DOES. Compares the visitor's public IP against ALLOWED_IPS and
 *  serves 403 to everyone else. There is deliberately NO `matcher`, so this
 *  runs on every request in the project: pages, /api, _next/static, and the
 *  agent installer in public/. A stranger gets nothing at all, which is what
 *  was asked for.
 *
 *  WHY IP IS ENOUGH HERE, and what it costs. Every PC behind one router shares
 *  that router's single public IP, so one entry covers a whole office. The
 *  price is that the entry is only as stable as the ISP's lease: if the public
 *  IP changes, everyone on that network is locked out at once, and the fix is
 *  to edit ALLOWED_IPS in Vercel and redeploy. That trade was made knowingly -
 *  see DEPLOYMENT_PLAN.md.
 *
 *  Named proxy.ts, not middleware.ts: Next 16 deprecated the `middleware`
 *  convention and renamed it to `proxy`. The exported function must be called
 *  `proxy`, it lives beside app/, and it runs on the Node.js runtime.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/** The master switch. OFF unless IP_GATE is literally "on".
 *
 *  The gate below is complete and tested, but switched off for now: the office
 *  addresses proved unstable - two of the three lines changed lease overnight
 *  on 2026-09-01, the first working day after this shipped - and locking the
 *  designers out is worse than leaving a site open that has no data behind it.
 *  See AUTH_PLAN.md. None of the code below is deleted, because the intent is
 *  to switch it back on once there is a static IP or an identity check beside
 *  it.
 *
 *  To turn the gate back on: set IP_GATE=on and a current ALLOWED_IPS in
 *  Vercel, then redeploy. Both values are inlined at build time, so a settings
 *  change alone does nothing until the site is rebuilt.
 *
 *  DEFAULT OFF, ON EXPLICIT REQUEST. It is the opposite of the ALLOWED_IPS rule
 *  right below, which fails shut, and the difference is deliberate: an empty
 *  ALLOWED_IPS is somebody forgetting to configure a gate they meant to run,
 *  while an absent IP_GATE is the state this file was deliberately left in. The
 *  cost is stated plainly: if this variable is ever lost in a future
 *  environment migration, the door opens silently rather than shutting loudly.
 */
const GATE_ENABLED = (process.env.IP_GATE ?? "off").trim().toLowerCase() === "on";

/** The networks allowed to use this site, comma separated.
 *
 *  Accepts single addresses and CIDR ranges, IPv4 and IPv6:
 *    ALLOWED_IPS=39.34.163.45,203.0.113.0/24,2a02:1234:5678::/48
 *
 *  Read from the environment rather than hardcoded so adding an office is a
 *  Vercel setting, not a code change. Next inlines process.env at build time,
 *  so a change to this value needs a redeploy to take effect.
 */
const ALLOWED_IPS = (process.env.ALLOWED_IPS ?? "")
  .split(",")
  .map((entry) => entry.trim())
  .filter(Boolean);

/** The visitor's public IP, as Vercel saw it.
 *
 *  All three of these headers are set by Vercel itself and hold the same
 *  value. Vercel's docs are explicit that a caller cannot forge them: "we
 *  currently overwrite the X-Forwarded-For header and do not forward external
 *  IPs. This restriction is in place to prevent IP spoofing." So the value
 *  here is the real address of whoever connected, and an attacker cannot talk
 *  their way past this gate with a header of their own.
 *
 *  x-vercel-forwarded-for is preferred because x-forwarded-for is the only one
 *  of the three that a proxy placed in front of Vercel could overwrite.
 */
function clientIp(request: NextRequest): string {
  const direct =
    request.headers.get("x-vercel-forwarded-for") ??
    request.headers.get("x-real-ip");
  if (direct) return direct.trim();

  // Chain form (a, b, c): the leftmost entry is the original client.
  return (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
}

/** An IPv4 address as its four bytes, or null if it is not one. */
function parseV4(text: string): Uint8Array | null {
  const parts = text.split(".");
  if (parts.length !== 4) return null;

  const bytes = new Uint8Array(4);
  for (let i = 0; i < 4; i++) {
    // Explicit digits-only test: Number(" 12") and Number("0x1") both parse,
    // and neither is a byte of an IP address.
    if (!/^\d{1,3}$/.test(parts[i])) return null;
    const value = Number(parts[i]);
    if (value > 255) return null;
    bytes[i] = value;
  }
  return bytes;
}

/** An IPv6 address as its sixteen bytes, or null if it is not one. */
function parseV6(text: string): Uint8Array | null {
  // A zone id (fe80::1%eth0) is link-local and can never arrive from the
  // internet, but strip it rather than fail on it.
  let addr = text.split("%")[0];

  // A trailing dotted quad (::ffff:203.0.113.9) is legal and stands for the
  // final two groups. Rewrite it into hex so one parser handles both forms.
  const lastColon = addr.lastIndexOf(":");
  if (lastColon !== -1 && addr.slice(lastColon + 1).includes(".")) {
    const quad = parseV4(addr.slice(lastColon + 1));
    if (!quad) return null;
    const high = ((quad[0] << 8) | quad[1]).toString(16);
    const low = ((quad[2] << 8) | quad[3]).toString(16);
    addr = `${addr.slice(0, lastColon + 1)}${high}:${low}`;
  }

  // "::" appears at most once and stands for a run of zero groups.
  const halves = addr.split("::");
  if (halves.length > 2) return null;

  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];

  let groups: string[];
  if (halves.length === 1) {
    // Uncompressed: all eight groups must be spelled out.
    if (head.length !== 8) return null;
    groups = head;
  } else {
    if (head.length + tail.length > 7) return null;
    const zeros = new Array(8 - head.length - tail.length).fill("0");
    groups = [...head, ...zeros, ...tail];
  }

  const bytes = new Uint8Array(16);
  for (let i = 0; i < 8; i++) {
    if (!/^[0-9a-f]{1,4}$/i.test(groups[i])) return null;
    const value = parseInt(groups[i], 16);
    bytes[i * 2] = value >> 8;
    bytes[i * 2 + 1] = value & 0xff;
  }
  return bytes;
}

/** Either family, as bytes. 4 bytes for IPv4, 16 for IPv6. */
function parseIp(text: string): Uint8Array | null {
  // An IPv4-mapped IPv6 address is the same machine as its plain IPv4 form, so
  // collapse it. Otherwise a rule written as 39.34.163.45 would silently fail
  // to match a visitor who arrived as ::ffff:39.34.163.45.
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(text);
  const addr = mapped ? mapped[1] : text;

  return addr.includes(":") ? parseV6(addr) : parseV4(addr);
}

/** Does `ip` fall inside `rule`, which is an address or a CIDR range? */
function ipMatchesRule(ip: Uint8Array, rule: string): boolean {
  const slash = rule.indexOf("/");
  const network = parseIp(slash === -1 ? rule : rule.slice(0, slash));

  // Different lengths means different families - an IPv4 rule must never match
  // an IPv6 visitor, however similar the bytes happen to look.
  if (!network || network.length !== ip.length) return false;

  const totalBits = network.length * 8;
  const prefix = slash === -1 ? totalBits : Number(rule.slice(slash + 1));
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > totalBits) return false;

  const wholeBytes = prefix >> 3;
  for (let i = 0; i < wholeBytes; i++) {
    if (ip[i] !== network[i]) return false;
  }

  // A prefix that stops mid-byte: compare only the bits it covers.
  const spareBits = prefix & 7;
  if (spareBits) {
    const mask = (0xff << (8 - spareBits)) & 0xff;
    if ((ip[wholeBytes] & mask) !== (network[wholeBytes] & mask)) return false;
  }

  return true;
}

function matchesAny(ip: Uint8Array, rules: string[]): boolean {
  return rules.some((rule) => ipMatchesRule(ip, rule));
}

/** The local dev server, which must never be gated.
 *
 *  Written as ranges and matched on the parsed bytes rather than compared as
 *  strings, because the string form varies: `next start` reports loopback as
 *  ::ffff:127.0.0.1, not 127.0.0.1, and a plain equality check silently 403s
 *  your own `npm run dev`. 127.0.0.0/8 rather than a single address for the
 *  same reason - 127.0.0.2 is just as much this machine.
 *
 *  Safe to allow unconditionally: Vercel always reports a public address, so
 *  nothing arriving from the internet can land in these ranges.
 */
const LOOPBACK = ["127.0.0.0/8", "::1/128"];

/** The page a blocked visitor sees.
 *
 *  Self-contained on purpose - every style is inline and there is not one
 *  external asset. This gate blocks _next/static too, so a page that linked to
 *  a stylesheet would render as unstyled text, or nothing at all.
 *
 *  It prints the IP it saw, which is the whole setup procedure: connect a PC
 *  to each office wifi, open the site, and copy the address off this page into
 *  ALLOWED_IPS. That value is authoritative in a way "what is my IP" sites are
 *  not, because it is the exact string this file will compare against. Telling
 *  a stranger their own IP leaks nothing: they can read it off any website.
 */
function deniedPage(ip: string, configured: boolean): string {
  // Escaped even though Vercel guarantees this header is its own and not the
  // caller's. It is a raw request header being written into HTML, which is the
  // shape of an XSS whatever today's platform promises; the guarantee is
  // Vercel's to change, and self-hosting would not carry it at all.
  const shown = (ip || "not detected").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!
  );
  const note = configured
    ? "This device is not on one of the approved office networks."
    : "No networks have been approved yet. Add the address below to ALLOWED_IPS in Vercel, then redeploy.";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Access restricted</title>
<style>
  :root { color-scheme: light dark; }
  body {
    margin: 0; min-height: 100vh; display: grid; place-items: center;
    background: #f3f5fa; color: #0c1220; padding: 24px;
    font: 15px/1.6 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  }
  .card {
    max-width: 30rem; width: 100%; background: #fff; border: 1px solid #e2e8f2;
    border-radius: 14px; padding: 32px;
    box-shadow: 0 1px 2px rgb(15 23 42 / .05), 0 8px 24px -12px rgb(15 23 42 / .15);
  }
  h1 { margin: 0 0 10px; font-size: 1.2rem; letter-spacing: -.01em; }
  p { margin: 0 0 18px; color: #57617a; }
  .ip {
    display: block; padding: 12px 14px; border-radius: 10px;
    background: #0b1020; color: #cbd5f5; font-size: 1.05rem;
    font-family: ui-monospace, "Cascadia Code", Consolas, monospace;
    word-break: break-all; user-select: all;
  }
  .label { font-size: .78rem; text-transform: uppercase; letter-spacing: .07em; color: #8b95ab; margin-bottom: 7px; }
  @media (prefers-color-scheme: dark) {
    body { background: #080b12; color: #e9edf7; }
    .card { background: #0f141f; border-color: #212b3d; }
    p { color: #9aa5bd; }
    .label { color: #74809a; }
  }
</style>
</head>
<body>
  <main class="card">
    <h1>Access restricted</h1>
    <p>${note}</p>
    <div class="label">Your network address</div>
    <code class="ip">${shown}</code>
  </main>
</body>
</html>`;
}

export function proxy(request: NextRequest) {
  // Switched off: every request passes untouched, and nothing below runs. No
  // 403 page, no JSON refusal, no trace of any of this in the browser - the
  // site behaves exactly as it did before this file existed.
  if (!GATE_ENABLED) return NextResponse.next();

  const ip = clientIp(request);

  // No address at all: nothing to gate against, and nothing that could have
  // reached here over the internet.
  if (!ip) return NextResponse.next();

  // An address we cannot parse is an address we cannot vouch for, so it falls
  // through to the block below rather than being waved past.
  const parsed = parseIp(ip);

  if (parsed && matchesAny(parsed, LOOPBACK)) {
    return NextResponse.next();
  }

  if (parsed && ALLOWED_IPS.length > 0 && matchesAny(parsed, ALLOWED_IPS)) {
    return NextResponse.next();
  }

  // An unset ALLOWED_IPS blocks everything rather than allowing everything.
  // Forgetting to configure a gate must not quietly leave the door open, and
  // this failure is self-repairing: the page names the address to add.
  const headers = {
    // Never cached. Without this the CDN could hand an allowed visitor's
    // response to a blocked one, or the reverse - and a cached 403 would
    // outlive the ALLOWED_IPS change meant to fix it.
    "cache-control": "no-store, max-age=0",
  };

  // The site's own API answers JSON everywhere else; a block should not be the
  // one place a fetch() gets HTML back and fails to parse it.
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json(
      { detail: `This network is not approved to use the planner. Address seen: ${ip}` },
      { status: 403, headers }
    );
  }

  return new NextResponse(deniedPage(ip, ALLOWED_IPS.length > 0), {
    status: 403,
    headers: { ...headers, "content-type": "text/html; charset=utf-8" },
  });
}

// No `matcher` on purpose. Without one this runs on EVERY request - including
// _next/static, _next/image and public/ - which is exactly the requirement: a
// blocked visitor gets no pages, no JavaScript, and no agent installer.
