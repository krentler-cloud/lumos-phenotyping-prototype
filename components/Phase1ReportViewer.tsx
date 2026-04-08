"use client";

import { useState, useEffect } from "react";
import { Phase1ReportData } from "@/lib/pipeline/synthesize-phase1";
import { ExploratoryBiomarker } from "@/lib/types";
import Phase1ExportButton from "@/components/Phase1ExportButton";

// SCIENCE-FEEDBACK: P1-F — SAD/MAD cohort type (mirrors DB row)
interface SadMadCohort {
  id: string;
  phase: "SAD" | "MAD";
  cohort_name: string;
  dose_mg: number;
  n_active: number;
  n_placebo: number;
  status: string;
  cmax_mean_ng_ml?: number | null;
  cmax_sd?: number | null;
  tmax_mean_h?: number | null;
  auc0t_mean?: number | null;
  half_life_mean_h?: number | null;
  bioavailability_pct?: number | null;
  accumulation_ratio?: number | null;
  bdnf_pct_change_day14?: number | null;
  bdnf_pct_change_sd?: number | null;
  bdnf_p_value?: number | null;
  il6_pct_change_day14?: number | null;
  crp_pct_change_day14?: number | null;
  ae_rate_pct: number;
  ae_max_grade: number;
  discontinuations: number;
  ae_description?: string | null;
}

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
  const color = pct >= 70 ? "var(--status-success)" : pct >= 45 ? "var(--status-warning)" : "var(--status-danger)";
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
    strong:   { color: "var(--status-success)", label: "Strong" },
    moderate: { color: "var(--status-warning)", label: "Moderate" },
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
  const map: Record<string, string> = { high: "var(--status-danger)", medium: "var(--status-warning)", low: "#6B7280" };
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
          ? "border-brand-core text-brand-core"
          : "border-transparent text-text-muted hover:text-text-heading"
      }`}
    >
      {label}
      {count !== undefined && (
        <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${active ? "bg-brand-core/20" : "bg-nav-item-active-bg"}`}>
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
    <div className="flex gap-3 py-1.5 border-b border-border-subtle last:border-0">
      <span className="text-text-muted text-[10px] uppercase tracking-wider flex-shrink-0 w-28 pt-0.5">{label}</span>
      <span className="text-text-body text-sm leading-relaxed flex-1">{value}</span>
    </div>
  );
}

// ── Biomarker priority bar ────────────────────────────────────────────────────
function PriorityBar({ pct }: { pct: number }) {
  const color = pct >= 75 ? "var(--status-success)" : pct >= 50 ? "var(--brand-core)" : "var(--status-warning)";
  return (
    <div>
      {/* SCIENCE-FEEDBACK: P1-B — tooltip clarifies what the score means */}
      <p
        className="text-[10px] uppercase tracking-wider text-text-secondary mb-1 cursor-help"
        title="Priority score reflects corpus evidence density for this biomarker — not clinical effect size or predicted response probability."
      >
        Planning Phase signal strength ⓘ
      </p>
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-nav-item-active-bg rounded-full overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
        </div>
        <span className="text-xs font-medium w-8 text-right" style={{ color }}>{pct}</span>
      </div>
    </div>
  );
}

