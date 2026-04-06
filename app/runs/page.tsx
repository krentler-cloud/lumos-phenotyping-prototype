export const dynamic = "force-dynamic";

import { createServiceClient } from "@/lib/supabase/server";
import Link from "next/link";

const STATUS_STYLES: Record<string, string> = {
  complete:   "text-status-success bg-status-success/12 border-status-success",
  processing: "text-brand-core bg-brand-core/12 border-brand-core",
  queued:     "text-status-warning bg-status-warning/12 border-status-warning",
  error:      "text-status-danger bg-status-danger/12 border-status-danger",
};

const PHASE_LABELS: Record<string, { label: string; color: string }> = {
  preclinical: { label: "Pre-Clinical Analysis", color: "var(--brand-core)" },
  clinical:    { label: "Clinical Analysis",      color: "var(--status-success)" },
};

export default async function AnalysisHistoryPage() {
  const supabase = createServiceClient();

  // Fetch runs without FK join (more reliable if FK isn't defined in Supabase schema)
  const { data: runs } = await supabase
    .from("runs")
    .select("id, created_at, status, phase, study_id, step_log")
    .order("created_at", { ascending: false });

  // Fetch studies separately and build a lookup map
  const studyIds = [...new Set((runs ?? []).map((r: { study_id: string }) => r.study_id).filter(Boolean))];
  const { data: studies } = studyIds.length
    ? await supabase
        .from("studies")
        .select("id, drug_name, indication, sponsor")
        .in("id", studyIds)
    : { data: [] };
  const studyMap = Object.fromEntries((studies ?? []).map((s: { id: string; drug_name: string; indication: string; sponsor: string }) => [s.id, s]));

  // Phase1 report lookup (to confirm report exists before linking)
  const { data: phase1Reports } = await supabase
    .from("phase1_reports")
    .select("run_id");

  const phase1ReportRunIds = new Set((phase1Reports ?? []).map((r: { run_id: string }) => r.run_id));

  return (
    <div className="max-w-5xl mx-auto px-6 py-12 w-full">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-text-heading mb-1">Analysis History</h1>
        <p className="text-text-muted text-sm">
          All pre-clinical and clinical analysis runs for this project.
        </p>
      </div>

      {!runs?.length ? (
        <div className="bg-bg-surface border border-border-subtle rounded-xl p-12 text-center">
          <p className="text-text-muted mb-2">No analysis runs yet.</p>
          <Link href="/" className="text-brand-core text-sm hover:underline">
            Go to study →
          </Link>
        </div>
      ) : (
        <div className="bg-bg-surface border border-border-subtle rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-subtle text-text-muted text-xs uppercase">
                <th className="text-left px-6 py-3">Study</th>
                <th className="text-left px-6 py-3">Phase</th>
                <th className="text-left px-6 py-3">Status</th>
                <th className="text-left px-6 py-3">Steps</th>
                <th className="text-left px-6 py-3">Date</th>
                <th className="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {(runs as any[]).map((run) => {
                const study = studyMap[run.study_id] ?? null;
                const phase = PHASE_LABELS[run.phase] ?? { label: run.phase, color: "var(--text-muted)" };
                const stepLog = (run.step_log ?? []) as { status: string }[];
                const completeSteps = stepLog.filter((s) => s.status === "complete").length;
                const totalSteps = stepLog.length;

                // Determine report link
                let reportHref: string | null = null;
                if (run.status === "complete" && run.study_id) {
                  if (run.phase === "preclinical" && phase1ReportRunIds.has(run.id)) {
                    reportHref = `/studies/${run.study_id}/phase1/report`;
                  } else if (run.phase === "clinical") {
                    reportHref = `/studies/${run.study_id}/phase2/report`;
                  }
                }

                const processingHref = run.study_id
                  ? run.phase === "preclinical"
                    ? `/studies/${run.study_id}/phase1/processing`
                    : `/studies/${run.study_id}/phase2/processing`
                  : null;

                return (
                  <tr
                    key={run.id}
                    className="border-b border-border-subtle last:border-0 hover:bg-nav-item-active-bg/12 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <p className="text-text-heading font-medium text-sm">
                        {study?.drug_name ?? "—"} · {study?.indication ?? ""}
                      </p>
                      <p className="text-text-muted text-xs mt-0.5">{study?.sponsor ?? ""}</p>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-xs font-semibold" style={{ color: phase.color }}>
                        {phase.label}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-0.5 rounded-full text-xs border capitalize ${STATUS_STYLES[run.status] ?? ""}`}>
                        {run.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-text-muted text-xs font-mono">
                      {totalSteps > 0 ? `${completeSteps}/${totalSteps}` : "—"}
                    </td>
                    <td className="px-6 py-4 text-text-muted text-xs">
                      {new Date(run.created_at).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {reportHref ? (
                        <Link href={reportHref} className="text-brand-core hover:underline text-xs">
                          View report →
                        </Link>
                      ) : processingHref && (run.status === "processing" || run.status === "queued") ? (
                        <Link href={processingHref} className="text-status-warning hover:underline text-xs">
                          View progress →
                        </Link>
                      ) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
