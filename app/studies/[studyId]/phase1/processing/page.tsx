"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, useParams } from "next/navigation";

interface StepLog {
  step: string;
  status: "pending" | "running" | "complete" | "error";
  ts: string;
  detail?: string;
}

interface RunStatus {
  status: "queued" | "processing" | "complete" | "error";
  step_log: StepLog[];
  error_message?: string;
}

const STEP_ICONS: Record<string, string> = {
  "Load study data": "📋",
  "Load mechanism context": "🔬",
  "Aspect embedding": "🧮",
  "Weighted corpus search": "🔍",
  "Bayesian prior computation": "∑",
  "Phenotype synthesis (Opus)": "🤖",
  "Store report": "💾",
  "Error": "❌",
};

const ALL_STEPS = [
  "Load study data",
  "Load mechanism context",
  "Aspect embedding",
  "Weighted corpus search",
  "Bayesian prior computation",
  "Phenotype synthesis (Opus)",
  "Store report",
];

export default function Phase1ProcessingPage() {
  const router = useRouter();
  const params = useParams();
  const studyId = params.studyId as string;

  const [runStatus, setRunStatus] = useState<RunStatus | null>(null);
  const [dots, setDots] = useState("");
  const isFirstFetch = useRef(true);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/studies/${studyId}/phase1-status`);
      if (!res.ok) return;
      const data: RunStatus = await res.json();
      setRunStatus(data);

      if (data.status === "complete") {
        // If already complete on first load, redirect immediately
        // If it just finished during polling, give 800ms to show the completion animation
        const delay = isFirstFetch.current ? 0 : 800;
        setTimeout(() => {
          router.push(`/studies/${studyId}/phase1/report`);
        }, delay);
      }

      isFirstFetch.current = false;
    } catch {
      // silent — will retry
    }
  }, [studyId, router]);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 2500);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  // Animated dots — only while processing
  useEffect(() => {
    const t = setInterval(() => setDots((d) => (d.length >= 3 ? "" : d + ".")), 400);
    return () => clearInterval(t);
  }, []);

  const stepLog = runStatus?.step_log ?? [];

  // Build display steps — merge logged steps with the expected list
  const displaySteps = ALL_STEPS.map((name) => {
    const logged = stepLog.find((s) => s.step === name);
    return logged ?? { step: name, status: "pending" as const, ts: "" };
  });

  // Find the currently running step for the pulsing label
  const runningStep = stepLog.findLast?.((s: StepLog) => s.status === "running");
  const completeCount = stepLog.filter((s) => s.status === "complete").length;
  const progress = Math.round((completeCount / ALL_STEPS.length) * 100);

  const isComplete = runStatus?.status === "complete";
  const isError = runStatus?.status === "error";

  // ── Complete state ──────────────────────────────────────────────────────────
  if (isComplete) {
    return (
      <div className="max-w-2xl mx-auto px-8 py-16 flex flex-col items-center text-center">
        {/* Success icon */}
        <div className="w-16 h-16 rounded-full bg-[#0A1A0A] border-2 border-[#22C55E] flex items-center justify-center mb-6">
          <svg className="w-8 h-8 text-[#22C55E]" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
        </div>

        <p className="text-[#22C55E] text-xs uppercase tracking-widest mb-2">Phase 1 — Preclinical</p>
        <h1 className="text-2xl font-bold text-[#F0F4FF] mb-3">Processing Complete</h1>
        <p className="text-[#8BA3C7] text-sm mb-8 max-w-md">
          The pre-clinical corpus analysis has finished. Your phenotype profiles, biomarker protocol, and cross-species evidence are ready.
        </p>

        {/* CTA */}
        <a
          href={`/studies/${studyId}/phase1/report`}
          className="flex items-center gap-2 px-6 py-3 bg-[#4F8EF7] text-white font-semibold text-sm rounded-xl hover:bg-[#3A7AE8] transition-colors"
        >
          View Report
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M3 7h8M7 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </a>

        {/* Completed steps summary */}
        <div className="mt-10 w-full space-y-1.5">
          {displaySteps.map((step) => {
            const icon = STEP_ICONS[step.step] ?? "⚙️";
            return (
              <div key={step.step} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-[#0A1628] border border-[#1E3A5F]">
                <svg className="w-3.5 h-3.5 text-[#22C55E] flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                <span className="text-sm">{icon}</span>
                <span className="text-sm text-[#8BA3C7]">{step.step}</span>
              </div>
            );
          })}
        </div>

        <p className="text-[#4A6580] text-xs mt-6">
          Powered by Claude Opus · Headlamp Corpus · OpenAI Embeddings
        </p>
      </div>
    );
  }

  // ── In-progress / error state ───────────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto px-8 py-12">
      {/* Header */}
      <div className="mb-10">
        <p className="text-[#4F8EF7] text-xs uppercase tracking-widest mb-2">
          Phase 1 — Preclinical
        </p>
        <h1 className="text-2xl font-bold text-[#F0F4FF] mb-2">
          {isError ? "Analysis Failed" : `Lumos AI™ is analyzing${dots}`}
        </h1>
        <p className="text-[#8BA3C7] text-sm">
          {isError
            ? "An error occurred during corpus analysis. You can re-run from the Phase 1 page."
            : "Running pre-clinical corpus analysis — no patient data required. This typically takes 60–90 seconds."}
        </p>
      </div>

      {/* Progress bar */}
      {!isError && (
        <div className="mb-8">
          <div className="flex justify-between text-xs text-[#8BA3C7] mb-2">
            <span>{runningStep ? runningStep.step : "Initialising"}</span>
            <span>{progress}%</span>
          </div>
          <div className="h-1.5 bg-[#1E3A5F] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#4F8EF7] rounded-full transition-all duration-700"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Step list */}
      <div className="space-y-2">
        {displaySteps.map((step) => {
          const icon = STEP_ICONS[step.step] ?? "⚙️";
          const isStepRunning = step.status === "running";
          const isStepComplete = step.status === "complete";
          const isStepError = step.status === "error";
          const isPending = step.status === "pending";

          return (
            <div
              key={step.step}
              className={`flex items-start gap-3 p-3 rounded-lg border transition-all ${
                isStepRunning
                  ? "bg-[#0F1F3D] border-[#4F8EF7]"
                  : isStepComplete
                  ? "bg-[#0A1628] border-[#1E3A5F]"
                  : isStepError
                  ? "bg-[#1A0A0A] border-[#EF4444]"
                  : "bg-[#080F1F] border-[#0D1F3A] opacity-50"
              }`}
            >
              {/* Status indicator */}
              <div className="flex-shrink-0 w-5 h-5 mt-0.5 flex items-center justify-center">
                {isStepComplete ? (
                  <svg className="w-4 h-4 text-[#22C55E]" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                ) : isStepRunning ? (
                  <div className="w-3 h-3 rounded-full bg-[#4F8EF7] animate-pulse" />
                ) : isStepError ? (
                  <span className="text-[#EF4444] text-xs">✕</span>
                ) : (
                  <div className="w-2 h-2 rounded-full bg-[#1E3A5F]" />
                )}
              </div>

              {/* Step content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm">{icon}</span>
                  <span
                    className={`text-sm font-medium ${
                      isStepComplete ? "text-[#F0F4FF]" : isStepRunning ? "text-[#4F8EF7]" : isStepError ? "text-[#EF4444]" : "text-[#4A6580]"
                    }`}
                  >
                    {step.step}
                  </span>
                </div>
                {step.detail && (
                  <p className="text-xs text-[#8BA3C7] mt-0.5 ml-6 truncate">{step.detail}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Error state */}
      {isError && runStatus?.error_message && (
        <div className="mt-6 p-4 bg-[#1A0808] border border-[#EF4444] rounded-xl">
          <p className="text-[#EF4444] text-sm font-medium mb-1">Processing error</p>
          <p className="text-[#FCA5A5] text-xs font-mono">{runStatus.error_message}</p>
          <a
            href={`/studies/${studyId}/phase1`}
            className="mt-3 inline-flex items-center gap-1.5 text-xs text-[#8BA3C7] hover:text-[#F0F4FF] transition-colors"
          >
            ← Return to Phase 1 to re-run
          </a>
        </div>
      )}

      {/* Footer note */}
      <p className="text-center text-[#4A6580] text-xs mt-8">
        Powered by Claude Opus · Headlamp Corpus · OpenAI Embeddings
      </p>
    </div>
  );
}
