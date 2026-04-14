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
        <h1 className="text-2xl font-bold text-text-heading mb-1">Corpus</h1>
        <p className="text-text-muted text-sm">
          Clinical literature, trial documents, and batch-ingested papers — chunked, embedded, and indexed for phenotype-driven retrieval.
        </p>
      </div>

      {/* Upload + stats */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <CorpusUploader onUploadComplete={handleUploadComplete} onUploadStart={() => setUploading(true)} />

        <div className="space-y-4">
          <h3 className="text-text-heading font-semibold">Corpus Stats</h3>
          <CorpusStats refreshTrigger={refreshTrigger} polling={uploading} />
          <div className="bg-bg-surface border border-border-subtle rounded-xl p-5 text-sm text-text-muted space-y-3">
            <div className="space-y-1">
              <p className="text-text-heading font-medium text-sm">Ingestion</p>
              <p>PDF acquisition (4-tier waterfall: Unpaywall → PubMed Central → publisher OA → OpenAlex hosted) → text extraction → 512-token chunks (64-token overlap) → Lumos AI semantic embeddings (1024-dim) → pgvector</p>
            </div>
            <div className="space-y-1">
              <p className="text-text-heading font-medium text-sm">Retrieval (RRCS)</p>
              <p>Multi-aspect vector search (600 raw → 100 deduped) → cross-attention reranking (→ top 50) → parallel evidence compression → Lumos AI synthesis</p>
            </div>
          </div>
        </div>
      </div>

      {/* Persistent document list — survives navigation */}
      <div>
        <h3 className="text-text-heading font-semibold mb-4">All Documents</h3>
        <CorpusDocList refreshTrigger={refreshTrigger} />
      </div>
    </div>
  );
}
