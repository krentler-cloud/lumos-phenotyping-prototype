export const dynamic = "force-dynamic";

import { createServiceClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import PatientPopulation, { ClinicalPatientFull } from "@/components/PatientPopulation";

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

  return (
    <PatientPopulation
      studyId={studyId}
      drugName={study.drug_name}
      patients={(patients ?? []) as ClinicalPatientFull[]}
    />
  );
}
