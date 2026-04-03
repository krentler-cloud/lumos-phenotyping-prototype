"use client";

interface Props {
  studyId: string;
  drugName: string;
}

export default function Phase1ExportButton({ studyId, drugName }: Props) {
  const filename = `${drugName.replace(/[^a-z0-9]/gi, "-")}-Phase1-Preclinical-Report.pdf`;

  return (
    <a
      href={`/api/studies/${studyId}/phase1-report/pdf`}
      download={filename}
      className="flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg border border-[#4F8EF7]/50 text-[#4F8EF7] hover:bg-[#4F8EF7]/10 hover:border-[#4F8EF7] transition-all"
    >
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <path d="M6 1v7M3 5l3 3 3-3M1 10h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      Export Report PDF
    </a>
  );
}
