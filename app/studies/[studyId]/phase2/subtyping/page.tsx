export const dynamic = "force-dynamic";

import { createServiceClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import SubtypingResults from "@/components/SubtypingResults";
import { Phase2ReportData } from "@/lib/pipeline/synthesize-phase2";
import { Phase2MLResult } from "@/lib/pipeline/clinical-ml";
import { PageContextDispatcher } from "@/components/PageContextDispatcher";
import { outOf } from "@/lib/context/pageContext";

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

export default async function SubtypingPage({
  params,
}: {
  params: Promise<{ studyId: string }>;
}) {
  const { studyId } = await params;
  const supabase = createServiceClient();

  const { data: study } = await supabase
    .from("studies")
    .select("drug_name, indication, phase2_run_id")
    .eq("id", studyId)
    .single();

  if (!study) notFound();

  const { data: reportRow } = await supabase
    .from("phase2_reports")
    .select("report_data")
    .eq("study_id", studyId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!reportRow) notFound();

  const report = reportRow.report_data as FullPhase2Report;

  const ml = report.ml_result;
  const total = (ml?.responder_count ?? 0) + (ml?.nonresponder_count ?? 0) + (ml?.uncertain_count ?? 0);
  const topFeatures = ml?.feature_importance?.slice(0, 3)
    .map(f => `${f.label} (|r|=${f.importance.toFixed(2)}, ${f.direction})`)
    .join("; ") ?? null;
  const responderTraj = ml?.madrs_trajectories?.find(t => t.label.toLowerCase().includes("respond") && !t.label.toLowerCase().includes("non"));
  const nonresponderTraj = ml?.madrs_trajectories?.find(t => t.label.toLowerCase().includes("non"));

  return (
    <>
      <PageContextDispatcher context={{
        pageId: "phase2/subtyping",
        pageLabel: "ML Subtyping Results",
        visibleData: {
          "ML concordance with Planning Phase": ml ? `${ml.concordance_pct}%` : null,
          "Responders": ml ? outOf(ml.responder_count, total) : null,
          "Non-responders": ml ? outOf(ml.nonresponder_count, total) : null,
          "Uncertain": ml ? outOf(ml.uncertain_count, total) : null,
          "Top predictive features (Pearson |r|)": topFeatures,
          "Responder MADRS trajectory (Wk0→Wk8)": responderTraj
            ? `${responderTraj.wk0.toFixed(1)} → ${responderTraj.wk8.toFixed(1)}` : null,
          "Non-responder MADRS trajectory (Wk0→Wk8)": nonresponderTraj
            ? `${nonresponderTraj.wk0.toFixed(1)} → ${nonresponderTraj.wk8.toFixed(1)}` : null,
        },
      }} />
      <SubtypingResults
        studyId={studyId}
        drugName={study.drug_name}
        report={report}
      />
    </>
  );
}
