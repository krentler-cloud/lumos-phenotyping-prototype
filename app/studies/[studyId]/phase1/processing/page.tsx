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
  "Exploratory biomarker synthesis": "🔭",
  // SCIENCE-FEEDBACK: P1-F
  "Load SAD/MAD data": "📊",
  "Error": "❌",
};

const STEP_DESCRIPTIONS: Record<string, { what: string; why: string }> = {
  "Load study data": {
    what: "Loaded the drug profile — mechanism class, target receptors, indication, and trial parameters from the study configuration. This establishes the analytical frame: every retrieval query, every confidence score, and every phenotype hypothesis is evaluated through the lens of this specific compound's pharmacology. Think of it as setting the prior before any evidence enters the picture.",
    why: "Everything downstream is scoped to this drug's specific pharmacology. A serotonin modulator and a glutamate receptor antagonist require entirely different evidence retrieval strategies — this step ensures the pipeline never conflates them.",
  },
  "Load mechanism context": {
    what: "Retrieved pre-extracted pharmacological context from the IND briefing document — binding affinities, receptor selectivity profile, and mechanism of action narrative. This isn't a keyword summary; it captures the precise quantitative fingerprint of how the drug interacts with its target receptors, including off-target binding that often predicts tolerability. That specificity is what separates a mechanistically-grounded search from a keyword lookup.",
    why: "Drug names and indications are poor proxies for mechanism. Two antidepressants can share an indication but diverge completely in their receptor pharmacology, and that divergence is exactly what determines which patient subtypes respond. Grounding the search in molecular specifics prevents the model from retrieving superficially similar but mechanistically irrelevant evidence.",
  },
  "Aspect embedding": {
    what: "Generated four independent semantic embeddings — mechanism, efficacy, biomarkers, and safety/PK — using OpenAI's text-embedding-3-large model at 3,072 dimensions. An embedding converts language into a high-dimensional numerical vector where semantic similarity becomes geometric proximity — papers about serotonin transporter occupancy cluster near each other regardless of whether they use identical terminology. Running four separate embeddings rather than one allows each dimension of the analysis to pull evidence from different parts of the scientific literature.",
    why: "A single query embedding optimized for, say, efficacy would systematically under-retrieve safety and biomarker literature. The four-aspect approach treats the analysis as four parallel information retrieval problems — each independently tuned — then merges the results. This is consistently more recall-complete than any single general-purpose embedding.",
  },
  "Weighted corpus search": {
    what: "Retrieved the top 20 most relevant chunks from the Headlamp pre-clinical corpus (107 documents, 800-token chunks) using cosine similarity across all four aspect embeddings, with domain-specific weighting applied to prioritize mechanistic and efficacy evidence. Cosine similarity measures the angular distance between two vectors in that 3,072-dimensional space — chunks that are conceptually close to the query sit at a small angle regardless of their literal wording. The domain weights reflect Headlamp's prior judgment about which evidence types carry the most predictive signal for responder stratification.",
    why: "The corpus is the evidentiary foundation of the entire analysis. Every confidence score, every biomarker recommendation, and every phenotype hypothesis is only as valid as the literature it rests on. Retrieval quality — meaning how well the top-20 chunks actually represent the relevant science — is the single highest-leverage variable in the pipeline.",
  },
  "Bayesian prior computation": {
    what: "Computed Beta-Binomial priors from the response rate distributions observed across the retrieved corpus chunks — capturing mean response rate, variance, and effective sample size for each evidence dimension. The Beta distribution is the natural choice here because it models probabilities bounded between 0 and 1, and the Binomial captures the responder/non-responder structure of the underlying data. The result is a calibrated prior for each confidence dimension that reflects not just the average effect size but how much the evidence agrees with itself.",
    why: "Confidence scores need to reflect both the magnitude and the consistency of the evidence. A drug with five studies all showing 60% response rates should score differently than one with two studies at 90% and three at 30% — even if the averages match. The Bayesian framework captures that distinction by encoding variance explicitly, which is why the confidence percentages in the report are statistically grounded rather than heuristic.",
  },
  "Phenotype synthesis (Opus)": {
    what: "Claude Opus read all 20 retrieved corpus chunks alongside the drug's full mechanism context and synthesized responder and non-responder phenotype profiles, a ranked biomarker screening protocol, cross-species evidence mappings, and safety signals. Opus is the most capable reasoning model in the Claude family — chosen here specifically because the synthesis task requires holding a large body of heterogeneous evidence in context, identifying convergent patterns across studies with different designs, and generating structured clinical hypotheses rather than summaries. The output is not extracted from any single source; it is reasoned from the pattern of evidence across all 20 chunks.",
    why: "This is the step where retrieval becomes interpretation. The model is asked to do what a scientific reviewer does — weigh evidence quality, resolve conflicting signals, and commit to ranked hypotheses about which patient characteristics predict response. Opus-class reasoning is necessary because the task requires genuine inference, not pattern matching.",
  },
  "Store report": {
    what: "Saved the complete structured output — phenotype profiles, efficacy signals, confidence scores, methodology narrative, corpus chunk references, and the Bayesian priors used to generate them — to the database as a versioned record. Every claim in the report is traceable to the specific corpus evidence and model version that produced it. This also makes the output portable: the same record feeds the interactive viewer, the PDF export, and eventually the Phase 2 study design inputs.",
    why: "Reproducibility and auditability are non-negotiable in a clinical context. Persisting the full evidential chain means a medical affairs team can reconstruct exactly why a particular biomarker was ranked first, which studies it rested on, and how confident the model was — months after the analysis ran.",
  },
  "Exploratory biomarker synthesis": {
    what: "Claude Sonnet scanned the same corpus excerpts for adjacent, speculative biomarker signals that didn't make it into the primary efficacy panel — signals that appear in the literature but aren't yet validated or routinely measured in MDD trials. This is a separate, non-blocking call: if it fails, the main report is unaffected. The output is 6–8 hypothesis-generating candidates drawn from neuroinflammation, synaptic remodeling, HPA axis biology, circadian markers, and other adjacent mechanisms with mechanistic plausibility for neuroplastogen response.",
    why: "The primary efficacy panel is deliberately conservative — only biomarkers with strong preclinical grounding. But early-stage drug development is also where exploratory hypotheses are cheapest to test. Surfacing these signals now gives the study team the option to add low-cost add-on assays or biological samples at baseline that cost almost nothing to collect but could yield important signal for the next trial.",
  },
  // SCIENCE-FEEDBACK: P1-F
  "Load SAD/MAD data": {
    what: "Checked the database for Phase 1 SAD (Single Ascending Dose) and MAD (Multiple Ascending Dose) cohort data previously seeded from the XYL-1001 trial. If cohort rows exist, they are injected directly into the Opus synthesis prompt so phenotype predictions are grounded in actual human PK/PD observations rather than corpus projections alone.",
    why: "Corpus-derived priors are animal-model and in-vitro evidence. When real human Phase 1 data exists — actual Cmax values, half-life measurements, observed BDNF responses — those observations should anchor the synthesis. Any discordance between corpus predictions and human data is explicitly flagged, so the output reflects genuine scientific uncertainty rather than projecting animal findings uncritically onto humans.",
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
  "Exploratory biomarker synthesis",
];

export default function Phase1ProcessingPage() {
  const router = useRouter();
  const params = useParams();
  const studyId = params.studyId as string;

  const [runStatus, setRunStatus] = useState<RunStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [dots, setDots] = useState("");
  const isFirstFetch = useRef(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/studies/${studyId}/phase1-status`);
      if (!res.ok) return;
      const data: RunStatus = await res.json();
      setRunStatus(data);
      setLoading(false);

      if (data.status === "complete") {
        // Stop polling — no need to keep checking once done
        if (intervalRef.current) clearInterval(intervalRef.current);

        // Only auto-redirect to report if it just finished while the user was watching.
        // If already complete when they navigated here, stay on this page.
        if (!isFirstFetch.current) {
          setTimeout(() => {
            router.push(`/studies/${studyId}/phase1/report`);
          }, 1200);
        }
      }

      if (data.status === "error") {
        if (intervalRef.current) clearInterval(intervalRef.current);
      }

      isFirstFetch.current = false;
    } catch {
      // silent — will retry
    }
  }, [studyId, router]);

  useEffect(() => {
    fetchStatus();
    intervalRef.current = setInterval(fetchStatus, 2500);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
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

  // ── Loading skeleton — shown only on first render before first fetch returns ─
  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-8 py-12">
        <div className="mb-10">
          <div className="h-3 w-24 bg-nav-item-active-bg rounded mb-3 animate-pulse" />
          <div className="h-7 w-64 bg-nav-item-active-bg rounded mb-3 animate-pulse" />
          <div className="h-4 w-96 bg-nav-item-active-bg rounded animate-pulse" />
        </div>
        <div className="space-y-2">
          {ALL_STEPS.map((name) => (
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
            {/* SCIENCE-FEEDBACK: P1-A */}
            <p className="text-status-success text-xs uppercase tracking-widest mb-1">Planning Phase Analysis</p>
            <h1 className="text-2xl font-bold text-text-heading mb-1">Analysis Complete</h1>
            <p className="text-text-muted text-sm">
              8 pipeline steps completed · Powered by Claude Opus · Headlamp Corpus · OpenAI Embeddings
            </p>
          </div>
          <a
            href={`/studies/${studyId}/phase1/report`}
            className="flex-shrink-0 flex items-center gap-2 px-5 py-2.5 bg-brand-core text-white font-semibold text-sm rounded-xl hover:bg-brand-hover transition-colors ml-6"
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
              <div key={step.step} className="bg-bg-page border border-border-subtle rounded-xl p-4">
                <div className="flex items-start gap-3">
                  {/* Step number + check */}
                  <div className="flex-shrink-0 flex flex-col items-center gap-1 pt-0.5">
                    <div className="w-5 h-5 rounded-full bg-status-success/5 border border-status-success flex items-center justify-center">
                      <svg className="w-3 h-3 text-status-success" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </div>
                    {i < displaySteps.length - 1 && (
                      <div className="w-px h-3 bg-nav-item-active-bg" />
                    )}
                  </div>

                  {/* Content */}
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
            href={`/studies/${studyId}/phase1/report`}
            className="flex items-center gap-2 px-6 py-3 bg-brand-core text-white font-semibold text-sm rounded-xl hover:bg-brand-hover transition-colors"
          >
            View Full Report
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
              <path d="M3 7h8M7 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </a>
        </div>

        <p className="text-center text-text-secondary text-xs mt-4">
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
        <p className="text-brand-core text-xs uppercase tracking-widest mb-2">
          Planning Phase Analysis
        </p>
        <h1 className="text-2xl font-bold text-text-heading mb-2">
          {isError ? "Analysis Failed" : `Lumos AI™ is analyzing${dots}`}
        </h1>
        <p className="text-text-muted text-sm">
          {isError
            ? "An error occurred during corpus analysis. You can re-run from the Planning Phase analysis page."
            : "Running Planning Phase corpus analysis — no patient data required. This typically takes 60–90 seconds."}
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
              className="h-full bg-brand-core rounded-full transition-all duration-700"
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
                  ? "bg-bg-surface border-brand-core"
                  : isStepComplete
                  ? "bg-bg-page border-border-subtle"
                  : isStepError
                  ? "bg-status-danger/5 border-status-danger"
                  : "bg-bg-overlay border-border-subtle opacity-50"
              }`}
            >
              {/* Status indicator */}
              <div className="flex-shrink-0 w-5 h-5 mt-0.5 flex items-center justify-center">
                {isStepComplete ? (
                  <svg className="w-4 h-4 text-status-success" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                ) : isStepRunning ? (
                  <div className="w-3 h-3 rounded-full bg-brand-core animate-pulse" />
                ) : isStepError ? (
                  <span className="text-status-danger text-xs">✕</span>
                ) : (
                  <div className="w-2 h-2 rounded-full bg-nav-item-active-bg" />
                )}
              </div>

              {/* Step content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm">{icon}</span>
                  <span
                    className={`text-sm font-medium ${
                      isStepComplete ? "text-text-heading" : isStepRunning ? "text-brand-core" : isStepError ? "text-status-danger" : "text-text-secondary"
                    }`}
                  >
                    {step.step}
                  </span>
                </div>
                {step.detail && (
                  <p className="text-xs text-text-muted mt-0.5 ml-6 truncate">{step.detail}</p>
                )}
              </div>
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
            href={`/studies/${studyId}/phase1`}
            className="mt-3 inline-flex items-center gap-1.5 text-xs text-text-muted hover:text-text-heading transition-colors"
          >
            ← Return to re-run
          </a>
        </div>
      )}

      {/* Footer note */}
      <p className="text-center text-text-secondary text-xs mt-8">
        Powered by Claude Opus · Headlamp Corpus · OpenAI Embeddings
      </p>
    </div>
  );
}
