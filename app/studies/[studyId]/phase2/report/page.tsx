export const dynamic = "force-dynamic";

import { createServiceClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Phase2FinalReport from "@/components/Phase2FinalReport";
import { Phase2ReportData } from "@/lib/pipeline/synthesize-phase2";
import { Phase2MLResult } from "@/lib/pipeline/clinical-ml";
import { PageContextDispatcher } from "@/components/PageContextDispatcher";
import { pct, outOf } from "@/lib/context/pageContext";

interface FullPhase2Report extends Phase2ReportData {
  ml_result: Phase2MLResult;
  patients: {
    patient_code: string;
    subtype_label: string;
    baseline_bdnf_ng_ml: number;
    baseline_il6_pg_ml: number;
    baseline_crp_mg_l: number;
    baseline_madrs: number;
    wk8_madrs: number | null;
    response_status: string;
  }[];
}

export default async function Phase2ReportPage({
  params,
}: {
  params: Promise<{ studyId: string }>;
}) {
  const { studyId } = await params;
  const supabase = createServiceClient();

  const { data: study } = await supabase
    .from("studies")
    .select("drug_name, indication, sponsor")
    .eq("id", studyId)
    .single();

  if (!study) notFound();

  const { data: reportRow } = await supabase
    .from("phase2_reports")
    .select("report_data, created_at")
    .eq("study_id", studyId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!reportRow) notFound();

  const report = reportRow.report_data as FullPhase2Report;

  const ml = report.ml_result;
  const rp = report.refined_responder_profile;
  const nr = report.refined_nonresponder_profile;
  const total = (ml?.responder_count ?? 0) + (ml?.nonresponder_count ?? 0) + (ml?.uncertain_count ?? 0);

  return (
    <>
      <PageContextDispatcher context={{
        pageId: "phase2/report",
        pageLabel: "Clinical Analysis Final Report",
        visibleData: {
          "ML concordance with Planning Phase predictions": ml ? `${ml.concordance_pct}%` : null,
          "Responders": ml ? outOf(ml.responder_count, total) : null,
          "Non-responders": ml ? outOf(ml.nonresponder_count, total) : null,
          "Uncertain": ml ? outOf(ml.uncertain_count, total) : null,
          "Responder Bayesian posterior": rp ? pct(rp.phase2_confidence) : null,
          "Responder corpus prior (Planning Phase)": rp ? pct(rp.phase1_confidence) : null,
          "Responder key inclusion criteria": rp?.key_criteria?.slice(0, 4).join("; ") ?? null,
          "Non-responder Bayesian posterior": nr ? pct(nr.phase2_confidence) : null,
          "Non-responder corpus prior (Planning Phase)": nr ? pct(nr.phase1_confidence) : null,
          "Non-responder key exclusion criteria": nr?.key_criteria?.slice(0, 4).join("; ") ?? null,
          "Enhanced outcome measures": report.enhanced_outcome_measures?.map(m => m.name).join(", ") ?? null,
          "CRO prompt categories": report.cro_prompts?.map(p => p.category).join(", ") ?? null,
          "Executive summary": report.executive_summary ?? null,
        },
      }} />
      <Phase2FinalReport
        studyId={studyId}
        drugName={study.drug_name}
        indication={study.indication}
        sponsor={study.sponsor}
        generatedAt={reportRow.created_at}
        report={report}
      />
    </>
  );
}
