export const dynamic = "force-dynamic";

import { createServiceClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import PatientPopulation, { ClinicalPatientFull } from "@/components/PatientPopulation";
import { PageContextDispatcher } from "@/components/PageContextDispatcher";

export default async function PatientsPage({
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

  if (!study?.phase2_run_id) notFound();

  const { data: patients } = await supabase
    .from("clinical_patients")
    .select("*")
    .eq("study_id", studyId)
    .order("patient_code");

  // F-2: Load ML assignments from Phase 2 report for LLR rationale display
  const { data: phase2Report } = await supabase
    .from("phase2_reports")
    .select("report_data")
    .eq("study_id", studyId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  const mlAssignments = (phase2Report?.report_data as Record<string, unknown>)?.ml_result as
    { assignments?: { patient_code: string; reason: string; llr_score?: number; assignment_method?: string }[] } | undefined;

  const cohort = (patients ?? []) as ClinicalPatientFull[];
  const n = cohort.length;
  const responders = cohort.filter(p => p.response_status === "responder").length;
  const nonresponders = cohort.filter(p => p.response_status === "nonresponder").length;
  const uncertain = cohort.filter(p => p.response_status === "uncertain").length;

  return (
    <>
      <PageContextDispatcher context={{
        pageId: "phase2/patients",
        pageLabel: "Patient Population Table",
        visibleData: {
          "Total patients in table": `${n}`,
          "Responders": `${responders}`,
          "Non-responders": `${nonresponders}`,
          "Uncertain": `${uncertain}`,
          "Columns visible per patient": "Patient code, age, sex, response status, BDNF (ng/mL), IL-6 (pg/mL), CRP (mg/L), MADRS baseline, MADRS Wk8, prior AD trials",
          "Note": "Individual patient biomarker values are visible in the table — you can reference specific patients by code",
        },
      }} />
      <PatientPopulation
        studyId={studyId}
        drugName={study.drug_name}
        patients={cohort}
        assignments={mlAssignments?.assignments}
      />
    </>
  );
}
