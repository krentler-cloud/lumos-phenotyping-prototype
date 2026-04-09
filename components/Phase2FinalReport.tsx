"use client";

import { useState, useEffect } from "react";
import { Phase2ReportData, RefinedProfile, CROPrompt, EnhancedOutcomeMeasure } from "@/lib/pipeline/synthesize-phase2";
import { Phase2MLResult } from "@/lib/pipeline/clinical-ml";
import { DimensionBlock, PosteriorBadge, splitSummary } from "@/components/reportShared";

interface FullReport extends Phase2ReportData {
  ml_result: Phase2MLResult;
}

type Tab = "phenotypes" | "outcomes" | "cro";

// ── Fire a question into the LumosAI chat panel ───────────────────────────────
function askLumosAI(question: string) {
  window.dispatchEvent(new CustomEvent("lumos-ask", { detail: { question } }));
}

// ── Derive executive summary fallback ─────────────────────────────────────────
function deriveExecutiveSummary(report: FullReport): string {
  if (report.executive_summary) return report.executive_summary;
  if (report.methodology_narrative) {
    const firstPara = report.methodology_narrative.split(/\n\n+/)[0]?.trim();
    if (firstPara) return firstPara;
  }
  return "Clinical analysis of the N=16 participant cohort refines the Planning Phase phenotype hypotheses and updates confidence in responder and non-responder profiles.";
}

