"use client";

import { useState, useEffect } from "react";
import { Alert, Icon, Name, Panel, btn, cn } from "./ui";
import type { JobResult, JobStatus } from "./types";
import { agentFetch, agentUrlWithToken } from "@/lib/api";

/* Purely presentational: the backend only reports a message + a percentage,
   so the rail below is derived from that percentage. */
const PHASES = [
  { label: "Upload & parse", from: 0, to: 25 },
  { label: "Preflight checks", from: 25, to: 35 },
  { label: "Illustrator render", from: 35, to: 90 },
  { label: "Package ZIP", from: 90, to: 100 },
];

function PhaseRail({ progress, done }: { progress: number; done: boolean }) {
  return (
    <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {PHASES.map((p) => {
        const complete = done || progress >= p.to;
        const active = !complete && progress >= p.from;
        return (
          <li
            key={p.label}
            className={cn(
              "rounded-lg border px-3 py-2 transition-colors",
              complete
                ? "border-ok/40 bg-ok-soft"
                : active
                  ? "border-brand/50 bg-brand-soft"
                  : "border-line bg-surface-2"
            )}
          >
            <span className="flex items-center gap-1.5">
              <span
                className={cn(
                  "flex h-3.5 w-3.5 items-center justify-center rounded-full",
                  complete ? "bg-ok text-white" : active ? "bg-brand text-white" : "bg-line-strong"
                )}
              >
                {complete && <Icon.Check className="h-2.5 w-2.5" strokeWidth={3} />}
              </span>
              <span
                className={cn(
                  "text-xs font-semibold",
                  complete ? "text-ok-ink" : active ? "text-brand-ink" : "text-faint"
                )}
              >
                {p.label}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard blocked — nothing to recover, the JSON is still on screen */
        }
      }}
      className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs font-semibold text-zinc-300 transition-colors hover:bg-white/10"
    >
      {copied ? <Icon.Check className="h-3 w-3" /> : <Icon.Copy className="h-3 w-3" />}
      {copied ? "Copied" : label}
    </button>
  );
}

function WarningList({ items }: { items: string[] }) {
  return (
    <ul className="custom-scrollbar max-h-52 space-y-1 overflow-y-auto rounded-lg border border-warn/25 bg-warn/5 p-2.5 font-mono text-xs leading-relaxed">
      {items.map((w, i) => (
        <li key={i} className="flex gap-2">
          <span className="text-warn">•</span>
          <span>{w}</span>
        </li>
      ))}
    </ul>
  );
}

export default function ProductionPlan({
  plan,
  onRunningChange,
}: {
  plan: JobResult | null;
  /** Fires whenever this job starts or stops occupying Illustrator, so the
   *  upload form can disable its start button for exactly that window. */
  onRunningChange?: (running: boolean) => void;
}) {
  const [status, setStatus] = useState<JobStatus>({
    message: "Starting...",
    progress: 0,
    is_ready: false,
  });
  const [resuming, setResuming] = useState(false);
  const [showPlan, setShowPlan] = useState(false);

  // The backend pushes; this panel never asks again.
  //
  // One fetch paints the current state, because the stream only speaks when
  // something CHANGES and a job mid-render can sit on the same line for a
  // minute. After that an EventSource carries every update for the rest of the
  // job - no interval, and no 2s lag between a panel finishing and the text
  // saying so.
  useEffect(() => {
    const jobId = plan?.job_id;
    if (!jobId) return;
    let stale = false;

    agentFetch(`/jobs/${jobId}/status`)
      .then((res) => res.json())
      .then((data) => {
        if (!stale) setStatus(data);
      })
      .catch(() => {
        /* the stream delivers it a moment later */
      });

    const source = new EventSource(agentUrlWithToken(`/jobs/${jobId}/stream`));
    source.onmessage = (e) => {
      try {
        setStatus(JSON.parse(e.data));
      } catch {
        /* ignore a malformed frame; the next one supersedes it */
      }
    };
    // Sent once the job is finished or cancelled. Without closing on it,
    // EventSource would treat the ended stream as a dropped connection and
    // reconnect every few seconds forever.
    source.addEventListener("end", () => source.close());
    source.onerror = () => {
      /* a real drop - EventSource retries on its own, nothing to do here */
    };

    return () => {
      stale = true;
      source.close();
    };
  }, [plan?.job_id]);

  const paused =
    status.font_missing ||
    status.center_layer_missing ||
    status.pattern_layer_missing ||
    status.local_tag_missing ||
    status.side_seam_match_layer_missing ||
    status.armhole_match_layer_missing ||
    status.hoodie_layer_missing ||
    status.hood_center_match_layer_missing ||
    status.pattern_piece_missing ||
    status.illustrator_unsaved_work;

  // Mirrors the backend's Illustrator slot exactly: _run_job_locked in main.py
  // releases it on a pre-flight pause too, so a paused job does NOT block a new
  // one. Keeping the two definitions identical means the upload button is
  // disabled for precisely as long as a second start would really be refused.
  //
  // Declared ABOVE the `if (!plan)` return: hooks must run on every render, and
  // `plan` goes from null to set the moment a job starts.
  const running = Boolean(plan?.job_id) && !status.is_ready && !status.cancelled && !paused;
  useEffect(() => {
    onRunningChange?.(running);
  }, [running, onRunningChange]);

  if (!plan) return null;

  const handleDownloadZip = () => {
    window.location.href = agentUrlWithToken(`/jobs/${plan.job_id}/download`);
  };

  const handleCancel = async () => {
    setResuming(true);
    try {
      const res = await agentFetch(`/jobs/${plan.job_id}/cancel`, { method: "POST" });
      if (res.ok) {
        setStatus({ message: "Cancelled by user.", progress: 0, is_ready: false, cancelled: true });
      }
    } catch (e) {
      console.error("Cancel failed", e);
    } finally {
      setResuming(false);
    }
  };

  const handleResume = async (action: "retry" | "continue") => {
    setResuming(true);
    try {
      const res = await agentFetch(`/jobs/${plan.job_id}/resume`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        setStatus({ message: "Resuming automation...", progress: 15, is_ready: false });
      }
    } catch (e) {
      console.error("Resume failed", e);
    } finally {
      setResuming(false);
    }
  };

  const progress = Math.max(0, Math.min(100, Number(status.progress) || 0));

  const state = status.cancelled
    ? { label: "Cancelled", cls: "border-danger/40 bg-danger-soft text-danger-ink" }
    : status.is_ready
      ? { label: "Ready", cls: "border-ok/40 bg-ok-soft text-ok-ink" }
      : paused
        ? { label: "Paused", cls: "border-warn/40 bg-warn-soft text-warn-ink" }
        : { label: "Processing", cls: "border-brand/40 bg-brand-soft text-brand-ink" };

  const stopButton = (
    <button onClick={handleCancel} disabled={resuming} className={btn.danger}>
      <Icon.Stop className="h-3.5 w-3.5" />
      Stop execution
    </button>
  );

  const continueButton = (label: string) => (
    <button onClick={() => handleResume("continue")} disabled={resuming} className={btn.ghost}>
      {label}
    </button>
  );

  return (
    <div className="animate-fade-up mt-8 space-y-5 pb-12">
      <Panel className="overflow-hidden">
        {/* Status header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-surface-2 text-brand">
              <Icon.Layers className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-base font-bold tracking-tight text-ink">Production status</h2>
              <p className="font-mono text-xs text-faint">Job {plan.job_id}</p>
            </div>
            <span
              className={cn(
                "ml-1 rounded-full border px-2.5 py-1 text-2xs font-bold uppercase tracking-wider",
                state.cls
              )}
            >
              {state.label}
            </span>
          </div>

          <button
            onClick={handleDownloadZip}
            disabled={!status.is_ready}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold transition-all",
              status.is_ready
                ? "bg-ok text-white shadow-[0_10px_26px_-12px_var(--ok)] hover:brightness-95"
                : "cursor-not-allowed border border-line bg-surface-2 text-faint"
            )}
          >
            {status.is_ready ? (
              <>
                <Icon.Download className="h-4 w-4" />
                Download print-ready ZIP
              </>
            ) : (
              <>
                <Icon.Clock className="h-4 w-4" />
                Processing…
              </>
            )}
          </button>
        </div>

        {/* Progress */}
        <div className="space-y-4 px-5 py-5 sm:px-6">
          <div className="flex items-end justify-between gap-4">
            <p
              className={cn(
                "flex items-center gap-2 text-sm font-medium",
                paused ? "text-warn-ink" : status.is_ready ? "text-ok-ink" : "text-brand-ink"
              )}
            >
              {!status.is_ready && !paused && !status.cancelled && (
                <span className="h-2 w-2 animate-pulse-ring rounded-full bg-brand" />
              )}
              {status.message}
            </p>
            <span className="font-mono text-sm font-bold tabular-nums text-ink">{progress}%</span>
          </div>

          <div className="relative h-2.5 w-full overflow-hidden rounded-full border border-line bg-surface-3">
            <div
              className={cn(
                "relative h-full rounded-full transition-all duration-500 ease-out",
                status.cancelled
                  ? "bg-danger"
                  : status.is_ready
                    ? "bg-ok"
                    : paused
                      ? "bg-warn"
                      : "animate-sheen overflow-hidden bg-gradient-to-r from-brand to-accent"
              )}
              style={{ width: `${progress}%` }}
            />
          </div>

          <PhaseRail progress={progress} done={!!status.is_ready} />
        </div>
      </Panel>

      {/* ---------------------------------------------------- pause states */}

      {status.font_missing && (
        <Alert
          tone="warn"
          title="Missing fonts . Automation paused"
          actions={
            <>
              <button
                onClick={() => handleResume("retry")}
                disabled={resuming}
                className={btn.success}
              >
                <Icon.Refresh className="h-3.5 w-3.5" />
                I&apos;ve installed them, run again
              </button>
              {continueButton("Continue with default font anyway")}
            </>
          }
        >
          <p>
            These fonts are used in the mockup, but they are{" "}
            <strong>not installed on this PC</strong> and were{" "}
            <strong>not found in the fonts you uploaded</strong>. If you continue without them,
            Illustrator will silently replace them with a default font and the design will not
            match the mockup.
          </p>
          <WarningList items={status.missing_fonts || []} />
          <p className="text-xs opacity-80">
            Recommended: install the fonts above on this PC first, then click &quot;Run
            again&quot;.
          </p>
        </Alert>
      )}

      {status.center_layer_missing && (
        <Alert
          tone="warn"
          title={
            <>
              Center Match is checked, but no <Name>Center</Name> layer was found . Automation
              paused
            </>
          }
          actions={
            <>
              {continueButton("Continue without Center Match")}
              {stopButton}
            </>
          }
        >
          <p>
            Full Button Jersey → Center Match is checked, but no object in the test print (mockup)
            is named <Name>Center</Name>. Without that exact name, the automation cannot find the
            shared design that crosses the Front-Left/Front-Right seam, so it will render each
            side&apos;s design as-is, without centering it across the 2.25in placket overlap.
          </p>
          <p className="text-xs opacity-80">
            Recommended: open the mockup in Illustrator, name the shared seam-crossing design
            object exactly <Name>Center</Name>, then upload a new job. This job&apos;s mockup file
            can&apos;t be swapped from here. Continuing will render it uncentered, using whatever
            position it already has.
          </p>
        </Alert>
      )}

      {status.pattern_layer_missing && (
        <Alert
          tone="warn"
          title={
            <>
              Pattern Match is checked, but no <Name>Pattern</Name> layer was found . Automation
              paused
            </>
          }
          actions={
            <>
              {continueButton("Continue without Pattern Match")}
              {stopButton}
            </>
          }
        >
          <p>
            Full Button Jersey → Pattern seam match is checked, but no object in the test print
            (mockup) is named <Name>Pattern</Name>. Without that exact name, the automation cannot
            find the striped/background design to shift for seam continuity, so it will render
            each side&apos;s pattern as-is, without correcting it across the 2.25in placket
            overlap.
          </p>
          <p className="text-xs opacity-80">
            Recommended: open the mockup in Illustrator, name the striped/background pattern group
            exactly <Name>Pattern</Name> (same name on both Front Left and Front Right), then
            upload a new job.
          </p>
        </Alert>
      )}

      {status.local_tag_missing && (
        <Alert
          tone="warn"
          title={
            <>
              LOCAL TAG is checked, but no <Name>LOCAL TAG</Name>/<Name>SIZE</Name> layer was found
              . Automation paused
            </>
          }
          actions={
            <>
              {continueButton("Continue without LOCAL TAG")}
              {stopButton}
            </>
          }
        >
          <p>
            The LOCAL TAG checkbox is on, but the test print (mockup) has no group named exactly{" "}
            <Name>LOCAL TAG</Name> with a text frame named <Name>SIZE</Name> inside it. Without
            both exact names, the automation cannot personalize the size letter or resize the
            tag&apos;s box (3in adult / 2.5in youth), so it would leave every tag exactly as drawn
            in the mockup.
          </p>
          <p className="text-xs opacity-80">
            Recommended: open the mockup in Illustrator, name the tag group{" "}
            <Name>LOCAL TAG</Name> and its size-letter text frame <Name>SIZE</Name>, then upload a
            new job. Continuing will render every size tag unpersonalized and unresized.
          </p>
        </Alert>
      )}

      {status.side_seam_match_layer_missing && (
        <Alert
          tone="warn"
          title="Side-Seam Match is checked, but no matching layer pair was found . Automation paused"
          actions={
            <>
              {continueButton("Continue without Side-Seam Match")}
              {stopButton}
            </>
          }
        >
          <p>
            The test print (mockup) has none of the required name pairs: either{" "}
            <Name>Front side match</Name> + <Name>Back side match</Name> (one seam), or{" "}
            <Name>Front Left side match</Name> + <Name>Back Right side match</Name> /{" "}
            <Name>Front Right side match</Name> + <Name>Back Left side match</Name> (explicit
            sides). Without one of these, the automation cannot find the shared design to center
            across the 14mm side-seam overlap, so Front and Back render unmatched.
          </p>
          <p className="text-xs opacity-80">
            Recommended: open the mockup in Illustrator, name the shared seam-crossing design
            object with one of the pairs above, then upload a new job.
          </p>
        </Alert>
      )}

      {status.armhole_match_layer_missing && (
        <Alert
          tone="warn"
          title={
            <>
              Armhole Side Sleeve Matching is checked, but no <Name>armhole match</Name> layer was
              found . Automation paused
            </>
          }
          actions={
            <>
              {continueButton("Continue without Armhole Matching")}
              {stopButton}
            </>
          }
        >
          <p>
            The test print (mockup)&apos;s Back view has no group named{" "}
            <Name>armhole match</Name> containing at least one <Name>unit 1</Name>-style item.
            Without that exact naming, the automation cannot find the design(s) to align across the
            armhole seam, so every sleeve will render as-is, unmatched.
          </p>
          <p className="text-xs opacity-80">
            Recommended: open the mockup in Illustrator, group the Back panel&apos;s right-side
            design as <Name>armhole match</Name> with each piece inside named <Name>unit 1</Name>,{" "}
            <Name>unit 2</Name>, etc. (or <Name>unit left 1</Name>/<Name>unit right 1</Name> if the
            two sides differ), then upload a new job.
          </p>
        </Alert>
      )}

      {status.hoodie_layer_missing && (
        <Alert
          tone="warn"
          title="Hoodie is checked, but a required layer is missing . Automation paused"
          actions={
            <>
              {continueButton("Continue without Hoodie parts")}
              {stopButton}
            </>
          }
        >
          <p>
            Either the pattern file is missing a <Name>Hood</Name> group (with <Name>Left</Name>/
            <Name>Right</Name> children), a <Name>Pocket</Name>, or a <Name>Border</Name>, or the
            mockup is missing an <Name>Outside Hood</Name> / <Name>Inside Hood</Name> group (each
            with Left/Right children) or a <Name>Border</Name> design group. Without these exact
            names, the automation cannot build the Outside Hood, Inside Hood, Border or Pocket for
            this job.
          </p>
          <p className="text-xs opacity-80">
            Recommended: open the pattern and mockup in Illustrator, add the missing group(s) with
            the exact names above, then upload a new job. Continuing renders the normal
            Front/Back/Sleeve flow only, without any Hoodie parts.
          </p>
        </Alert>
      )}

      {status.hood_center_match_layer_missing && (
        <Alert
          tone="warn"
          title="Hood center design match is checked, but a required layer is missing . Automation paused"
          actions={
            <>
              {continueButton("Continue without hood center match")}
              {stopButton}
            </>
          }
        >
          <p>
            The mockup&apos;s <Name>Outside Hood</Name> group needs the shared design named{" "}
            <Name>Center</Name> inside its <Name>Right</Name> half and <Name>Center</Name> inside
            its <Name>Left</Name> half, the same short word on both. Without that name, in those
            exact halves, there is nothing to join across the hood&apos;s center seam and the
            option would silently do nothing for every size.
          </p>
          <p className="text-xs opacity-80">
            Recommended: open the mockup in Illustrator, name the seam-crossing artwork in each
            Outside Hood half as above, then upload a new job. Continuing builds the Hoodie
            normally (Outside Hood, Inside Hood, Border and Pocket), but leaves the hood&apos;s
            center design unmatched.
          </p>
        </Alert>
      )}

      {status.illustrator_unsaved_work && (
        <Alert
          tone="warn"
          title={`Illustrator has ${status.unsaved_documents?.length ?? 0} unsaved document${
            (status.unsaved_documents?.length ?? 0) > 1 ? "s" : ""
          } open . Automation paused`}
          actions={
            <>
              <button
                onClick={() => handleResume("retry")}
                disabled={resuming}
                className={btn.success}
              >
                <Icon.Refresh className="h-3.5 w-3.5" />
                I&apos;ve saved my work, check again
              </button>
              {continueButton("Close without saving anyway")}
              {stopButton}
            </>
          }
        >
          <p>
            Every job starts from a freshly launched Illustrator, so it{" "}
            <strong>closes the one already running without saving</strong>. These documents have
            unsaved changes and would be lost:
          </p>
          <WarningList items={status.unsaved_documents || []} />
          <p className="text-xs opacity-80">
            Nothing has been closed yet &mdash; the job stopped before touching Illustrator. Save
            them (or close them yourself), then click &quot;Check again&quot;.
          </p>
        </Alert>
      )}

      {status.pattern_piece_missing && (
        <Alert
          tone="warn"
          title={`${status.missing_pattern_pieces?.length ?? 0} pattern piece${
            (status.missing_pattern_pieces?.length ?? 0) > 1 ? "s" : ""
          } from the order ${
            (status.missing_pattern_pieces?.length ?? 0) > 1 ? "were" : "was"
          } not found in the pattern file . Automation paused`}
          actions={
            <>
              {continueButton("Continue without these pieces")}
              {stopButton}
            </>
          }
        >
          <p>
            The order sheet asks for these panels, but the pattern file has no group with that
            name. The name the automation looks for is built from the row&apos;s size and part, e.g.
            size <Name>2XL</Name> + part <Name>front</Name> → <Name>2XL Front</Name>.
          </p>
          <WarningList items={status.missing_pattern_pieces || []} />
          <p className="text-xs opacity-80">
            Recommended: open the pattern file in Illustrator, check the spelling of these group
            names (spaces and capitals don&apos;t matter, the words do), then upload a new job.
            Continuing renders everything else and simply leaves these pieces out of the order
            file.
          </p>
        </Alert>
      )}

      {status.cancelled && (
        <Alert tone="muted" title="Job cancelled. No files were generated.">
          <p>Fix the mockup/test print and start a new job from the upload form.</p>
        </Alert>
      )}

      {/* ------------------------------------------- end-of-job warnings */}

      {Array.isArray(status.warnings) && status.warnings.length > 0 && (
        <Alert
          tone="warn"
          title={`Side sleeve matching skipped on ${status.warnings.length} part${
            status.warnings.length > 1 ? "s" : ""
          }`}
        >
          <p>
            These parts were rendered <strong>without matching</strong>, so please check them
            manually before printing.
          </p>
          <WarningList items={status.warnings} />
          <p className="text-xs opacity-80">
            Full details are inside the ZIP: <code>sleeve_match_warnings.txt</code> and{" "}
            <code>debug_log.txt</code>.
          </p>
        </Alert>
      )}

      {Array.isArray(status.back_label_warnings) && status.back_label_warnings.length > 0 && (
        <Alert
          tone="warn"
          title={`Back Label used a fallback position on ${status.back_label_warnings.length} part${
            status.back_label_warnings.length > 1 ? "s" : ""
          }`}
        >
          <p>
            Something needed manual attention on the Back Label for these parts: a fallback
            position, a verification mismatch, or a Match_ clearance that couldn&apos;t be settled.
             Please check them manually before printing.
          </p>
          <WarningList items={status.back_label_warnings} />
          <p className="text-xs opacity-80">
            Full details are inside the ZIP: <code>back_label_warnings.txt</code> and{" "}
            <code>debug_log.txt</code>.
          </p>
        </Alert>
      )}

      {Array.isArray(status.parm_errors) && status.parm_errors.length > 0 && (
        <Alert
          tone="warn"
          title={`PARM error — ${status.parm_errors.length} panel${
            status.parm_errors.length > 1 ? "s" : ""
          } failed, check manually`}
        >
          <p>
            Illustrator raised error <code>1346458189 (&apos;PARM&apos;)</code> while building
            the panels below. Each one was <strong>deleted and rebuilt from scratch 3 times</strong>{" "}
            and still failed.
          </p>
          <p>
            <strong>These panels are not complete.</strong> Colours, clipping, placement or
            matching may be missing. Open each one in the <code>.ai</code> file and finish it by
            hand before printing.
          </p>
          <WarningList items={status.parm_errors} />
          <p className="text-xs opacity-80">
            Full details are inside the ZIP: <code>parm_errors.txt</code> and{" "}
            <code>debug_log.txt</code>.
          </p>
        </Alert>
      )}

      {/* ------------------------------------------------- plan payload */}

      <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-code-bg shadow-[var(--shadow-lift)]">
        <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-4 py-3">
          <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1 font-mono text-xs text-zinc-400">
            production_plan.json
          </span>
          <span className="font-mono text-xs text-zinc-500">
            {Array.isArray(plan.production_plan?.items)
              ? `${plan.production_plan.items.length} items`
              : ""}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <CopyButton text={plan.job_id} label="Job ID" />
            <CopyButton text={JSON.stringify(plan.production_plan, null, 2)} label="Copy JSON" />
            <button
              type="button"
              onClick={() => setShowPlan((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs font-semibold text-zinc-300 transition-colors hover:bg-white/10"
            >
              {showPlan ? "Hide" : "Show"}
            </button>
          </div>
        </div>
        {showPlan && (
          <div className="custom-scrollbar max-h-[320px] overflow-auto px-4 py-3">
            <pre className="font-mono text-xs leading-relaxed text-code-ink">
              {JSON.stringify(plan.production_plan, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
