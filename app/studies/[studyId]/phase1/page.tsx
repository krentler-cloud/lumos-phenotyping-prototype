import { createServiceClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import Phase1Steps from "@/components/Phase1Steps";

export default async function Phase1Page({
  params,
}: {
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

  // If phase 1 is already complete, redirect to report
  if (study.phase1_run_id) {
    const { data: run } = await supabase
      .from("runs")
      .select("status")
      .eq("id", study.phase1_run_id)
      .single();

    if (run?.status === "complete") {
      redirect(`/studies/${studyId}/phase1/report`);
    }
    if (run?.status === "processing" || run?.status === "queued") {
      redirect(`/studies/${studyId}/phase1/processing`);
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-8 py-12">
      {/* Header */}
      <div className="mb-10">
        <p className="text-[#4F8EF7] text-xs uppercase tracking-widest mb-2">Phase 1 — Preclinical</p>
        <h1 className="text-2xl font-bold text-[#F0F4FF] mb-2">
          Lumos AI™ Preclinical Analysis
        </h1>
        <p className="text-[#8BA3C7] text-sm leading-relaxed">
          Lumos will analyze the {study.drug_name} IND package and Headlamp&apos;s MDD corpus to generate
          predicted responder and non-responder phenotypes, biomarker collection protocols, and
          cross-species evidence — all before any patient data is collected.
        </p>
      </div>

      {/* What Lumos will do */}
      <div className="bg-[#0F1F3D] border border-[#1E3A5F] rounded-2xl p-6 mb-6">
        <h2 className="text-[#F0F4FF] font-semibold mb-4">What Lumos AI will do</h2>
        <Phase1Steps drugName={study.drug_name} />
      </div>

      {/* Corpus stats */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {[
          { label: "IND Documents", value: "13", sub: "XYL-1001 package" },
          { label: "MDD Corpus", value: "107", sub: "indexed documents" },
          { label: "Corpus Chunks", value: "~2,400", sub: "vector embeddings" },
        ].map((stat) => (
          <div key={stat.label} className="bg-[#0F1F3D] border border-[#1E3A5F] rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-[#4F8EF7]">{stat.value}</div>
            <div className="text-[#F0F4FF] text-xs font-medium mt-0.5">{stat.label}</div>
            <div className="text-[#8BA3C7] text-xs">{stat.sub}</div>
          </div>
        ))}
      </div>

      {/* CTA */}
      <form action={`/api/studies/${studyId}/run-phase1`} method="POST">
        <button
          type="submit"
          className="w-full bg-[#4F8EF7] hover:bg-[#3A7AE4] text-white font-semibold py-4 rounded-xl text-sm transition-colors flex items-center justify-center gap-2"
        >
          <span>⚡</span>
          Run Lumos Phase 1 Analysis
        </button>
      </form>
      <p className="text-center text-[#8BA3C7] text-xs mt-3">
        Estimated time: 60–90 seconds · No patient data required
      </p>
    </div>
  );
}
