/** The two backends this app talks to, and the token that unlocks one of them.
 *
 *  PLAN    the planning half - Excel in, plan out. The browser does NOT call
 *          the cloud directly: it posts to this site's own /api/plan, which
 *          adds the API key server-side. See app/api/plan/route.ts for why a
 *          key in the browser is not a key at all. There is deliberately no
 *          NEXT_PUBLIC_CLOUD_API here any more.
 *  AGENT   the rendering half, on this designer's own PC. Everything big goes
 *          here: the 135MB pattern, the mockup, and the ~334MB zip that comes
 *          back. None of it ever touches the network.
 *
 *  The agent URL stays localhost by definition - it IS the machine the browser
 *  is running on - so it works with nothing configured.
 */
export const PLAN_API = "/api/plan";
export const AGENT_API = process.env.NEXT_PUBLIC_AGENT_URL ?? "http://localhost:8765";

const TOKEN_KEY = "aiApparelAgentToken";

export function getAgentToken(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(TOKEN_KEY) ?? "";
  } catch {
    return ""; // storage blocked - treat as unpaired
  }
}

export function setAgentToken(token: string): void {
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token.trim());
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* nothing useful to do - the next call will simply be unauthorised */
  }
}

/** Calls the agent with the pairing token attached. */
export function agentFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = getAgentToken();
  return fetch(`${AGENT_API}${path}`, {
    ...init,
    headers: { ...(init.headers ?? {}), ...(token ? { "X-Agent-Token": token } : {}) },
  });
}

/** A full agent URL with the token in the query string.
 *
 *  Only for EventSource and for download navigations - neither can send a
 *  header. See QUERY_TOKEN_SUFFIXES in Agent/main.py for why that is safe on
 *  these two routes and nowhere else. */
export function agentUrlWithToken(path: string): string {
  const token = getAgentToken();
  const sep = path.includes("?") ? "&" : "?";
  return `${AGENT_API}${path}${token ? `${sep}token=${encodeURIComponent(token)}` : ""}`;
}

export type AgentHealth = {
  agent?: string;
  version?: string;
  paired?: boolean;
  illustrator_found?: boolean;
  free_gb?: number | null;
  disk_ok?: boolean;
  running_job_id?: string | null;
  production_dir?: string;
};

/** Health, or null when the agent is not answering at all.
 *
 *  The distinction matters: "not running" and "running but not paired" need
 *  different advice, and only the agent can tell them apart - it answers this
 *  one route without a token precisely so the site can ask. */
export async function fetchAgentHealth(): Promise<AgentHealth | null> {
  try {
    const res = await agentFetch("/agent/health");
    if (!res.ok) return null;
    return (await res.json()) as AgentHealth;
  } catch {
    return null;
  }
}
