export const dynamic = "force-dynamic";

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
        {/* SCIENCE-FEEDBACK: P1-A */}
        <p className="text-brand-core text-xs uppercase tracking-widest mb-2">Planning Phase</p>
        <h1 className="text-2xl font-bold text-text-heading mb-2">
          Lumos AI™ Planning Phase Analysis
        </h1>
        <p className="text-text-muted text-sm leading-relaxed">
          Lumos will analyze the {study.drug_name} IND package and Headlamp&apos;s MDD corpus to generate
          predicted responder and non-responder phenotypes, biomarker collection protocols, and
          cross-species evidence — all before any patient data is collected.
        </p>
      </div>

      {/* What Lumos will do */}
      <div className="bg-bg-surface border border-border-subtle rounded-2xl p-6 mb-6">
        <h2 className="text-text-heading font-semibold mb-4">What Lumos AI will do</h2>
        <Phase1Steps drugName={study.drug_name} />
      </div>

      {/* Corpus stats */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {[
          { label: "IND Documents", value: "13", sub: "XYL-1001 package" },
          { label: "MDD Corpus", value: "107", sub: "indexed documents" },
          { label: "Corpus Chunks", value: "~2,400", sub: "vector embeddings" },
        ].map((stat) => (
          <div key={stat.label} className="bg-bg-surface border border-border-subtle rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-brand-core">{stat.value}</div>
            <div className="text-text-heading text-xs font-medium mt-0.5">{stat.label}</div>
            <div className="text-text-muted text-xs">{stat.sub}</div>
          </div>
        ))}
      </div>

      {/* CTA */}
      <form action={`/api/studies/${studyId}/run-phase1`} method="POST">
        <button
          type="submit"
          className="w-full bg-brand-core hover:bg-brand-hover text-white font-semibold py-4 rounded-xl text-sm transition-colors flex items-center justify-center gap-2"
        >
          <span>⚡</span>
          Run Lumos Phase 1 Analysis
        </button>
      </form>
      <p className="text-center text-text-muted text-xs mt-3">
        Estimated time: 60–90 seconds · No patient data required
      </p>
    </div>
  );
}
