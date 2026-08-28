import type { NextRequest } from "next/server";

/** The browser's only way to reach the cloud planner.
 *
 *  WHY THIS FILE EXISTS: the cloud API needs a key, and a key the browser can
 *  read is not a key. Anything named NEXT_PUBLIC_* is compiled into the
 *  JavaScript that every visitor downloads - it is visible in DevTools, in
 *  "view source", and in the build output. So the browser posts here instead,
 *  to this site's own origin, with no credential at all; this handler runs on
 *  the server, adds the key from a server-only variable, and forwards.
 *
 *  What crosses each hop:
 *
 *    browser  --(Excel + checkboxes, no key)-->  /api/plan
 *    /api/plan --(same body + X-API-Key)------>  CLOUD_API/plan
 *
 *  The .ai files are NOT part of this. They go straight from the browser to
 *  the local agent and never touch a network - see lib/api.ts.
 */

// Node, not Edge: this forwards a multipart body and needs no Edge behaviour.
export const runtime = "nodejs";

// Gemini planning takes roughly 20 s on a real order. The platform default is
// 10 s, which would cut a perfectly good plan in half.
export const maxDuration = 60;

// Server-only on purpose. Renaming either of these to NEXT_PUBLIC_* would undo
// the entire point of this file.
const CLOUD_API = (process.env.CLOUD_API ?? "http://localhost:8000").replace(/\/+$/, "");
const CLOUD_API_KEY = process.env.CLOUD_API_KEY ?? "";

export async function POST(request: NextRequest) {
  const contentType = request.headers.get("content-type");
  if (!contentType?.includes("multipart/form-data")) {
    return Response.json(
      { detail: "Expected a multipart form with the order sheet attached." },
      { status: 400 }
    );
  }

  // Forwarded as raw bytes rather than parsed and rebuilt: re-encoding a
  // FormData changes the multipart boundary and re-orders fields for no gain.
  // The Excel is a few hundred KB, so holding it briefly costs nothing.
  const body = await request.arrayBuffer();

  let upstream: Response;
  try {
    upstream = await fetch(`${CLOUD_API}/plan`, {
      method: "POST",
      headers: {
        "content-type": contentType,
        ...(CLOUD_API_KEY ? { "x-api-key": CLOUD_API_KEY } : {}),
      },
      body,
    });
  } catch {
    // The cloud being unreachable is an operational fact, not a bug in the
    // order sheet - say so, rather than letting a generic 500 imply the
    // designer did something wrong.
    return Response.json(
      { detail: "The planning service is not reachable. Try again in a moment." },
      { status: 502 }
    );
  }

  // Pass the upstream body through untouched, including its error detail: the
  // backend already writes messages meant for a designer to read.
  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: {
      "content-type": upstream.headers.get("content-type") ?? "application/json",
    },
  });
}
