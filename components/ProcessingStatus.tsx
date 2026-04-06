"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RunStatus } from "@/lib/types";

// Fallback steps shown before the server starts logging
const DEFAULT_STEPS = [
  "Load patient data",
  "Load mechanism context",
  "Aspect embedding",
  "Weighted corpus search",
  "Score computation",
  "Claude synthesis",
  "Store report",
];

export default function ProcessingStatus({ runId }: { runId: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<RunStatus | null>(null);

  useEffect(() => {
    const poll = async () => {
      const res = await fetch(`/api/runs/${runId}/status`);
      if (!res.ok) return;
      const data: RunStatus = await res.json();
      setStatus(data);
      if (data.status === "complete") {
        router.push(`/runs/${runId}/report`);
      }
    };

    poll();
    const interval = setInterval(poll, 2000);
    return () => clearInterval(interval);
  }, [runId, router]);

  // Build step list dynamically from DB log, falling back to defaults
  const loggedSteps = (status?.step_log ?? []).map(s => s.step).filter(s => s !== "Error");
  const knownSteps = loggedSteps.length > 0
    ? Array.from(new Set([...loggedSteps, ...DEFAULT_STEPS.filter(d => !loggedSteps.includes(d))]))
    : DEFAULT_STEPS;

  const completedSteps = new Set(
    (status?.step_log ?? []).filter(s => s.status === "complete").map(s => s.step)
  );
  const runningStep = status?.step_log?.findLast(s => s.status === "running")?.step;
  const stepDetails = Object.fromEntries(
    (status?.step_log ?? []).filter(s => s.detail).map(s => [s.step, s.detail])
  );

  return (
    <div className="max-w-xl mx-auto px-6 py-16 w-full">
      <div className="bg-bg-surface border border-border-subtle rounded-2xl p-8">
        <div className="mb-6">
          <h2 className="text-text-heading font-semibold text-xl mb-1">Analyzing patient</h2>
          <p className="text-text-muted text-sm">Running the phenotyping pipeline…</p>
        </div>

        <div className="space-y-3">
          {knownSteps.map((step) => {
            const done = completedSteps.has(step);
            const running = runningStep === step;

            return (
              <div key={step} className="flex items-center gap-3">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs flex-shrink-0 ${
                  done ? "bg-status-success text-white" :
                  running ? "bg-brand-core text-white" :
                  "bg-nav-item-active-bg text-text-muted"
                }`}>
                  {done ? "✓" : running ? <span className="animate-spin inline-block">⟳</span> : "○"}
                </div>
                <div className="flex-1 min-w-0">
                  <span className={`text-sm ${
                    done ? "text-text-heading" :
                    running ? "text-brand-core font-medium" :
                    "text-text-muted"
                  }`}>
                    {step}
                  </span>
                  {stepDetails[step] && (
                    <span className="text-text-muted text-xs ml-2 truncate">{stepDetails[step]}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {status?.status === "error" && (
          <div className="mt-6 bg-status-danger/12 border border-status-danger rounded-lg p-4 text-status-danger text-sm">
            {status.error_message ?? "An error occurred during processing."}
          </div>
        )}

        {!status || status.status === "queued" ? (
          <p className="mt-6 text-text-muted text-xs">Starting pipeline…</p>
        ) : null}
      </div>
    </div>
  );
}
