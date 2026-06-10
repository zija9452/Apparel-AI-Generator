"use client";

import { useState, useEffect } from "react";

export default function ProductionPlan({ plan }: { plan: any }) {
  const [status, setStatus] = useState({ message: "Starting...", progress: 0, is_ready: false });
  
  // Polling to check detailed status
  useEffect(() => {
    if (!plan?.job_id) return;

    const checkStatus = async () => {
      try {
        const res = await fetch(`http://localhost:8000/jobs/status/${plan.job_id}`);
        const data = await res.json();
        setStatus(data);
      } catch (e) {
        console.error("Checking status failed", e);
      }
    };

    const interval = setInterval(checkStatus, 2000); // Check every 2 seconds for real-time feedback
    return () => clearInterval(interval);
  }, [plan?.job_id]);

  if (!plan) return null;

  const handleDownloadZip = () => {
    window.location.href = `http://localhost:8000/jobs/download/${plan.job_id}`;
  };

  return (
    <div className="mt-8 space-y-6 animate-in fade-in duration-500 pb-12">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-zinc-800">2. Production Status</h2>
          <button
            onClick={handleDownloadZip}
            disabled={!status.is_ready}
            className={`px-6 py-2 rounded-md font-bold text-sm transition-all shadow-md flex items-center gap-2 ${
              status.is_ready 
                ? "bg-green-600 hover:bg-green-700 text-white cursor-pointer" 
                : "bg-zinc-200 text-zinc-400 cursor-not-allowed"
            }`}
          >
            <span>{status.is_ready ? "📥 Download Ready-to-Print Files (ZIP)" : "⏳ Processing... Please Wait"}</span>
          </button>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-zinc-100 rounded-full h-2.5 overflow-hidden border border-zinc-200">
          <div 
            className="bg-blue-600 h-full transition-all duration-500 ease-out" 
            style={{ width: `${status.progress}%` }}
          ></div>
        </div>
        <p className="text-sm font-medium text-blue-600 animate-pulse">{status.message}</p>
      </div>

      <div className="bg-zinc-900 rounded-xl p-6 overflow-hidden border border-zinc-800 shadow-xl">
        <div className="flex items-center gap-4 mb-4">
          <div className="bg-zinc-800 px-3 py-1 rounded text-xs text-zinc-400 font-mono border border-zinc-700">Job ID: {plan.job_id}</div>
          <div className={`px-3 py-1 rounded text-xs font-bold uppercase tracking-wider border ${
            status.is_ready ? "bg-green-900/30 text-green-400 border-green-800" : "bg-blue-900/30 text-blue-400 border-blue-800"
          }`}>
            {status.is_ready ? "READY" : "PROCESSING"}
          </div>
        </div>
        
        <div className="max-h-[250px] overflow-y-auto custom-scrollbar border-t border-zinc-800 pt-4">
          <pre className="text-[10px] text-zinc-500 font-mono">
            {JSON.stringify(plan.production_plan, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  );
}
