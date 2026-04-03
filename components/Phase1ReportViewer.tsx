"use client";

import { useState } from "react";
import { Phase1ReportData } from "@/lib/pipeline/synthesize-phase1";
import Phase1ExportButton from "@/components/Phase1ExportButton";

interface Props {
  report: Phase1ReportData;
  drugName: string;
  indication: string;
  generatedAt: string;
  studyId: string;
}

// ── Confidence badge — clickable, shows why ──────────────────────────────────
function ConfidenceBadge({
  value,
  onClick,
  active,
}: {
  value: number;
  onClick?: () => void;
  active?: boolean;
}) {
  const pct = Math.round(value * 100);
  const color = pct >= 70 ? "#22C55E" : pct >= 45 ? "#F59E0B" : "#EF4444";
  return (
    <button
      onClick={onClick}
      className="text-xs font-semibold px-2.5 py-1 rounded-full border transition-all"
      style={{
        color,
        borderColor: color,
        background: active ? `${color}30` : `${color}18`,
        cursor: onClick ? "pointer" : "default",
      }}
      title={onClick ? "Click to see confidence reasoning" : undefined}
    >
      {pct}% confidence {onClick && (active ? "▲" : "▼")}
    </button>
  );
}

// ── Signal badge ─────────────────────────────────────────────────────────────
function SignalBadge({ strength }: { strength: string }) {
  const map: Record<string, { color: string; label: string }> = {
    strong:   { color: "#22C55E", label: "Strong" },
    moderate: { color: "#F59E0B", label: "Moderate" },
    weak:     { color: "#6B7280", label: "Weak" },
  };
  const { color, label } = map[strength] ?? map.weak;
  return (
    <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ color, background: `${color}20` }}>
      {label}
    </span>
  );
}

// ── Severity badge ────────────────────────────────────────────────────────────
function SeverityBadge({ severity }: { severity: string }) {
  const map: Record<string, string> = { high: "#EF4444", medium: "#F59E0B", low: "#6B7280" };
  const color = map[severity] ?? "#6B7280";
  return (
    <span className="text-xs font-medium px-2 py-0.5 rounded-full capitalize" style={{ color, background: `${color}20` }}>
      {severity}
    </span>
  );
}

// ── Tab button ────────────────────────────────────────────────────────────────
function Tab({ label, active, onClick, count }: { label: string; active: boolean; onClick: () => void; count?: number }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
        active
          ? "border-[#4F8EF7] text-[#4F8EF7]"
          : "border-transparent text-[#8BA3C7] hover:text-[#F0F4FF]"
      }`}
    >
      {label}
      {count !== undefined && (
        <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${active ? "bg-[#4F8EF7]/20" : "bg-[#1E3A5F]"}`}>
          {count}
        </span>
      )}
    </button>
  );
}

// ── Profile field ─────────────────────────────────────────────────────────────
function ProfileField({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="mb-3">
      <p className="text-[#8BA3C7] text-[10px] uppercase tracking-wider mb-1">{label}</p>
      <p className="text-[#D0DCF0] text-sm leading-relaxed">{value}</p>
    </div>
  );
}

// ── Biomarker priority bar ────────────────────────────────────────────────────
function PriorityBar({ pct }: { pct: number }) {
  const color = pct >= 75 ? "#22C55E" : pct >= 50 ? "#4F8EF7" : "#F59E0B";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-[#1E3A5F] rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-xs font-medium w-8 text-right" style={{ color }}>{pct}</span>
    </div>
  );
}

// ── Confidence reasoning panel ────────────────────────────────────────────────
function ConfidencePanel({ overall, narrative }: { overall: number; narrative: string }) {
  const pct = Math.round(overall * 100);
  const drivers =
    pct >= 70
      ? { label: "High confidence", color: "#22C55E", summary: "Strong mechanistic evidence with multiple converging preclinical signals." }
      : pct >= 45
      ? { label: "Moderate confidence", color: "#F59E0B", summary: "Moderate mechanistic support with meaningful translational uncertainty." }
      : { label: "Low confidence", color: "#EF4444", summary: "Limited or conflicting evidence. Treat predictions as directional hypotheses only." };

  return (
    <div className="mt-3 p-4 bg-[#060D1A] border border-[#4F8EF7]/30 rounded-xl">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs font-semibold" style={{ color: drivers.color }}>{drivers.label} — {pct}%</span>
      </div>
      <p className="text-[#8BA3C7] text-xs leading-relaxed mb-3">{drivers.summary}</p>
      <p className="text-[#4F8EF7] text-[10px] uppercase tracking-wider mb-1">Full reasoning</p>
      <p className="text-[#C0CFEA] text-xs leading-relaxed">{narrative}</p>
    </div>
  );
}

