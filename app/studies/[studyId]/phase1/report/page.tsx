export const dynamic = "force-dynamic";

import { createServiceClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Phase1ReportViewer from "@/components/Phase1ReportViewer";
import { Phase1ReportData } from "@/lib/pipeline/synthesize-phase1";

export default async function Phase1ReportPage({
  params,
}: {
  params: Promise<{ studyId: string }>;
}) {
  const { studyId } = await params;
  const supabase = createServiceClient();

  // Load study + run
  const { data: study } = await supabase
    .from("studies")
    .select("*, phase1_run_id")
    .eq("id", studyId)
    .single();

  if (!study) notFound();

  if (!study.phase1_run_id) {
    return (
      <div className="max-w-2xl mx-auto px-8 py-16 text-center">
        <p className="text-[#8BA3C7]">No Phase 1 report yet. Run the analysis first.</p>
      </div>
    );
  }

  // Load Phase 1 report
  const { data: reportRow } = await supabase
    .from("phase1_reports")
    .select("report_data, created_at")
    .eq("run_id", study.phase1_run_id)
    .single();

  if (!reportRow) {
    // Run might still be processing
    return (
      <div className="max-w-2xl mx-auto px-8 py-16 text-center">
        <p className="text-[#8BA3C7]">Report is still being generated…</p>
      </div>
    );
  }

  const report = reportRow.report_data as Phase1ReportData;

  return (
    <Phase1ReportViewer
      report={report}
      drugName={study.drug_name}
      indication={study.indication}
      generatedAt={reportRow.created_at}
      studyId={studyId}
    />
  );
}
