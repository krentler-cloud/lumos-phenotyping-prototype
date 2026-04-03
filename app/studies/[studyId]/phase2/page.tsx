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

  const cohort = patients ?? [];
  const n = cohort.length;
  const responders = cohort.filter((p) => p.response_status === "responder").length;
  const nonresponders = cohort.filter((p) => p.response_status === "nonresponder").length;
  const uncertain = cohort.filter((p) => p.response_status === "uncertain").length;
  const female = cohort.filter((p) => p.sex === "F").length;

  const bdnfValues = cohort.map((p) => p.baseline_bdnf_ng_ml).filter(Boolean);
  const il6Values = cohort.map((p) => p.baseline_il6_pg_ml).filter(Boolean);
  const ageValues = cohort.map((p) => p.age).filter(Boolean);
  const madrsValues = cohort.map((p) => p.baseline_madrs).filter(Boolean);

  const fmt1 = (v: number) => v.toFixed(1);
  const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;

  return (
    <div className="max-w-4xl mx-auto px-8 py-12">
      <div className="text-center mb-10">
        <p className="text-[#A855F7] text-xs uppercase tracking-widest mb-4">Clinical Analysis · Lumos v2.1</p>
        <h1 className="text-4xl font-bold text-[#F0F4FF] mb-3">Trial Data Is In</h1>
        <p className="text-[#8BA3C7] text-sm max-w-xl mx-auto leading-relaxed">
          XYL-1001 Phase 1 patient outcomes are ready. Run Lumos Clinical Analysis to validate the pre-clinical
          phenotype hypotheses against real patient data and generate CRO-ready screening criteria.
        </p>
      </div>

      {/* Patient cohort summary */}
      {n > 0 && (
        <div className="mb-8 bg-[#0F1F3D] border border-[#1E3A5F] rounded-xl p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-[#4A6580] mb-1">Patient Cohort</p>
              <p className="text-[#F0F4FF] font-semibold text-sm">XYL-1001 Phase 1 Trial · N={n} participants</p>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-[#4F8EF7]/15 text-[#4F8EF7] border border-[#4F8EF7]/30">
              EDC DATA LOADED
            </span>
          </div>

          {/* Response breakdown */}
          <div className="grid grid-cols-3 gap-3 mb-5">
            <div className="bg-[#080F1F] rounded-lg p-3 border border-[#22C55E]/20">
              <p className="text-[10px] uppercase tracking-widest text-[#4A6580] mb-1">Responders</p>
              <p className="text-2xl font-bold text-[#22C55E]">{responders}</p>
              <p className="text-[#4A6580] text-xs mt-0.5">{Math.round((responders / n) * 100)}% of cohort</p>
            </div>
            <div className="bg-[#080F1F] rounded-lg p-3 border border-[#EF4444]/20">
              <p className="text-[10px] uppercase tracking-widest text-[#4A6580] mb-1">Non-Responders</p>
              <p className="text-2xl font-bold text-[#EF4444]">{nonresponders}</p>
              <p className="text-[#4A6580] text-xs mt-0.5">{Math.round((nonresponders / n) * 100)}% of cohort</p>
            </div>
            <div className="bg-[#080F1F] rounded-lg p-3 border border-[#F59E0B]/20">
              <p className="text-[10px] uppercase tracking-widest text-[#4A6580] mb-1">Uncertain</p>
              <p className="text-2xl font-bold text-[#F59E0B]">{uncertain}</p>
              <p className="text-[#4A6580] text-xs mt-0.5">{Math.round((uncertain / n) * 100)}% of cohort</p>
            </div>
          </div>

          {/* Biomarker + demographics summary */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-[#080F1F] rounded-lg p-3 border border-[#1E3A5F]">
              <p className="text-[10px] uppercase tracking-widest text-[#4A6580] mb-2">Key Biomarkers (baseline mean)</p>
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-[#8BA3C7] text-xs">BDNF</span>
                  <span className="text-[#D0DCF0] text-xs font-mono">
                    {fmt1(avg(bdnfValues))} ng/mL
                    <span className="text-[#4A6580] ml-1">(range {fmt1(Math.min(...bdnfValues))}–{fmt1(Math.max(...bdnfValues))})</span>
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[#8BA3C7] text-xs">IL-6</span>
                  <span className="text-[#D0DCF0] text-xs font-mono">
                    {fmt1(avg(il6Values))} pg/mL
                    <span className="text-[#4A6580] ml-1">(range {fmt1(Math.min(...il6Values))}–{fmt1(Math.max(...il6Values))})</span>
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[#8BA3C7] text-xs">MADRS</span>
                  <span className="text-[#D0DCF0] text-xs font-mono">
                    {fmt1(avg(madrsValues))} pts
                    <span className="text-[#4A6580] ml-1">(range {Math.min(...madrsValues)}–{Math.max(...madrsValues)})</span>
                  </span>
                </div>
              </div>
            </div>
            <div className="bg-[#080F1F] rounded-lg p-3 border border-[#1E3A5F]">
              <p className="text-[10px] uppercase tracking-widest text-[#4A6580] mb-2">Demographics</p>
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-[#8BA3C7] text-xs">Age</span>
                  <span className="text-[#D0DCF0] text-xs font-mono">
                    {Math.round(avg(ageValues))} yrs avg
                    <span className="text-[#4A6580] ml-1">({Math.min(...ageValues)}–{Math.max(...ageValues)})</span>
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[#8BA3C7] text-xs">Sex</span>
                  <span className="text-[#D0DCF0] text-xs font-mono">{female}F / {n - female}M</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[#8BA3C7] text-xs">Prior AD trials</span>
                  <span className="text-[#D0DCF0] text-xs font-mono">
                    {fmt1(avg(cohort.map((p) => p.prior_ad_trials)))} avg
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Patient list */}
          <div className="mt-4 pt-4 border-t border-[#1E3A5F]">
            <p className="text-[10px] uppercase tracking-widest text-[#4A6580] mb-2">Enrolled Participants</p>
            <div className="flex flex-wrap gap-1.5">
              {cohort.map((p) => {
                const color =
                  p.response_status === "responder" ? "#22C55E"
                  : p.response_status === "nonresponder" ? "#EF4444"
                  : "#F59E0B";
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
              <span className="text-[10px] text-[#4A6580] flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#22C55E] inline-block" /> Responder</span>
              <span className="text-[10px] text-[#4A6580] flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#EF4444] inline-block" /> Non-responder</span>
              <span className="text-[10px] text-[#4A6580] flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#F59E0B] inline-block" /> Uncertain</span>
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
            color: "#4F8EF7",
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
            color: "#A855F7",
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
            color: "#22C55E",
          },
        ].map((card) => (
          <div key={card.title} className="bg-[#0F1F3D] border border-[#1E3A5F] rounded-xl p-5">
            <div className="text-2xl mb-3">{card.icon}</div>
            <h3 className="font-semibold text-sm mb-3" style={{ color: card.color }}>{card.title}</h3>
            <ul className="space-y-1.5">
              {card.items.map((item, i) => (
                <li key={i} className="text-[#8BA3C7] text-xs">{item}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <form action={`/api/studies/${studyId}/run-phase2`} method="POST">
        <button
          type="submit"
          className="w-full bg-gradient-to-r from-[#4F8EF7] to-[#22C55E] text-white font-semibold py-4 rounded-xl text-sm transition-opacity hover:opacity-90 flex items-center justify-center gap-2"
        >
          Run Lumos v2.1 Clinical Analysis →
        </button>
      </form>
    </div>
  );
}
