"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import UploadForm from "@/components/UploadForm";
import ProductionPlan from "@/components/ProductionPlan";
import AgentStatus from "@/components/AgentStatus";
import AppHeader from "@/components/AppHeader";
import { Icon } from "@/components/ui";
import type { JobResult } from "@/components/types";

const STEPS = [
  {
    step: "01",
    title: "Upload data",
    desc: "Order Excel, design mockup (.ai) and the master pattern (.ai).",
    icon: <Icon.Upload className="h-4 w-4" />,
  },
  {
    step: "02",
    title: "AI analysis",
    desc: "Excel columns are mapped to the mockup's layers and sizes.",
    icon: <Icon.Spark className="h-4 w-4" />,
  },
  {
    step: "03",
    title: "Production plan",
    desc: "A machine-readable JSON plan is generated and shown below.",
    icon: <Icon.Sheet className="h-4 w-4" />,
  },
  {
    step: "04",
    title: "Illustrator render",
    desc: "Every piece is built, matched, laid out and exported print-ready.",
    icon: <Icon.Layers className="h-4 w-4" />,
  },
];

export default function Orchestrator() {
  const [jobResult, setJobResult] = useState<JobResult | null>(null);
  // Illustrator builds one order at a time (the backend enforces this with a
  // 409); the form mirrors it so the button is visibly unavailable rather than
  // failing after an upload.
  const [jobRunning, setJobRunning] = useState(false);
  const planRef = useRef<HTMLDivElement>(null);

  // Bring the status panel into view the moment a job starts, since the form
  // is long and the progress bar is otherwise below the fold.
  useEffect(() => {
    if (jobResult?.job_id) {
      planRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [jobResult?.job_id]);

  return (
    <div className="type-up min-h-screen">
      <AppHeader active="app" />

      <main className="mx-auto max-w-7xl px-5 pb-24 pt-10">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-ink sm:text-3xl">
              New production job
            </h1>
            <p className="mt-1.5 text-sm text-muted">
              Attach the three files, tick what this order needs, and start the run.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          {/* Left rail */}
          <aside className="lg:col-span-4">
            <div className="space-y-6 lg:sticky lg:top-24">
              <section>
                <h2 className="mb-4 text-xs font-bold uppercase tracking-[0.18em] text-faint">
                  How a job runs
                </h2>
                <ol className="relative space-y-5 border-l border-dashed border-line pl-6">
                  {STEPS.map((s) => (
                    <li key={s.step} className="relative">
                      <span
                        className="absolute -left-[34px] flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-brand to-accent text-white shadow-[var(--shadow-soft)]"
                      >
                        {s.icon}
                      </span>
                      <p className="flex items-baseline gap-2 text-sm font-semibold text-ink">
                        <span className="font-mono text-xs text-faint">{s.step}</span>
                        {s.title}
                      </p>
                      <p className="mt-0.5 text-xs leading-relaxed text-muted">{s.desc}</p>
                    </li>
                  ))}
                </ol>
              </section>

              <Link
                href="/docs"
                className="group flex items-start gap-3 rounded-2xl border border-line bg-surface p-4 shadow-[var(--shadow-soft)] transition-colors hover:border-brand/50"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-accent text-white">
                  <Icon.Book className="h-4 w-4" />
                </span>
                <span>
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                    Production handbook
                    <Icon.Arrow className="h-3.5 w-3.5 text-brand transition-transform group-hover:translate-x-0.5" />
                  </span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-muted">
                    Nine chapters: required layer names, every option, and what each one does.
                  </span>
                </span>
              </Link>

              <Link
                href="/order-guide"
                className="group flex items-start gap-3 rounded-2xl border border-line bg-surface p-4 shadow-[var(--shadow-soft)] transition-colors hover:border-brand/50"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-brand to-accent text-white">
                  <Icon.Book className="h-4 w-4" />
                </span>
                <span>
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                    Order Excel guide
                    <Icon.Arrow className="h-3.5 w-3.5 text-brand transition-transform group-hover:translate-x-0.5" />
                  </span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-muted">
                    Which columns to keep, how logos are named, and a downloadable template.
                  </span>
                </span>
              </Link>

              <div className="rounded-2xl border border-line bg-surface-2 p-4">
                <p className="flex items-center gap-2 text-xs font-bold text-ink">
                  <Icon.Clock className="h-3.5 w-3.5" />
                  Before you press start
                </p>
                <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-muted">
                  <li>Keep Illustrator closed, the job opens and drives it itself.</li>
                  <li>Layer names in the mockup must match exactly what each option asks for.</li>
                  <li>A full order can take 10 to 15 minutes, the progress bar keeps updating.</li>
                </ul>
              </div>
            </div>
          </aside>

          {/* Work area */}
          <div className="lg:col-span-8">
            {/* Ahead of the form on purpose: if the agent is not running or
                this browser is not paired, nothing below can work, and the
                designer should learn that before attaching three files. */}
            <div className="mb-5">
              <AgentStatus />
            </div>
            <UploadForm onPlanGenerated={setJobResult} jobRunning={jobRunning} />
            <div ref={planRef} className="scroll-mt-24">
              <ProductionPlan plan={jobResult} onRunningChange={setJobRunning} />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
