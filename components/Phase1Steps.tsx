"use client";

import { useState } from "react";

const STEPS = [
  {
    icon: "📄",
    label: "Load IND package",
    detail: "IND clinical trial documentation",
    tooltip: {
      title: "IND package — the drug's complete pre-clinical dossier",
      body: "An Investigational New Drug (IND) filing is the FDA-required submission before first-in-human dosing. It covers synthesis & manufacturing, preclinical pharmacology, toxicology, proposed trial protocol, and the investigator's brochure. Lumos ingests all IND documents as structured source material — treating them as highest-weight evidence throughout every downstream analysis step.",
    },
  },
  {
    icon: "🔬",
    label: "Extract mechanism context",
    detail: "Receptor profile, PK/PD, neuroplasticity signals, safety",
    tooltip: {
      title: "Structured pharmacology extraction",
      body: "Claude parses the IND corpus to extract a structured drug profile: receptor binding affinities (e.g. 5-HT2A Ki in nM), selectivity ratios vs. off-targets, PK parameters (half-life, bioavailability, Cmax), neuroplasticity signals (BDNF upregulation, TrkB agonism), and pre-clinical safety flags. This structured context is then injected verbatim into every synthesis prompt — so the model reasons from precise pharmacology, not general knowledge.",
    },
  },
  {
    icon: "🧬",
    label: "Multi-aspect corpus search",
    detail: "4 simultaneous vector queries across Headlamp MDD corpus",
    tooltip: {
      title: "Parallel semantic search across 4 independent query axes",
      body: "Each document in Headlamp's research corpus is pre-embedded as a high-dimensional vector using Lumos AI's proprietary embedding model. Lumos runs 4 simultaneous cosine-similarity queries — mechanism of action, PK/safety, biomarker thresholds, and efficacy signals — fetching up to 80 candidates per aspect (320 raw). Results are deduplicated by chunk ID (keeping the best similarity score), source-type boosts are applied (clinical trial docs: 1.20×, regulatory: 1.15×), a 3-chunk-per-document cap prevents any single paper from dominating, and the top 40 are sent to the Lumos AI synthesis model. A single query would miss cross-domain evidence; 4 parallel queries cover the mechanistic search space.",
    },
  },
  {
    icon: "🐭",
    label: "Cross-species mapping",
    detail: "FST / CMS / LH animal models → human MDD subtypes",
    tooltip: {
      title: "Translating rodent models to human patient subtypes",
      body: "Three validated preclinical depression paradigms are the field standard: Forced Swim Test (FST — acute behavioral despair, maps to Subtype A responders), Chronic Mild Stress (CMS — anhedonia and HPA dysregulation, maps to Subtype B inflammatory profile), and Learned Helplessness (LH — treatment-resistant, maps to Subtype C). Lumos identifies which models appear in the retrieved corpus chunks and uses those mappings to predict which human phenotypes the drug's preclinical efficacy data actually supports.",
    },
  },
  {
    icon: "∑",
    label: "Bayesian subtype priors",
    detail: "Beta-Binomial posteriors from corpus animal-model evidence",
    tooltip: {
      title: "Beta-Binomial posteriors: quantifying subtype confidence before trial data",
      body: "Lumos counts corpus mentions of each animal model (FST → Subtype A, CMS → B, LH → C) and fits a Beta-Binomial: α = 1 + evidence_for_subtype, β = 1 + evidence_against. The posterior mean (α / α+β) gives a pre-trial probability that this drug works for each patient subtype. These priors aren't soft guesses — they're the starting state of a Bayesian update that will shift numerically when Phase 1 outcome data arrives, giving you a principled before/after comparison.",
    },
  },
  {
    icon: "🤖",
    label: "Phenotype synthesis",
    detail: "Lumos AI synthesis: predicted responder + non-responder profiles",
    tooltip: {
      title: "Synthesis over retrieved evidence — two structured phenotype portraits",
      body: "The Lumos AI synthesis model receives the drug's structured pharmacology, the Bayesian subtype priors, and the top 40 corpus chunks (weighted by relevance and source type). It synthesizes two structured phenotype profiles — predicted responder and non-responder — across five dimensions: demographics, core clinical presentation (MADRS/HAMD-17 thresholds), inflammatory markers, neuroplasticity signals (BDNF, TrkB), and imaging correlates. Every claim is grounded in specific corpus evidence with a confidence score. Confidence percentages reflect how consistently and strongly the corpus mechanistic evidence (animal model data, in vitro studies) supports each phenotype — they do not predict clinical response probability.",
    },
  },
  {
    icon: "📊",
    label: "Biomarker protocol",
    detail: "Priority-ranked collection plan for Phase 1 trial",
    tooltip: {
      title: "Evidence-grounded biomarker collection plan with quantitative thresholds",
      body: "A second Lumos AI analysis pass generates a ranked protocol of 6–9 biomarkers spanning inflammatory (CRP, IL-6, TNF-α), neuroplasticity (BDNF, TrkB), behavioral, imaging, and genetic domains. For each biomarker: a mechanistic rationale tied to the drug's receptor profile, a quantitative threshold that distinguishes responder from non-responder signal, collection timing mapped to trial visits (Baseline → Wk 2 → Wk 4 → Wk 8), and collection method. The output is a protocol your CRO can implement directly — not a literature review.",
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
