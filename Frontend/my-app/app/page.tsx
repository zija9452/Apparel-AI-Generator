"use client";

import { useState } from "react";
import UploadForm from "@/components/UploadForm";
import ProductionPlan from "@/components/ProductionPlan";

export default function Home() {
  const [jobResult, setJobResult] = useState<any>(null);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 pb-20">
      {/* Header */}
      <header className="bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 py-6">
        <div className="max-w-5xl mx-auto px-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2 rounded-lg">
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                width="24" height="24" 
                viewBox="0 0 24 24" fill="none" 
                stroke="white" strokeWidth="2.5" 
                strokeLinecap="round" strokeLinejoin="round"
              >
                <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.375 2.625a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4Z" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight text-zinc-900 dark:text-white uppercase">
                Apparel AI <span className="text-blue-600">Generator</span>
              </h1>
              <p className="text-xs font-medium text-zinc-500 uppercase tracking-widest">Production Orchestrator v1.0</p>
            </div>
          </div>
          
          <nav className="hidden md:flex items-center gap-6">
            <span className="text-sm font-medium text-zinc-400">Documentation</span>
            <span className="text-sm font-medium text-zinc-400">Settings</span>
            <div className="h-4 w-px bg-zinc-200 dark:bg-zinc-800" />
            <button className="text-sm font-bold text-zinc-900 dark:text-white">Sign Out</button>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-6 pt-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
          
          {/* Left Column: Instructions */}
          <div className="lg:col-span-4 space-y-8">
            <section>
              <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest mb-4">Workflow</h3>
              <ul className="space-y-4">
                {[
                  { step: "01", title: "Upload Data", desc: "Select your Excel orders and AI templates." },
                  { step: "02", title: "AI Analysis", desc: "Agent maps Excel columns to Illustrator layers." },
                  { step: "03", title: "Generate Plan", desc: "A machine-readable production JSON is created." },
                  { step: "04", title: "Illustrator Render", desc: "Run the JSX script to generate production assets." }
                ].map((item) => (
                  <li key={item.step} className="flex gap-4">
                    <span className="text-blue-600 font-black italic">{item.step}</span>
                    <div>
                      <p className="text-sm font-bold text-zinc-800 dark:text-zinc-200">{item.title}</p>
                      <p className="text-xs text-zinc-500">{item.desc}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            <div className="p-4 bg-zinc-100 dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800">
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-tighter mb-2">System Status</p>
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">FastAPI Backend: Online</span>
              </div>
            </div>
          </div>

          {/* Right Column: Interactive Area */}
          <div className="lg:col-span-8">
            <UploadForm onPlanGenerated={setJobResult} />
            <ProductionPlan plan={jobResult} />
          </div>

        </div>
      </main>
    </div>
  );
}
