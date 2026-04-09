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
      />
    </>
  );
}
