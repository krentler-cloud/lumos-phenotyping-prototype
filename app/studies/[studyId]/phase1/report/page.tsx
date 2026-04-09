export const dynamic = "force-dynamic";

import { createServiceClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Phase1ReportViewer from "@/components/Phase1ReportViewer";
import { Phase1ReportData } from "@/lib/pipeline/synthesize-phase1";
import { PageContextDispatcher } from "@/components/PageContextDispatcher";
import { pct } from "@/lib/context/pageContext";

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
        <p className="text-text-muted">No Phase 1 report yet. Run the analysis first.</p>
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
        <p className="text-text-muted">Report is still being generated…</p>
      </div>
    );
  }

  const report = reportRow.report_data as Phase1ReportData;

  const topBiomarkers = (report.biomarker_recommendations ?? [])
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 4)
    .map(b => `${b.name} (#${b.rank})`)
    .join(", ");

  return (
    <>
      <PageContextDispatcher context={{
        pageId: "phase1/report",
        pageLabel: "Planning Phase Report",
        visibleData: {
          "Overall corpus confidence": pct(report.overall_confidence),
          "Responder subtype": report.responder_profile?.primary_subtype ?? null,
          "Responder corpus confidence": pct(report.responder_profile?.corpus_hypothesis_confidence),
          "Responder key inclusion criteria": report.responder_profile?.key_inclusion_criteria?.slice(0, 4).join("; ") ?? null,
          "Non-responder subtype": report.nonresponder_profile?.primary_subtype ?? null,
          "Non-responder corpus confidence": pct(report.nonresponder_profile?.corpus_hypothesis_confidence),
          "Non-responder key exclusion criteria": report.nonresponder_profile?.key_exclusion_criteria?.slice(0, 4).join("; ") ?? null,
          "Top biomarkers by priority": topBiomarkers || null,
          "Primary endpoint recommendation": report.primary_endpoint_recommendation ?? null,
        },
      }} />
      <Phase1ReportViewer
        report={report}
        drugName={study.drug_name}
        indication={study.indication}
        generatedAt={reportRow.created_at}
        studyId={studyId}
      />
    </>
  );
}
