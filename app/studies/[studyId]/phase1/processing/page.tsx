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

const STEP_DESCRIPTIONS: Record<string, { what: string; why: string }> = {
  "Load study data": {
    what: "Loaded the drug profile — mechanism class, target receptors, indication, and trial parameters from the study configuration.",
    why: "Everything downstream is scoped to this drug's specific pharmacology. No generic analysis.",
  },
  "Load mechanism context": {
    what: "Retrieved pre-extracted pharmacological context from the IND briefing document — binding affinities, receptor selectivity profile, and mechanism of action narrative.",
    why: "Grounds the corpus search in the drug's actual molecular mechanism rather than just its name or indication.",
  },
  "Aspect embedding": {
    what: "Generated four independent semantic embeddings — mechanism, efficacy, biomarkers, and safety/PK — using OpenAI text-embedding-3-large (3072 dimensions).",
    why: "A single embedding misses nuance. Four aspect vectors let the search retrieve evidence that's relevant to each dimension of the analysis separately.",
  },
  "Weighted corpus search": {
    what: "Retrieved the top 20 most relevant chunks from the Headlamp pre-clinical corpus (107 documents) using cosine similarity across all four aspect embeddings, with domain-specific weighting.",
    why: "The corpus is the core of the analysis — peer-reviewed pre-clinical studies, IND filings, and mechanism literature. Higher similarity scores mean stronger evidential grounding.",
  },
  "Bayesian prior computation": {
    what: "Computed Beta-Binomial priors from the corpus response rate distributions — mean, variance, and effective sample size — to calibrate confidence scoring.",
    why: "Confidence scores aren't arbitrary. They're grounded in the statistical distribution of effect sizes observed across comparable pre-clinical studies in the corpus.",
  },
  "Phenotype synthesis (Opus)": {
    what: "Claude Opus analyzed all 20 corpus chunks against the drug's mechanism to synthesize responder/non-responder phenotype profiles, a ranked biomarker protocol, cross-species evidence mapping, and safety signals.",
    why: "This is the reasoning step. Opus integrates the retrieved evidence with the mechanism context to generate hypotheses — which patient subtypes are most likely to respond and why.",
  },
  "Store report": {
    what: "Saved the complete analysis — phenotype profiles, biomarker recommendations, confidence scores, methodology narrative, and corpus references — to the database.",
    why: "Persists the full evidential chain so the report can be audited, exported, and carried forward into Phase 2 clinical trial design.",
  },
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

      if (data.status === "complete" && !isFirstFetch.current) {
        // Only auto-redirect if it just finished during this session's polling.
        // If already complete on load, show the pipeline summary — don't whisk away.
        setTimeout(() => {
          router.push(`/studies/${studyId}/phase1/report`);
        }, 1200);
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
      <div className="max-w-2xl mx-auto px-8 py-10">

        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <p className="text-[#22C55E] text-xs uppercase tracking-widest mb-1">Phase 1 — Preclinical</p>
            <h1 className="text-2xl font-bold text-[#F0F4FF] mb-1">Analysis Complete</h1>
            <p className="text-[#8BA3C7] text-sm">
              7 pipeline steps completed · Powered by Claude Opus · Headlamp Corpus · OpenAI Embeddings
            </p>
          </div>
          <a
            href={`/studies/${studyId}/phase1/report`}
            className="flex-shrink-0 flex items-center gap-2 px-5 py-2.5 bg-[#4F8EF7] text-white font-semibold text-sm rounded-xl hover:bg-[#3A7AE8] transition-colors ml-6"
          >
            View Report
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
              <path d="M3 7h8M7 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </a>
        </div>

        {/* Pipeline steps — full descriptions */}
        <div className="space-y-3">
          {displaySteps.map((step, i) => {
            const icon = STEP_ICONS[step.step] ?? "⚙️";
            const desc = STEP_DESCRIPTIONS[step.step];
            const logged = stepLog.find((s) => s.step === step.step);

            return (
              <div key={step.step} className="bg-[#0A1628] border border-[#1E3A5F] rounded-xl p-4">
                <div className="flex items-start gap-3">
                  {/* Step number + check */}
                  <div className="flex-shrink-0 flex flex-col items-center gap-1 pt-0.5">
                    <div className="w-5 h-5 rounded-full bg-[#0A1A0A] border border-[#22C55E] flex items-center justify-center">
                      <svg className="w-3 h-3 text-[#22C55E]" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </div>
                    {i < displaySteps.length - 1 && (
                      <div className="w-px h-3 bg-[#1E3A5F]" />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-base">{icon}</span>
                      <span className="text-sm font-semibold text-[#F0F4FF]">{step.step}</span>
                      {logged?.detail && (
                        <span className="text-[10px] text-[#4A6580] font-mono ml-auto flex-shrink-0">{logged.detail}</span>
                      )}
                    </div>
                    {desc && (
                      <>
                        <p className="text-xs text-[#D0DCF0] leading-relaxed mb-1.5">{desc.what}</p>
                        <p className="text-xs text-[#4A6580] leading-relaxed">
                          <span className="text-[#4F8EF7] font-medium">Why it matters: </span>
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
            href={`/studies/${studyId}/phase1/report`}
            className="flex items-center gap-2 px-6 py-3 bg-[#4F8EF7] text-white font-semibold text-sm rounded-xl hover:bg-[#3A7AE8] transition-colors"
          >
            View Full Report
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
              <path d="M3 7h8M7 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </a>
        </div>

        <p className="text-center text-[#4A6580] text-xs mt-4">
          Questions about the methodology? See the Methodology tab in the report.
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
