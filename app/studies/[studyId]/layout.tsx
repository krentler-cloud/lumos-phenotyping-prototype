export const dynamic = "force-dynamic";

import { createServiceClient } from "@/lib/supabase/server";
import Sidebar from "@/components/Sidebar";
import { notFound } from "next/navigation";
import Link from "next/link";

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

  const isPhase1 = true; // always available once study exists
  const isPhase2 = !!study.phase2_run_id;

  return (
    <div className="flex h-screen overflow-hidden bg-[#0A1628]">
      <Sidebar study={study} />

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar with phase toggle */}
        <header className="flex-shrink-0 h-14 bg-[#070F1E] border-b border-[#1E3A5F] flex items-center justify-between px-6">
          <div className="text-[#8BA3C7] text-sm" id="page-title" />
          <div className="flex items-center gap-2">
            <Link
              href={`/studies/${studyId}/phase1`}
              className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                !isPhase2
                  ? "bg-[#4F8EF7] text-white"
                  : "text-[#8BA3C7] hover:text-[#F0F4FF] border border-[#1E3A5F]"
              }`}
            >
              Phase 1 — Preclinical
            </Link>
            <Link
              href={isPhase1 ? `/studies/${studyId}/phase2` : "#"}
              className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                isPhase2
                  ? "bg-[#22C55E] text-white"
                  : "text-[#2A4060] border border-[#1E3A5F] cursor-not-allowed"
              }`}
            >
              Phase 2 — Clinical
            </Link>
          </div>
        </header>

        {/* Scrollable main content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
