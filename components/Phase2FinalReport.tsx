"use client";

import { useState } from "react";
import { Phase2ReportData, RefinedProfile, CROPrompt, EnhancedOutcomeMeasure } from "@/lib/pipeline/synthesize-phase2";
import { Phase2MLResult } from "@/lib/pipeline/clinical-ml";

interface FullReport extends Phase2ReportData {
  ml_result: Phase2MLResult;
}

type Tab = "phenotypes" | "outcomes" | "cro";

// ── Validation badge ──────────────────────────────────────────────────────────
function ValidationBadge({ delta }: { delta: string }) {
  return (
    <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-[#22C55E]/15 text-[#22C55E] border border-[#22C55E]/30 whitespace-nowrap">
      {delta}
    </span>
  );
}

// ── Section label + value ─────────────────────────────────────────────────────
function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="mb-3">
      <p className="text-[10px] uppercase tracking-widest text-[#4A6580] mb-1">{label}</p>
      <p className="text-[#D0DCF0] text-sm leading-relaxed">{value}</p>
    </div>
  );
}

// ── Refined profile card ──────────────────────────────────────────────────────
function ProfileCard({
  profile,
  type,
}: {
  profile: RefinedProfile;
  type: "responder" | "nonresponder";
}) {
  const isResponder = type === "responder";
  const borderColor = isResponder ? "#22C55E" : "#EF4444";
  const labelColor = isResponder ? "#22C55E" : "#EF4444";
  const title = isResponder ? "Predicted Responder Profile" : "Predicted Non-Responder Profile";

  const priorPct = Math.round(profile.phase1_confidence * 100);
  const postPct = Math.round(profile.phase2_confidence * 100);
  const barColor = postPct >= 70 ? "#22C55E" : postPct >= 45 ? "#F59E0B" : "#EF4444";

  return (
    <div
      className="rounded-xl border p-5"
      style={{ borderColor: `${borderColor}30`, background: `${borderColor}06` }}
    >
      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="text-[10px] uppercase tracking-widest font-semibold mb-1" style={{ color: labelColor }}>
            {title}
          </p>
          <ValidationBadge delta={profile.validation_delta} />
        </div>
        <div className="text-right">
          <p className="text-[10px] text-[#4A6580] mb-1">Confidence Score</p>
          <div className="flex items-center gap-2">
            <span className="text-[#4A6580] text-xs line-through">{priorPct}%</span>
            <span className="text-lg font-bold" style={{ color: barColor }}>{postPct}%</span>
          </div>
          <div className="w-24 h-1 bg-[#1E3A5F] rounded-full overflow-hidden mt-1">
            <div className="h-full rounded-full" style={{ width: `${postPct}%`, background: barColor }} />
          </div>
        </div>
      </div>

      <p className="text-[#F0F4FF] text-sm leading-relaxed mb-4 italic">{profile.summary}</p>

      <div className="space-y-0">
        <Field label="Demographics" value={profile.demographics} />
        <Field label="Core Clinical" value={profile.core_clinical} />
        <Field label="Inflammatory Profile" value={profile.inflammatory} />
        <Field label="Neuroplasticity" value={profile.neuroplasticity} />
        <Field label="Imaging" value={profile.imaging} />
      </div>

      {profile.key_criteria && profile.key_criteria.length > 0 && (
        <div className="mt-4 pt-4 border-t" style={{ borderColor: `${borderColor}20` }}>
          <p className="text-[10px] uppercase tracking-widest text-[#4A6580] mb-2">Key Criteria</p>
          <ul className="space-y-1">
            {profile.key_criteria.map((c, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-[#8BA3C7]">
                <span style={{ color: labelColor }} className="mt-0.5 flex-shrink-0">›</span>
                {c}
              </li>
            ))}
          </ul>
        </div>
      )}

      {profile.what_changed && (
        <div className="mt-4 p-3 rounded-lg bg-[#0F1F3D] border border-[#1E3A5F]">
          <p className="text-[10px] uppercase tracking-widest text-[#4F8EF7] mb-1">What the clinical data changed</p>
          <p className="text-[#8BA3C7] text-xs leading-relaxed">{profile.what_changed}</p>
        </div>
      )}
    </div>
  );
}

// ── Outcome measures tab ──────────────────────────────────────────────────────
function OutcomesTab({ measures }: { measures: EnhancedOutcomeMeasure[] }) {
  const grouped: Record<string, EnhancedOutcomeMeasure[]> = {
    primary_endpoint: [],
    early_response: [],
    leading_indicator: [],
  };
  for (const m of measures) {
    (grouped[m.type] ?? grouped.leading_indicator).push(m);
  }

  const typeConfig = {
    primary_endpoint: { label: "Primary Endpoint", color: "#4F8EF7" },
    early_response: { label: "Early Response Indicators", color: "#22C55E" },
    leading_indicator: { label: "Leading Indicators", color: "#F59E0B" },
  };

  return (
    <div className="space-y-6">
      {(["primary_endpoint", "early_response", "leading_indicator"] as const).map(type => {
        const items = grouped[type];
        if (items.length === 0) return null;
        const { label, color } = typeConfig[type];
        return (
          <div key={type}>
            <p className="text-[10px] uppercase tracking-widest mb-3" style={{ color }}>{label}</p>
            <div className="space-y-3">
              {items.map((m, i) => (
                <div key={i} className="p-4 bg-[#080F1F] border border-[#1E3A5F] rounded-xl">
                  <div className="flex items-start justify-between mb-2">
                    <p className="text-[#F0F4FF] font-semibold text-sm">{m.name}</p>
                    <span
                      className="text-[10px] px-2 py-0.5 rounded-full ml-3 flex-shrink-0"
                      style={{ color, background: `${color}15` }}
                    >
                      {m.timing}
                    </span>
                  </div>
                  <p className="text-[#8BA3C7] text-xs leading-relaxed mb-2">{m.description}</p>
                  <p className="text-[#4A6580] text-xs leading-relaxed">
                    <span className="text-[#4F8EF7] font-semibold">Rationale: </span>
                    {m.clinical_rationale}
                  </p>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── CRO prompts tab ───────────────────────────────────────────────────────────
const CATEGORY_COLORS: Record<string, string> = {
  Inclusion: "#22C55E",
  Exclusion: "#EF4444",
  Stratification: "#4F8EF7",
  "Biomarker Monitoring": "#A855F7",
};

function CROTab({ prompts }: { prompts: CROPrompt[] }) {
  return (
    <div className="space-y-4">
      <div className="p-4 bg-[#080F1F] border border-[#F59E0B]/20 rounded-xl">
        <p className="text-[#F59E0B] text-xs font-semibold mb-1">Clinical Research Organization Use</p>
        <p className="text-[#8BA3C7] text-xs leading-relaxed">
          These screening prompts are derived from the validated clinical analysis phenotype profiles. They translate
          the Lumos AI biomarker findings into actionable enrollment criteria for future clinical trial design.
        </p>
      </div>

      {prompts.map((prompt, i) => {
        const color = CATEGORY_COLORS[prompt.category] ?? "#4F8EF7";
        return (
          <div key={i} className="p-5 bg-[#080F1F] border border-[#1E3A5F] rounded-xl">
            <div className="flex items-center gap-2 mb-3">
              <span
                className="text-xs font-semibold px-2.5 py-1 rounded-full"
                style={{ color, background: `${color}15` }}
              >
                {prompt.category}
              </span>
            </div>
            <ul className="space-y-2 mb-3">
              {prompt.criteria.map((c, j) => (
                <li key={j} className="flex items-start gap-2 text-sm text-[#D0DCF0]">
                  <span style={{ color }} className="mt-1 flex-shrink-0 text-xs">›</span>
                  {c}
                </li>
              ))}
            </ul>
            {prompt.rationale && (
              <p className="text-[#4A6580] text-xs leading-relaxed border-t border-[#1E3A5F] pt-3 mt-3">
                <span className="text-[#4F8EF7] font-semibold">Rationale: </span>
                {prompt.rationale}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function Phase2FinalReport({
  studyId,
  drugName,
  indication,
  sponsor,
  generatedAt,
  report,
}: {
  studyId: string;
  drugName: string;
  indication: string;
  sponsor: string;
  generatedAt: string;
  report: FullReport;
}) {
  const [activeTab, setActiveTab] = useState<Tab>("phenotypes");

  const tabs: { id: Tab; label: string }[] = [
    { id: "phenotypes", label: "Refined Phenotypes & Biomarkers" },
    { id: "outcomes", label: "Enhanced Outcome Measures" },
    { id: "cro", label: "CRO Screening Prompts" },
  ];

  return (
    <div className="max-w-5xl mx-auto px-8 py-10">
      {/* Header */}
      <div className="mb-8">
        <p className="text-[#A855F7] text-xs uppercase tracking-widest font-semibold mb-1">
          Clinical Analysis — Final Report · Lumos v2.1
        </p>
        <h1 className="text-2xl font-bold text-[#F0F4FF] mb-1">
          {drugName} · {indication} · Clinical Validation
        </h1>
        <p className="text-[#8BA3C7] text-sm mb-3">
          {sponsor} · Generated {generatedAt} · N=16 clinical patients
        </p>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-[#22C55E]/15 text-[#22C55E] border border-[#22C55E]/30">
            PATIENT-LEVEL VALIDATED
          </span>
          <span className="text-xs text-[#4A6580]">
            Pre-clinical hypotheses tested against {report.ml_result.responder_count + report.ml_result.nonresponder_count + report.ml_result.uncertain_count} participants
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[#1E3A5F] mb-6 overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === tab.id
                ? "border-[#A855F7] text-[#A855F7]"
                : "border-transparent text-[#8BA3C7] hover:text-[#F0F4FF]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "phenotypes" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <ProfileCard profile={report.refined_responder_profile} type="responder" />
            <ProfileCard profile={report.refined_nonresponder_profile} type="nonresponder" />
          </div>

          {/* Methodology narrative */}
          {report.methodology_narrative && (
            <div className="p-5 bg-[#080F1F] border border-[#1E3A5F] rounded-xl">
              <p className="text-[10px] uppercase tracking-widest text-[#4A6580] mb-3">Clinical Analysis Methodology</p>
              <div className="text-[#8BA3C7] text-sm leading-relaxed space-y-3">
                {report.methodology_narrative.split(/\n\n+/).map((para, i) => (
                  <p key={i}>{para.trim()}</p>
                ))}
              </div>
            </div>
          )}

          {/* Disclaimer */}
          <div className="p-4 bg-[#080F1F] border border-[#1E3A5F] rounded-xl">
            <p className="text-[#8BA3C7] text-xs leading-relaxed">
              <span className="text-[#F59E0B] font-semibold">Note: </span>
              Clinical analysis is based on N=16 participants. Confidence scores reflect Bayesian-updated
              estimates — larger trials will further refine these hypotheses. CRO screening prompts
              should be reviewed by a qualified clinical team before protocol implementation.
            </p>
          </div>
        </div>
      )}

      {activeTab === "outcomes" && (
        <OutcomesTab measures={report.enhanced_outcome_measures ?? []} />
      )}

      {activeTab === "cro" && (
        <CROTab prompts={report.cro_prompts ?? []} />
      )}
    </div>
  );
}
