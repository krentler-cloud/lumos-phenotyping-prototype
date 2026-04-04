export const dynamic = "force-dynamic";

import { createServiceClient } from "@/lib/supabase/server";
import Sidebar from "@/components/Sidebar";
import StudyChat from "@/components/StudyChat";
import { notFound } from "next/navigation";
import { Phase1ReportData } from "@/lib/pipeline/synthesize-phase1";

export default async function StudyLayout({
  children,
  params,
}: {
  children: React.ReactNode;
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

  // Build suggestion chips for AI chat (optionally grounded in actual report values)
  let phase1Report: Phase1ReportData | null = null;
  if (study.phase1_run_id) {
    const { data: p1Row } = await supabase
      .from("phase1_reports")
      .select("report_data")
      .eq("run_id", study.phase1_run_id)
      .single();
    if (p1Row) phase1Report = p1Row.report_data as Phase1ReportData;
  }

  const topBiomarker = phase1Report?.biomarker_recommendations
    ?.sort((a, b) => a.rank - b.rank)[0]?.name ?? "BDNF";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let phase2Report: Record<string, any> | null = null;
  if (study.phase2_run_id) {
    const { data: p2Row } = await supabase
      .from("phase2_reports")
      .select("report_data")
      .eq("study_id", studyId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    if (p2Row) phase2Report = p2Row.report_data as Record<string, unknown>;
  }

  const predictedSubtype = phase2Report?.ml_result?.predicted_subtype ?? null;

  const chatSuggestions: string[] = [
    `Why is ${topBiomarker} the strongest efficacy signal?`,
    `What corpus evidence underpins the responder phenotype?`,
    `What are the top safety signals for ${study.drug_name}?`,
    "Compare the responder and non-responder inflammatory profiles",
    ...(predictedSubtype ? [`What drove the ${predictedSubtype} subtype prediction?`] : []),
    ...(phase1Report?.exploratory_biomarkers?.length
      ? ["What exploratory biomarkers are worth adding to a Phase 2 assay panel?"]
      : []),
  ].slice(0, 5);

  return (
    <div className="flex h-screen overflow-hidden bg-[#0A1628]">
      <div className="print-hide"><Sidebar study={study} /></div>

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="print-hide flex-shrink-0 h-14 bg-[#070F1E] border-b border-[#1E3A5F] flex items-center px-6">
          <div className="text-[#8BA3C7] text-sm" id="page-title" />
        </header>

        {/* Scrollable main content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>

      {/* AI Chat — floating panel, persists across study tabs */}
      <StudyChat studyId={studyId} drugName={study.drug_name} suggestions={chatSuggestions} />
    </div>
  );
}
