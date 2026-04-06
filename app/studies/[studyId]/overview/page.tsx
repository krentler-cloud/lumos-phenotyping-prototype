export const dynamic = "force-dynamic";

import { createServiceClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";

const OBJECTIVES = [
  {
    number: "01",
    title: "Phenotype Stratification",
    description:
      "Predict which patients are likely responders vs. non-responders before any clinical data is collected, using pre-clinical corpus evidence and Bayesian subtype priors.",
    phase: "Pre-Clinical",
    phaseKey: "phase1",
    reportPath: "phase1/report",
    color: "blue",
  },
  {
    number: "02",
    title: "Biomarker Protocol",
    description:
      "Identify the highest-priority biomarkers to collect in the trial and specify evidence-grounded thresholds that distinguish responder from non-responder subpopulations.",
    phase: "Pre-Clinical",
    phaseKey: "phase1",
    reportPath: "phase1/report",
    color: "blue",
  },
  {
    number: "03",
    title: "Clinical Validation & CRO Readiness",
    description:
      "Apply ML-driven subtyping to Phase 1 patient data, update Bayesian posteriors with observed outcomes, and produce actionable CRO screening recommendations.",
    phase: "Clinical",
    phaseKey: "phase2",
    reportPath: "phase2/report",
    color: "green",
  },
] as const;

const METHODOLOGY_STEPS = [
  {
    icon: "◈",
    title: "Corpus Retrieval",
    description:
      "Multi-aspect weighted search across 100+ scientific documents. Clinical trial documents receive a source boost to surface IND-specific evidence.",
  },
  {
    icon: "∿",
    title: "Bayesian Prior Estimation",
    description:
      "Beta-Binomial priors are computed from FST/CMS/LH animal-model mentions in the corpus, producing a probabilistic subtype distribution before any patient data.",
  },
  {
    icon: "⬡",
    title: "Phenotype Synthesis",
    description:
      "Claude Opus synthesizes responder and non-responder phenotype profiles across five dimensions: demographics, clinical, inflammatory, neuroplasticity, and imaging.",
  },
  {
    icon: "◉",
    title: "Clinical Subtyping",
    description:
      "Logistic regression trained on real patient biomarkers, with SHAP-based feature attribution and Bayesian posterior updates from observed clinical outcomes.",
  },
];

export default async function StudyOverviewPage({
  params,
}: {
  params: Promise<{ studyId: string }>;
}) {
  const { studyId } = await params;
  const supabase = createServiceClient();

  const { data: study } = await supabase
    .from("studies")
    .select("*")
    .eq("id", studyId)
    .single();

  if (!study) notFound();

  // Fetch run statuses
  const [phase1Run, phase2Run] = await Promise.all([
    study.phase1_run_id
      ? supabase
          .from("runs")
          .select("status")
          .eq("id", study.phase1_run_id)
          .single()
          .then((r: { data: { status: string } | null }) => r.data)
      : Promise.resolve(null),
    study.phase2_run_id
      ? supabase
          .from("runs")
          .select("status")
          .eq("id", study.phase2_run_id)
          .single()
          .then((r: { data: { status: string } | null }) => r.data)
      : Promise.resolve(null),
  ]);

  const phase1Complete = phase1Run?.status === "complete";
  const phase2Complete = phase2Run?.status === "complete";

  // CTA logic
  let ctaPrimary: { label: string; href: string } | null = null;
  let ctaSecondary: { label: string; href: string } | null = null;

  if (phase2Complete) {
    ctaPrimary = { label: "View Final Report", href: `/studies/${studyId}/phase2/report` };
  } else if (phase1Complete) {
    ctaPrimary = { label: "View Pre-Clinical Report", href: `/studies/${studyId}/phase1/report` };
    ctaSecondary = { label: "Run Clinical Analysis", href: `/studies/${studyId}/phase2` };
  } else {
    ctaPrimary = { label: "Run Pre-Clinical Analysis", href: `/studies/${studyId}/phase1` };
  }

  function objectiveStatus(phaseKey: "phase1" | "phase2") {
    if (phaseKey === "phase1") {
      if (phase1Complete) return "complete";
      if (study.phase1_run_id) return "active";
      return "pending";
    }
    if (phase2Complete) return "complete";
    if (study.phase2_run_id) return "active";
    return "pending";
  }

  return (
    <div className="max-w-4xl mx-auto px-8 py-12 space-y-10">
      {/* Header */}
      <div>
        <p className="text-[#4F8EF7] text-xs uppercase tracking-widest mb-2">
          Lumos AI™ · Precision Phenotyping Study
        </p>
        <h1 className="text-2xl font-bold text-[#F0F4FF] mb-1">
          {study.drug_name}
          <span className="text-[#8BA3C7] font-normal"> in {study.indication}</span>
        </h1>
        <p className="text-[#4A6580] text-sm">{study.sponsor}</p>
      </div>

      {/* Objectives */}
      <div>
        <h2 className="text-[#8BA3C7] text-xs uppercase tracking-widest mb-4">Study Objectives</h2>
        <div className="space-y-3">
          {OBJECTIVES.map((obj) => {
            const status = objectiveStatus(obj.phaseKey);
            const borderColor =
              status === "complete"
                ? "border-l-[#22C55E]"
                : status === "active"
                ? "border-l-[#4F8EF7]"
                : "border-l-[#1E3A5F]";
            const statusLabel =
              status === "complete" ? "Complete" : status === "active" ? "In Progress" : "Not Started";
            const statusColor =
              status === "complete"
                ? "text-[#22C55E] bg-[#22C55E20] border-[#22C55E]"
                : status === "active"
                ? "text-[#4F8EF7] bg-[#4F8EF720] border-[#4F8EF7]"
                : "text-[#4A6580] bg-[#0F1F3D] border-[#1E3A5F]";

            return (
              <div
                key={obj.number}
                className={`bg-[#0F1F3D] border border-[#1E3A5F] border-l-4 ${borderColor} rounded-xl p-5`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-1.5">
                      <span className="text-[#4A6580] font-mono text-xs">{obj.number}</span>
                      <span className="text-[#F0F4FF] font-semibold text-sm">{obj.title}</span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] border ${statusColor}`}
                      >
                        {statusLabel}
                      </span>
                    </div>
                    <p className="text-[#8BA3C7] text-xs leading-relaxed">{obj.description}</p>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <p className="text-[#4A6580] text-[10px] uppercase tracking-wider mb-1">
                      {obj.phase}
                    </p>
                    {status === "complete" && (
                      <Link
                        href={`/studies/${studyId}/${obj.reportPath}`}
                        className="text-[#4F8EF7] text-xs hover:underline"
                      >
                        View report →
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Deliverables */}
      <div>
        <h2 className="text-[#8BA3C7] text-xs uppercase tracking-widest mb-4">Deliverables</h2>
        <div className="bg-[#0F1F3D] border border-[#1E3A5F] rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#1E3A5F]">
                <th className="text-left px-5 py-3 text-[#8BA3C7] text-xs uppercase tracking-wider font-medium">
                  Deliverable
                </th>
                <th className="text-left px-5 py-3 text-[#8BA3C7] text-xs uppercase tracking-wider font-medium">
                  Contents
                </th>
                <th className="text-left px-5 py-3 text-[#8BA3C7] text-xs uppercase tracking-wider font-medium">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-[#1E3A5F]">
                <td className="px-5 py-4">
                  <p className="text-[#F0F4FF] text-sm font-medium">Pre-Clinical Report</p>
                  <p className="text-[#4A6580] text-xs mt-0.5">Phase 1 complete</p>
                </td>
                <td className="px-5 py-4 text-[#8BA3C7] text-xs">
                  Responder phenotype · Efficacy signals · Cross-species evidence · Exploratory biomarkers
                </td>
                <td className="px-5 py-4">
                  {phase1Complete ? (
                    <Link
                      href={`/studies/${studyId}/phase1/report`}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border text-[#22C55E] bg-[#22C55E20] border-[#22C55E] hover:bg-[#22C55E30] transition-colors"
                    >
                      Complete →
                    </Link>
                  ) : study.phase1_run_id ? (
                    <Link
                      href={`/studies/${studyId}/phase1/processing`}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border text-[#4F8EF7] bg-[#4F8EF720] border-[#4F8EF7]"
                    >
                      Processing
                    </Link>
                  ) : (
                    <span className="px-2.5 py-1 rounded-full text-xs border text-[#4A6580] bg-[#0A1628] border-[#1E3A5F]">
                      Pending
                    </span>
                  )}
                </td>
              </tr>
              <tr>
                <td className="px-5 py-4">
                  <p className="text-[#F0F4FF] text-sm font-medium">Final Report + CRO Recommendations</p>
                  <p className="text-[#4A6580] text-xs mt-0.5">Phase 2 complete</p>
                </td>
                <td className="px-5 py-4 text-[#8BA3C7] text-xs">
                  Clinical subtyping · ML predictions · SHAP attributions · CRO screening prompts
                </td>
                <td className="px-5 py-4">
                  {phase2Complete ? (
                    <Link
                      href={`/studies/${studyId}/phase2/report`}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border text-[#22C55E] bg-[#22C55E20] border-[#22C55E] hover:bg-[#22C55E30] transition-colors"
                    >
                      Complete →
                    </Link>
                  ) : study.phase2_run_id ? (
                    <Link
                      href={`/studies/${studyId}/phase2/processing`}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border text-[#4F8EF7] bg-[#4F8EF720] border-[#4F8EF7]"
                    >
                      Processing
                    </Link>
                  ) : (
                    <span className="px-2.5 py-1 rounded-full text-xs border text-[#4A6580] bg-[#0A1628] border-[#1E3A5F]">
                      Pending
                    </span>
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* How Lumos Works */}
      <div>
        <h2 className="text-[#8BA3C7] text-xs uppercase tracking-widest mb-4">How Lumos AI Works</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {METHODOLOGY_STEPS.map((step, i) => (
            <div key={step.title} className="relative">
              {i < METHODOLOGY_STEPS.length - 1 && (
                <div className="hidden md:block absolute top-6 left-full w-3 z-10 text-center text-[#1E3A5F] text-xs">
                  →
                </div>
              )}
              <div className="bg-[#0F1F3D] border border-[#1E3A5F] rounded-xl p-4 h-full">
                <div className="text-[#4F8EF7] text-lg mb-2">{step.icon}</div>
                <p className="text-[#F0F4FF] text-xs font-semibold mb-1.5">{step.title}</p>
                <p className="text-[#4A6580] text-[11px] leading-relaxed">{step.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div className="flex items-center gap-3">
        {ctaPrimary && (
          <Link
            href={ctaPrimary.href}
            className="bg-[#4F8EF7] hover:bg-[#3A7AE4] text-white font-semibold py-3 px-6 rounded-xl text-sm transition-colors flex items-center gap-2"
          >
            <span>⚡</span>
            {ctaPrimary.label}
          </Link>
        )}
        {ctaSecondary && (
          <Link
            href={ctaSecondary.href}
            className="bg-[#0F1F3D] hover:bg-[#1E3A5F] text-[#8BA3C7] hover:text-[#F0F4FF] border border-[#1E3A5F] font-medium py-3 px-6 rounded-xl text-sm transition-colors"
          >
            {ctaSecondary.label}
          </Link>
        )}
      </div>
    </div>
  );
}
