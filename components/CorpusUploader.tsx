"use client";

import { useState, useCallback } from "react";

const SOURCE_TYPES = [
  { value: "literature", label: "Literature" },
  { value: "clinical_trial", label: "Clinical Trial" },
  { value: "internal", label: "Internal" },
  { value: "regulatory", label: "Regulatory" },
];

const ACCEPTED_EXTENSIONS = [".pdf", ".docx", ".csv"];

function isValidFile(name: string) {
  return ACCEPTED_EXTENSIONS.some(ext => name.toLowerCase().endsWith(ext));
}

interface FileStatus {
  file: File;
  state: "pending" | "uploading" | "done" | "skipped" | "error";
  chunkCount?: number;
  error?: string;
}

export default function CorpusUploader({ onUploadComplete, onUploadStart }: { onUploadComplete?: () => void; onUploadStart?: () => void }) {
  const [mode, setMode] = useState<"file" | "folder">("file");
  const [dragging, setDragging] = useState(false);
  const [sourceType, setSourceType] = useState("literature");
  const [fileStatuses, setFileStatuses] = useState<FileStatus[]>([]);
  const [uploading, setUploading] = useState(false);

  // Single-file title (only used in file mode)
  const [title, setTitle] = useState("");

  const setStatus = (index: number, update: Partial<FileStatus>) => {
    setFileStatuses(prev => prev.map((s, i) => i === index ? { ...s, ...update } : s));
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const items = Array.from(e.dataTransfer.files).filter(f => isValidFile(f.name));
    if (items.length === 0) return;
    setFileStatuses(items.map(f => ({ file: f, state: "pending" })));
    if (items.length === 1 && !title) setTitle(items[0].name.replace(/\.(pdf|docx|csv)$/i, ""));
  }, [title]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).filter(f => isValidFile(f.name));
    if (files.length === 0) return;
    setFileStatuses(files.map(f => ({ file: f, state: "pending" })));
    if (files.length === 1 && !title) setTitle(files[0].name.replace(/\.(pdf|docx|csv)$/i, ""));
  };

  const ingestFile = async (fs: FileStatus, index: number, titleOverride: string): Promise<boolean> => {
    setStatus(index, { state: "uploading" });
    const formData = new FormData();
    formData.append("file", fs.file);
    formData.append("title", titleOverride);
    formData.append("source_type", sourceType);

    try {
      const res = await fetch("/api/corpus/ingest", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      if (data.skipped) {
        setStatus(index, { state: "skipped" });
      } else {
        setStatus(index, { state: "done", chunkCount: data.chunk_count });
      }
      return true;
    } catch (err: unknown) {
      setStatus(index, { state: "error", error: err instanceof Error ? err.message : "Failed" });
      return false;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (fileStatuses.length === 0) return;
    setUploading(true);
    onUploadStart?.();

    if (mode === "file") {
      // Single file — use the typed title
      await ingestFile(fileStatuses[0], 0, title || fileStatuses[0].file.name);
    } else {
      // Folder — ingest sequentially, derive title from filename
      for (let i = 0; i < fileStatuses.length; i++) {
        const t = fileStatuses[i].file.name.replace(/\.(pdf|docx|csv)$/i, "");
        await ingestFile(fileStatuses[i], i, t);
      }
    }

    setUploading(false);
    onUploadComplete?.();
  };

  const reset = () => {
    setFileStatuses([]);
    setTitle("");
  };

  const pending = fileStatuses.filter(s => s.state === "pending").length;
  const done = fileStatuses.filter(s => s.state === "done").length;
  const skipped = fileStatuses.filter(s => s.state === "skipped").length;
  const errors = fileStatuses.filter(s => s.state === "error").length;
  const allDone = fileStatuses.length > 0 && done + skipped + errors === fileStatuses.length;

  return (
    <div className="bg-bg-surface border border-border-subtle rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-text-heading font-semibold">Upload Documents</h3>
        {/* Mode toggle */}
        <div className="flex rounded-lg overflow-hidden border border-border-subtle text-sm">
          {(["file", "folder"] as const).map(m => (
            <button
              key={m}
              type="button"
              onClick={() => { setMode(m); reset(); }}
              className={`px-4 py-1.5 transition-colors capitalize ${
                mode === m
                  ? "bg-brand-core text-white"
                  : "text-text-muted hover:text-text-heading"
              }`}
            >
              {m === "file" ? "Single file" : "Folder"}
            </button>
          ))}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${
            dragging
              ? "border-brand-core bg-nav-item-active-bg"
              : fileStatuses.length > 0
              ? "border-status-success bg-bg-page"
              : "border-border-subtle hover:border-brand-core"
          }`}
          onClick={() => document.getElementById(mode === "folder" ? "folder-input" : "file-input")?.click()}
        >
          <input
            id="file-input"
            type="file"
            accept=".pdf,.docx,.csv"
            className="hidden"
            onChange={handleFileInput}
          />
          <input
            id="folder-input"
            type="file"
            // @ts-expect-error webkitdirectory is non-standard but widely supported
            webkitdirectory=""
            multiple
            className="hidden"
            onChange={handleFileInput}
          />

          {fileStatuses.length > 0 ? (
            <div>
              <div className="text-2xl mb-1">{mode === "folder" ? "📁" : "📄"}</div>
              <p className="text-status-success font-medium text-sm">
                {fileStatuses.length === 1
                  ? fileStatuses[0].file.name
                  : `${fileStatuses.length} files selected`}
              </p>
              {mode === "folder" && (
                <p className="text-text-muted text-xs mt-1">
                  {ACCEPTED_EXTENSIONS.join(", ")} files only
                </p>
              )}
            </div>
          ) : (
            <div>
              <div className="text-3xl mb-2">{mode === "folder" ? "📁" : "⬆"}</div>
              <p className="text-text-muted text-sm">
                {mode === "folder"
                  ? "Click to select a folder — all .pdf, .docx, and .csv files will be ingested"
                  : "Drag & drop a file here, or click to browse (.pdf, .docx, .csv)"}
              </p>
            </div>
          )}
        </div>

        {/* Title (single file only) */}
        {mode === "file" && (
          <div>
            <label className="block text-sm text-text-muted mb-1.5">Document title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Phase II Clinical Trial Protocol"
              required
              className="w-full bg-bg-page border border-border-subtle rounded-lg px-4 py-2.5 text-text-heading text-sm placeholder-text-muted focus:outline-none focus:border-brand-core transition-colors"
            />
          </div>
        )}

        {/* Source type */}
        <div>
          <label className="block text-sm text-text-muted mb-1.5">Document type</label>
          <select
            value={sourceType}
            onChange={(e) => setSourceType(e.target.value)}
            className="w-full bg-bg-page border border-border-subtle rounded-lg px-4 py-2.5 text-text-heading text-sm focus:outline-none focus:border-brand-core transition-colors"
          >
            {SOURCE_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        {/* Per-file progress (folder mode or after submit) */}
        {fileStatuses.length > 0 && (mode === "folder" || uploading || allDone) && (
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {fileStatuses.map((fs, i) => (
              <div key={i} className="flex items-center gap-3 text-xs px-3 py-2 bg-bg-page rounded-lg">
                <span className={`flex-shrink-0 ${
                  fs.state === "done" ? "text-status-success" :
                  fs.state === "skipped" ? "text-text-muted" :
                  fs.state === "error" ? "text-status-danger" :
                  fs.state === "uploading" ? "text-brand-core" :
                  "text-text-muted"
                }`}>
                  {fs.state === "done" ? "✓" :
                   fs.state === "skipped" ? "–" :
                   fs.state === "error" ? "✗" :
                   fs.state === "uploading" ? "⟳" : "○"}
                </span>
                <span className="flex-1 truncate text-text-muted">{fs.file.name}</span>
                {fs.state === "done" && (
                  <span className="text-status-success">{fs.chunkCount} chunks</span>
                )}
                {fs.state === "skipped" && (
                  <span className="text-text-muted">already ingested</span>
                )}
                {fs.state === "error" && (
                  <span className="text-status-danger break-all">{fs.error}</span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Summary when done */}
        {allDone && (
          <div className={`rounded-lg p-4 border ${errors > 0 ? "bg-status-warning/12 border-status-warning" : "bg-status-success/12 border-status-success"}`}>
            <p className={`font-medium text-sm ${errors > 0 ? "text-status-warning" : "text-status-success"}`}>
              {done} ingested{skipped > 0 ? `, ${skipped} already existed` : ""}{errors > 0 ? `, ${errors} failed` : ""}
            </p>
            <button type="button" onClick={reset} className="text-text-muted text-xs mt-1 hover:underline">
              Upload more
            </button>
          </div>
        )}

        {!allDone && (
          <button
            type="submit"
            disabled={fileStatuses.length === 0 || uploading || (mode === "file" && !title)}
            className="w-full bg-brand-core hover:bg-brand-hover disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium py-2.5 rounded-lg text-sm transition-colors"
          >
            {uploading
              ? `Ingesting${mode === "folder" ? ` (${done + skipped}/${fileStatuses.length})` : "…"}`
              : mode === "folder" && fileStatuses.length > 0
              ? `Ingest ${fileStatuses.length} files`
              : "Ingest document"}
          </button>
        )}
      </form>
    </div>
  );
}
