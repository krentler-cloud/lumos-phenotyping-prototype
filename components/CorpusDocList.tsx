"use client";

import { useEffect, useState } from "react";

interface CorpusDoc {
  id: string;
  title: string;
  source_type: string;
  chunk_count: number | null;
  status: string;
  created_at: string;
  filename: string | null;
  metadata: { error?: string } | null;
}

const STATUS_STYLES: Record<string, string> = {
  ready:      "text-[#22C55E] bg-[#22C55E20] border-[#22C55E]",
  processing: "text-[#4F8EF7] bg-[#4F8EF720] border-[#4F8EF7]",
  pending:    "text-[#F59E0B] bg-[#F59E0B20] border-[#F59E0B]",
  error:      "text-[#EF4444] bg-[#EF444420] border-[#EF4444]",
};

const SOURCE_LABELS: Record<string, string> = {
  literature:     "Literature",
  clinical_trial: "Clinical Trial",
  internal:       "Internal",
  regulatory:     "Regulatory",
};

const SOURCE_OPTIONS = [
  { value: "literature",     label: "Literature" },
  { value: "clinical_trial", label: "Clinical Trial" },
  { value: "internal",       label: "Internal" },
  { value: "regulatory",     label: "Regulatory" },
];

function SourceTypeSelect({ doc, onUpdated }: { doc: CorpusDoc; onUpdated: () => void }) {
  const [saving, setSaving] = useState(false);

  const handleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newType = e.target.value;
    if (newType === doc.source_type) return;
    setSaving(true);
    try {
      await fetch(`/api/corpus/docs/${doc.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source_type: newType }),
      });
      onUpdated();
    } finally {
      setSaving(false);
    }
  };

  return (
    <select
      value={doc.source_type}
      onChange={handleChange}
      disabled={saving}
      className="bg-[#0A1628] border border-[#1E3A5F] text-[#8BA3C7] text-xs rounded px-2 py-1 cursor-pointer hover:border-[#4F8EF7] transition-colors disabled:opacity-50"
    >
      {SOURCE_OPTIONS.map(o => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

export default function CorpusDocList({ refreshTrigger }: { refreshTrigger?: number }) {
  const [docs, setDocs] = useState<CorpusDoc[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDocs = async () => {
    const res = await fetch("/api/corpus/docs");
    if (res.ok) setDocs(await res.json());
    setLoading(false);
  };

  useEffect(() => {
    fetchDocs();
  }, [refreshTrigger]);

  // Poll every 3s while any doc is still processing
  useEffect(() => {
    const hasProcessing = docs.some(d => d.status === "processing" || d.status === "pending");
    if (!hasProcessing) return;
    const interval = setInterval(fetchDocs, 3000);
    return () => clearInterval(interval);
  }, [docs]);

  if (loading) {
    return (
      <div className="space-y-2">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-10 bg-[#0F1F3D] border border-[#1E3A5F] rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (docs.length === 0) {
    return (
      <p className="text-[#8BA3C7] text-sm py-4">
        No documents ingested yet. Upload one to get started.
      </p>
    );
  }

  const ready = docs.filter(d => d.status === "ready");
  const processing = docs.filter(d => d.status === "processing" || d.status === "pending");
  const errors = docs.filter(d => d.status === "error");

  return (
    <div className="space-y-3">
      {/* In-progress banner */}
      {processing.length > 0 && (
        <div className="flex items-center gap-2 bg-[#4F8EF720] border border-[#4F8EF7] rounded-lg px-4 py-2.5 text-sm text-[#4F8EF7]">
          <span className="animate-spin inline-block">⟳</span>
          {processing.length} document{processing.length > 1 ? "s" : ""} still processing…
        </div>
      )}

      {/* Document table */}
      <div className="bg-[#0F1F3D] border border-[#1E3A5F] rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#1E3A5F]">
          <span className="text-[#F0F4FF] font-medium text-sm">
            {ready.length} document{ready.length !== 1 ? "s" : ""} ready
          </span>
          {errors.length > 0 && (
            <span className="text-[#EF4444] text-xs">{errors.length} failed</span>
          )}
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#1E3A5F] text-[#8BA3C7] text-xs uppercase">
              <th className="text-left px-5 py-2.5">Title</th>
              <th className="text-left px-5 py-2.5 hidden md:table-cell">Type</th>
              <th className="text-left px-5 py-2.5">Status</th>
              <th className="text-left px-5 py-2.5 hidden md:table-cell">Chunks</th>
              <th className="text-left px-5 py-2.5 hidden lg:table-cell">Date</th>
            </tr>
          </thead>
          <tbody>
            {docs.map(doc => (
              <tr key={doc.id} className="border-b border-[#1E3A5F] last:border-0 hover:bg-[#1E3A5F20]">
                <td className="px-5 py-3">
                  <span className="text-[#F0F4FF]">{doc.title}</span>
                  {doc.filename && doc.filename !== doc.title && (
                    <span className="block text-[#8BA3C7] text-xs truncate max-w-xs">{doc.filename}</span>
                  )}
                  {doc.status === "error" && doc.metadata?.error && (
                    <span className="block text-[#EF4444] text-xs mt-0.5 max-w-xs">{doc.metadata.error}</span>
                  )}
                </td>
                <td className="px-5 py-3 hidden md:table-cell">
                  <SourceTypeSelect doc={doc} onUpdated={fetchDocs} />
                </td>
                <td className="px-5 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs border ${STATUS_STYLES[doc.status] ?? ""}`}>
                    {doc.status === "processing" ? (
                      <span className="flex items-center gap-1">
                        <span className="animate-spin inline-block text-xs">⟳</span> processing
                      </span>
                    ) : doc.status}
                  </span>
                </td>
                <td className="px-5 py-3 text-[#4F8EF7] font-mono text-xs hidden md:table-cell">
                  {doc.status === "ready" ? (doc.chunk_count ?? "—") : "—"}
                </td>
                <td className="px-5 py-3 text-[#8BA3C7] text-xs hidden lg:table-cell">
                  {new Date(doc.created_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
