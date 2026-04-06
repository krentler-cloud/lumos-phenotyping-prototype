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
  ready:      "text-status-success bg-status-success/12 border-status-success",
  processing: "text-brand-core bg-brand-core/12 border-brand-core",
  pending:    "text-status-warning bg-status-warning/12 border-status-warning",
  error:      "text-status-danger bg-status-danger/12 border-status-danger",
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
      className="bg-bg-page border border-border-subtle text-text-muted text-xs rounded px-2 py-1 cursor-pointer hover:border-brand-core transition-colors disabled:opacity-50"
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
          <div key={i} className="h-10 bg-bg-surface border border-border-subtle rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (docs.length === 0) {
    return (
      <p className="text-text-muted text-sm py-4">
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
        <div className="flex items-center gap-2 bg-brand-core/12 border border-brand-core rounded-lg px-4 py-2.5 text-sm text-brand-core">
          <span className="animate-spin inline-block">⟳</span>
          {processing.length} document{processing.length > 1 ? "s" : ""} still processing…
        </div>
      )}

      {/* Document table */}
      <div className="bg-bg-surface border border-border-subtle rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border-subtle">
          <span className="text-text-heading font-medium text-sm">
            {ready.length} document{ready.length !== 1 ? "s" : ""} ready
          </span>
          {errors.length > 0 && (
            <span className="text-status-danger text-xs">{errors.length} failed</span>
          )}
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-subtle text-text-muted text-xs uppercase">
              <th className="text-left px-5 py-2.5">Title</th>
              <th className="text-left px-5 py-2.5 hidden md:table-cell">Type</th>
              <th className="text-left px-5 py-2.5">Status</th>
              <th className="text-left px-5 py-2.5 hidden md:table-cell">Chunks</th>
              <th className="text-left px-5 py-2.5 hidden lg:table-cell">Date</th>
            </tr>
          </thead>
          <tbody>
            {docs.map(doc => (
              <tr key={doc.id} className="border-b border-border-subtle last:border-0 hover:bg-nav-item-active-bg/12">
                <td className="px-5 py-3">
                  <span className="text-text-heading">{doc.title}</span>
                  {doc.filename && doc.filename !== doc.title && (
                    <span className="block text-text-muted text-xs truncate max-w-xs">{doc.filename}</span>
                  )}
                  {doc.status === "error" && doc.metadata?.error && (
                    <span className="block text-status-danger text-xs mt-0.5 max-w-xs">{doc.metadata.error}</span>
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
                <td className="px-5 py-3 text-brand-core font-mono text-xs hidden md:table-cell">
                  {doc.status === "ready" ? (doc.chunk_count ?? "—") : "—"}
                </td>
                <td className="px-5 py-3 text-text-muted text-xs hidden lg:table-cell">
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
