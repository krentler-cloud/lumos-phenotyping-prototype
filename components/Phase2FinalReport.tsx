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
    <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-status-success/15 text-status-success border border-status-success/30 whitespace-nowrap">
      {delta}
    </span>
  );
}

// ── Section label + value ─────────────────────────────────────────────────────
function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="mb-3">
      <p className="text-[10px] uppercase tracking-widest text-text-secondary mb-1">{label}</p>
      <p className="text-text-body text-sm leading-relaxed">{value}</p>
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
  const borderColor = isResponder ? "var(--status-success)" : "var(--status-danger)";
  const labelColor = isResponder ? "var(--status-success)" : "var(--status-danger)";
  const title = isResponder ? "Predicted Responder Profile" : "Predicted Non-Responder Profile";

  const priorPct = Math.round(profile.phase1_confidence * 100);
  const postPct = Math.round(profile.phase2_confidence * 100);
  const barColor = postPct >= 70 ? "var(--status-success)" : postPct >= 45 ? "var(--status-warning)" : "var(--status-danger)";

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
          <p className="text-[10px] text-text-secondary mb-1">Confidence Score</p>
          <div className="flex items-center gap-2">
            <span className="text-text-secondary text-xs line-through">{priorPct}%</span>
            <span className="text-lg font-bold" style={{ color: barColor }}>{postPct}%</span>
          </div>
          <div className="w-24 h-1 bg-nav-item-active-bg rounded-full overflow-hidden mt-1">
            <div className="h-full rounded-full" style={{ width: `${postPct}%`, background: barColor }} />
          </div>
        </div>
      </div>

      <p className="text-text-heading text-sm leading-relaxed mb-4 italic">{profile.summary}</p>

      <div className="space-y-0">
        <Field label="Demographics" value={profile.demographics} />
        <Field label="Core Clinical" value={profile.core_clinical} />
        <Field label="Inflammatory Profile" value={profile.inflammatory} />
        <Field label="Neuroplasticity" value={profile.neuroplasticity} />
        <Field label="Imaging" value={profile.imaging} />
      </div>

      {profile.key_criteria && profile.key_criteria.length > 0 && (
        <div className="mt-4 pt-4 border-t" style={{ borderColor: `${borderColor}20` }}>
          <p className="text-[10px] uppercase tracking-widest text-text-secondary mb-2">Key Criteria</p>
          <ul className="space-y-1">
            {profile.key_criteria.map((c, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-text-muted">
                <span style={{ color: labelColor }} className="mt-0.5 flex-shrink-0">›</span>
                {c}
              </li>
            ))}
          </ul>
        </div>
      )}

      {profile.what_changed && (
        <div className="mt-4 p-3 rounded-lg bg-bg-surface border border-border-subtle">
          <p className="text-[10px] uppercase tracking-widest text-brand-core mb-1">What the clinical data changed</p>
          <p className="text-text-muted text-xs leading-relaxed">{profile.what_changed}</p>
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
    primary_endpoint: { label: "Primary Endpoint", color: "var(--brand-core)" },
    early_response: { label: "Early Response Indicators", color: "var(--status-success)" },
    leading_indicator: { label: "Leading Indicators", color: "var(--status-warning)" },
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
                <div key={i} className="p-4 bg-bg-overlay border border-border-subtle rounded-xl">
                  <div className="flex items-start justify-between mb-2">
                    <p className="text-text-heading font-semibold text-sm">{m.name}</p>
                    <span
                      className="text-[10px] px-2 py-0.5 rounded-full ml-3 flex-shrink-0"
                      style={{ color, background: `${color}15` }}
                    >
                      {m.timing}
                    </span>
                  </div>
                  <p className="text-text-muted text-xs leading-relaxed mb-2">{m.description}</p>
                  <p className="text-text-secondary text-xs leading-relaxed">
                    <span className="text-brand-core font-semibold">Rationale: </span>
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
  Inclusion: "var(--status-success)",
  Exclusion: "var(--status-danger)",
  Stratification: "var(--brand-core)",
  "Biomarker Monitoring": "var(--status-purple)",
};

function CROTab({ prompts }: { prompts: CROPrompt[] }) {
  return (
    <div className="space-y-4">
      <div className="p-4 bg-bg-overlay border border-status-warning/20 rounded-xl">
        <p className="text-status-warning text-xs font-semibold mb-1">Clinical Research Organization Use</p>
        <p className="text-text-muted text-xs leading-relaxed">
          These screening prompts are derived from the data-supported phenotype profiles from the clinical analysis. They translate
          the Lumos AI biomarker findings into actionable enrollment criteria for future clinical trial design.
        </p>
      </div>

      {prompts.map((prompt, i) => {
        const color = CATEGORY_COLORS[prompt.category] ?? "var(--brand-core)";
        return (
          <div key={i} className="p-5 bg-bg-overlay border border-border-subtle rounded-xl">
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
                <li key={j} className="flex items-start gap-2 text-sm text-text-body">
                  <span style={{ color }} className="mt-1 flex-shrink-0 text-xs">›</span>
                  {c}
                </li>
              ))}
            </ul>
            {prompt.rationale && (
              <p className="text-text-secondary text-xs leading-relaxed border-t border-border-subtle pt-3 mt-3">
                <span className="text-brand-core font-semibold">Rationale: </span>
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
        <p className="text-status-purple text-xs uppercase tracking-widest font-semibold mb-1">
          Clinical Analysis — Final Report · Lumos v2.1
        </p>
        <h1 className="text-2xl font-bold text-text-heading mb-1">
          {drugName} · {indication} · Clinical Analysis
        </h1>
        <p className="text-text-muted text-sm mb-3">
          {sponsor} · Generated {generatedAt} · N=16 clinical patients
        </p>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-status-success/15 text-status-success border border-status-success/30">
              PATIENT-LEVEL CONFIRMED
            </span>
            <span className="text-xs text-text-secondary">
              {/* SCIENCE-FEEDBACK: P1-A */}
              Planning Phase hypotheses tested against {report.ml_result.responder_count + report.ml_result.nonresponder_count + report.ml_result.uncertain_count} participants
            </span>
          </div>
          <button
            onClick={() => window.print()}
            className="print-hide flex items-center gap-2 px-4 py-2 rounded-lg border border-border-subtle bg-bg-surface text-text-muted hover:text-text-heading hover:border-brand-core transition-colors text-xs font-medium"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
              <rect x="6" y="14" width="12" height="8"/>
            </svg>
            Export PDF
          </button>
        </div>
      </div>

      {/* Tabs — hidden in print */}
      <div className="print-hide flex border-b border-border-subtle mb-6 overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === tab.id
                ? "border-status-purple text-status-purple"
                : "border-transparent text-text-muted hover:text-text-heading"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Phenotypes tab */}
      <div className={activeTab !== "phenotypes" ? "hidden print-show" : ""}>
        <span className="print-section-heading hidden">Refined Phenotypes &amp; Biomarkers</span>
        <div className="space-y-6">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <ProfileCard profile={report.refined_responder_profile} type="responder" />
            <ProfileCard profile={report.refined_nonresponder_profile} type="nonresponder" />
          </div>
          {report.methodology_narrative && (
            <div className="p-5 bg-bg-overlay border border-border-subtle rounded-xl">
              <p className="text-[10px] uppercase tracking-widest text-text-secondary mb-3">Clinical Analysis Methodology</p>
              <div className="text-text-muted text-sm leading-relaxed space-y-3">
                {report.methodology_narrative.split(/\n\n+/).map((para, i) => (
                  <p key={i}>{para.trim()}</p>
                ))}
              </div>
            </div>
          )}
          <div className="p-4 bg-bg-overlay border border-border-subtle rounded-xl">
            <p className="text-text-muted text-xs leading-relaxed">
              <span className="text-status-warning font-semibold">Note: </span>
              Clinical analysis is based on N=16 participants. Confidence scores reflect Bayesian-updated
              estimates — larger trials will further refine these hypotheses. CRO screening prompts
              should be reviewed by a qualified clinical team before protocol implementation.
            </p>
          </div>
        </div>
      </div>

      {/* Outcomes tab */}
      <div className={activeTab !== "outcomes" ? "hidden print-show" : ""}>
        <span className="print-section-heading hidden">Enhanced Outcome Measures</span>
        <OutcomesTab measures={report.enhanced_outcome_measures ?? []} />
      </div>

      {/* CRO tab */}
      <div className={activeTab !== "cro" ? "hidden print-show" : ""}>
        <span className="print-section-heading hidden">CRO Screening Prompts</span>
        <CROTab prompts={report.cro_prompts ?? []} />
      </div>
    </div>
  );
}
