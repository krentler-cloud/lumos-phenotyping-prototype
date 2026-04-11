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

const ALL_STEPS = [
  "Load study data",
  "Load pre-clinical report",
  "Load clinical patients",
  "Clinical ML analysis",
  "Clinical synthesis",
  "Store clinical report",
];

const STEP_ICONS: Record<string, string> = {
  "Load study data":            "📋",
  "Load pre-clinical report":   "📊",
  "Load clinical patients":     "👥",
  "Clinical ML analysis":       "🧮",
  "Clinical synthesis":         "🤖",
  "Store clinical report":      "💾",
};

const STEP_DESCRIPTIONS: Record<string, { what: string; why: string }> = {
  "Load study data": {
    what: "Loaded the study configuration — drug name, indication, and the linked Phase 1 run record.",
    why: "Phase 2 re-analysis is always anchored to a specific drug and its Phase 1 hypothesis. This establishes that link before any data is touched.",
  },
  "Load pre-clinical report": {
    what: "Retrieved the complete Planning Phase corpus synthesis — responder and non-responder phenotype profiles, biomarker table, and the original Bayesian confidence scores. These are the Planning Phase hypotheses that Phase 2 will now test against real patient data.",
    why: "The Bayesian update in Step 4 requires the Phase 1 priors as a starting point. Without them, we would have no principled baseline to update — the clinical data would be interpreted in a vacuum rather than against a pre-specified hypothesis.",
  },
  "Load clinical patients": {
    what: "Retrieved all enrolled Phase 1 trial participants from the database — baseline biomarker panels (BDNF, IL-6, CRP, TNF-α), HAMD-17 and MADRS scores at Wk 0/2/4/8, sleep regularity, anhedonia subscale, and adjudicated response status.",
    why: "This is the first time real human outcome data enters the analysis. Every claim in the Phase 2 report is grounded in these 16 observations, which is why data quality and response adjudication matter enormously at this stage.",
  },
  "Clinical ML analysis": {
    what: "Ran three analyses in parallel: (1) threshold-based subtype clustering — assigned each patient to Subtype A (BDNF < 15 ng/mL), B (IL-6 ≥ 4 pg/mL), or C (mixed) using the Phase 1-derived thresholds; (2) Pearson correlation feature importance — ranked each biomarker by its linear association with response status; (3) Bayesian update — applied the observed responder/non-responder counts to update the Phase 1 Beta-Binomial priors.",
    why: "These three computations answer three distinct questions: Which subtype did each patient actually belong to? Which biomarkers were most predictive in practice? And how much should we revise our confidence in the Phase 1 hypotheses given the new data? Each feeds directly into the synthesis step.",
  },
  "Clinical synthesis": {
    what: "Lumos AI integrated the Phase 1 phenotype profiles, the Bayesian-updated confidence scores, MADRS trajectory data, and feature importance rankings to produce refined responder and non-responder profiles, enhanced outcome measures for future trials, and structured CRO screening prompts.",
    why: "This synthesis step requires the same level of scientific reasoning as the Planning Phase — the model must weigh evidence from both corpus priors and real patient outcomes, resolve conflicts between pre-specified hypotheses and observed data, and commit to ranked clinical recommendations. Frontier-class reasoning is used consistently across both phases for this reason.",
  },
  "Store clinical report": {
    what: "Persisted the complete Phase 2 output — refined profiles, ML results, patient-level data, MADRS trajectories, feature importances, and the Bayesian update record — as a versioned report linked to this study.",
    why: "Storing the full evidential chain means every confidence score and profile revision can be traced back to the specific patient observations and computational steps that produced it — critical for regulatory review and for explaining methodology to clinical stakeholders.",
  },
};

