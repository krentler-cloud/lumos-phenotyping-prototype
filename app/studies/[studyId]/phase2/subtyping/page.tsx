export const dynamic = "force-dynamic";

import { createServiceClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import SubtypingResults from "@/components/SubtypingResults";
import { Phase2ReportData } from "@/lib/pipeline/synthesize-phase2";
import { Phase2MLResult } from "@/lib/pipeline/clinical-ml";

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

  return (
    <SubtypingResults
      studyId={studyId}
      drugName={study.drug_name}
      report={report}
    />
  );
}