// ── Confidence reasoning panel ────────────────────────────────────────────────
// ── Methodology narrative parser ─────────────────────────────────────────────
function MethodologyNarrative({ text }: { text: string }) {
  // Split on "Key limitations:" or "Limitations:"
  const limIdx = text.search(/key limitations?:/i);
  const mainText = limIdx > -1 ? text.slice(0, limIdx).trim() : text;
  const limText  = limIdx > -1 ? text.slice(limIdx).replace(/key limitations?:/i, "").trim() : "";

  // Parse numbered evidence streams: (1) ... (2) ... (3)
  const streamRegex = /\((\d+)\)\s+([^(]+?)(?=\(\d+\)|$)/g;
  const streams: { n: string; body: string }[] = [];
  let m;
  while ((m = streamRegex.exec(mainText)) !== null) {
    streams.push({ n: m[1], body: m[2].trim() });
  }
  const intro = streams.length > 0
    ? mainText.slice(0, mainText.search(/\(\d+\)/)).trim()
    : mainText;

  // Parse lettered limitations: (a) ... (b) etc.
  const limRegex = /\(([a-z])\)\s+([^(]+?)(?=\([a-z]\)|$)/g;
  const limitations: { letter: string; body: string }[] = [];
  if (limText) {
    while ((m = limRegex.exec(limText)) !== null) {
      limitations.push({ letter: m[1], body: m[2].trim() });
    }
  }
  const limIntro = limitations.length > 0
    ? limText.slice(0, limText.search(/\([a-z]\)/)).trim()
    : limText;

  return (
    <div className="bg-bg-surface border border-border-subtle rounded-xl overflow-hidden">
      {/* Intro prose */}
      {intro && (
        <div className="px-5 pt-5 pb-4">
          <p className="text-brand-core text-[10px] uppercase tracking-widest font-semibold mb-2">Analysis Approach</p>
          <p className="text-text-body text-sm leading-relaxed">{intro}</p>
        </div>
      )}

      {/* Evidence streams */}
      {streams.length > 0 && (
        <div className="border-t border-border-subtle">
          <p className="text-brand-core text-[10px] uppercase tracking-widest font-semibold px-5 pt-4 pb-2">Evidence Streams</p>
          <div className="divide-y divide-border-subtle">
            {streams.map(({ n, body }) => (
              <div key={n} className="flex items-start gap-4 px-5 py-3">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-bg-page border border-brand-core flex items-center justify-center">
                  <span className="text-brand-core text-[10px] font-bold">{n}</span>
                </div>
                <p className="text-text-body text-xs leading-relaxed pt-0.5">{body}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Limitations */}
      {(limitations.length > 0 || limIntro) && (
        <div className="border-t border-border-subtle bg-bg-page">
          <p className="text-status-warning text-[10px] uppercase tracking-widest font-semibold px-5 pt-4 pb-2">Key Limitations</p>
          {limIntro && <p className="text-text-muted text-xs px-5 pb-2 leading-relaxed">{limIntro}</p>}
          <div className="divide-y divide-border-subtle">
            {limitations.map(({ letter, body }) => (
              <div key={letter} className="flex items-start gap-3 px-5 py-2.5">
                <span className="flex-shrink-0 text-status-warning text-[10px] font-bold uppercase mt-0.5">({letter})</span>
                <p className="text-text-muted text-xs leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
          <div className="h-3" />
        </div>
      )}
    </div>
  );
}

// ── Exploratory Biomarkers tab ────────────────────────────────────────────────
function ExploratoryBiomarkersTab({ biomarkers }: { biomarkers: ExploratoryBiomarker[] }) {
  const classColors: Record<string, string> = {
    "neuroinflammatory": "var(--status-danger)",
    "synaptic plasticity": "var(--status-purple)",
    "HPA axis": "var(--status-warning)",
    "circadian": "#06B6D4",
    "metabolic": "var(--status-success)",
    "genetic": "#3B82F6",
    "imaging": "var(--brand-core)",
  };
  const evidenceColors: Record<string, string> = {
    emerging: "var(--status-warning)",
    preclinical_only: "#D97706",
    theoretical: "#6B7280",
  };
  const feasibilityMeta: Record<string, { icon: string; color: string }> = {
    high: { icon: "✓", color: "var(--status-success)" },
    moderate: { icon: "~", color: "var(--status-warning)" },
    low: { icon: "✗", color: "var(--status-danger)" },
  };

  return (
    <div>
      {/* Disclaimer */}
      <div className="mb-5 p-4 bg-bg-overlay border border-status-warning/30 rounded-xl flex items-start gap-3">
        <span className="text-status-warning flex-shrink-0 mt-0.5">⚠</span>
        <p className="text-[#C0A060] text-xs leading-relaxed">
          <span className="font-semibold text-status-warning">Exploratory only.</span>{" "}
          These biomarkers are hypothesis-generating and are not part of the validated efficacy signal panel. They require further study before clinical use. Treat as signals for add-on assays or future trial design — not as inclusion/exclusion criteria.
        </p>
      </div>

      <div className="space-y-3">
        {biomarkers.map((bm, i) => {
          const classColor = classColors[bm.biomarker_class] ?? "#6B7280";
          const evidenceColor = evidenceColors[bm.evidence_level] ?? "#6B7280";
          const feas = feasibilityMeta[bm.feasibility] ?? feasibilityMeta.moderate;
          return (
            <div key={i} className="p-4 bg-bg-surface border border-border-subtle rounded-xl">
              <div className="flex items-start justify-between gap-4 mb-2">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-text-heading text-sm font-medium">{bm.name}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full capitalize font-medium"
                    style={{ color: classColor, background: `${classColor}20` }}>
                    {bm.biomarker_class}
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded-full capitalize"
                    style={{ color: evidenceColor, background: `${evidenceColor}20` }}>
                    {bm.evidence_level.replace('_', ' ')}
                  </span>
                </div>
                <span className="text-xs font-semibold flex-shrink-0 flex items-center gap-1"
                  style={{ color: feas.color }}>
                  <span>{feas.icon}</span>
                  <span className="capitalize">{bm.feasibility}</span>
                </span>
              </div>
              <p className="text-text-muted text-xs leading-relaxed mb-3">{bm.rationale}</p>
              {bm.corpus_refs?.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {bm.corpus_refs.map((ref, j) => (
                    <span key={j} className="text-[10px] px-2 py-0.5 bg-bg-page border border-border-subtle text-text-secondary rounded italic truncate max-w-xs">
                      {ref}
                    </span>
                  ))}
                </div>
              )}
              <div className="pt-2.5 border-t border-border-subtle">
                <span className="text-brand-core text-[10px] uppercase tracking-wider font-semibold">→ Learning objective: </span>
                <span className="text-text-muted text-xs">{bm.learning_objective}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// SCIENCE-FEEDBACK: P1-F — Phase 1 Human Data tab (SAD/MAD PK + PD)
function HumanDataTab({ studyId }: { studyId: string }) {
  const [cohorts, setCohorts] = useState<SadMadCohort[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/studies/${studyId}/sad-mad`)
      .then(r => r.json())
      .then(data => setCohorts(data.cohorts ?? []))
      .catch(() => setError("Failed to load SAD/MAD data"));
  }, [studyId]);

  if (error) return <p className="text-status-danger text-sm">{error}</p>;
  if (cohorts === null) return <p className="text-text-muted text-sm">Loading…</p>;
  if (cohorts.length === 0) {
    return (
      <div className="p-6 bg-bg-surface border border-border-subtle rounded-xl text-center">
        <p className="text-text-muted text-sm">No SAD/MAD cohort data available for this study.</p>
        <p className="text-text-secondary text-xs mt-1">Run <code className="bg-bg-page px-1 rounded">scripts/seed-clinical-data.ts</code> after applying the 008 migration.</p>
      </div>
    );
  }

  const sadRows = cohorts.filter(c => c.phase === "SAD");
  const madRows = cohorts.filter(c => c.phase === "MAD");
  const ongoingCohorts = cohorts.filter(c => c.status.toLowerCase().includes("ongoing"));
  const totalDiscontinuations = cohorts.reduce((s, c) => s + (c.discontinuations ?? 0), 0);
  const maxGrade = Math.max(...cohorts.map(c => c.ae_max_grade ?? 0));

  // MAD BDNF chart — horizontal bars, scale to max absolute value
  const madWithBdnf = madRows.filter(c => c.bdnf_pct_change_day14 != null);
  const maxBdnf = Math.max(...madWithBdnf.map(c => Math.abs(c.bdnf_pct_change_day14!)), 1);

  return (
    <div className="space-y-6">
      {/* Enrollment banner */}
      {ongoingCohorts.length > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 bg-status-info/10 border border-status-info/30 rounded-xl">
          <span className="w-2 h-2 rounded-full bg-status-info flex-shrink-0 animate-pulse" />
          <p className="text-xs text-status-info">
            <span className="font-semibold">Enrollment active:</span> {ongoingCohorts.map(c => c.cohort_name).join(", ")} — data preliminary
          </p>
        </div>
      )}

      {/* Tolerability summary */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Max AE Grade", value: maxGrade === 0 ? "None" : `Grade ${maxGrade}`, ok: maxGrade <= 1 },
          { label: "Total Discontinuations", value: String(totalDiscontinuations), ok: totalDiscontinuations === 0 },
          { label: "SAD Cohorts Completed", value: `${sadRows.filter(c => c.status === "Complete").length} / ${sadRows.length}`, ok: true },
        ].map(item => (
          <div key={item.label} className="bg-bg-surface border border-border-subtle rounded-xl p-4">
            <p className="text-text-secondary text-[10px] uppercase tracking-wider mb-1">{item.label}</p>
            <p className={`text-lg font-bold ${item.ok ? "text-status-success" : "text-status-warning"}`}>{item.value}</p>
          </div>
        ))}
      </div>

      {/* SAD PK Table */}
      {sadRows.length > 0 && (
        <div>
          <p className="text-text-secondary text-[10px] uppercase tracking-widest font-semibold mb-3">
            Single Ascending Dose (SAD) — Pharmacokinetics
          </p>
          <div className="overflow-x-auto rounded-xl border border-border-subtle">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-bg-overlay border-b border-border-subtle">
                  {["Cohort", "N (Active)", "Cmax (ng/mL)", "tmax (h)", "AUC₀₋ₜ", "t½ (h)", "F%", "AE Rate", "Description"].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left text-text-secondary font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {sadRows.map(c => (
                  <tr key={c.id} className="bg-bg-surface hover:bg-bg-overlay transition-colors">
                    <td className="px-3 py-2 font-medium text-text-heading whitespace-nowrap">{c.cohort_name}</td>
                    <td className="px-3 py-2 text-text-body">{c.n_active}</td>
                    <td className="px-3 py-2 text-text-body">{c.cmax_mean_ng_ml != null ? `${c.cmax_mean_ng_ml}${c.cmax_sd != null ? ` ±${c.cmax_sd}` : ""}` : "—"}</td>
                    <td className="px-3 py-2 text-text-body">{c.tmax_mean_h ?? "—"}</td>
                    <td className="px-3 py-2 text-text-body">{c.auc0t_mean != null ? c.auc0t_mean.toLocaleString() : "—"}</td>
                    <td className="px-3 py-2 text-text-body">{c.half_life_mean_h ?? "—"}</td>
                    <td className="px-3 py-2 text-text-body">{c.bioavailability_pct != null ? `${c.bioavailability_pct}%` : "—"}</td>
                    <td className="px-3 py-2">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${c.ae_rate_pct === 0 ? "bg-status-success/10 text-status-success" : c.ae_max_grade >= 2 ? "bg-status-warning/10 text-status-warning" : "bg-status-info/10 text-status-info"}`}>
                        {c.ae_rate_pct}% (G{c.ae_max_grade})
                      </span>
                    </td>
                    <td className="px-3 py-2 text-text-muted italic">{c.ae_description || "None"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-text-secondary text-[10px] mt-2">
            Linear PK confirmed across SAD doses. t½ ≈ 9–10h suggests QD dosing. F ≈ 42% consistent across cohorts.
          </p>
        </div>
      )}

      {/* MAD BDNF chart */}
      {madWithBdnf.length > 0 && (
        <div>
          <p className="text-text-secondary text-[10px] uppercase tracking-widest font-semibold mb-3">
            Multiple Ascending Dose (MAD) — BDNF % Change at Day 14
          </p>
          <div className="bg-bg-surface border border-border-subtle rounded-xl p-4 space-y-3">
            {madWithBdnf.map(c => {
              const pct = c.bdnf_pct_change_day14!;
              const barW = Math.round((Math.abs(pct) / maxBdnf) * 100);
              const sig = c.bdnf_p_value != null && c.bdnf_p_value < 0.05;
              return (
                <div key={c.id}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-text-body text-xs font-medium">{c.cohort_name}</span>
                    <div className="flex items-center gap-2">
                      {sig && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-status-success/10 text-status-success font-semibold">p={c.bdnf_p_value}</span>
                      )}
                      {!sig && c.bdnf_p_value != null && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-bg-overlay text-text-secondary">p={c.bdnf_p_value} (ns)</span>
                      )}
                      <span className={`text-xs font-semibold ${pct > 0 ? "text-status-success" : "text-status-danger"}`}>
                        {pct > 0 ? "+" : ""}{pct}%
                      </span>
                    </div>
                  </div>
                  <div className="h-2 bg-bg-overlay rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${barW}%`,
                        backgroundColor: sig ? "var(--status-success)" : pct > 0 ? "var(--brand-core)" : "var(--status-danger)",
                        opacity: sig ? 1 : 0.6,
                      }}
                    />
                  </div>
                </div>
              );
            })}
            <p className="text-text-secondary text-[10px] pt-2 border-t border-border-subtle">
              Green bars = statistically significant (p&lt;0.05). 100 mg QD shows first significant BDNF elevation consistent with corpus neuroplasticity predictions.
            </p>
          </div>
        </div>
      )}

      {/* MAD full table */}
      {madRows.length > 0 && (
        <div>
          <p className="text-text-secondary text-[10px] uppercase tracking-widest font-semibold mb-3">
            MAD — Pharmacodynamics + Safety Summary
          </p>
          <div className="overflow-x-auto rounded-xl border border-border-subtle">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-bg-overlay border-b border-border-subtle">
                  {["Cohort", "Accum Ratio", "BDNF Δ (D14)", "p", "IL-6 Δ", "CRP Δ", "AE Rate", "Status"].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left text-text-secondary font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {madRows.map(c => (
                  <tr key={c.id} className={`bg-bg-surface hover:bg-bg-overlay transition-colors ${c.status.toLowerCase().includes("ongoing") ? "opacity-75" : ""}`}>
                    <td className="px-3 py-2 font-medium text-text-heading whitespace-nowrap">
                      {c.cohort_name}
                      {c.status.toLowerCase().includes("ongoing") && (
                        <span className="ml-1.5 text-[9px] px-1 py-0.5 rounded bg-status-info/10 text-status-info">Ongoing</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-text-body">{c.accumulation_ratio ?? "—"}</td>
                    <td className="px-3 py-2 font-medium" style={{ color: c.bdnf_pct_change_day14 != null && c.bdnf_pct_change_day14 > 0 ? "var(--status-success)" : "inherit" }}>
                      {c.bdnf_pct_change_day14 != null ? `+${c.bdnf_pct_change_day14}% ±${c.bdnf_pct_change_sd ?? "?"}` : "—"}
                    </td>
                    <td className="px-3 py-2 text-text-body">{c.bdnf_p_value ?? "—"}</td>
                    <td className="px-3 py-2 text-text-body">{c.il6_pct_change_day14 != null ? `${c.il6_pct_change_day14}%` : "—"}</td>
                    <td className="px-3 py-2 text-text-body">{c.crp_pct_change_day14 != null ? `${c.crp_pct_change_day14}%` : "—"}</td>
                    <td className="px-3 py-2">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${c.ae_rate_pct === 0 ? "bg-status-success/10 text-status-success" : c.ae_max_grade >= 2 ? "bg-status-warning/10 text-status-warning" : "bg-status-info/10 text-status-info"}`}>
                        {c.ae_rate_pct}% (G{c.ae_max_grade})
                      </span>
                    </td>
                    <td className="px-3 py-2 text-text-muted">{c.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Summary helpers ────────────────────────────────────────────────────────────
function splitSummary(text: string, leadSentences = 2): { lead: string; rest: string } {
  // Split on sentence-ending punctuation followed by a space or end of string
  const matches = text.match(/[^.!?]+[.!?]+(\s|$)/g) ?? [];
  if (matches.length <= leadSentences) return { lead: text, rest: "" };
  const lead = matches.slice(0, leadSentences).join("").trim();
  const rest = matches.slice(leadSentences).join("").trim();
  return { lead, rest };
}

// Derive a plain-English executive summary from existing fields when
// executive_summary is absent (pre-upgrade reports)
function deriveExecutiveSummary(report: Phase1ReportData, drugName: string): string {
  const rConf = Math.round((report.responder_profile.corpus_hypothesis_confidence ?? 0) * 100);
  const nrConf = Math.round((report.nonresponder_profile.corpus_hypothesis_confidence ?? 0) * 100);
  const { lead: rLead } = splitSummary(report.responder_profile.summary, 1);
  const { lead: nrLead } = splitSummary(report.nonresponder_profile.summary, 1);
  return `${rLead} Conversely, ${nrLead.charAt(0).toLowerCase()}${nrLead.slice(1)} Responder corpus support: ${rConf}%. Non-responder corpus support: ${nrConf}%. Evidence is preclinical — human validation required.`;
}

export default function Phase1ReportViewer({ report, drugName, indication, generatedAt, studyId }: Props) {
  const [activeTab, setActiveTab] = useState<"overview" | "biomarkers" | "evidence" | "corpus-intelligence" | "exploratory" | "human-data">("overview");
  const [showCoThinkPrompt, setShowCoThinkPrompt] = useState(false);
  const [responderExpanded, setResponderExpanded] = useState(false);
  const [nonresponderExpanded, setNonresponderExpanded] = useState(false);

  const genDate = new Date(generatedAt).toLocaleDateString("en-US", {
    year: "numeric", month: "short", day: "numeric",
  });

  return (
    <div className="max-w-4xl mx-auto px-8 py-8 print:px-4 print:py-2">

      {/* ── Report header ──────────────────────────────────────────────── */}
      <div className="mb-6">
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="text-brand-core text-xs uppercase tracking-widest mb-1">Planning Phase Analysis Report</p>
            <h1 className="text-2xl font-bold text-text-heading">{drugName} · {indication}</h1>
            <p className="text-text-secondary text-xs mt-1">Generated {genDate}</p>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0 print-hide">
            <form action={`/api/studies/${studyId}/rerun-phase1`} method="POST">
              <button
                type="submit"
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border-subtle bg-bg-surface text-text-muted hover:text-text-heading hover:border-brand-core transition-colors text-xs font-medium"
                title="Clear this run and re-analyse with the current corpus"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.25"/>
                </svg>
                Re-run with updated corpus
              </button>
            </form>
            <Phase1ExportButton
              studyId={studyId}
              drugName={drugName}
            />
          </div>
        </div>

      </div>

      {/* ── Tabs ──────────────────────────────────────────────────────── */}
      <div className="flex border-b border-border-subtle mb-6 -mx-1 overflow-x-auto">
        <Tab label="Overview" active={activeTab === "overview"} onClick={() => setActiveTab("overview")} />
        <Tab label="Efficacy Signals" active={activeTab === "biomarkers"} onClick={() => setActiveTab("biomarkers")} count={report.biomarker_recommendations?.length} />
        <Tab label="Evidence & Safety" active={activeTab === "evidence"} onClick={() => setActiveTab("evidence")} count={(report.cross_species_evidence?.length ?? 0) + (report.safety_flags?.length ?? 0)} />
        {report.exploratory_biomarkers && report.exploratory_biomarkers.length > 0 && (
          <Tab label="Exploratory Biomarkers" active={activeTab === "exploratory"} onClick={() => setActiveTab("exploratory")} count={report.exploratory_biomarkers.length} />
        )}
        {/* SCIENCE-FEEDBACK: P1-F — Phase 1 Human Data tab (always shown when data may exist) */}
        <Tab label="Phase 1 Human Data" active={activeTab === "human-data"} onClick={() => setActiveTab("human-data")} />
        <Tab label="Corpus Intelligence" active={activeTab === "corpus-intelligence"} onClick={() => setActiveTab("corpus-intelligence")} />
      </div>

      {/* ══ OVERVIEW TAB ══════════════════════════════════════════════ */}
      {activeTab === "overview" && (() => {
        const execSummary = report.executive_summary || deriveExecutiveSummary(report, drugName);
        const rSplit = splitSummary(report.responder_profile.summary, 2);
        const nrSplit = splitSummary(report.nonresponder_profile.summary, 2);
        const overallPct = Math.round((report.overall_confidence ?? 0) * 100);

        return (
          <div className="space-y-5">

            {/* ── Executive Summary banner ── */}
            <div className="p-5 bg-bg-surface border border-border-subtle rounded-2xl">
              <div className="flex items-center justify-between gap-4 mb-3">
                <p className="text-brand-core text-[10px] uppercase tracking-widest font-semibold">Planning Phase Summary</p>
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-bg-overlay border border-border-subtle text-text-secondary">
                  {overallPct}% overall corpus confidence
                </span>
              </div>
              <p className="text-text-body text-sm leading-relaxed">{execSummary}</p>
              <div className="mt-4 pt-3 border-t border-border-subtle flex gap-6">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-text-muted mb-0.5">Target Responder</p>
                  <p className="text-sm font-semibold text-status-success">Subtype {report.responder_profile.primary_subtype}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-text-muted mb-0.5">Predicted Non-Responder</p>
                  <p className="text-sm font-semibold text-status-danger">Subtype {report.nonresponder_profile.primary_subtype}</p>
                </div>
                {report.primary_endpoint_recommendation && (
                  <div className="flex-1">
                    <p className="text-[10px] uppercase tracking-wider text-text-muted mb-0.5">Primary Endpoint</p>
                    <p className="text-sm text-text-body">{report.primary_endpoint_recommendation}</p>
                  </div>
                )}
              </div>
            </div>

            {/* ── Phenotype cards ── */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
              {/* Responder */}
              <div className="bg-bg-surface border border-border-subtle rounded-2xl p-6 min-w-0">
                <div className="flex items-center justify-between gap-3 mb-1">
                  <p className="text-status-success text-[10px] uppercase tracking-widest">Predicted Responder</p>
                  <ConfidenceBadge value={report.responder_profile.corpus_hypothesis_confidence} />
                </div>
                <h2 className="text-text-heading font-semibold text-sm leading-snug mb-3 break-words">
                  {report.responder_profile.primary_subtype}
                </h2>

                {/* Lead summary — always visible */}
                <p className="text-text-body text-sm leading-relaxed mb-1">{rSplit.lead}</p>

                {/* Expandable mechanistic detail */}
                {rSplit.rest && (
                  <>
                    {responderExpanded && (
                      <p className="text-text-muted text-sm leading-relaxed mb-1 mt-2">{rSplit.rest}</p>
                    )}
                    <button
                      onClick={() => setResponderExpanded(v => !v)}
                      className="text-xs text-brand-core hover:underline mb-3 mt-1 block"
                    >
                      {responderExpanded ? "Hide full rationale ↑" : "Full rationale ↓"}
                    </button>
                  </>
                )}
                {!rSplit.rest && <div className="mb-4" />}

                <div className="border-t border-border-subtle pt-3 mt-1">
                  <ProfileField label="Demographics" value={report.responder_profile.demographics} />
                  <ProfileField label="Core Clinical" value={report.responder_profile.core_clinical} />
                  <ProfileField label="Inflammatory" value={report.responder_profile.inflammatory} />
                  <ProfileField label="Neuroplasticity" value={report.responder_profile.neuroplasticity} />
                  {report.responder_profile.imaging && <ProfileField label="Imaging" value={report.responder_profile.imaging} />}
                </div>

                {report.responder_profile.key_inclusion_criteria?.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-border-subtle">
                    <p className="text-text-muted text-[10px] uppercase tracking-wider mb-2">Key Inclusion Criteria</p>
                    <ul className="space-y-1.5">
                      {report.responder_profile.key_inclusion_criteria.map((c, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-text-body">
                          <span className="text-status-success flex-shrink-0 mt-0.5">✓</span>{c}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Non-responder */}
              <div className="bg-bg-surface border border-border-subtle rounded-2xl p-6 min-w-0">
                <div className="flex items-center justify-between gap-3 mb-1">
                  <p className="text-status-danger text-[10px] uppercase tracking-widest">Predicted Non-Responder</p>
                  <ConfidenceBadge value={report.nonresponder_profile.corpus_hypothesis_confidence} />
                </div>
                <h2 className="text-text-heading font-semibold text-sm leading-snug mb-3 break-words">
                  {report.nonresponder_profile.primary_subtype}
                </h2>

                {/* Lead summary — always visible */}
                <p className="text-text-body text-sm leading-relaxed mb-1">{nrSplit.lead}</p>

                {/* Expandable mechanistic detail */}
                {nrSplit.rest && (
                  <>
                    {nonresponderExpanded && (
                      <p className="text-text-muted text-sm leading-relaxed mb-1 mt-2">{nrSplit.rest}</p>
                    )}
                    <button
                      onClick={() => setNonresponderExpanded(v => !v)}
                      className="text-xs text-brand-core hover:underline mb-3 mt-1 block"
                    >
                      {nonresponderExpanded ? "Hide full rationale ↑" : "Full rationale ↓"}
                    </button>
                  </>
                )}
                {!nrSplit.rest && <div className="mb-4" />}

                <div className="border-t border-border-subtle pt-3 mt-1">
                  <ProfileField label="Demographics" value={report.nonresponder_profile.demographics} />
                  <ProfileField label="Core Clinical" value={report.nonresponder_profile.core_clinical} />
                  <ProfileField label="Inflammatory" value={report.nonresponder_profile.inflammatory} />
                  <ProfileField label="Neuroplasticity" value={report.nonresponder_profile.neuroplasticity} />
                  {report.nonresponder_profile.imaging && <ProfileField label="Imaging" value={report.nonresponder_profile.imaging} />}
                </div>

                {report.nonresponder_profile.key_exclusion_criteria?.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-border-subtle">
                    <p className="text-text-muted text-[10px] uppercase tracking-wider mb-2">Key Exclusion Criteria</p>
                    <ul className="space-y-1.5">
                      {report.nonresponder_profile.key_exclusion_criteria.map((c, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-text-body">
                          <span className="text-status-danger flex-shrink-0 mt-0.5">✕</span>{c}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ══ BIOMARKERS TAB ════════════════════════════════════════════ */}
      {activeTab === "biomarkers" && (
        <div>
          {(report.primary_endpoint_recommendation || report.early_response_indicator) && (
            <div className="grid grid-cols-2 gap-4 mb-6">
              {report.primary_endpoint_recommendation && (
                <div className="p-4 bg-bg-surface border border-brand-core/30 rounded-xl">
                  <p className="text-brand-core text-[10px] uppercase tracking-wider mb-1.5">Primary Endpoint Recommendation</p>
                  <p className="text-text-body text-sm leading-relaxed">{report.primary_endpoint_recommendation}</p>
                </div>
              )}
              {report.early_response_indicator && (
                <div className="p-4 bg-bg-surface border border-status-success/30 rounded-xl">
                  <p className="text-status-success text-[10px] uppercase tracking-wider mb-1.5">Early Response Indicator</p>
                  <p className="text-text-body text-sm leading-relaxed">{report.early_response_indicator}</p>
                </div>
              )}
            </div>
          )}

          <div className="space-y-3">
            {report.biomarker_recommendations?.sort((a, b) => a.rank - b.rank).map((bm) => {
              const domainColors: Record<string, string> = {
                inflammatory: "var(--status-danger)", neuroplasticity: "var(--status-purple)",
                behavioral: "var(--status-warning)", imaging: "var(--brand-core)", genetic: "var(--status-success)",
              };
              const dc = domainColors[bm.domain] ?? "#6B7280";
              return (
                <div key={bm.rank} className="p-4 bg-bg-surface border border-border-subtle rounded-xl">
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 bg-nav-item-active-bg text-brand-core">{bm.rank}</span>
                      <div>
                        <span className="text-text-heading text-sm font-medium">{bm.name}</span>
                        {bm.unit && <span className="text-text-muted text-xs ml-1.5">({bm.unit})</span>}
                      </div>
                    </div>
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full capitalize flex-shrink-0" style={{ color: dc, background: `${dc}20` }}>
                      {bm.domain}
                    </span>
                  </div>
                  <PriorityBar pct={bm.priority_pct} />
                  <p className="text-text-muted text-xs mt-3 leading-relaxed">{bm.preclinical_rationale}</p>
                  <div className="grid grid-cols-2 gap-3 mt-3">
                    <div className="p-2.5 bg-status-success/5 border border-status-success/20 rounded-lg">
                      <p className="text-status-success text-xs font-medium mb-0.5">Responder signal</p>
                      <p className="text-text-body text-xs">{bm.responder_threshold}</p>
                    </div>
                    <div className="p-2.5 bg-status-danger/5 border border-status-danger/20 rounded-lg">
                      <p className="text-status-danger text-xs font-medium mb-0.5">Non-responder signal</p>
                      <p className="text-text-body text-xs">{bm.nonresponder_threshold}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-3 flex-wrap">
                    <p className="text-text-secondary text-xs">Timing:</p>
                    {bm.timing.map((t) => (
                      <span key={t} className="text-xs px-2 py-0.5 rounded bg-nav-item-active-bg text-text-muted">{t}</span>
                    ))}
                    <span className="text-text-secondary text-xs ml-1">· {bm.collection_method}</span>
                  </div>
                </div>
              );
            })}
          </div>
          {report.protocol_notes && (
            <p className="mt-5 text-text-muted text-xs leading-relaxed border-t border-border-subtle pt-4">{report.protocol_notes}</p>
          )}
        </div>
      )}

      {/* ══ EVIDENCE & SAFETY TAB ═════════════════════════════════════ */}
      {activeTab === "evidence" && (
        <div className="space-y-6">
          {/* SCIENCE-FEEDBACK: F2 — PICOS cross-trial comparison callout */}
          <div className="p-4 bg-bg-overlay border border-border-subtle rounded-xl flex gap-3">
            <span className="text-base flex-shrink-0 mt-0.5">ⓘ</span>
            <div>
              <p className="text-text-heading text-xs font-semibold mb-1">Cross-trial evidence methodology</p>
              <p className="text-text-muted text-xs leading-relaxed">
                Evidence is drawn from mechanistically similar analog compounds — primarily drugs sharing the same receptor class or target pathway as {drugName}. Cross-trial comparisons require PICOS-framework alignment (Population, Intervention, Comparator, Outcome, Study Design). Studies with divergent designs receive lower source-type weighting in the retrieval pipeline. Evidence from dissimilar study populations or endpoints is flagged below.
              </p>
            </div>
          </div>

          {report.cross_species_evidence?.length > 0 && (
            <div>
              <h3 className="text-status-purple text-xs uppercase tracking-widest font-semibold mb-3">🐭 Cross-Species Evidence</h3>
              <div className="space-y-3">
                {report.cross_species_evidence.map((ev, i) => (
                  <div key={i} className="p-4 bg-bg-surface border border-border-subtle rounded-xl">
                    {/* Header row: model name + badge */}
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <p className="text-text-heading text-sm font-semibold leading-snug">{ev.animal_model}</p>
                      <SignalBadge strength={ev.signal_strength} />
                    </div>
                    {/* Human mapping */}
                    <div className="flex items-start gap-2 mb-3">
                      <span className="text-text-secondary text-xs mt-0.5 flex-shrink-0">↳</span>
                      <p className="text-status-purple text-xs leading-relaxed">{ev.human_subtype_mapping}</p>
                    </div>
                    {/* Biomarker signal chips */}
                    {ev.key_biomarker_signals?.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-2.5">
                        {ev.key_biomarker_signals.map((sig, j) => (
                          <span key={j} className="text-xs px-2 py-1 rounded-md bg-bg-page border border-border-subtle text-text-muted">{sig}</span>
                        ))}
                      </div>
                    )}
                    {ev.corpus_ref && (
                      <p className="text-text-secondary text-[11px] italic border-t border-border-subtle pt-2 mt-1">{ev.corpus_ref}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {report.safety_flags?.length > 0 && (
            <div>
              <h3 className="text-status-warning text-xs uppercase tracking-widest font-semibold mb-3">⚠️ Safety Signals</h3>
              <div className="space-y-3">
                {report.safety_flags.map((flag, i) => (
                  <div key={i} className="p-4 bg-bg-surface border border-border-subtle rounded-xl">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <p className="text-text-heading text-sm font-semibold leading-snug">{flag.signal}</p>
                      <SeverityBadge severity={flag.severity} />
                    </div>
                    <p className="text-text-muted text-xs leading-relaxed mb-2">{flag.clinical_implication}</p>
                    <p className="text-text-secondary text-[11px] italic border-t border-border-subtle pt-2">Source: {flag.source}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══ EXPLORATORY BIOMARKERS TAB ════════════════════════════════ */}
      {activeTab === "exploratory" && report.exploratory_biomarkers && (
        <ExploratoryBiomarkersTab biomarkers={report.exploratory_biomarkers} />
      )}

      {/* ══ CORPUS INTELLIGENCE TAB ═══════════════════════════════════ */}
      {activeTab === "corpus-intelligence" && (
        <div className="space-y-5">

          {/* ── Corpus Coverage ─────────────────────────────────────── */}
          {report.corpus_intelligence && (
            <>
              <div>
                <p className="text-[10px] uppercase tracking-widest font-semibold text-text-secondary mb-3">Corpus Coverage</p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[
                    { label: "Clinical Trial", count: report.corpus_intelligence.source_breakdown.clinical_trial, color: "var(--status-success)" },
                    { label: "Regulatory", count: report.corpus_intelligence.source_breakdown.regulatory, color: "var(--brand-core)" },
                    { label: "Literature", count: report.corpus_intelligence.source_breakdown.literature, color: "var(--text-muted)" },
                    { label: "Internal", count: report.corpus_intelligence.source_breakdown.internal, color: "var(--gold-icon)" },
                  ].map(({ label, count, color }) => (
                    <div key={label} className="p-4 bg-bg-surface border border-border-subtle rounded-xl text-center">
                      <p className="text-2xl font-bold" style={{ color }}>{count}</p>
                      <p className="text-[10px] uppercase tracking-widest text-text-secondary mt-1">{label}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex gap-6 text-xs text-text-muted px-1">
                  <span>Similarity p50 <span className="text-text-body font-medium">{report.corpus_intelligence.similarity_stats.p50}</span></span>
                  <span>p75 <span className="text-text-body font-medium">{report.corpus_intelligence.similarity_stats.p75}</span></span>
                  <span>Min <span className="text-text-body font-medium">{report.corpus_intelligence.similarity_stats.min.toFixed(3)}</span></span>
                  <span>Total chunks <span className="text-text-body font-medium">{report.corpus_intelligence.similarity_stats.total_chunks}</span></span>
                </div>
              </div>

              {/* ── Overall verdict ─────────────────────────────────── */}
              {report.corpus_intelligence.overall_verdict && (
                <div className="p-4 bg-bg-surface border border-border-subtle rounded-xl">
                  <p className="text-[10px] uppercase tracking-widest font-semibold text-text-secondary mb-1">Corpus Verdict</p>
                  <p className="text-sm text-text-body leading-relaxed">{report.corpus_intelligence.overall_verdict}</p>
                </div>
              )}

              {/* ── Strengths & Gaps ────────────────────────────────── */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {report.corpus_intelligence.corpus_strengths.length > 0 && (
                  <div className="p-4 bg-bg-surface border border-border-subtle rounded-xl">
                    <p className="text-[10px] uppercase tracking-widest font-semibold text-status-success mb-3">Coverage Strengths</p>
                    <ul className="space-y-2">
                      {report.corpus_intelligence.corpus_strengths.map((s, i) => (
                        <li key={i} className="flex gap-2 text-xs text-text-body leading-relaxed">
                          <span className="text-status-success flex-shrink-0 mt-0.5">✓</span>
                          <span>{s}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {report.corpus_intelligence.corpus_gaps.length > 0 && (
                  <div className="p-4 bg-bg-surface border border-border-subtle rounded-xl">
                    <p className="text-[10px] uppercase tracking-widest font-semibold text-status-warning mb-3">Evidence Gaps</p>
                    <ul className="space-y-2">
                      {report.corpus_intelligence.corpus_gaps.map((g, i) => (
                        <li key={i} className="flex gap-2 text-xs text-text-body leading-relaxed">
                          <span className="text-status-warning flex-shrink-0 mt-0.5">⚠</span>
                          <span>{g}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* ── Recommended searches ────────────────────────────── */}
              {report.corpus_intelligence.recommended_searches.length > 0 && (
                <div className="p-4 bg-bg-surface border border-border-subtle rounded-xl">
                  <p className="text-[10px] uppercase tracking-widest font-semibold text-text-secondary mb-3">Recommended Literature Searches</p>
                  <ol className="space-y-1.5">
                    {report.corpus_intelligence.recommended_searches.map((q, i) => (
                      <li key={i} className="flex gap-2 text-xs text-text-body">
                        <span className="text-text-muted flex-shrink-0 font-mono">{i + 1}.</span>
                        <span className="italic">{q}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {/* ── CoThink Prompt Generator ────────────────────────── */}
              <div className="p-4 bg-bg-overlay border border-border-subtle rounded-xl">
                <div className="flex items-start justify-between gap-4 mb-2">
                  <div>
                    <p className="text-[10px] uppercase tracking-widest font-semibold text-text-secondary mb-0.5">Lumos AI CoThink Agent</p>
                    <p className="text-xs text-text-muted">Generate a research prompt that instructs the CoThink agent to find and ingest missing literature.</p>
                  </div>
                  <button
                    onClick={() => setShowCoThinkPrompt(v => !v)}
                    className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-brand-core text-white text-xs font-medium hover:opacity-90 transition-opacity"
                  >
                    {showCoThinkPrompt ? "Hide Prompt" : "Generate CoThink Prompt"}
                  </button>
                </div>
                {showCoThinkPrompt && (
                  <div className="mt-3">
                    <textarea
                      readOnly
                      className="w-full h-56 text-xs font-mono bg-bg-surface border border-border-subtle rounded-lg p-3 text-text-body resize-none focus:outline-none focus:border-brand-core"
                      value={`You are a biomedical research agent helping expand the Lumos AI corpus for ${drugName} (${indication}).

CORPUS GAPS IDENTIFIED:
${(report.corpus_intelligence?.corpus_gaps ?? []).map(g => `• ${g}`).join('\n')}

RECOMMENDED LITERATURE SEARCHES:
${(report.corpus_intelligence?.recommended_searches ?? []).map((q, i) => `${i + 1}. ${q}`).join('\n')}

YOUR TASK:
1. Search PubMed, bioRxiv, and ClinicalTrials.gov for papers addressing these gaps
2. Prioritize: clinical trials > regulatory submissions > peer-reviewed literature > preprints
3. For each paper found, provide: title, authors, DOI/URL, abstract summary, and why it addresses the identified gap
4. Output as structured JSON: { "title": "", "source_url": "", "source_type": "", "relevance_rationale": "" }

Focus on evidence published 2018–2026. Exclude review articles unless they are systematic meta-analyses.`}
                    />
                    <p className="text-[10px] text-text-muted mt-1.5">Select all → Copy → Paste into Lumos AI CoThink agent to commission targeted literature retrieval.</p>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Fallback if corpus_intelligence not yet generated */}
          {!report.corpus_intelligence && (
            <div className="p-4 bg-bg-overlay border border-border-subtle rounded-xl text-center">
              <p className="text-text-muted text-sm">Corpus intelligence data not available for this run.</p>
              <p className="text-text-muted text-xs mt-1">Re-run the Planning Phase analysis to generate coverage metrics and gap analysis.</p>
            </div>
          )}

          {/* ── Confidence score explainer (P1-B) ────────────────────── */}
          {/* SCIENCE-FEEDBACK: P1-B — Confidence score explainer */}
          <div className="p-4 bg-bg-surface border border-border-subtle rounded-xl space-y-3">
            <p className="text-[10px] uppercase tracking-widest font-semibold text-text-secondary">How confidence scores are calculated</p>
            <ul className="space-y-2 text-xs text-text-muted leading-relaxed">
              <li className="flex gap-2"><span className="text-brand-core flex-shrink-0">•</span><span><span className="text-text-body font-medium">Overall confidence</span> is generated by the Lumos AI synthesis model after reading all 40 retrieved corpus chunks. It reflects how consistently and strongly the preclinical literature (animal models, in vitro studies) supports a mechanistic link between this drug's pharmacology and the predicted patient phenotype. It is not derived from a formula — it is a synthesis judgment, informed by Bayesian Beta-Binomial priors computed from animal-model keyword counts across the retrieved chunks.</span></li>
              <li className="flex gap-2"><span className="text-brand-core flex-shrink-0">•</span><span><span className="text-text-body font-medium">Subgroup scores (Responder / Non-Responder)</span> are generated independently per phenotype — not as a partition of the overall score. It is expected and correct for a subgroup score to exceed the overall when the corpus evidence for that phenotype is particularly concentrated.</span></li>
              <li className="flex gap-2"><span className="text-brand-core flex-shrink-0">•</span><span><span className="text-text-body font-medium">Score thresholds are display heuristics, not statistically derived cutoffs:</span> ≥70% = multiple independent corpus sources converge on the same mechanistic pathway across validated animal models; 45–69% = mechanistic signal present but limited by sparse evidence, conflicting findings, or reliance on a single model type; &lt;45% = insufficient or inconsistent corpus grounding — treat as a directional hypothesis only.</span></li>
              <li className="flex gap-2"><span className="text-brand-core flex-shrink-0">•</span><span><span className="text-text-body font-medium">"Translational uncertainty"</span> refers specifically to the animal-to-human translation gap. All corpus evidence at this stage is preclinical (rodent FST/CMS/LH models, cell culture assays). A moderate score reflects meaningful uncertainty about whether those findings will hold in human patients — not uncertainty about the analysis itself.</span></li>
              <li className="flex gap-2"><span className="text-brand-core flex-shrink-0">•</span><span>These scores do <span className="text-text-body font-medium">not</span> predict probability of patient response or clinical trial success. They are measures of preclinical corpus evidence quality, to be validated against real patient data in the Clinical Analysis phase.</span></li>
            </ul>
          </div>

          {/* ── Analysis methodology narrative ──────────────────────── */}
          <MethodologyNarrative text={report.methodology_narrative} />

          {/* Disclaimer */}
          <div className="p-4 bg-bg-overlay border border-border-subtle rounded-xl">
            <p className="text-text-muted text-xs leading-relaxed">
              <span className="text-status-warning font-semibold">Important: </span>
              All evidence is in vitro or animal-model — no human clinical data has been collected yet. Confidence scores reflect corpus evidence strength, not clinical validation. These are hypotheses to be tested in the clinical trial.
            </p>
          </div>
        </div>
      )}

      {/* SCIENCE-FEEDBACK: P1-F — Phase 1 Human Data tab panel */}
      {activeTab === "human-data" && (
        <div className="space-y-6">
          <div className="flex items-center gap-2 mb-2">
            <p className="text-text-secondary text-[10px] uppercase tracking-widest font-semibold">Phase 1 Human Data — SAD/MAD Cohorts</p>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-status-warning/10 text-status-warning border border-status-warning/30">{drugName} Actual Data</span>
          </div>
          <HumanDataTab studyId={studyId} />
        </div>
      )}
    </div>
  );
}