export default function Phase1ReportViewer({ report, drugName, indication, generatedAt, studyId }: Props) {
  const [activeTab, setActiveTab] = useState<"overview" | "biomarkers" | "evidence" | "methodology">("methodology");
  const [showConfidence, setShowConfidence] = useState(false);

  const genDate = new Date(generatedAt).toLocaleDateString("en-US", {
    year: "numeric", month: "short", day: "numeric",
  });

  return (
    <div className="max-w-4xl mx-auto px-8 py-8 print:px-4 print:py-2">

      {/* ── Report header ──────────────────────────────────────────────── */}
      <div className="mb-6">
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="text-[#4F8EF7] text-xs uppercase tracking-widest mb-1">Phase 1 — Preclinical Report</p>
            <h1 className="text-2xl font-bold text-[#F0F4FF]">{drugName} · {indication}</h1>
            <p className="text-[#4A6580] text-xs mt-1">Generated {genDate}</p>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <ConfidenceBadge
              value={report.overall_confidence}
              onClick={() => setShowConfidence(v => !v)}
              active={showConfidence}
            />
            <Phase1ExportButton
              studyId={studyId}
              drugName={drugName}
            />
          </div>
        </div>

        {/* Confidence reasoning panel */}
        {showConfidence && (
          <ConfidencePanel overall={report.overall_confidence} narrative={report.methodology_narrative} />
        )}
      </div>

      {/* ── Tabs ──────────────────────────────────────────────────────── */}
      <div className="flex border-b border-[#1E3A5F] mb-6 -mx-1 overflow-x-auto">
        <Tab label="Methodology" active={activeTab === "methodology"} onClick={() => setActiveTab("methodology")} />
        <Tab label="Overview" active={activeTab === "overview"} onClick={() => setActiveTab("overview")} />
        <Tab label="Biomarker Protocol" active={activeTab === "biomarkers"} onClick={() => setActiveTab("biomarkers")} count={report.biomarker_recommendations?.length} />
        <Tab label="Evidence & Safety" active={activeTab === "evidence"} onClick={() => setActiveTab("evidence")} count={(report.cross_species_evidence?.length ?? 0) + (report.safety_flags?.length ?? 0)} />
      </div>

      {/* ══ OVERVIEW TAB ══════════════════════════════════════════════ */}
      {activeTab === "overview" && (
        <div>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            {/* Responder */}
            <div className="bg-[#0F1F3D] border border-[#1E3A5F] rounded-2xl p-6 min-w-0">
              <div className="flex items-center justify-between gap-3 mb-1">
                <p className="text-[#22C55E] text-[10px] uppercase tracking-widest">Predicted Responder</p>
                <ConfidenceBadge value={report.responder_profile.corpus_hypothesis_confidence} />
              </div>
              <h2 className="text-[#F0F4FF] font-semibold text-sm leading-snug mb-3 break-words">
                {report.responder_profile.primary_subtype}
              </h2>
              <p className="text-[#D0DCF0] text-sm leading-relaxed mb-4">{report.responder_profile.summary}</p>
              <ProfileField label="Demographics" value={report.responder_profile.demographics} />
              <ProfileField label="Core Clinical" value={report.responder_profile.core_clinical} />
              <ProfileField label="Inflammatory" value={report.responder_profile.inflammatory} />
              <ProfileField label="Neuroplasticity" value={report.responder_profile.neuroplasticity} />
              {report.responder_profile.imaging && <ProfileField label="Imaging" value={report.responder_profile.imaging} />}
              {report.responder_profile.key_inclusion_criteria?.length > 0 && (
                <div className="mt-4 pt-4 border-t border-[#1E3A5F]">
                  <p className="text-[#8BA3C7] text-[10px] uppercase tracking-wider mb-2">Key Inclusion Criteria</p>
                  <ul className="space-y-1.5">
                    {report.responder_profile.key_inclusion_criteria.map((c, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-[#D0DCF0]">
                        <span className="text-[#22C55E] flex-shrink-0 mt-0.5">✓</span>{c}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Non-responder */}
            <div className="bg-[#0F1F3D] border border-[#1E3A5F] rounded-2xl p-6 min-w-0">
              <div className="flex items-center justify-between gap-3 mb-1">
                <p className="text-[#EF4444] text-[10px] uppercase tracking-widest">Predicted Non-Responder</p>
                <ConfidenceBadge value={report.nonresponder_profile.corpus_hypothesis_confidence} />
              </div>
              <h2 className="text-[#F0F4FF] font-semibold text-sm leading-snug mb-3 break-words">
                {report.nonresponder_profile.primary_subtype}
              </h2>
              <p className="text-[#D0DCF0] text-sm leading-relaxed mb-4">{report.nonresponder_profile.summary}</p>
              <ProfileField label="Demographics" value={report.nonresponder_profile.demographics} />
              <ProfileField label="Core Clinical" value={report.nonresponder_profile.core_clinical} />
              <ProfileField label="Inflammatory" value={report.nonresponder_profile.inflammatory} />
              <ProfileField label="Neuroplasticity" value={report.nonresponder_profile.neuroplasticity} />
              {report.nonresponder_profile.imaging && <ProfileField label="Imaging" value={report.nonresponder_profile.imaging} />}
              {report.nonresponder_profile.key_exclusion_criteria?.length > 0 && (
                <div className="mt-4 pt-4 border-t border-[#1E3A5F]">
                  <p className="text-[#8BA3C7] text-[10px] uppercase tracking-wider mb-2">Key Exclusion Criteria</p>
                  <ul className="space-y-1.5">
                    {report.nonresponder_profile.key_exclusion_criteria.map((c, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-[#D0DCF0]">
                        <span className="text-[#EF4444] flex-shrink-0 mt-0.5">✕</span>{c}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══ BIOMARKERS TAB ════════════════════════════════════════════ */}
      {activeTab === "biomarkers" && (
        <div>
          {(report.primary_endpoint_recommendation || report.early_response_indicator) && (
            <div className="grid grid-cols-2 gap-4 mb-6">
              {report.primary_endpoint_recommendation && (
                <div className="p-4 bg-[#0F1F3D] border border-[#4F8EF7]/30 rounded-xl">
                  <p className="text-[#4F8EF7] text-[10px] uppercase tracking-wider mb-1.5">Primary Endpoint Recommendation</p>
                  <p className="text-[#D0DCF0] text-sm leading-relaxed">{report.primary_endpoint_recommendation}</p>
                </div>
              )}
              {report.early_response_indicator && (
                <div className="p-4 bg-[#0F1F3D] border border-[#22C55E]/30 rounded-xl">
                  <p className="text-[#22C55E] text-[10px] uppercase tracking-wider mb-1.5">Early Response Indicator</p>
                  <p className="text-[#D0DCF0] text-sm leading-relaxed">{report.early_response_indicator}</p>
                </div>
              )}
            </div>
          )}

          <div className="space-y-3">
            {report.biomarker_recommendations?.sort((a, b) => a.rank - b.rank).map((bm) => {
              const domainColors: Record<string, string> = {
                inflammatory: "#EF4444", neuroplasticity: "#A855F7",
                behavioral: "#F59E0B", imaging: "#4F8EF7", genetic: "#22C55E",
              };
              const dc = domainColors[bm.domain] ?? "#6B7280";
              return (
                <div key={bm.rank} className="p-4 bg-[#0F1F3D] border border-[#1E3A5F] rounded-xl">
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 bg-[#1E3A5F] text-[#4F8EF7]">{bm.rank}</span>
                      <div>
                        <span className="text-[#F0F4FF] text-sm font-medium">{bm.name}</span>
                        {bm.unit && <span className="text-[#8BA3C7] text-xs ml-1.5">({bm.unit})</span>}
                      </div>
                    </div>
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full capitalize flex-shrink-0" style={{ color: dc, background: `${dc}20` }}>
                      {bm.domain}
                    </span>
                  </div>
                  <PriorityBar pct={bm.priority_pct} />
                  <p className="text-[#8BA3C7] text-xs mt-3 leading-relaxed">{bm.preclinical_rationale}</p>
                  <div className="grid grid-cols-2 gap-3 mt-3">
                    <div className="p-2.5 bg-[#0A1F0A] border border-[#22C55E]/20 rounded-lg">
                      <p className="text-[#22C55E] text-xs font-medium mb-0.5">Responder signal</p>
                      <p className="text-[#D0DCF0] text-xs">{bm.responder_threshold}</p>
                    </div>
                    <div className="p-2.5 bg-[#1A0A0A] border border-[#EF4444]/20 rounded-lg">
                      <p className="text-[#EF4444] text-xs font-medium mb-0.5">Non-responder signal</p>
                      <p className="text-[#D0DCF0] text-xs">{bm.nonresponder_threshold}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-3 flex-wrap">
                    <p className="text-[#4A6580] text-xs">Timing:</p>
                    {bm.timing.map((t) => (
                      <span key={t} className="text-xs px-2 py-0.5 rounded bg-[#1E3A5F] text-[#8BA3C7]">{t}</span>
                    ))}
                    <span className="text-[#4A6580] text-xs ml-1">· {bm.collection_method}</span>
                  </div>
                </div>
              );
            })}
          </div>
          {report.protocol_notes && (
            <p className="mt-5 text-[#8BA3C7] text-xs leading-relaxed border-t border-[#1E3A5F] pt-4">{report.protocol_notes}</p>
          )}
        </div>
      )}

      {/* ══ EVIDENCE & SAFETY TAB ═════════════════════════════════════ */}
      {activeTab === "evidence" && (
        <div className="space-y-6">
          {report.cross_species_evidence?.length > 0 && (
            <div>
              <h3 className="text-[#A855F7] text-xs uppercase tracking-widest font-semibold mb-3">🐭 Cross-Species Evidence</h3>
              <div className="space-y-3">
                {report.cross_species_evidence.map((ev, i) => (
                  <div key={i} className="p-4 bg-[#0F1F3D] border border-[#1E3A5F] rounded-xl">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <span className="text-[#F0F4FF] text-sm font-medium">{ev.animal_model}</span>
                        <span className="text-[#4A6580] text-xs">→</span>
                        <span className="text-[#A855F7] text-sm">{ev.human_subtype_mapping}</span>
                      </div>
                      <SignalBadge strength={ev.signal_strength} />
                    </div>
                    {ev.key_biomarker_signals?.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {ev.key_biomarker_signals.map((sig, j) => (
                          <span key={j} className="text-xs px-2 py-0.5 rounded bg-[#1E3A5F] text-[#8BA3C7]">{sig}</span>
                        ))}
                      </div>
                    )}
                    {ev.corpus_ref && <p className="text-[#4A6580] text-xs italic">{ev.corpus_ref}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {report.safety_flags?.length > 0 && (
            <div>
              <h3 className="text-[#F59E0B] text-xs uppercase tracking-widest font-semibold mb-3">⚠️ Safety Signals</h3>
              <div className="space-y-3">
                {report.safety_flags.map((flag, i) => (
                  <div key={i} className="p-4 bg-[#0F1F3D] border border-[#1E3A5F] rounded-xl">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <p className="text-[#F0F4FF] text-sm font-medium">{flag.signal}</p>
                      <SeverityBadge severity={flag.severity} />
                    </div>
                    <p className="text-[#8BA3C7] text-xs mb-1.5 leading-relaxed">{flag.clinical_implication}</p>
                    <p className="text-[#4A6580] text-xs italic">Source: {flag.source}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══ METHODOLOGY TAB ═══════════════════════════════════════════ */}
      {activeTab === "methodology" && (
        <div className="space-y-4">
          <div className="p-5 bg-[#0F1F3D] border border-[#1E3A5F] rounded-xl">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[#F0F4FF] font-semibold text-sm">Overall Confidence</h3>
              <ConfidenceBadge value={report.overall_confidence} />
            </div>
            <p className="text-[#D0DCF0] text-sm leading-relaxed">{report.methodology_narrative}</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-[#0F1F3D] border border-[#1E3A5F] rounded-xl">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[#22C55E] text-xs uppercase tracking-wider font-medium">Responder Hypothesis</p>
                <ConfidenceBadge value={report.responder_profile.corpus_hypothesis_confidence} />
              </div>
              <p className="text-[#8BA3C7] text-xs leading-relaxed">
                Confidence reflects the strength and consistency of corpus evidence supporting the responder phenotype definition for Subtype {report.responder_profile.primary_subtype}.
              </p>
            </div>
            <div className="p-4 bg-[#0F1F3D] border border-[#1E3A5F] rounded-xl">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[#EF4444] text-xs uppercase tracking-wider font-medium">Non-Responder Hypothesis</p>
                <ConfidenceBadge value={report.nonresponder_profile.corpus_hypothesis_confidence} />
              </div>
              <p className="text-[#8BA3C7] text-xs leading-relaxed">
                Confidence reflects the strength of negative evidence and mechanistic rationale for Subtype {report.nonresponder_profile.primary_subtype} exclusion.
              </p>
            </div>
          </div>
          <div className="p-4 bg-[#080F1F] border border-[#1E3A5F] rounded-xl text-center">
            <p className="text-[#8BA3C7] text-xs">Phase 1 pre-clinical analysis · All evidence is in vitro or animal-model — no human clinical data yet</p>
            <p className="text-[#4A6580] text-xs mt-1">Re-run with Lumos v2.1 after Phase 1 clinical data collection</p>
          </div>
        </div>
      )}
    </div>
  );
}
