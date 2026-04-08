"use client";

import { useState } from "react";
import { Phase2ReportData, RefinedProfile, CROPrompt, EnhancedOutcomeMeasure } from "@/lib/pipeline/synthesize-phase2";
import { Phase2MLResult } from "@/lib/pipeline/clinical-ml";
import { DimensionBlock, PosteriorBadge, splitSummary } from "@/components/reportShared";

interface FullReport extends Phase2ReportData {
  ml_result: Phase2MLResult;
}

type Tab = "phenotypes" | "outcomes" | "cro";

// ── Derive executive summary fallback from methodology_narrative ──────────────
function deriveExecutiveSummary(report: FullReport): string {
  if (report.executive_summary) return report.executive_summary;
  if (report.methodology_narrative) {
    const firstPara = report.methodology_narrative.split(/\n\n+/)[0]?.trim();
    if (firstPara) return firstPara;
  }
  return "Clinical analysis of the N=16 participant cohort refines the Planning Phase phenotype hypotheses and updates confidence in responder and non-responder profiles.";
}

// ── Refined profile card — full-width stacked (mirrors Phase 1) ───────────────
function ProfileCard({
  profile,
  type,
}: {
  profile: RefinedProfile;
  type: "responder" | "nonresponder";
}) {
  const [expanded, setExpanded] = useState(false);
  const [changedOpen, setChangedOpen] = useState(false);

  const isResponder = type === "responder";
  const cardBorder = isResponder ? "border-status-success/20" : "border-status-danger/20";
  const headerBg = isResponder ? "bg-status-success/[0.04]" : "bg-status-danger/[0.04]";
  const dotBg = isResponder ? "bg-status-success" : "bg-status-danger";
  const textColor = isResponder ? "text-status-success" : "text-status-danger";
  const label = isResponder ? "Refined Responder Profile" : "Refined Non-Responder Profile";
  const criteriaLabel = isResponder ? "Key Inclusion Criteria" : "Key Exclusion Criteria";
  const criteriaIcon = isResponder ? "✓" : "✕";

  const summarySplit = splitSummary(profile.summary || "", 2);

  return (
    <div className={`bg-bg-surface border ${cardBorder} rounded-2xl overflow-hidden`}>
      {/* Card header */}
      <div className={`flex items-center justify-between gap-3 px-6 py-4 border-b border-border-subtle ${headerBg}`}>
        <div className="flex items-center gap-3">
          <span className={`w-2 h-2 rounded-full ${dotBg} flex-shrink-0`} />
          <p className={`${textColor} text-xs font-semibold uppercase tracking-widest`}>{label}</p>
        </div>
        <PosteriorBadge posterior={profile.phase2_confidence} prior={profile.phase1_confidence} />
      </div>

      <div className="p-6 space-y-5">
        {/* Summary + expandable rationale */}
        <div>
          <p className="text-text-body text-sm leading-relaxed">{summarySplit.lead}</p>
          {summarySplit.rest && (
            <>
              {expanded && (
                <p className="text-text-muted text-sm leading-relaxed mt-2">{summarySplit.rest}</p>
              )}
              <button
                onClick={() => setExpanded(v => !v)}
                className="text-xs text-brand-core hover:underline mt-2 block"
              >
                {expanded ? "Hide full rationale ↑" : "Full rationale ↓"}
              </button>
            </>
          )}

          {/* What changed — inline collapsible */}
          {profile.what_changed && (
            <div className="mt-3">
              <button
                onClick={() => setChangedOpen(v => !v)}
                className="text-xs text-brand-core hover:underline"
              >
                {changedOpen ? "Hide what changed from Planning Phase ↑" : "What changed from Planning Phase ↓"}
              </button>
              {changedOpen && (
                <div className="mt-2 p-3 rounded-lg bg-bg-page border border-border-subtle">
                  <p className="text-text-muted text-xs leading-relaxed">{profile.what_changed}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Dimension blocks — 3-col grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <DimensionBlock label="Demographics"    value={profile.demographics} />
          <DimensionBlock label="Core Clinical"   value={profile.core_clinical} />
          <DimensionBlock label="Inflammatory"    value={profile.inflammatory} />
          <DimensionBlock label="Neuroplasticity" value={profile.neuroplasticity} />
          {profile.imaging && (
            <DimensionBlock label="Imaging / EEG" value={profile.imaging} />
          )}
        </div>

        {/* Key criteria */}
        {profile.key_criteria && profile.key_criteria.length > 0 && (
          <div className="pt-4 border-t border-border-subtle">
            <p className={`${textColor} text-[10px] uppercase tracking-wider font-semibold mb-2.5`}>{criteriaLabel}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
              {profile.key_criteria.map((c, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-text-body">
                  <span className={`${textColor} flex-shrink-0 mt-0.5 font-bold`}>{criteriaIcon}</span>{c}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
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
  const [methodologyOpen, setMethodologyOpen] = useState(false);

  const tabs: { id: Tab; label: string }[] = [
    { id: "phenotypes", label: "Refined Phenotypes & Biomarkers" },
    { id: "outcomes", label: "Enhanced Outcome Measures" },
    { id: "cro", label: "CRO Screening Prompts" },
  ];

  const execSummary = deriveExecutiveSummary(report);
  const { responder_count, nonresponder_count, uncertain_count, concordance_pct } = report.ml_result;
  const totalN = responder_count + nonresponder_count + uncertain_count;

  const concordanceTooltip =
    "Concordance = % of patients whose Phase 2 ML-assigned subtype matches the Planning Phase phenotype hypothesis. This reflects internal consistency between preclinical prediction and clinical data — it is not a clinical validation metric.";

  return (
    <div className="max-w-5xl mx-auto px-8 py-10">
      {/* Header */}
      <div className="mb-6">
        <p className="text-status-purple text-xs uppercase tracking-widest font-semibold mb-1">
          Clinical Analysis — Final Report · Lumos v2.1
        </p>
        <h1 className="text-2xl font-bold text-text-heading mb-1">
          {drugName} · {indication} · Clinical Analysis
        </h1>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-text-muted text-sm">
            {sponsor} · Generated {generatedAt}
          </p>
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

        <div className="space-y-5">
          {/* ── Clinical Analysis Summary banner (top) ── */}
          <div className="p-5 bg-bg-surface border border-border-subtle rounded-2xl">
            <div className="flex items-center justify-between gap-4 mb-3">
              <p className="text-status-purple text-[10px] uppercase tracking-widest font-semibold">Clinical Analysis Summary</p>
              <span
                className="text-xs font-semibold px-2.5 py-1 rounded-full bg-bg-overlay border border-border-subtle text-text-secondary cursor-help whitespace-nowrap"
                title={concordanceTooltip}
              >
                N={totalN} · {concordance_pct}% ML concordance ⓘ
              </span>
            </div>
            <p className="text-text-body text-sm leading-relaxed">{execSummary}</p>
            <div className="mt-4 pt-3 border-t border-border-subtle flex gap-6 flex-wrap">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-text-muted mb-0.5">Responders</p>
                <p className="text-sm font-semibold text-status-success">{responder_count} / {totalN} patients</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-text-muted mb-0.5">Non-Responders</p>
                <p className="text-sm font-semibold text-status-danger">{nonresponder_count} / {totalN} patients</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-text-muted mb-0.5">Uncertain</p>
                <p className="text-sm font-semibold text-text-muted">{uncertain_count} / {totalN} patients</p>
              </div>
            </div>
          </div>

          {/* ── Phenotype cards — full width, stacked ── */}
          <div className="space-y-5">
            <ProfileCard profile={report.refined_responder_profile} type="responder" />
            <ProfileCard profile={report.refined_nonresponder_profile} type="nonresponder" />
          </div>

          {/* ── Methodology accordion ── */}
          {report.methodology_narrative && (
            <div className="bg-bg-surface border border-border-subtle rounded-2xl overflow-hidden">
              <button
                onClick={() => setMethodologyOpen(v => !v)}
                className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-bg-overlay transition-colors"
              >
                <p className="text-[10px] uppercase tracking-widest text-text-secondary font-semibold">
                  Clinical Analysis Methodology
                </p>
                <span className="text-text-muted text-xs">{methodologyOpen ? "Hide ↑" : "Show ↓"}</span>
              </button>
              {methodologyOpen && (
                <div className="px-5 pb-5 border-t border-border-subtle">
                  <div className="text-text-muted text-sm leading-relaxed space-y-3 max-w-prose pt-4">
                    {report.methodology_narrative.split(/\n\n+/).map((para, i) => (
                      <p key={i}>{para.trim()}</p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
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