// ── Refined profile card ──────────────────────────────────────────────────────
function ProfileCard({ profile, type }: { profile: RefinedProfile; type: "responder" | "nonresponder" }) {
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
      <div className={`flex items-center justify-between gap-3 px-6 py-4 border-b border-border-subtle ${headerBg}`}>
        <div className="flex items-center gap-3">
          <span className={`w-2 h-2 rounded-full ${dotBg} flex-shrink-0`} />
          <p className={`${textColor} text-xs font-semibold uppercase tracking-widest`}>{label}</p>
        </div>
        <PosteriorBadge posterior={profile.phase2_confidence} prior={profile.phase1_confidence} />
      </div>

      <div className="p-6 space-y-5">
        <div>
          <p className="text-text-body text-sm leading-relaxed">{summarySplit.lead}</p>
          {summarySplit.rest && (
            <>
              {expanded && <p className="text-text-muted text-sm leading-relaxed mt-2">{summarySplit.rest}</p>}
              <button onClick={() => setExpanded(v => !v)} className="text-xs text-brand-core hover:underline mt-2 block">
                {expanded ? "Hide full rationale ↑" : "Full rationale ↓"}
              </button>
            </>
          )}
          {profile.what_changed && (
            <div className="mt-3">
              <button onClick={() => setChangedOpen(v => !v)} className="text-xs text-brand-core hover:underline">
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

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <DimensionBlock label="Demographics"    value={profile.demographics} />
          <DimensionBlock label="Core Clinical"   value={profile.core_clinical} />
          <DimensionBlock label="Inflammatory"    value={profile.inflammatory} />
          <DimensionBlock label="Neuroplasticity" value={profile.neuroplasticity} />
          {profile.imaging && <DimensionBlock label="Imaging / EEG" value={profile.imaging} />}
        </div>

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

// ── Outcome measure card — matches ProfileCard style ──────────────────────────
const OUTCOME_TYPE_CONFIG = {
  primary_endpoint:  { label: "Primary Endpoint",        icon: "🎯", border: "border-brand-core/20",    headerBg: "bg-brand-core/[0.04]",    dot: "bg-brand-core",    text: "text-brand-core" },
  early_response:    { label: "Early Response Indicator", icon: "⚡", border: "border-status-success/20", headerBg: "bg-status-success/[0.04]", dot: "bg-status-success", text: "text-status-success" },
  leading_indicator: { label: "Leading Indicator",        icon: "📊", border: "border-status-warning/20", headerBg: "bg-status-warning/[0.04]", dot: "bg-status-warning", text: "text-status-warning" },
};

function OutcomeMeasureCard({ m }: { m: EnhancedOutcomeMeasure }) {
  const [rationaleOpen, setRationaleOpen] = useState(false);
  const cfg = OUTCOME_TYPE_CONFIG[m.type] ?? OUTCOME_TYPE_CONFIG.leading_indicator;

  return (
    <div className={`bg-bg-surface border ${cfg.border} rounded-2xl overflow-hidden`}>
      <div className={`flex items-center justify-between gap-3 px-6 py-4 border-b border-border-subtle ${cfg.headerBg}`}>
        <div className="flex items-center gap-3">
          <span className={`w-2 h-2 rounded-full ${cfg.dot} flex-shrink-0`} />
          <p className={`${cfg.text} text-xs font-semibold uppercase tracking-widest`}>{cfg.icon} {cfg.label}</p>
          <span className="text-text-heading font-bold text-sm">· {m.name}</span>
        </div>
        <span className={`text-[10px] px-2.5 py-1 rounded-full font-medium whitespace-nowrap ${cfg.text}`}
          style={{ background: `color-mix(in srgb, currentColor 12%, transparent)` }}>
          {m.timing}
        </span>
      </div>

      <div className="p-6 space-y-3">
        <p className="text-text-body text-sm leading-relaxed">{m.description}</p>
        {m.clinical_rationale && (
          <>
            <button onClick={() => setRationaleOpen(v => !v)} className="text-xs text-brand-core hover:underline">
              {rationaleOpen ? "Hide clinical rationale ↑" : "Clinical rationale ↓"}
            </button>
            {rationaleOpen && (
              <div className="p-3 rounded-lg bg-bg-page border border-border-subtle">
                <p className="text-text-muted text-xs leading-relaxed">{m.clinical_rationale}</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Outcomes tab ──────────────────────────────────────────────────────────────
function OutcomesTab({ measures }: { measures: EnhancedOutcomeMeasure[] }) {
  const grouped: Record<string, EnhancedOutcomeMeasure[]> = { primary_endpoint: [], early_response: [], leading_indicator: [] };
  for (const m of measures) {
    (grouped[m.type] ?? grouped.leading_indicator).push(m);
  }

  const SECTION_CONFIG = {
    primary_endpoint:  { label: "Primary Endpoint",        color: "var(--brand-core)" },
    early_response:    { label: "Early Response Indicators", color: "var(--status-success)" },
    leading_indicator: { label: "Leading Indicators",        color: "var(--status-warning)" },
  };

  return (
    <div className="space-y-8">
      {(["primary_endpoint", "early_response", "leading_indicator"] as const).map(type => {
        const items = grouped[type];
        if (items.length === 0) return null;
        const { label, color } = SECTION_CONFIG[type];
        return (
          <div key={type}>
            <p className="text-[10px] uppercase tracking-widest font-semibold mb-3" style={{ color }}>{label}</p>
            <div className="space-y-4">
              {items.map((m, i) => <OutcomeMeasureCard key={i} m={m} />)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── CRO prompt card — matches ProfileCard style ───────────────────────────────
const CATEGORY_CONFIG: Record<string, { border: string; headerBg: string; dot: string; text: string; icon: string }> = {
  Inclusion:            { border: "border-status-success/20", headerBg: "bg-status-success/[0.04]", dot: "bg-status-success", text: "text-status-success", icon: "✓" },
  Exclusion:            { border: "border-status-danger/20",  headerBg: "bg-status-danger/[0.04]",  dot: "bg-status-danger",  text: "text-status-danger",  icon: "✕" },
  Stratification:       { border: "border-brand-core/20",     headerBg: "bg-brand-core/[0.04]",     dot: "bg-brand-core",     text: "text-brand-core",     icon: "⊕" },
  "Biomarker Monitoring": { border: "border-status-purple/20",  headerBg: "bg-status-purple/[0.04]",  dot: "bg-status-purple",  text: "text-status-purple",  icon: "◈" },
};

function CROPromptCard({ prompt }: { prompt: CROPrompt }) {
  const [rationaleOpen, setRationaleOpen] = useState(false);
  const cfg = CATEGORY_CONFIG[prompt.category] ?? CATEGORY_CONFIG.Stratification;

  return (
    <div className={`bg-bg-surface border ${cfg.border} rounded-2xl overflow-hidden`}>
      <div className={`flex items-center gap-3 px-6 py-4 border-b border-border-subtle ${cfg.headerBg}`}>
        <span className={`w-2 h-2 rounded-full ${cfg.dot} flex-shrink-0`} />
        <p className={`${cfg.text} text-xs font-semibold uppercase tracking-widest`}>{prompt.category}</p>
      </div>

      <div className="p-6 space-y-3">
        <div className="space-y-2">
          {prompt.criteria.map((c, i) => (
            <div key={i} className="flex items-start gap-2 text-sm text-text-body">
              <span className={`${cfg.text} flex-shrink-0 mt-0.5 font-bold text-xs`}>{cfg.icon}</span>
              <span className="leading-relaxed">{c}</span>
            </div>
          ))}
        </div>

        {prompt.rationale && (
          <>
            <button onClick={() => setRationaleOpen(v => !v)} className="text-xs text-brand-core hover:underline">
              {rationaleOpen ? "Hide rationale ↑" : "Rationale ↓"}
            </button>
            {rationaleOpen && (
              <div className="p-3 rounded-lg bg-bg-page border border-border-subtle">
                <p className="text-text-muted text-xs leading-relaxed">{prompt.rationale}</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── CRO tab ───────────────────────────────────────────────────────────────────
function CROTab({ prompts }: { prompts: CROPrompt[] }) {
  return (
    <div className="space-y-4">
      <div className="p-4 bg-bg-overlay border border-status-warning/20 rounded-xl">
        <p className="text-status-warning text-xs font-semibold mb-1">Clinical Research Organization Use</p>
        <p className="text-text-muted text-xs leading-relaxed">
          These screening prompts translate the data-supported phenotype profiles from the clinical analysis into actionable enrollment criteria for future trial design.
        </p>
      </div>
      {prompts.map((p, i) => <CROPromptCard key={i} prompt={p} />)}
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
  generatedAt: string;   // raw ISO string — formatted client-side (browser timezone)
  report: FullReport;
}) {
  const [activeTab, setActiveTab] = useState<Tab>("phenotypes");
  const [methodologyOpen, setMethodologyOpen] = useState(false);

  // Format date client-side so it uses the user's timezone, not the server's
  const genDateDisplay = (() => {
    try {
      return new Date(generatedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    } catch {
      return generatedAt;
    }
  })();

  const tabs: { id: Tab; label: string }[] = [
    { id: "phenotypes", label: "Refined Phenotypes & Biomarkers" },
    { id: "outcomes", label: "Enhanced Outcome Measures" },
    { id: "cro", label: "CRO Screening Prompts" },
  ];

  const execSummary = deriveExecutiveSummary(report);
  const { responder_count, nonresponder_count, uncertain_count, concordance_pct } = report.ml_result;
  const totalN = responder_count + nonresponder_count + uncertain_count;

  return (
    <div className="max-w-5xl mx-auto px-8 py-10">
      {/* Header */}
      <div className="mb-6">
        <p className="text-status-purple text-xs uppercase tracking-widest font-semibold mb-1">
          Lumos AI · Clinical Analysis — Final Report
        </p>
        <h1 className="text-2xl font-bold text-text-heading mb-1">
          {drugName} · {indication} · Clinical Analysis
        </h1>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-text-muted text-sm">{sponsor} · Generated {genDateDisplay}</p>
          <div className="print-hide flex items-center gap-2">
            <form action={`/api/studies/${studyId}/rerun-phase2`} method="POST">
              <button
                type="submit"
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border-subtle bg-bg-surface text-text-muted hover:text-text-heading hover:border-status-purple transition-colors text-xs font-medium"
                title="Clear this run and re-analyse with the current clinical patient data"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.25"/>
                </svg>
                Re-run Clinical Analysis
              </button>
            </form>
            <button
              onClick={() => window.print()}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border-subtle bg-bg-surface text-text-muted hover:text-text-heading hover:border-brand-core transition-colors text-xs font-medium"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
                <rect x="6" y="14" width="12" height="8"/>
              </svg>
              Export PDF
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
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

      {/* ── Phenotypes tab ── */}
      <div className={activeTab !== "phenotypes" ? "hidden print-show" : ""}>
        <span className="print-section-heading hidden">Refined Phenotypes &amp; Biomarkers</span>
        <div className="space-y-5">

          {/* Clinical Analysis Summary banner */}
          <div className="p-5 bg-bg-surface border border-border-subtle rounded-2xl">
            <div className="flex items-center justify-between gap-4 mb-3">
              <p className="text-status-purple text-[10px] uppercase tracking-widest font-semibold">Clinical Analysis Summary</p>
              {/* ⓘ button fires a LumosAI question about concordance */}
              <button
                onClick={() => askLumosAI(
                  `The clinical analysis shows ${concordance_pct}% ML concordance between Phase 2 patient subtype assignments and the Planning Phase phenotype predictions. What does this concordance rate actually tell us, and what are its limitations as a measure of prediction quality?`
                )}
                className="text-xs font-semibold px-2.5 py-1 rounded-full bg-bg-overlay border border-border-subtle text-text-secondary hover:border-brand-core hover:text-brand-core transition-colors whitespace-nowrap cursor-pointer"
                title="Click to ask LumosAI about this metric"
              >
                N={totalN} · {concordance_pct}% ML concordance ⓘ
              </button>
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

          {/* Phenotype cards */}
          <div className="space-y-5">
            <ProfileCard profile={report.refined_responder_profile} type="responder" />
            <ProfileCard profile={report.refined_nonresponder_profile} type="nonresponder" />
          </div>

          {/* Methodology accordion */}
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

      {/* ── Outcomes tab ── */}
      <div className={activeTab !== "outcomes" ? "hidden print-show" : ""}>
        <span className="print-section-heading hidden">Enhanced Outcome Measures</span>
        <OutcomesTab measures={report.enhanced_outcome_measures ?? []} />
      </div>

      {/* ── CRO tab ── */}
      <div className={activeTab !== "cro" ? "hidden print-show" : ""}>
        <span className="print-section-heading hidden">CRO Screening Prompts</span>
        <CROTab prompts={report.cro_prompts ?? []} />
      </div>
    </div>
  );
}
