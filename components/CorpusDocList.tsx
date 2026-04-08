"use client";

import { useEffect, useState, useRef } from "react";

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

const SOURCE_OPTIONS = [
  { value: "literature",     label: "Literature" },
  { value: "clinical_trial", label: "Clinical Trial" },
  { value: "internal",       label: "Internal" },
  { value: "regulatory",     label: "Regulatory" },
];

// ── Inline source-type reclassifier ──────────────────────────────────────────
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

// ── Inline title editor ───────────────────────────────────────────────────────
function InlineTitle({ doc, onUpdated }: { doc: CorpusDoc; onUpdated: () => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(doc.title);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const save = async () => {
    const trimmed = value.trim();
    if (!trimmed || trimmed === doc.title) { setEditing(false); setValue(doc.title); return; }
    setSaving(true);
    try {
      await fetch(`/api/corpus/docs/${doc.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: trimmed }),
      });
      onUpdated();
    } finally {
      setSaving(false);
      setEditing(false);
    }
  };

  const cancel = () => { setEditing(false); setValue(doc.title); };

  if (editing) {
    return (
      <div className="flex items-center gap-1.5 min-w-0">
        <input
          ref={inputRef}
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") save(); if (e.key === "Escape") cancel(); }}
          disabled={saving}
          className="flex-1 min-w-0 bg-bg-page border border-brand-core rounded px-2 py-1 text-text-heading text-sm focus:outline-none"
        />
        <button
          onClick={save}
          disabled={saving}
          title="Save"
          className="text-status-success hover:opacity-75 flex-shrink-0 text-base leading-none disabled:opacity-40"
        >✓</button>
        <button
          onClick={cancel}
          title="Cancel"
          className="text-text-muted hover:text-text-heading flex-shrink-0 text-sm leading-none"
        >✕</button>
      </div>
    );
  }

  return (
    <div className="group flex items-start gap-1.5 min-w-0">
      <div className="min-w-0">
        <span className="text-text-heading block truncate max-w-xs">{doc.title}</span>
        {doc.filename && doc.filename !== doc.title && (
          <span className="block text-text-muted text-xs truncate max-w-xs">{doc.filename}</span>
        )}
        {doc.status === "error" && doc.metadata?.error && (
          <span className="block text-status-danger text-xs mt-0.5 max-w-xs">{doc.metadata.error}</span>
        )}
      </div>
      <button
        onClick={() => setEditing(true)}
        title="Rename"
        className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-text-muted hover:text-brand-core mt-0.5"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
      </button>
    </div>
  );
}

// ── Delete button with inline confirmation ────────────────────────────────────
function DeleteButton({ doc, onDeleted }: { doc: CorpusDoc; onDeleted: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await fetch(`/api/corpus/docs/${doc.id}`, { method: "DELETE" });
      onDeleted();
    } finally {
      setDeleting(false);
      setConfirming(false);
    }
  };

  if (confirming) {
    return (
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <span className="text-[10px] text-status-danger whitespace-nowrap">Delete?</span>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="text-[10px] px-2 py-0.5 rounded bg-status-danger text-white disabled:opacity-50 whitespace-nowrap"
        >
          {deleting ? "…" : "Yes"}
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="text-[10px] text-text-muted hover:text-text-heading"
        >
          No
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      title="Delete document and all chunks"
      className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-text-muted hover:text-status-danger"
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="3 6 5 6 21 6"/>
        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
        <path d="M10 11v6M14 11v6"/>
        <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
      </svg>
    </button>
  );
}

// ── Main list component ───────────────────────────────────────────────────────
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

  const ready      = docs.filter(d => d.status === "ready");
  const processing = docs.filter(d => d.status === "processing" || d.status === "pending");
  const errors     = docs.filter(d => d.status === "error");

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
              <th className="px-5 py-2.5 w-10" />
            </tr>
          </thead>
          <tbody>
            {docs.map(doc => (
              <tr key={doc.id} className="group border-b border-border-subtle last:border-0 hover:bg-nav-item-active-bg/12">
                <td className="px-5 py-3">
                  <InlineTitle doc={doc} onUpdated={fetchDocs} />
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
                <td className="px-3 py-3">
                  <DeleteButton doc={doc} onDeleted={fetchDocs} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
