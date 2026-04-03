export const dynamic = "force-dynamic";

import { createServiceClient } from "@/lib/supabase/server";
import Link from "next/link";

const statusColors: Record<string, string> = {
  complete: "text-[#22C55E] bg-[#22C55E20] border-[#22C55E]",
  processing: "text-[#4F8EF7] bg-[#4F8EF720] border-[#4F8EF7]",
  queued: "text-[#F59E0B] bg-[#F59E0B20] border-[#F59E0B]",
  error: "text-[#EF4444] bg-[#EF444420] border-[#EF4444]",
};

export default async function AdminPage() {
  const supabase = createServiceClient();

  const [
    { data: docs },
    { data: chunks },
    { data: allRuns },
    { data: patients },
  ] = await Promise.all([
    supabase.from("corpus_docs").select("id, title, source_type, chunk_count, status, created_at").order("created_at", { ascending: false }),
    supabase.from("corpus_chunks").select("id", { count: "exact", head: true }),
    supabase.from("runs").select("id, status, created_at, study_id, error_message, patients(patient_code)").order("created_at", { ascending: false }).limit(50),
    supabase.from("patients").select("id", { count: "exact", head: true }),
  ]);

  const totalChunks = (chunks as unknown as { count: number } | null)?.count ?? 0;
  const totalPatients = (patients as unknown as { count: number } | null)?.count ?? 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const runs = (allRuns as any[]) ?? []
  const goodRuns = runs.filter((r: { status: string }) => r.status !== "error")
  const failedRuns = runs.filter((r: { status: string }) => r.status === "error")

  // Only count good docs in stats
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const readyDocs = (docs as any[] ?? []).filter((d: { status: string }) => d.status === "ready")
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const errorDocs = (docs as any[] ?? []).filter((d: { status: string }) => d.status === "error")

  const runCounts = goodRuns.reduce((acc: Record<string, number>, r: { status: string }) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="max-w-7xl mx-auto px-6 py-12 w-full space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-[#F0F4FF] mb-1">Admin</h1>
        <p className="text-[#8BA3C7] text-sm">System health and corpus overview</p>
      </div>

      {/* Stats — only good data */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Corpus Docs", value: readyDocs.length, icon: "📄" },
          { label: "Embeddings", value: totalChunks.toLocaleString(), icon: "🧩" },
          { label: "Patients", value: totalPatients, icon: "👤" },
          { label: "Completed Runs", value: goodRuns.filter((r: { status: string }) => r.status === "complete").length, icon: "▶" },
        ].map(s => (
          <div key={s.label} className="bg-[#0F1F3D] border border-[#1E3A5F] rounded-xl p-5">
            <div className="text-xl mb-2">{s.icon}</div>
            <div className="text-2xl font-bold text-[#F0F4FF]">{s.value}</div>
            <div className="text-[#8BA3C7] text-sm">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Run status breakdown */}
      <div className="bg-[#0F1F3D] border border-[#1E3A5F] rounded-xl p-6">
        <h2 className="text-[#F0F4FF] font-semibold mb-4">Run Status</h2>
        <div className="flex gap-3 flex-wrap">
          {Object.entries(runCounts).map(([status, count]) => (
            <span key={status} className={`px-3 py-1 rounded-full text-sm border capitalize ${statusColors[status] ?? ""}`}>
              {status}: {count as number}
            </span>
          ))}
          {failedRuns.length > 0 && (
            <span className="px-3 py-1 rounded-full text-sm border text-[#EF4444] bg-[#EF444420] border-[#EF4444]">
              error: {failedRuns.length}
            </span>
          )}
          {runs.length === 0 && <span className="text-[#8BA3C7] text-sm">No runs yet</span>}
        </div>
      </div>

      {/* Corpus docs — ready only */}
      <div className="bg-[#0F1F3D] border border-[#1E3A5F] rounded-xl p-6">
        <h2 className="text-[#F0F4FF] font-semibold mb-4">Corpus Documents</h2>
        {!readyDocs.length ? (
          <p className="text-[#8BA3C7] text-sm">No documents ingested yet. <Link href="/corpus" className="text-[#4F8EF7] hover:underline">Go to Corpus →</Link></p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#1E3A5F] text-[#8BA3C7] text-xs uppercase">
                  <th className="text-left py-2 pr-4">Title</th>
                  <th className="text-left py-2 pr-4">Type</th>
                  <th className="text-left py-2 pr-4">Chunks</th>
                  <th className="text-left py-2">Ingested</th>
                </tr>
              </thead>
              <tbody>
                {readyDocs.map((doc: { id: string; title: string; source_type: string; chunk_count: number; created_at: string }) => (
                  <tr key={doc.id} className="border-b border-[#1E3A5F] last:border-0">
                    <td className="py-3 pr-4 text-[#F0F4FF]">{doc.title}</td>
                    <td className="py-3 pr-4 text-[#8BA3C7] capitalize">{doc.source_type.replace("_", " ")}</td>
                    <td className="py-3 pr-4 text-[#4F8EF7] font-mono">{doc.chunk_count ?? "—"}</td>
                    <td className="py-3 text-[#8BA3C7] text-xs">{new Date(doc.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent good runs */}
      <div className="bg-[#0F1F3D] border border-[#1E3A5F] rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[#F0F4FF] font-semibold">Recent Runs</h2>
          <Link href="/runs" className="text-[#4F8EF7] text-sm hover:underline">View all →</Link>
        </div>
        {!goodRuns.length ? (
          <p className="text-[#8BA3C7] text-sm">No runs yet.</p>
        ) : (
          <div className="space-y-2">
            {goodRuns.map((run: { id: string; status: string; created_at: string; study_id: string; patients: { patient_code: string } }) => (
              <div key={run.id} className="flex items-center justify-between text-sm py-2 border-b border-[#1E3A5F] last:border-0">
                <div className="flex items-center gap-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs border capitalize ${statusColors[run.status] ?? ""}`}>{run.status}</span>
                  <span className="text-[#8BA3C7] font-mono text-xs">{run.patients?.patient_code ?? run.id.slice(0, 8)}</span>
                  <span className="text-[#8BA3C7] text-xs">{run.study_id}</span>
                </div>
                <div className="flex items-center gap-4">
                  {run.status === "complete" && (
                    <Link href={`/runs/${run.id}/report`} className="text-[#4F8EF7] text-xs hover:underline">View report →</Link>
                  )}
                  <span className="text-[#8BA3C7] text-xs">{new Date(run.created_at).toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Failed runs — collapsed */}
      {(failedRuns.length > 0 || errorDocs.length > 0) && (
        <details className="group bg-[#0F1F3D] border border-[#EF444440] rounded-xl">
          <summary className="flex items-center justify-between px-6 py-4 cursor-pointer list-none">
            <div className="flex items-center gap-3">
              <span className="text-[#EF4444] text-sm font-medium">
                Failed items ({failedRuns.length + errorDocs.length})
              </span>
              <span className="text-[#8BA3C7] text-xs">runs + corpus errors</span>
            </div>
            <span className="text-[#8BA3C7] text-xs group-open:rotate-180 transition-transform">▼</span>
          </summary>

          <div className="px-6 pb-6 space-y-4 border-t border-[#EF444430] pt-4">
            {failedRuns.length > 0 && (
              <div>
                <p className="text-[#8BA3C7] text-xs uppercase mb-2">Failed Runs</p>
                <div className="space-y-2">
                  {failedRuns.map((run: { id: string; created_at: string; study_id: string; error_message: string; patients: { patient_code: string } }) => (
                    <div key={run.id} className="flex items-start justify-between text-xs py-2 border-b border-[#1E3A5F] last:border-0">
                      <div className="space-y-0.5">
                        <span className="text-[#8BA3C7] font-mono">{run.patients?.patient_code ?? run.id.slice(0, 8)}</span>
                        {run.error_message && (
                          <p className="text-[#EF4444] max-w-lg truncate">{run.error_message}</p>
                        )}
                      </div>
                      <span className="text-[#8BA3C7] flex-shrink-0 ml-4">{new Date(run.created_at).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {errorDocs.length > 0 && (
              <div>
                <p className="text-[#8BA3C7] text-xs uppercase mb-2">Failed Corpus Ingestions</p>
                <div className="space-y-2">
                  {errorDocs.map((doc: { id: string; title: string; created_at: string }) => (
                    <div key={doc.id} className="flex items-center justify-between text-xs py-2 border-b border-[#1E3A5F] last:border-0">
                      <span className="text-[#8BA3C7]">{doc.title}</span>
                      <span className="text-[#8BA3C7] flex-shrink-0 ml-4">{new Date(doc.created_at).toLocaleDateString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </details>
      )}
    </div>
  );
}
