"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Alert, Icon, Name, btn, cn } from "./ui";
import { fetchAgentHealth, getAgentToken, setAgentToken, type AgentHealth } from "@/lib/api";

/** Is the designer's machine ready to render?
 *
 *  Without this the failure is silent and expensive: they attach three files,
 *  press start, and nothing happens - because the agent is not running, or the
 *  browser was never paired with it. Those two need different fixes, so the
 *  agent reports them separately and this shows the right one.
 */
export default function AgentStatus({
  onReadyChange,
}: {
  onReadyChange?: (ready: boolean) => void;
}) {
  const [health, setHealth] = useState<AgentHealth | null>(null);
  const [checking, setChecking] = useState(true);
  const [tokenInput, setTokenInput] = useState("");
  const [saving, setSaving] = useState(false);

  const check = useCallback(async () => {
    setChecking(true);
    const h = await fetchAgentHealth();
    setHealth(h);
    setChecking(false);
    return h;
  }, []);

  // AUTOMATIC PAIRING. The installer finishes by opening this page with
  // ?agent_token=... , so the designer never sees a token, never copies one and
  // never pastes one - the whole exchange happens on their own machine, between
  // a program they just ran and a page it opened.
  //
  // The token is stripped from the URL immediately, so it does not sit in the
  // address bar, get bookmarked, or ride along if the page is shared. Manual
  // pairing below still exists for the case where someone opens the site on a
  // second browser.
  useEffect(() => {
    const url = new URL(window.location.href);
    const fromInstaller = url.searchParams.get("agent_token");
    if (fromInstaller) {
      setAgentToken(fromInstaller);
      url.searchParams.delete("agent_token");
      window.history.replaceState({}, "", url.toString());
    }
    void check();
  }, [check]);

  const ready = Boolean(health?.paired && health?.illustrator_found && health?.disk_ok !== false);
  useEffect(() => {
    onReadyChange?.(ready);
  }, [ready, onReadyChange]);

  const savePairing = async () => {
    setSaving(true);
    setAgentToken(tokenInput);
    const h = await check();
    setSaving(false);
    if (h?.paired) setTokenInput("");
  };

  /* ------------------------------------------------ agent is not answering */
  if (!checking && !health) {
    return (
      <Alert
        tone="warn"
        title="The agent is not running on this PC"
        actions={
          <>
            <button onClick={() => void check()} className={btn.ghost}>
              <Icon.Refresh className="h-3.5 w-3.5" />
              Check again
            </button>
            <Link href="/home#agent" className={btn.ghost}>
              Get the agent
            </Link>
          </>
        }
      >
        <p>
          Illustrator runs here, on your machine, so a small agent has to be running for a job to
          start. Nothing else on this page will work until it is.
        </p>
        <p className="text-xs opacity-80">
          If you have already installed it, it starts by itself at login — open Task Scheduler and
          start <Name>AI Apparel Agent</Name>, or run <Name>install-agent.ps1</Name> again.
        </p>
      </Alert>
    );
  }

  /* ------------------------------------------- running, but not paired yet */
  if (health && !health.paired) {
    return (
      <Alert tone="warn" title="Pair this browser with your agent">
        <p>
          The agent is running (version {health.version}), but this browser has not been paired with
          it yet. Installing it printed a <strong>pairing token</strong> — paste it here once.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            type="password"
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && tokenInput.trim()) void savePairing();
            }}
            placeholder="Paste the pairing token"
            className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2 font-mono text-sm text-ink outline-none focus:border-brand/60"
          />
          <button
            onClick={() => void savePairing()}
            disabled={!tokenInput.trim() || saving}
            className={btn.success}
          >
            {saving ? "Checking…" : "Pair"}
          </button>
        </div>
        <p className="text-xs opacity-80">
          Lost it? Run{" "}
          <Name>install-agent.ps1 -ShowToken</Name> in the agent folder.
        </p>
      </Alert>
    );
  }

  /* ------------------------------------------------- paired, but not usable */
  if (health?.paired && !health.illustrator_found) {
    return (
      <Alert tone="danger" title="Adobe Illustrator was not found on this PC">
        <p>
          The agent is running and paired, but there is no Illustrator for it to drive. Install
          Illustrator on this machine, then restart the agent.
        </p>
      </Alert>
    );
  }

  if (health?.paired && health.disk_ok === false) {
    return (
      <Alert tone="danger" title={`Only ${health.free_gb} GB free — not enough to run a job`}>
        <p>
          Each order needs about 1 GB, plus room for Illustrator&apos;s scratch space. Clear some
          old order folders from <Name>{health.production_dir ?? "C:\\Production"}</Name> and check
          again.
        </p>
      </Alert>
    );
  }

  /* ------------------------------------------------------------- all good */
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-ok/40 bg-ok-soft px-4 py-2.5 text-xs">
      <span className="flex items-center gap-2 font-bold text-ok-ink">
        <span className="h-2 w-2 rounded-full bg-ok" />
        Agent ready
      </span>
      <span className="text-muted">v{health?.version}</span>
      {typeof health?.free_gb === "number" && (
        <span className={cn("text-muted", health.free_gb < 20 && "font-semibold text-warn-ink")}>
          {health.free_gb} GB free
          {health.free_gb < 20 && " — clear some old orders soon"}
        </span>
      )}
      {health?.running_job_id && (
        <span className="font-semibold text-brand-ink">
          rendering {health.running_job_id}
        </span>
      )}
    </div>
  );
}
