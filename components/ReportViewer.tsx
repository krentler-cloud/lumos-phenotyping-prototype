"use client";

import { useState } from "react";
import {
  BiomarkerEntry, CorpusRef, KeyBiomarker, PhenotypeReport,
  CompositeScore, BayesianPrior, DrugMechanism,
  CrossSpeciesMapping, CROScreeningCategory, InSilicoTwin,
} from "@/lib/types";

interface ReportData {
  id: string;
  run_id: string;
  created_at: string;
  report_type: string;
  responder_prob: number;
  confidence: number;
  phenotype_label: string;
  executive_summary: string;
  responder_profile: PhenotypeReport["responder_profile"];
  nonresponder_profile: PhenotypeReport["nonresponder_profile"];
  key_biomarkers: KeyBiomarker[];
  matched_corpus_refs: CorpusRef[];
  methodology_notes: string;
  recommendations: string[];
  extended_report?: {
    composite_score?: CompositeScore;
    bayesian_prior?: BayesianPrior;
    drug_mechanism?: DrugMechanism;
    cross_species_mapping?: CrossSpeciesMapping[];
    cro_screening_prompts?: CROScreeningCategory[];
    in_silico_twin?: InSilicoTwin;
  };
}

function confidenceColor(c: number) {
  if (c >= 0.75) return "text-[#22C55E] bg-[#22C55E20] border-[#22C55E]";
  if (c >= 0.5)  return "text-[#F59E0B] bg-[#F59E0B20] border-[#F59E0B]";
  return "text-[#EF4444] bg-[#EF444420] border-[#EF4444]";
}

function phenotypeColor(label: string) {
  if (label === "High Responder")     return "text-[#22C55E] bg-[#22C55E20] border-[#22C55E]";
  if (label === "Moderate Responder") return "text-[#F59E0B] bg-[#F59E0B20] border-[#F59E0B]";
  return "text-[#EF4444] bg-[#EF444420] border-[#EF4444]";
}

function directionIcon(d: string) { return d === "elevated" ? "↑" : d === "reduced" ? "↓" : "→"; }
function directionColor(d: string) {
  return d === "elevated" ? "text-[#EF4444]" : d === "reduced" ? "text-[#4F8EF7]" : "text-[#8BA3C7]";
}

function signalColor(s: string) {
  return s === "strong" ? "text-[#22C55E]" : s === "moderate" ? "text-[#F59E0B]" : "text-[#8BA3C7]";
}

// ── Provenance badges ─────────────────────────────────────────────────────────
type ProvenanceType = "computed" | "ai-estimate" | "extracted" | "retrieved";

