export const dynamic = "force-dynamic";

import { createServiceClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";

export default async function Phase2Page({
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

  // Fetch patient cohort for summary
  const { data: patients } = await supabase
    .from("clinical_patients")
    .select(
      "patient_code, age, sex, response_status, baseline_bdnf_ng_ml, baseline_il6_pg_ml, baseline_crp_mg_l, baseline_madrs, prior_ad_trials"
    )
    .eq("study_id", studyId)
    .order("patient_code");

  type PatientRow = {
    patient_code: string; age: number; sex: string; response_status: string;
    baseline_bdnf_ng_ml: number; baseline_il6_pg_ml: number; baseline_crp_mg_l: number;
    baseline_madrs: number; prior_ad_trials: number;
  }
  const cohort: PatientRow[] = (patients ?? []) as PatientRow[];
  const n = cohort.length;
  const responders = cohort.filter((p) => p.response_status === "responder").length;
  const nonresponders = cohort.filter((p) => p.response_status === "nonresponder").length;
  const uncertain = cohort.filter((p) => p.response_status === "uncertain").length;
  const female = cohort.filter((p) => p.sex === "F").length;

  const bdnfValues = cohort.map((p) => p.baseline_bdnf_ng_ml).filter((v): v is number => v != null);
  const il6Values = cohort.map((p) => p.baseline_il6_pg_ml).filter((v): v is number => v != null);
  const ageValues = cohort.map((p) => p.age).filter((v): v is number => v != null);
  const madrsValues = cohort.map((p) => p.baseline_madrs).filter((v): v is number => v != null);

  const fmt1 = (v: number | null) => v != null ? v.toFixed(1) : "—";
  const avg = (arr: number[]): number | null => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;

  return (
    <div className="max-w-4xl mx-auto px-8 py-12">
      <div className="text-center mb-10">
        <p className="text-status-purple text-xs uppercase tracking-widest mb-4">Clinical Analysis · Lumos AI</p>
        <h1 className="text-4xl font-bold text-text-heading mb-3">Trial Data Is In</h1>
        <p className="text-text-muted text-sm max-w-xl mx-auto leading-relaxed">
          {/* SCIENCE-FEEDBACK: P1-A */}
          {study.drug_name} Phase 1 patient outcomes are ready. Run Lumos Clinical Analysis to validate the Planning Phase
          phenotype hypotheses against real patient data and generate CRO-ready screening criteria.
        </p>
      </div>

      {/* Patient cohort summary */}
      {n > 0 && (
        <div className="mb-8 bg-bg-surface border border-border-subtle rounded-xl p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-text-secondary mb-1">Patient Cohort</p>
              <p className="text-text-heading font-semibold text-sm">{study.drug_name} Phase 1 Trial · N={n} participants</p>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-brand-core/15 text-brand-core border border-brand-core/30">
              EDC DATA LOADED
            </span>
          </div>

          {/* Response breakdown */}
          <div className="grid grid-cols-3 gap-3 mb-5">
            <div className="bg-bg-overlay rounded-lg p-3 border border-status-success/20">
              <p className="text-[10px] uppercase tracking-widest text-text-secondary mb-1">Responders</p>
              <p className="text-2xl font-bold text-status-success">{responders}</p>
              <p className="text-text-secondary text-xs mt-0.5">{Math.round((responders / n) * 100)}% of cohort</p>
            </div>
            <div className="bg-bg-overlay rounded-lg p-3 border border-status-danger/20">
              <p className="text-[10px] uppercase tracking-widest text-text-secondary mb-1">Non-Responders</p>
              <p className="text-2xl font-bold text-status-danger">{nonresponders}</p>
              <p className="text-text-secondary text-xs mt-0.5">{Math.round((nonresponders / n) * 100)}% of cohort</p>
            </div>
            <div className="bg-bg-overlay rounded-lg p-3 border border-status-warning/20">
              <p className="text-[10px] uppercase tracking-widest text-text-secondary mb-1">Uncertain</p>
              <p className="text-2xl font-bold text-status-warning">{uncertain}</p>
              <p className="text-text-secondary text-xs mt-0.5">{Math.round((uncertain / n) * 100)}% of cohort</p>
            </div>
          </div>

          {/* Biomarker + demographics summary */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-bg-overlay rounded-lg p-3 border border-border-subtle">
              <p className="text-[10px] uppercase tracking-widest text-text-secondary mb-2">Key Biomarkers (baseline mean)</p>
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-text-muted text-xs">BDNF</span>
                  <span className="text-text-body text-xs font-mono">
                    {fmt1(avg(bdnfValues))} ng/mL
                    <span className="text-text-secondary ml-1">(range {fmt1(Math.min(...bdnfValues))}–{fmt1(Math.max(...bdnfValues))})</span>
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-text-muted text-xs">IL-6</span>
                  <span className="text-text-body text-xs font-mono">
                    {fmt1(avg(il6Values))} pg/mL
                    <span className="text-text-secondary ml-1">(range {fmt1(Math.min(...il6Values))}–{fmt1(Math.max(...il6Values))})</span>
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-text-muted text-xs">MADRS</span>
                  <span className="text-text-body text-xs font-mono">
                    {fmt1(avg(madrsValues))} pts
                    <span className="text-text-secondary ml-1">(range {Math.min(...madrsValues)}–{Math.max(...madrsValues)})</span>
                  </span>
                </div>
              </div>
            </div>
            <div className="bg-bg-overlay rounded-lg p-3 border border-border-subtle">
              <p className="text-[10px] uppercase tracking-widest text-text-secondary mb-2">Demographics</p>
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-text-muted text-xs">Age</span>
                  <span className="text-text-body text-xs font-mono">
                    {ageValues.length
                      ? <>{Math.round(avg(ageValues)!)} yrs avg <span className="text-text-secondary ml-1">({Math.min(...ageValues)}–{Math.max(...ageValues)})</span></>
                      : <span className="text-text-secondary">—</span>}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-text-muted text-xs">Sex</span>
                  <span className="text-text-body text-xs font-mono">{female}F / {n - female}M</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-text-muted text-xs">Prior AD trials</span>
                  <span className="text-text-body text-xs font-mono">
                    {fmt1(avg(cohort.map((p) => p.prior_ad_trials).filter((v): v is number => v != null)))} avg
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Patient list */}
          <div className="mt-4 pt-4 border-t border-border-subtle">
            <p className="text-[10px] uppercase tracking-widest text-text-secondary mb-2">Enrolled Participants</p>
            <div className="flex flex-wrap gap-1.5">
              {cohort.map((p) => {
                const color =
                  p.response_status === "responder" ? "var(--status-success)"
                  : p.response_status === "nonresponder" ? "var(--status-danger)"
                  : "var(--status-warning)";
                return (
                  <span
                    key={p.patient_code}
                    className="text-[10px] font-mono px-2 py-0.5 rounded"
                    style={{ color, background: `${color}15`, border: `1px solid ${color}25` }}
                  >
                    {p.patient_code}
                  </span>
                );
              })}
            </div>
            <div className="flex gap-4 mt-2">
              <span className="text-[10px] text-text-secondary flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-status-success inline-block" /> Responder</span>
              <span className="text-[10px] text-text-secondary flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-status-danger inline-block" /> Non-responder</span>
              <span className="text-[10px] text-text-secondary flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-status-warning inline-block" /> Uncertain</span>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-4 mb-8">
        {[
          {
            icon: "📊",
            title: "New Corpus Data",
            items: [
              "+ 1,847 new MDD trial records ingested",
              "+ 340 new publications indexed",
              "+ ClinicalTrials.gov re-queried: +28 trials",
            ],
            color: "var(--brand-core)",
          },
          {
            icon: "🤖",
            title: "AI Advancement",
            items: [
              "+ Lumos v2.1 — next-gen foundation model",
              "+ Improved biomarker extraction accuracy",
              "+ Enhanced cross-species mapping fidelity",
              "+ New: temporal trajectory modeling",
            ],
            color: "var(--status-purple)",
          },
          {
            icon: "🚀",
            title: "Your Clinical Data",
            items: [
              `+ N=${n} MDD patient outcomes integrated`,
              "+ HAMD-17 response data at Day 28",
              "+ Biomarker validation at Wk 2, 4, 8",
              `+ ${responders} responders · ${nonresponders} non-responders · ${uncertain} uncertain`,
            ],
            color: "var(--status-success)",
          },
        ].map((card) => (
          <div key={card.title} className="bg-bg-surface border border-border-subtle rounded-xl p-5">
            <div className="text-2xl mb-3">{card.icon}</div>
            <h3 className="font-semibold text-sm mb-3" style={{ color: card.color }}>{card.title}</h3>
            <ul className="space-y-1.5">
              {card.items.map((item, i) => (
                <li key={i} className="text-text-muted text-xs">{item}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <form action={`/api/studies/${studyId}/run-phase2`} method="POST">
        <button
          type="submit"
          className="w-full bg-gradient-to-r from-brand-core to-status-success text-white font-semibold py-4 rounded-xl text-sm transition-opacity hover:opacity-90 flex items-center justify-center gap-2"
        >
          Run Lumos v2.1 Clinical Analysis →
        </button>
      </form>
    </div>
  );
}
