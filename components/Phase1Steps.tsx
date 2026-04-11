"use client";

import { useState } from "react";

const STEPS = [
  {
    icon: "📄",
    label: "Load IND package",
    detail: "IND clinical trial documentation",
    tooltip: {
      title: "IND package — the drug's complete pre-clinical dossier",
      body: "An Investigational New Drug (IND) filing is the FDA-required submission before first-in-human dosing. It covers synthesis & manufacturing, preclinical pharmacology, toxicology, proposed trial protocol, and the investigator's brochure. Lumos AI ingests all IND documents as highest-weight evidence throughout every downstream analysis step.",
    },
  },
  {
    icon: "🔬",
    label: "Extract mechanism context",
    detail: "Receptor profile, PK/PD, neuroplasticity signals, safety",
    tooltip: {
      title: "Structured pharmacology extraction",
      body: "Lumos AI parses the IND corpus to extract a structured drug profile: receptor binding affinities (e.g. 5-HT2A Ki in nM), selectivity ratios vs. off-targets, PK parameters (half-life, bioavailability, Cmax), neuroplasticity signals (BDNF upregulation, TrkB agonism), and pre-clinical safety flags. This structured context is injected into every synthesis prompt — so reasoning is grounded in precise pharmacology, not general knowledge.",
    },
  },
  {
    icon: "🧬",
    label: "Phenotype-oriented corpus search",
    detail: "4 aspect queries → 600 raw candidates → 100 retrieved",
    tooltip: {
      title: "Broad semantic retrieval across 4 phenotype dimensions",
      body: "Lumos AI runs 4 simultaneous cosine-similarity queries — responder profile, non-responder profile, biomarker stratification, and analog outcomes — fetching up to 150 candidates per aspect (600 raw). Results are deduplicated, source-type boosts applied (clinical trial: 1.20×, regulatory: 1.15×), and capped at 5 chunks per document to prevent any single paper from dominating. The top 100 are passed to the reranking step.",
    },
  },
  {
    icon: "🎯",
    label: "Cross-attention reranking",
    detail: "100 candidates → 50 precision-selected chunks",
    tooltip: {
      title: "Reranking with cross-attention for precision selection",
      body: "The 100 retrieved chunks are reranked using Lumos AI's cross-attention model, which reads each chunk alongside the full phenotype query simultaneously. Unlike embedding similarity (which compares pre-computed vectors), cross-attention evaluates how well each chunk actually answers the stratification question. The top 50 by rerank score are kept — significantly more accurate than similarity alone, especially as the corpus scales.",
    },
  },
  {
    icon: "∑",
    label: "Bayesian subtype priors",
    detail: "Beta-Binomial posteriors from corpus evidence",
    tooltip: {
      title: "Beta-Binomial posteriors: quantifying subtype confidence before trial data",
      body: "Lumos AI fits a Beta-Binomial model from corpus evidence for each patient subtype. The posterior mean gives a pre-trial probability that this drug works for each subtype. These priors are the starting state of a Bayesian update that will shift numerically when Phase 1 outcome data arrives, giving a principled before/after comparison.",
    },
  },
  {
    icon: "📝",
    label: "Evidence compression",
    detail: "50 chunks → structured findings (4 parallel extractions)",
    tooltip: {
      title: "Parallel extraction of structured evidence findings",
      body: "The 50 reranked chunks are split by phenotype dimension and processed in parallel. Each extraction call reads its group and pulls out structured findings: specific thresholds, effect sizes, p-values, sample sizes, study quality classifications, and contradictions between studies. The output is ~70% smaller than raw chunks while preserving every quantitative finding and its source citation.",
    },
  },
  {
    icon: "🤖",
    label: "Phenotype synthesis",
    detail: "Lumos AI synthesis: predicted responder + non-responder profiles",
    tooltip: {
      title: "Synthesis from structured evidence — two phenotype portraits",
      body: "Lumos AI receives the structured evidence brief (compressed from 50 reranked chunks), the drug's pharmacology, and Bayesian subtype priors. It synthesizes responder and non-responder phenotype profiles across five dimensions: demographics, core clinical presentation, inflammatory markers, neuroplasticity signals, and imaging correlates. Every claim is grounded in specific corpus evidence with a confidence score.",
    },
  },
  {
    icon: "📊",
    label: "Biomarker protocol",
    detail: "Priority-ranked collection plan for Phase 1 trial",
    tooltip: {
      title: "Evidence-grounded biomarker collection plan with quantitative thresholds",
      body: "A second analysis pass generates a ranked protocol of 6–9 biomarkers spanning inflammatory (CRP, IL-6, TNF-α), neuroplasticity (BDNF, TrkB), behavioral, imaging, and genetic domains. Each includes a mechanistic rationale, quantitative threshold, collection timing mapped to trial visits, and collection method. The output is a protocol your CRO can implement directly.",
    },
  },
];

export default function Phase1Steps({ drugName }: { drugName: string }) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const steps = STEPS.map((s, i) =>
    i === 0
      ? { ...s, detail: `${drugName} clinical trial documentation` }
      : s
  );

  const active = hoveredIndex !== null ? steps[hoveredIndex] : null;

  return (
    <div>
      {/* Step list */}
      <div className="space-y-0.5">
        {steps.map((step, i) => {
          const isHovered = hoveredIndex === i;
          return (
            <div
              key={i}
              onMouseEnter={() => setHoveredIndex(i)}
              onMouseLeave={() => setHoveredIndex(null)}
              className={`flex items-start gap-3 px-3 py-2.5 rounded-lg cursor-default transition-colors duration-100 ${
                isHovered ? "bg-bg-page" : "hover:bg-bg-page/40"
              }`}
            >
              <span className="text-base flex-shrink-0 w-5 text-center mt-0.5">{step.icon}</span>
              <div className="min-w-0">
                <p className={`text-sm font-medium leading-snug transition-colors duration-100 ${isHovered ? "text-text-heading" : "text-text-body"}`}>
                  {step.label}
                </p>
                <p className="text-xs text-text-secondary mt-0.5 leading-snug">{step.detail}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Fixed-height description zone — no layout shift */}
      <div className="mt-4 h-28 relative">
        {/* Default state */}
        <div
          className={`absolute inset-0 flex items-center justify-center transition-opacity duration-200 ${
            active ? "opacity-0" : "opacity-100"
          }`}
        >
          <p className="text-nav-item-muted text-xs">↑ Hover any step to learn more</p>
        </div>

        {/* Active explanation */}
        <div
          className={`absolute inset-0 p-4 bg-bg-overlay border border-brand-core/30 rounded-xl transition-opacity duration-150 ${
            active ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
        >
          {active && (
            <>
              <p className="text-brand-core text-xs font-semibold mb-1.5">
                {active.tooltip.title}
              </p>
              <p className="text-text-body text-xs leading-relaxed line-clamp-4">
                {active.tooltip.body}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
