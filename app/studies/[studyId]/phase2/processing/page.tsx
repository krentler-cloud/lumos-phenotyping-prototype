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
  "Phase 2 synthesis (Sonnet)",
  "Store Phase 2 report",
];

const STEP_ICONS: Record<string, string> = {
  "Load study data":           "📋",
  "Load pre-clinical report":  "📊",
  "Load clinical patients":    "👥",
  "Clinical ML analysis":      "🧮",
  "Clinical synthesis (Sonnet)":"🤖",
  "Store clinical report":      "💾",
};

const STEP_DESCRIPTIONS: Record<string, { what: string; why: string }> = {
  "Load study data": {
    what: "Loaded the study configuration — drug name, indication, and the linked Phase 1 run record.",
    why: "Phase 2 re-analysis is always anchored to a specific drug and its Phase 1 hypothesis. This establishes that link before any data is touched.",
  },
  "Load pre-clinical report": {
    what: "Retrieved the complete Phase 1 corpus synthesis — responder and non-responder phenotype profiles, biomarker table, and the original Bayesian confidence scores. These are the pre-clinical hypotheses that Phase 2 will now test against real patient data.",
    why: "The Bayesian update in Step 4 requires the Phase 1 priors as a starting point. Without them, we would have no principled baseline to update — the clinical data would be interpreted in a vacuum rather than against a pre-specified hypothesis.",
  },
  "Load clinical patients": {
    what: "Retrieved all 16 XYL-1001 Phase 1 trial participants from the database — baseline biomarker panels (BDNF, IL-6, CRP, TNF-α), HAMD-17 and MADRS scores at Wk 0/2/4/8, sleep regularity, anhedonia subscale, and adjudicated response status.",
    why: "This is the first time real human outcome data enters the analysis. Every claim in the Phase 2 report is grounded in these 16 observations, which is why data quality and response adjudication matter enormously at this stage.",
  },
  "Clinical ML analysis": {
    what: "Ran three analyses in parallel: (1) threshold-based subtype clustering — assigned each patient to Subtype A (BDNF < 15 ng/mL), B (IL-6 ≥ 4 pg/mL), or C (mixed) using the Phase 1-derived thresholds; (2) Pearson correlation feature importance — ranked each biomarker by its linear association with response status; (3) Bayesian update — applied the observed responder/non-responder counts to update the Phase 1 Beta-Binomial priors.",
    why: "These three computations answer three distinct questions: Which subtype did each patient actually belong to? Which biomarkers were most predictive in practice? And how much should we revise our confidence in the Phase 1 hypotheses given the new data? Each feeds directly into the synthesis step.",
  },
  "Clinical synthesis (Sonnet)": {
    what: "Claude Sonnet integrated the Phase 1 phenotype profiles, the Bayesian-updated confidence scores, MADRS trajectory data, and feature importance rankings to produce refined responder and non-responder profiles with validation badges, enhanced outcome measures for future trials, and structured CRO screening prompts.",
    why: "Sonnet — rather than Opus — is used here because the synthesis task is more constrained: the structure of the output is tighter, the corpus context is smaller, and the primary challenge is interpretation rather than open-ended scientific reasoning. Sonnet is faster and more cost-efficient for this type of structured generation.",
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
          setTimeout(() => router.push(`/studies/${studyId}/phase2/subtyping`), 1200);
        }
      }
      if (data.status === "error") {
        if (intervalRef.current) clearInterval(intervalRef.current);
      }
      isFirstFetch.current = false;
    } catch { }
  }, [studyId, router]);

  useEffect(() => {
    fetchStatus();
    intervalRef.current = setInterval(fetchStatus, 2500);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [fetchStatus]);

  useEffect(() => {
    const t = setInterval(() => setDots(d => d.length >= 3 ? "" : d + "."), 400);
    return () => clearInterval(t);
  }, []);

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
          <div className="h-3 w-24 bg-[#1E3A5F] rounded mb-3 animate-pulse" />
          <div className="h-7 w-64 bg-[#1E3A5F] rounded mb-3 animate-pulse" />
          <div className="h-4 w-96 bg-[#1E3A5F] rounded animate-pulse" />
        </div>
        <div className="space-y-2">
          {ALL_STEPS.map(name => (
            <div key={name} className="flex items-center gap-3 p-3 rounded-lg border border-[#0D1F3A] bg-[#080F1F]">
              <div className="w-5 h-5 rounded-full bg-[#1E3A5F] animate-pulse flex-shrink-0" />
              <div className="h-4 w-48 bg-[#1E3A5F] rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Complete state ──────────────────────────────────────────────────────────
  if (isComplete) {
    return (
      <div className="max-w-2xl mx-auto px-8 py-12">
        <div className="mb-8">
          <p className="text-[#22C55E] text-xs uppercase tracking-widest font-semibold mb-2">Clinical Analysis</p>
          <h1 className="text-2xl font-bold text-[#F0F4FF] mb-2">Analysis Complete</h1>
          <p className="text-[#8BA3C7] text-sm">
            {ALL_STEPS.length} pipeline steps completed · Powered by Claude Sonnet · N=16 clinical patients
          </p>
          <a
            href={`/studies/${studyId}/phase2/subtyping`}
            className="inline-flex items-center gap-2 mt-5 px-5 py-2.5 bg-[#4F8EF7] text-white font-semibold text-sm rounded-xl hover:bg-[#3A7AE8] transition-colors"
          >
            View Subtyping Results →
          </a>
        </div>

        <div className="space-y-3">
          {ALL_STEPS.map((name, idx) => {
            const desc = STEP_DESCRIPTIONS[name];
            const isLast = idx === ALL_STEPS.length - 1;
            return (
              <div key={name}>
                <div className="p-4 rounded-xl border border-[#1A4A1A] bg-[#0A1F0A]">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-[#22C55E] text-base">✓</span>
                    <span className="text-base">{STEP_ICONS[name]}</span>
                    <span className="text-[#F0F4FF] font-semibold text-sm">{name}</span>
                  </div>
                  <p className="text-[#D0DCF0] text-xs leading-relaxed mb-2">{desc?.what}</p>
                  <p className="text-[#4F8EF7] text-xs leading-relaxed">
                    <span className="font-semibold text-[#4F8EF7]">Why it matters: </span>
                    {desc?.why}
                  </p>
                </div>
                {!isLast && (
                  <div className="flex justify-center py-1">
                    <div className="w-px h-4 bg-[#22C55E] opacity-40" />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-8 text-center">
          <a
            href={`/studies/${studyId}/phase2/subtyping`}
            className="inline-flex items-center gap-2 px-6 py-3 bg-[#4F8EF7] text-white font-semibold text-sm rounded-xl hover:bg-[#3A7AE8] transition-colors"
          >
            View Subtyping Results →
          </a>
          <p className="text-[#4A6580] text-xs mt-3">
            Questions about the methodology? See the Methodology tab in the report.
          </p>
        </div>
      </div>
    );
  }

  // ── Error state ─────────────────────────────────────────────────────────────
  if (isError) {
    return (
      <div className="max-w-2xl mx-auto px-8 py-12">
        <div className="p-6 rounded-xl border border-[#EF4444]/30 bg-[#1A0A0A]">
          <p className="text-[#EF4444] font-semibold mb-2">Clinical Analysis Failed</p>
          <p className="text-[#8BA3C7] text-sm">{runStatus?.error_message ?? "Unknown error"}</p>
        </div>
      </div>
    );
  }

  // ── In-progress state ───────────────────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto px-8 py-12">
      <div className="mb-8">
        <p className="text-[#A855F7] text-xs uppercase tracking-widest font-semibold mb-2">Clinical Analysis</p>
        <h1 className="text-2xl font-bold text-[#F0F4FF] mb-2">
          {runningStep ? `${runningStep.step}${dots}` : `Initializing${dots}`}
        </h1>
        <p className="text-[#8BA3C7] text-sm">
          Running Lumos v2.1 · N=16 patient outcomes · Powered by Claude Sonnet
        </p>
        <div className="mt-4 h-1.5 bg-[#1E3A5F] rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-[#A855F7] to-[#4F8EF7] rounded-full transition-all duration-500"
            style={{ width: `${Math.max(progress, 3)}%` }}
          />
        </div>
        <p className="text-[#4A6580] text-xs mt-1">{completeCount} of {ALL_STEPS.length} steps complete</p>
      </div>

      <div className="space-y-2">
        {displaySteps.map(s => {
          const statusColor = s.status === "complete" ? "#22C55E"
            : s.status === "running" ? "#A855F7"
            : s.status === "error" ? "#EF4444"
            : "#1E3A5F";
          return (
            <div
              key={s.step}
              className="flex items-center gap-3 p-3 rounded-lg border transition-all"
              style={{
                borderColor: s.status === "running" ? "#A855F740" : "#0D1F3A",
                background: s.status === "running" ? "#130A2A" : "#080F1F",
              }}
            >
              <span style={{ color: statusColor }} className="text-sm font-bold flex-shrink-0 w-4 text-center">
                {s.status === "complete" ? "✓" : s.status === "running" ? "●" : s.status === "error" ? "✕" : "○"}
              </span>
              <span className="text-sm">{STEP_ICONS[s.step]}</span>
              <span className="text-sm" style={{ color: s.status === "pending" ? "#4A6580" : "#F0F4FF" }}>
                {s.step}
              </span>
              {s.status === "running" && (
                <span className="ml-auto text-[#A855F7] text-xs animate-pulse">Running{dots}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
