"use client";

import { useState } from "react";
import CorpusUploader from "@/components/CorpusUploader";
import CorpusStats from "@/components/CorpusStats";
import CorpusDocList from "@/components/CorpusDocList";

export default function CorpusPage() {
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [uploading, setUploading] = useState(false);

  const handleUploadComplete = () => { setUploading(false); setRefreshTrigger(t => t + 1); };

  return (
    <div className="max-w-7xl mx-auto px-6 py-12 w-full space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-[#F0F4FF] mb-1">Corpus</h1>
        <p className="text-[#8BA3C7] text-sm">
          Upload clinical literature and trial documents. Each document is chunked and embedded into the vector store for patient phenotyping.
        </p>
      </div>

      {/* Upload + stats */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <CorpusUploader onUploadComplete={handleUploadComplete} onUploadStart={() => setUploading(true)} />

        <div className="space-y-4">
          <h3 className="text-[#F0F4FF] font-semibold">Corpus Stats</h3>
          <CorpusStats refreshTrigger={refreshTrigger} polling={uploading} />
          <div className="bg-[#0F1F3D] border border-[#1E3A5F] rounded-xl p-5 text-sm text-[#8BA3C7] space-y-1">
            <p className="text-[#F0F4FF] font-medium text-sm">Pipeline</p>
            <p>PDF / DOCX / CSV → text extraction → 512-token chunks (64-token overlap) → OpenAI text-embedding-3-small → pgvector</p>
            <p className="text-xs">~$0.001 per 50-page document</p>
          </div>
        </div>
      </div>

      {/* Persistent document list — survives navigation */}
      <div>
        <h3 className="text-[#F0F4FF] font-semibold mb-4">All Documents</h3>
        <CorpusDocList refreshTrigger={refreshTrigger} />
      </div>
    </div>
  );
}
