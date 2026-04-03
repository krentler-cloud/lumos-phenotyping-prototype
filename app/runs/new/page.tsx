import PatientDataForm from "@/components/PatientDataForm";

export default function NewRunPage() {
  return (
    <div className="max-w-7xl mx-auto px-6 py-12 w-full">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[#F0F4FF] mb-1">New Run</h1>
        <p className="text-[#8BA3C7] text-sm">
          Enter patient data to generate a phenotyping report.
        </p>
      </div>
      <PatientDataForm />
    </div>
  );
}