function ProvenanceBadge({ type }: { type: ProvenanceType }) {
  const styles: Record<ProvenanceType, { label: string; cls: string; icon: string }> = {
    "computed":    { label: "Computed",       icon: "∑", cls: "text-[#22C55E] border-[#22C55E40] bg-[#22C55E10]" },
    "ai-estimate": { label: "AI Estimate",    icon: "◆", cls: "text-[#F59E0B] border-[#F59E0B40] bg-[#F59E0B10]" },
    "extracted":   { label: "Extracted",      icon: "⬡", cls: "text-[#4F8EF7] border-[#4F8EF740] bg-[#4F8EF710]" },
    "retrieved":   { label: "Vector Search",  icon: "⊕", cls: "text-[#A855F7] border-[#A855F740] bg-[#A855F710]" },
  };
  const { label, icon, cls } = styles[type];
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium ${cls}`}>
      <span>{icon}</span>{label}
    </span>
  );
}

// ── Provenance legend ─────────────────────────────────────────────────────────
function ProvenanceLegend() {
  return (
    <div className="bg-[#0A1628] border border-[#1E3A5F] rounded-xl p-4">
      <p className="text-[#8BA3C7] text-xs uppercase tracking-wide mb-3">Data provenance key</p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs text-[#8BA3C7]">
        <div className="flex items-center gap-2"><ProvenanceBadge type="computed" /><span>Deterministic math (score.ts)</span></div>
        <div className="flex items-center gap-2"><ProvenanceBadge type="ai-estimate" /><span>Claude reasoning over corpus</span></div>
        <div className="flex items-center gap-2"><ProvenanceBadge type="extracted" /><span>Structured extraction from IND docs</span></div>
        <div className="flex items-center gap-2"><ProvenanceBadge type="retrieved" /><span>Retrieved by vector similarity</span></div>
      </div>
    </div>
  );
}

// ── Score gauge bar ───────────────────────────────────────────────────────────
function ScoreBar({ value, max = 100, color = "#4F8EF7" }: { value: number; max?: number; color?: string }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="h-2 bg-[#1E3A5F] rounded-full overflow-hidden">
      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  );
}

// ── Signed contribution bar (supports negative values) ────────────────────────
function ContributionBar({ raw, contribution }: { raw: number; contribution: number }) {
  const isNeg = raw < 0;
  const pct = Math.min(100, Math.abs(raw) * 100);
  const color = isNeg ? "#EF4444" : "#4F8EF7";
  return (
    <div className="flex items-center gap-3 w-full">
      {/* Negative side */}
      <div className="w-1/2 flex justify-end">
        {isNeg && (
          <div className="h-2 rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
        )}
      </div>
      {/* Centre line */}
      <div className="w-px h-3 bg-[#1E3A5F] flex-shrink-0" />
      {/* Positive side */}
      <div className="w-1/2 flex justify-start">
        {!isNeg && (
          <div className="h-2 rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
        )}
      </div>
      <span className="font-mono text-xs w-12 text-right flex-shrink-0" style={{ color }}>
        {contribution > 0 ? '+' : ''}{contribution.toFixed(1)}
      </span>
    </div>
  );
}

// ── Composite Score Card ──────────────────────────────────────────────────────
function CompositeScoreCard({ score }: { score: CompositeScore }) {
  const color = score.value >= 65 ? "#22C55E" : score.value >= 40 ? "#F59E0B" : "#EF4444";
  return (
    <div className="bg-[#0F1F3D] border border-[#1E3A5F] rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[#F0F4FF] font-semibold">Composite Biomarker Score</h2>
        <ProvenanceBadge type="computed" />
      </div>
      <div className="flex items-center gap-6 mb-4">
        <div className="text-5xl font-bold" style={{ color }}>{score.value}</div>
        <div className="flex-1">
          <ScoreBar value={score.value} color={color} />
          <p className="text-[#8BA3C7] text-xs mt-1.5">{score.formula}</p>
        </div>
      </div>
      <p className="text-[#8BA3C7] text-sm mb-4">{score.interpretation}</p>
      {score.components.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between mb-1">
            <p className="text-[#8BA3C7] text-xs uppercase tracking-wide">Component Breakdown</p>
            <p className="text-[#8BA3C7] text-xs">← unfavourable · favourable →</p>
          </div>
          {score.components.map((c, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <span className="text-[#8BA3C7] w-40 flex-shrink-0">{c.label}</span>
              <div className="flex-1">
                <ContributionBar raw={c.raw} contribution={c.contribution} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Bayesian Prior Card ───────────────────────────────────────────────────────
function BayesianPriorCard({ prior }: { prior: BayesianPrior }) {
  const subtypes = [
    { key: "subtype_a", data: prior.subtype_a, color: "#4F8EF7" },
    { key: "subtype_b", data: prior.subtype_b, color: "#A855F7" },
    { key: "subtype_c", data: prior.subtype_c, color: "#F59E0B" },
  ] as const;

  // Prior is "uninformative" when total evidence is very low (α+β ≤ 4 for all subtypes)
  const totalEvidence = prior.subtype_a.alpha + prior.subtype_a.beta
    + prior.subtype_b.alpha + prior.subtype_b.beta
    + prior.subtype_c.alpha + prior.subtype_c.beta - 6; // subtract uniform base
  const isUninformative = totalEvidence <= 3;

  return (
    <div className="bg-[#0F1F3D] border border-[#1E3A5F] rounded-xl p-6">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-[#F0F4FF] font-semibold">Bayesian Subtype Priors</h2>
        <ProvenanceBadge type="computed" />
      </div>
      <p className="text-[#8BA3C7] text-xs mb-3">Beta-Binomial posteriors from corpus animal-model evidence</p>
      {isUninformative && (
        <div className="flex items-start gap-2 bg-[#F59E0B10] border border-[#F59E0B30] rounded-lg px-3 py-2 mb-4">
          <span className="text-[#F59E0B] text-sm mt-0.5">⚠</span>
          <p className="text-[#F59E0B] text-xs">Low corpus evidence — prior is largely uninformative. Posteriors will update significantly with clinical outcome data.</p>
        </div>
      )}
      <div className="space-y-4">
        {subtypes.map(({ data, color }) => (
          <div key={data.label}>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-[#F0F4FF]">{data.label}</span>
              <span className="font-mono" style={{ color }}>{(data.mean * 100).toFixed(1)}%</span>
            </div>
            <ScoreBar value={data.mean * 100} color={color} />
            <p className="text-[#8BA3C7] text-xs mt-0.5">α={data.alpha} β={data.beta}</p>
          </div>
        ))}
      </div>
      <p className="text-[#8BA3C7] text-xs mt-4 border-t border-[#1E3A5F] pt-3">{prior.evidence_basis}</p>
    </div>
  );
}

// ── Drug Mechanism Card ───────────────────────────────────────────────────────
function DrugMechanismCard({ mech }: { mech: DrugMechanism }) {
  return (
    <div className="bg-[#0F1F3D] border border-[#1E3A5F] rounded-xl p-6">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-[#F0F4FF] font-semibold">{mech.drug_name} — Mechanism Profile</h2>
        <ProvenanceBadge type="extracted" />
      </div>
      <p className="text-[#4F8EF7] text-sm mb-4">{mech.mechanism_class}</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <p className="text-[#8BA3C7] text-xs uppercase tracking-wide mb-2">Receptor Profile</p>
          {mech.receptor_profile.map((r, i) => (
            <div key={i} className="text-sm text-[#F0F4FF] mb-1">
              {r.target}
              {r.ki_nm !== null && r.ki_nm !== undefined && <span className="text-[#8BA3C7]"> Ki={r.ki_nm}nM</span>}
              {r.selectivity_ratio !== null && r.selectivity_ratio !== undefined && <span className="text-[#8BA3C7]"> {r.selectivity_ratio}× selective</span>}
            </div>
          ))}
        </div>
        <div>
          <p className="text-[#8BA3C7] text-xs uppercase tracking-wide mb-2">PK Summary</p>
          {mech.pk_summary.half_life_h !== null && mech.pk_summary.half_life_h !== undefined && (
            <p className="text-sm text-[#F0F4FF]">t½ = {mech.pk_summary.half_life_h}h</p>
          )}
          {mech.pk_summary.bioavailability_pct !== null && mech.pk_summary.bioavailability_pct !== undefined && (
            <p className="text-sm text-[#F0F4FF]">F = {mech.pk_summary.bioavailability_pct}%</p>
          )}
          {mech.pk_summary.cmax_ng_ml !== null && mech.pk_summary.cmax_ng_ml !== undefined && (
            <p className="text-sm text-[#F0F4FF]">Cmax = {mech.pk_summary.cmax_ng_ml} ng/mL</p>
          )}
        </div>
      </div>

      {mech.neuroplasticity_signal && (
        <div className="mb-4">
          <p className="text-[#8BA3C7] text-xs uppercase tracking-wide mb-1">Neuroplasticity Signal</p>
          <p className="text-sm text-[#F0F4FF]">{mech.neuroplasticity_signal}</p>
        </div>
      )}

      {mech.analog_overlaps?.length > 0 && (
        <div>
          <p className="text-[#8BA3C7] text-xs uppercase tracking-wide mb-2">Analog Mechanism Overlap</p>
          <div className="space-y-2">
            {mech.analog_overlaps.map((a, i) => (
              <div key={i} className="flex items-center gap-3 text-sm">
                <span className="text-[#F0F4FF] w-24">{a.drug}</span>
                <div className="flex-1">
                  <ScoreBar value={a.overlap_pct} color="#22C55E" />
                </div>
                <span className="text-[#22C55E] font-mono w-10 text-right">{a.overlap_pct}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Cross-Species Mapping Card ────────────────────────────────────────────────
function CrossSpeciesCard({ mapping }: { mapping: CrossSpeciesMapping[] }) {
  return (
    <div className="bg-[#0F1F3D] border border-[#1E3A5F] rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[#F0F4FF] font-semibold">Cross-Species Mapping</h2>
        <ProvenanceBadge type="ai-estimate" />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#1E3A5F] text-[#8BA3C7] text-xs uppercase">
              <th className="text-left py-2 pr-4">Animal Model</th>
              <th className="text-left py-2 pr-4">Human Subtype</th>
              <th className="text-left py-2 pr-4">Signal</th>
              <th className="text-left py-2">Key Features</th>
            </tr>
          </thead>
          <tbody>
            {mapping.map((m, i) => (
              <tr key={i} className="border-b border-[#1E3A5F] last:border-0">
                <td className="py-3 pr-4 text-[#4F8EF7] font-medium">{m.animal_model}</td>
                <td className="py-3 pr-4 text-[#F0F4FF]">{m.human_subtype}</td>
                <td className={`py-3 pr-4 capitalize font-medium ${signalColor(m.signal_strength)}`}>{m.signal_strength}</td>
                <td className="py-3 text-[#8BA3C7]">{m.key_features?.join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── In Silico Twin Card ───────────────────────────────────────────────────────
function InSilicoTwinCard({ twin }: { twin: InSilicoTwin }) {
  return (
    <div className="bg-[#0F1F3D] border border-[#1E3A5F] rounded-xl p-6">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-[#F0F4FF] font-semibold">In Silico Twin Projection</h2>
        <ProvenanceBadge type="ai-estimate" />
      </div>
      <p className="text-[#F59E0B] text-xs mb-2 flex items-center gap-1.5">
        <span>⚠</span>
        Overlap percentages are AI estimates derived from corpus pattern matching — not a geometric projection against a reference population. Phase 2 clinical data will enable real projection.
      </p>
      <p className="text-[#8BA3C7] text-sm mb-4">{twin.phenotype_shape}</p>
      <div className="space-y-4">
        {twin.projections.map((p, i) => (
          <div key={i}>
            <p className="text-[#F0F4FF] text-sm font-medium mb-2">{p.analog}</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[#22C55E] text-xs mb-1">Responder overlap</p>
                <ScoreBar value={p.responder_overlap_pct} color="#22C55E" />
                <p className="text-[#22C55E] text-xs mt-0.5 font-mono">{p.responder_overlap_pct}%</p>
              </div>
              <div>
                <p className="text-[#EF4444] text-xs mb-1">Non-responder overlap</p>
                <ScoreBar value={p.nonresponder_overlap_pct} color="#EF4444" />
                <p className="text-[#EF4444] text-xs mt-0.5 font-mono">{p.nonresponder_overlap_pct}%</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── CRO Screening Card ────────────────────────────────────────────────────────
function CROScreeningCard({ categories }: { categories: CROScreeningCategory[] }) {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="bg-[#0F1F3D] border border-[#1E3A5F] rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[#F0F4FF] font-semibold">CRO Screening Prompts</h2>
        <ProvenanceBadge type="ai-estimate" />
      </div>
      <div className="space-y-2">
        {categories.map((cat, i) => (
          <div key={i} className="border border-[#1E3A5F] rounded-lg overflow-hidden">
            <button
              className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-[#1E3A5F30] transition-colors"
              onClick={() => setOpen(open === i ? null : i)}
            >
              <span className="text-[#F0F4FF] text-sm font-medium">{cat.category}</span>
              <span className="text-[#8BA3C7] text-xs">{open === i ? "▲" : "▼"}</span>
            </button>
            {open === i && (
              <div className="px-4 pb-4 border-t border-[#1E3A5F]">
                <ul className="space-y-2 pt-3">
                  {cat.prompts.map((prompt, j) => (
                    <li key={j} className="flex gap-2 text-sm text-[#8BA3C7]">
                      <span className="text-[#4F8EF7] mt-0.5 flex-shrink-0">·</span>
                      {prompt}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main ReportViewer ─────────────────────────────────────────────────────────
export default function ReportViewer({ report, runId }: { report: ReportData; runId: string }) {
  const ext = report.extended_report;

  return (
    <div className="max-w-5xl mx-auto px-6 py-10 w-full space-y-8">

      {/* Header */}
      <div className="bg-[#0F1F3D] border border-[#1E3A5F] rounded-2xl p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[#8BA3C7] text-xs mb-1">Run ID: {runId.slice(0, 8)}… · {new Date(report.created_at).toLocaleString()}</p>
            <h1 className="text-2xl font-bold text-[#F0F4FF]">Pre-Clinical Phenotyping Report</h1>
            <p className="text-[#8BA3C7] text-sm mt-1 capitalize">{report.report_type} phase</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <span className={`px-4 py-1.5 rounded-full text-sm font-semibold border ${phenotypeColor(report.phenotype_label)}`}>
              {report.phenotype_label}
            </span>
            <div className={`px-4 py-1.5 rounded-full text-sm font-medium border ${confidenceColor(report.confidence)}`}>
              Confidence: {(report.confidence * 100).toFixed(0)}%
            </div>
            <div className="px-4 py-1.5 rounded-full text-sm font-medium border border-[#4F8EF7] text-[#4F8EF7] bg-[#4F8EF720]">
              Responder prob: {(report.responder_prob * 100).toFixed(0)}%
            </div>
            <ProvenanceBadge type="ai-estimate" />
            {ext?.composite_score && (
              <div className="px-4 py-1.5 rounded-full text-sm font-medium border border-[#A855F7] text-[#A855F7] bg-[#A855F720]">
                Score: {ext.composite_score.value}/100
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Provenance legend */}
      <ProvenanceLegend />

      {/* Executive Summary */}
      <div className="bg-[#0F1F3D] border border-[#1E3A5F] rounded-xl p-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[#F0F4FF] font-semibold">Executive Summary</h2>
          <ProvenanceBadge type="ai-estimate" />
        </div>
        <p className="text-[#8BA3C7] leading-relaxed">{report.executive_summary}</p>
      </div>

      {/* Composite Score + Bayesian Prior side by side */}
      {(ext?.composite_score || ext?.bayesian_prior) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {ext.composite_score && <CompositeScoreCard score={ext.composite_score} />}
          {ext.bayesian_prior && <BayesianPriorCard prior={ext.bayesian_prior} />}
        </div>
      )}

      {/* Drug Mechanism */}
      {ext?.drug_mechanism && ext.drug_mechanism.drug_name && (
        <DrugMechanismCard mech={ext.drug_mechanism} />
      )}

      {/* Responder / Non-Responder profiles */}
      <div className="flex items-center justify-between">
        <h2 className="text-[#F0F4FF] font-semibold">Predicted Phenotype Profiles</h2>
        <ProvenanceBadge type="ai-estimate" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <ProfileCard
          title="Predicted Responder Profile"
          description={report.responder_profile?.description}
          biomarkers={report.responder_profile?.biomarkers}
          accent="#22C55E"
        />
        <ProfileCard
          title="Predicted Non-Responder Profile"
          description={report.nonresponder_profile?.description}
          biomarkers={report.nonresponder_profile?.biomarkers}
          accent="#EF4444"
        />
      </div>

      {/* Key Biomarkers */}
      {report.key_biomarkers?.length > 0 && (
        <div className="bg-[#0F1F3D] border border-[#1E3A5F] rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[#F0F4FF] font-semibold">Key Biomarkers</h2>
            <ProvenanceBadge type="ai-estimate" />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#1E3A5F] text-[#8BA3C7] text-xs uppercase">
                  <th className="text-left py-2 pr-4">Biomarker</th>
                  <th className="text-left py-2 pr-4">Patient Value</th>
                  <th className="text-left py-2 pr-4">Reference Range</th>
                  <th className="text-left py-2">Interpretation</th>
                </tr>
              </thead>
              <tbody>
                {report.key_biomarkers.map((b, i) => (
                  <tr key={i} className="border-b border-[#1E3A5F] last:border-0">
                    <td className="py-3 pr-4 text-[#F0F4FF] font-medium">{b.name}</td>
                    <td className="py-3 pr-4 text-[#4F8EF7] font-mono">{b.patient_value}</td>
                    <td className="py-3 pr-4 text-[#8BA3C7]">{b.reference_range}</td>
                    <td className="py-3 text-[#8BA3C7]">{b.interpretation}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Cross-Species Mapping */}
      {ext?.cross_species_mapping && ext.cross_species_mapping.length > 0 && (
        <CrossSpeciesCard mapping={ext.cross_species_mapping} />
      )}

      {/* In Silico Twin */}
      {ext?.in_silico_twin && ext.in_silico_twin.projections?.length > 0 && (
        <InSilicoTwinCard twin={ext.in_silico_twin} />
      )}

      {/* CRO Screening Prompts */}
      {ext?.cro_screening_prompts && ext.cro_screening_prompts.length > 0 && (
        <CROScreeningCard categories={ext.cro_screening_prompts} />
      )}

      {/* Recommendations */}
      {report.recommendations?.length > 0 && (
        <div className="bg-[#0F1F3D] border border-[#1E3A5F] rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[#F0F4FF] font-semibold">Recommendations</h2>
            <ProvenanceBadge type="ai-estimate" />
          </div>
          <ul className="space-y-2">
            {report.recommendations.map((r, i) => (
              <li key={i} className="flex gap-3 text-[#8BA3C7] text-sm">
                <span className="text-[#4F8EF7] font-bold mt-0.5">·</span>
                {r}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Matched Corpus References */}
      {report.matched_corpus_refs?.length > 0 && (
        <div className="bg-[#0F1F3D] border border-[#1E3A5F] rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[#F0F4FF] font-semibold">Matched Corpus References</h2>
            <ProvenanceBadge type="retrieved" />
          </div>
          <div className="space-y-3">
            {report.matched_corpus_refs.map((ref, i) => (
              <CorpusRefCard key={i} ref_={ref} index={i + 1} />
            ))}
          </div>
        </div>
      )}

      {/* Methodology */}
      {report.methodology_notes && (
        <div className="bg-[#0F1F3D] border border-[#1E3A5F] rounded-xl p-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[#F0F4FF] font-semibold">Methodology</h2>
            <ProvenanceBadge type="ai-estimate" />
          </div>
          <p className="text-[#8BA3C7] text-sm leading-relaxed">{report.methodology_notes}</p>
        </div>
      )}

    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ProfileCard({ title, description, biomarkers, accent }: {
  title: string;
  description?: string;
  biomarkers?: BiomarkerEntry[];
  accent: string;
}) {
  return (
    <div className="bg-[#0F1F3D] border border-[#1E3A5F] rounded-xl p-5">
      <h3 className="font-semibold mb-2" style={{ color: accent }}>{title}</h3>
      {description && <p className="text-[#8BA3C7] text-sm mb-3 leading-relaxed">{description}</p>}
      {biomarkers && biomarkers.length > 0 && (
        <div className="space-y-1.5">
          {biomarkers.map((b, i) => (
            <div key={i} className="flex items-start gap-2 text-sm">
              <span className={`font-bold mt-0.5 ${directionColor(b.direction)}`}>
                {directionIcon(b.direction)}
              </span>
              <div>
                <span className="text-[#F0F4FF] font-medium">{b.name}</span>
                {b.significance && <span className="text-[#8BA3C7]"> — {b.significance}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CorpusRefCard({ ref_, index }: { ref_: CorpusRef; index: number }) {
  return (
    <details className="group bg-[#0A1628] border border-[#1E3A5F] rounded-lg">
      <summary className="flex items-center gap-3 px-4 py-3 cursor-pointer list-none">
        <span className="text-[#4F8EF7] font-mono text-xs w-5">[{index}]</span>
        <div className="flex-1 min-w-0">
          <span className="text-[#F0F4FF] text-sm font-medium">{ref_.title}</span>
          <span className="ml-2 text-xs text-[#8BA3C7] capitalize">{ref_.source_type?.replace("_", " ")}</span>
        </div>
        <span className="text-[#8BA3C7] text-xs group-open:rotate-180 transition-transform">▼</span>
      </summary>
      <div className="px-4 pb-4 space-y-2 border-t border-[#1E3A5F] pt-3">
        {ref_.excerpt && <p className="text-[#8BA3C7] text-sm italic">"{ref_.excerpt}"</p>}
        {ref_.relevance_note && <p className="text-[#4F8EF7] text-xs">{ref_.relevance_note}</p>}
      </div>
    </details>
  );
}
