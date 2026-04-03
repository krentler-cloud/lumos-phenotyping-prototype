export const dynamic = "force-dynamic";

import { createServiceClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";

export default async function Phase2Page({
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

  return (
    <div className="max-w-4xl mx-auto px-8 py-12">
      <div className="text-center mb-12">
        <p className="text-[#A855F7] text-xs uppercase tracking-widest mb-4">Clinical Analysis · Lumos v2.1</p>
        <h1 className="text-4xl font-bold text-[#F0F4FF] mb-3">Trial Data Is In</h1>
        <p className="text-[#8BA3C7] text-sm max-w-xl mx-auto leading-relaxed">
          XYL-1001 Phase 1 patient outcomes are ready. Run Lumos Clinical Analysis to validate the pre-clinical
          phenotype hypotheses against real patient data and generate CRO-ready screening criteria.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-8">
        {[
          {
            icon: "📊",
            title: "New Corpus Data",
            items: [
              "+ 1,847 new MDD trial records ingested",
              "+ 340 new publications indexed",
              "+ ClinicalTrials.gov re-queried: +28 trials",
            ],
            color: "#4F8EF7",
          },
          {
            icon: "🤖",
            title: "AI Advancement",
            items: [
              "+ Lumos v2.1 — next-gen foundation model",
              "+ Improved biomarker extraction accuracy",
              "+ Enhanced cross-species mapping fidelity",
              "+ New: temporal trajectory modeling",
            ],
            color: "#A855F7",
          },
          {
            icon: "🚀",
            title: "Your Clinical Data",
            items: [
              `+ N=16 MDD patient outcomes integrated`,
              "+ HAMD-17 response data at Day 28",
              "+ Biomarker validation at Wk 2, 4, 8",
              "+ Subtype concordance: 87% with corpus prediction",
            ],
            color: "#22C55E",
          },
        ].map((card) => (
          <div key={card.title} className="bg-[#0F1F3D] border border-[#1E3A5F] rounded-xl p-5">
            <div className="text-2xl mb-3">{card.icon}</div>
            <h3 className="font-semibold text-sm mb-3" style={{ color: card.color }}>{card.title}</h3>
            <ul className="space-y-1.5">
              {card.items.map((item, i) => (
                <li key={i} className="text-[#8BA3C7] text-xs">{item}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <form action={`/api/studies/${studyId}/run-phase2`} method="POST">
        <button
          type="submit"
          className="w-full bg-gradient-to-r from-[#4F8EF7] to-[#22C55E] text-white font-semibold py-4 rounded-xl text-sm transition-opacity hover:opacity-90 flex items-center justify-center gap-2"
        >
          Run Lumos v2.1 on Expanded Corpus →
        </button>
      </form>
    </div>
  );
}
