"use client";

import { useState } from "react";

export default function UploadForm({ onPlanGenerated }: { onPlanGenerated: (plan: any) => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);

    try {
      const response = await fetch("http://localhost:8000/jobs/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        // Extract the error detail from FastAPI's response
        const errorData = await response.json();
        throw new Error(errorData.detail || "Failed to upload files and generate plan.");
      }

      const data = await response.json();
      onPlanGenerated(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 bg-white p-8 rounded-xl shadow-sm border border-zinc-200">
      <h2 className="text-xl font-bold text-zinc-800">1. Upload Production Files</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-zinc-700">Orders Excel (.xlsx)</label>
          <input 
            type="file" 
            name="excel_file" 
            accept=".xlsx" 
            required 
            className="block w-full text-sm text-zinc-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-zinc-100 file:text-zinc-700 hover:file:bg-zinc-200"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-zinc-700">Design Mockup (.ai)</label>
          <input 
            type="file" 
            name="mockup_ai" 
            accept=".ai" 
            required 
            className="block w-full text-sm text-zinc-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-zinc-100 file:text-zinc-700 hover:file:bg-zinc-200"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-zinc-700">Master Pattern (.ai)</label>
          <input 
            type="file" 
            name="pattern_ai" 
            accept=".ai" 
            required 
            className="block w-full text-sm text-zinc-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-zinc-100 file:text-zinc-700 hover:file:bg-zinc-200"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-zinc-700">Reference Output (.ai)</label>
          <input 
            type="file" 
            name="reference_ai" 
            accept=".ai" 
            required 
            className="block w-full text-sm text-zinc-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-zinc-100 file:text-zinc-700 hover:file:bg-zinc-200"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-zinc-700">Required Fonts (Multiple)</label>
          <input 
            type="file" 
            name="fonts" 
            multiple
            className="block w-full text-sm text-zinc-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-zinc-100 file:text-zinc-700 hover:file:bg-zinc-200"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-zinc-700">Mockup Image (PNG/JPG) <span className="text-blue-600 text-xs">(For AI Vision)</span></label>
          <input 
            type="file" 
            name="mockup_image" 
            accept="image/*" 
            className="block w-full text-sm text-zinc-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-zinc-100 file:text-zinc-700 hover:file:bg-zinc-200"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-zinc-700">Special Instructions</label>
          <input 
            type="text" 
            name="user_instructions" 
            placeholder="e.g. Ensure Pantone 185C is used for Red"
            className="p-2 border border-zinc-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>
      </div>

      {error && <p className="text-red-500 text-sm mt-2">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className={`w-full py-3 px-4 rounded-md font-bold text-white transition-all ${
          loading ? "bg-zinc-400 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700 shadow-md"
        }`}
      >
        {loading ? "Analyzing Files & Generating Plan..." : "Start AI Orchestration"}
      </button>
    </form>
  );
}