export default function Phase2ProcessingPage() {
  const params = useParams();
  const studyId = params.studyId as string;
  const router = useRouter();

  const [runStatus, setRunStatus] = useState<RunStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [dots, setDots] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [showEscapeHatch, setShowEscapeHatch] = useState(false);
  const isFirstFetch = useRef(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/studies/${studyId}/phase2-status`);
      if (!res.ok) return;
      const data: RunStatus = await res.json();
      setRunStatus(data);
      setLoading(false);

      if (data.status === "complete") {
        if (intervalRef.current) clearInterval(intervalRef.current);
        if (!isFirstFetch.current) {
          setTimeout(() => router.push(`/studies/${studyId}/phase2/report`), 1200);
        }
      }
      if (data.status === "error") {
        if (intervalRef.current) clearInterval(intervalRef.current);
      }
      isFirstFetch.current = false;
    } catch { /* silent — will retry */ }
  }, [studyId, router]);

  useEffect(() => {
    fetchStatus();
    intervalRef.current = setInterval(fetchStatus, 2500);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [fetchStatus]);

  // Animated dots — only while processing
  useEffect(() => {
    const t = setInterval(() => setDots(d => d.length >= 3 ? "" : d + "."), 400);
    return () => clearInterval(t);
  }, []);

  // Show escape hatch after 90 s in case the run hangs
  useEffect(() => {
    const t = setTimeout(() => setShowEscapeHatch(true), 90_000);
    return () => clearTimeout(t);
  }, []);

  const handleCancel = useCallback(async () => {
    setCancelling(true);
    try {
      await fetch(`/api/studies/${studyId}/cancel-phase2`, { method: "POST" });
      router.push(`/studies/${studyId}/phase2`);
    } catch {
      setCancelling(false);
    }
  }, [studyId, router]);

  const stepLog = runStatus?.step_log ?? [];
  const displaySteps = ALL_STEPS.map(name => {
    const logged = stepLog.find(s => s.step === name);
    return logged ?? { step: name, status: "pending" as const, ts: "" };
  });
  const runningStep = stepLog.findLast?.((s: StepLog) => s.status === "running");
  const completeCount = stepLog.filter(s => s.status === "complete").length;
  const progress = Math.round((completeCount / ALL_STEPS.length) * 100);
  const isComplete = runStatus?.status === "complete";
  const isError = runStatus?.status === "error";

  // ── Loading skeleton ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-8 py-12">
        <div className="mb-10">
          <div className="h-3 w-24 bg-nav-item-active-bg rounded mb-3 animate-pulse" />
          <div className="h-7 w-64 bg-nav-item-active-bg rounded mb-3 animate-pulse" />
          <div className="h-4 w-96 bg-nav-item-active-bg rounded animate-pulse" />
        </div>
        <div className="space-y-2">
          {ALL_STEPS.map(name => (
            <div key={name} className="flex items-center gap-3 p-3 rounded-lg border border-border-subtle bg-bg-overlay">
              <div className="w-5 h-5 rounded-full bg-nav-item-active-bg animate-pulse flex-shrink-0" />
              <div className="h-4 w-48 bg-nav-item-active-bg rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Complete state ──────────────────────────────────────────────────────────
  if (isComplete) {
    return (
      <div className="max-w-2xl mx-auto px-8 py-10">
        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <p className="text-status-success text-xs uppercase tracking-widest mb-1">Clinical Analysis</p>
            <h1 className="text-2xl font-bold text-text-heading mb-1">Analysis Complete</h1>
            <p className="text-text-muted text-sm">
              {ALL_STEPS.length} pipeline steps completed · Powered by Lumos AI™
            </p>
          </div>
          <a
            href={`/studies/${studyId}/phase2/report`}
            className="flex-shrink-0 flex items-center gap-2 px-5 py-2.5 bg-brand-core text-white font-semibold text-sm rounded-xl hover:bg-brand-hover transition-colors ml-6"
          >
            View Report
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
              <path d="M3 7h8M7 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </a>
        </div>

        {/* Pipeline steps — full descriptions (matches Phase 1 complete layout) */}
        <div className="space-y-3">
          {displaySteps.map((step, i) => {
            const icon = STEP_ICONS[step.step] ?? "⚙️";
            const desc = STEP_DESCRIPTIONS[step.step];
            const logged = stepLog.find(s => s.step === step.step);
            return (
              <div key={step.step} className="bg-bg-page border border-border-subtle rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 flex flex-col items-center gap-1 pt-0.5">
                    <div className="w-5 h-5 rounded-full bg-status-success/5 border border-status-success flex items-center justify-center">
                      <svg className="w-3 h-3 text-status-success" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </div>
                    {i < displaySteps.length - 1 && <div className="w-px h-3 bg-nav-item-active-bg" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-base">{icon}</span>
                      <span className="text-sm font-semibold text-text-heading">{step.step}</span>
                      {logged?.detail && (
                        <span className="text-[10px] text-text-secondary font-mono ml-auto flex-shrink-0">{logged.detail}</span>
                      )}
                    </div>
                    {desc && (
                      <>
                        <p className="text-xs text-text-body leading-relaxed mb-1.5">{desc.what}</p>
                        <p className="text-xs text-text-secondary leading-relaxed">
                          <span className="text-brand-core font-medium">Why it matters: </span>
                          {desc.why}
                        </p>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-6 flex justify-center">
          <a
            href={`/studies/${studyId}/phase2/report`}
            className="flex items-center gap-2 px-6 py-3 bg-brand-core text-white font-semibold text-sm rounded-xl hover:bg-brand-hover transition-colors"
          >
            View Final Report
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
              <path d="M3 7h8M7 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </a>
        </div>
        <p className="text-center text-text-secondary text-xs mt-4">
          Questions about the methodology? See the Methodology section in the report.
        </p>
      </div>
    );
  }

  // ── In-progress / error state ───────────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto px-8 py-12">
      {/* Header */}
      <div className="mb-10">
        <p className="text-status-purple text-xs uppercase tracking-widest mb-2">Clinical Analysis</p>
        <h1 className="text-2xl font-bold text-text-heading mb-2">
          {isError ? "Analysis Failed" : `Lumos AI™ is analyzing${dots}`}
        </h1>
        <p className="text-text-muted text-sm">
          {isError
            ? "An error occurred during clinical analysis. You can re-run from the Clinical Analysis page."
            : "Running clinical analysis — integrating Planning Phase hypotheses with patient outcomes. This typically takes 3–5 minutes."}
        </p>
      </div>

      {/* Progress bar */}
      {!isError && (
        <div className="mb-8">
          <div className="flex justify-between text-xs text-text-muted mb-2">
            <span>{runningStep ? runningStep.step : "Initialising"}</span>
            <span>{progress}%</span>
          </div>
          <div className="h-1.5 bg-nav-item-active-bg rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-status-purple to-brand-core rounded-full transition-all duration-700"
              style={{ width: `${Math.max(progress, 3)}%` }}
            />
          </div>
        </div>
      )}

      {/* Step list */}
      <div className="space-y-2">
        {displaySteps.map(s => {
          const isStepRunning = s.status === "running";
          const isStepComplete = s.status === "complete";
          const isStepError = s.status === "error";
          const desc = STEP_DESCRIPTIONS[s.step];

          return (
            <div
              key={s.step}
              className={`rounded-lg border transition-all ${
                isStepRunning
                  ? "bg-bg-surface border-status-purple"
                  : isStepComplete
                  ? "bg-bg-page border-border-subtle"
                  : isStepError
                  ? "bg-status-danger/5 border-status-danger"
                  : "bg-bg-overlay border-border-subtle opacity-50"
              }`}
            >
              {/* Step header row */}
              <div className="flex items-center gap-3 p-3">
                <div className="flex-shrink-0 w-5 h-5 mt-0.5 flex items-center justify-center">
                  {isStepComplete ? (
                    <svg className="w-4 h-4 text-status-success" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  ) : isStepRunning ? (
                    <div className="w-3 h-3 rounded-full bg-status-purple animate-pulse" />
                  ) : isStepError ? (
                    <span className="text-status-danger text-xs">✕</span>
                  ) : (
                    <div className="w-2 h-2 rounded-full bg-nav-item-active-bg" />
                  )}
                </div>
                <span className="text-sm">{STEP_ICONS[s.step] ?? "⚙️"}</span>
                <span className={`text-sm font-medium ${
                  isStepComplete ? "text-text-heading" : isStepRunning ? "text-status-purple" : isStepError ? "text-status-danger" : "text-text-secondary"
                }`}>
                  {s.step}
                </span>
                {isStepRunning && (
                  <span className="ml-auto text-status-purple text-xs animate-pulse">Running{dots}</span>
                )}
                {s.detail && !isStepRunning && (
                  <span className="ml-auto text-text-secondary text-xs font-mono">{s.detail}</span>
                )}
              </div>

              {/* Completed step — expanded description */}
              {isStepComplete && desc && (
                <div className="px-4 pb-3 ml-7 border-t border-status-success/[0.12] pt-2.5 space-y-1.5">
                  <p className="text-xs text-text-body leading-relaxed">{desc.what}</p>
                  <p className="text-xs text-text-secondary leading-relaxed">
                    <span className="text-brand-core font-medium">Why it matters: </span>
                    {desc.why}
                  </p>
                </div>
              )}

              {/* Running step — show description preview */}
              {isStepRunning && desc && (
                <div className="px-4 pb-3 ml-7 border-t border-status-purple/[0.12] pt-2.5">
                  <p className="text-xs text-text-muted leading-relaxed italic">{desc.what}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Error state */}
      {isError && runStatus?.error_message && (
        <div className="mt-6 p-4 bg-status-danger/5 border border-status-danger rounded-xl">
          <p className="text-status-danger text-sm font-medium mb-1">Processing error</p>
          <p className="text-status-danger text-xs font-mono">{runStatus.error_message}</p>
          <a
            href={`/studies/${studyId}/phase2`}
            className="mt-3 inline-flex items-center gap-1.5 text-xs text-text-muted hover:text-text-heading transition-colors"
          >
            ← Return to re-run
          </a>
        </div>
      )}

      {/* Escape hatch — shown after 90 s */}
      {!isError && showEscapeHatch && (
        <div className="mt-6 p-4 bg-bg-overlay border border-border-subtle rounded-xl">
          <p className="text-text-body text-sm font-medium mb-1">Analysis taking longer than expected?</p>
          <p className="text-text-muted text-xs mb-3">
            If the analysis appears stuck, you can cancel and restart. This preserves the current run in history as cancelled.
          </p>
          <button
            onClick={handleCancel}
            disabled={cancelling}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-status-danger border border-status-danger/40 rounded-lg hover:bg-status-danger/5 transition-colors disabled:opacity-50"
          >
            {cancelling ? "Cancelling…" : "Cancel & restart"}
          </button>
        </div>
      )}

      {/* Footer note */}
      <p className="text-center text-text-secondary text-xs mt-8">
        Powered by Lumos AI™
      </p>
    </div>
  );
}
