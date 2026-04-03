export const dynamic = "force-dynamic";

import { createServiceClient } from "@/lib/supabase/server";
import Link from "next/link";

const statusColors: Record<string, string> = {
  complete: "text-[#22C55E] bg-[#22C55E20] border-[#22C55E]",
  processing: "text-[#4F8EF7] bg-[#4F8EF720] border-[#4F8EF7]",
  queued: "text-[#F59E0B] bg-[#F59E0B20] border-[#F59E0B]",
  error: "text-[#EF4444] bg-[#EF444420] border-[#EF4444]",
};

const phenotypeColors: Record<string, string> = {
  "High Responder": "text-[#22C55E]",
  "Moderate Responder": "text-[#F59E0B]",
  "Non-Responder": "text-[#EF4444]",
};

export default async function RunsPage() {
  const supabase = createServiceClient();

  const { data: runs } = await supabase
    .from("runs")
    .select("id, created_at, status, study_id, phase, patients(patient_code), reports(phenotype_label, responder_prob, confidence)")
    .order("created_at", { ascending: false });

  return (
    <div className="max-w-7xl mx-auto px-6 py-12 w-full">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-[#F0F4FF] mb-1">All Runs</h1>
          <p className="text-[#8BA3C7] text-sm">{runs?.length ?? 0} total runs</p>
        </div>
        <Link
          href="/runs/new"
          className="bg-[#4F8EF7] hover:bg-[#3A7AE4] text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          + New Run
        </Link>
      </div>

      {!runs?.length ? (
        <div className="bg-[#0F1F3D] border border-[#1E3A5F] rounded-xl p-12 text-center">
          <p className="text-[#8BA3C7]">No runs yet.</p>
          <Link href="/runs/new" className="text-[#4F8EF7] text-sm mt-2 inline-block hover:underline">
            Start your first run →
          </Link>
        </div>
      ) : (
        <div className="bg-[#0F1F3D] border border-[#1E3A5F] rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#1E3A5F] text-[#8BA3C7] text-xs uppercase">
                <th className="text-left px-6 py-3">Patient</th>
                <th className="text-left px-6 py-3">Study</th>
                <th className="text-left px-6 py-3">Phase</th>
                <th className="text-left px-6 py-3">Status</th>
                <th className="text-left px-6 py-3">Phenotype</th>
                <th className="text-left px-6 py-3">Date</th>
                <th className="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {(runs as any[]).map((run) => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const report = (run.reports as any)?.[0];
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const patient = run.patients as any;
                return (
                  <tr key={run.id} className="border-b border-[#1E3A5F] last:border-0 hover:bg-[#1E3A5F20] transition-colors">
                    <td className="px-6 py-4 text-[#F0F4FF] font-mono text-xs">{patient?.patient_code ?? "—"}</td>
                    <td className="px-6 py-4 text-[#8BA3C7]">{run.study_id ?? "—"}</td>
                    <td className="px-6 py-4 text-[#8BA3C7] capitalize">{run.phase}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-0.5 rounded-full text-xs border capitalize ${statusColors[run.status] ?? ""}`}>
                        {run.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {report?.phenotype_label ? (
                        <span className={`font-medium ${phenotypeColors[report.phenotype_label] ?? "text-[#8BA3C7]"}`}>
                          {report.phenotype_label}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-6 py-4 text-[#8BA3C7] text-xs">
                      {new Date(run.created_at).toLocaleString()}
                    </td>
                    <td className="px-6 py-4">
                      {run.status === "complete" ? (
                        <Link
                          href={`/runs/${run.id}/report`}
                          className="text-[#4F8EF7] hover:underline text-xs"
                        >
                          View report →
                        </Link>
                      ) : run.status === "processing" || run.status === "queued" ? (
                        <Link href={`/runs/${run.id}`} className="text-[#F59E0B] hover:underline text-xs">
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
