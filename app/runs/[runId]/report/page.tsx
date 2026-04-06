export const dynamic = "force-dynamic";

import { createServiceClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import ReportViewer from "@/components/ReportViewer";
import ReportChat from "@/components/ReportChat";
import Link from "next/link";

export default async function ReportPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;
  const supabase = createServiceClient();

  const { data: report, error } = await supabase
    .from("reports")
    .select("*")
    .eq("run_id", runId)
    .single();

  if (error || !report) notFound();

  return (
    <div>
      <div className="max-w-5xl mx-auto px-6 pt-6">
        <Link
          href="/runs"
          className="text-text-muted hover:text-text-heading text-sm transition-colors"
        >
          ← All Runs
        </Link>
      </div>
      <ReportViewer report={report} runId={runId} />
      <ReportChat runId={runId} />
    </div>
  );
}
