export const dynamic = "force-dynamic";

import { createServiceClient } from "@/lib/supabase/server";
import Phase1ProcessingClient from "./Phase1ProcessingClient";
import { PageContextDispatcher } from "@/components/PageContextDispatcher";

export default async function Phase1ProcessingPage({
  params,
}: {
  params: Promise<{ studyId: string }>;
}) {
  const { studyId } = await params;
  const supabase = createServiceClient();

  const { data: docs } = await supabase
    .from("corpus_docs")
    .select("source_type, chunk_count")
    .eq("status", "ready");

  const rows = docs ?? [];
  const totalDocs = rows.length;
  const totalChunks = rows.reduce((sum: number, d: { source_type: string; chunk_count: number | null }) => sum + (d.chunk_count ?? 0), 0);
  const bySourceType: Record<string, number> = {};
  for (const doc of rows) {
    bySourceType[doc.source_type] = (bySourceType[doc.source_type] ?? 0) + 1;
  }

  return (
    <>
      <PageContextDispatcher context={{
        pageId: "phase1/processing",
        pageLabel: "Planning Phase Processing",
        visibleData: {
          "Page": "Planning Phase analysis is running or recently completed",
          "Corpus size": `${totalDocs} documents, ${totalChunks.toLocaleString()} chunks`,
          "Pipeline": "4 phenotype-oriented aspect queries → 600 raw candidates → 100 deduped → 50 reranked by cross-attention → compressed to structured evidence brief → Opus synthesis from ~8K token brief",
          "Steps": "Load study data, Load mechanism context, Aspect embedding, Weighted corpus search, Rerank corpus evidence, Bayesian prior computation, Evidence compression, Phenotype synthesis, Store report, Exploratory biomarker synthesis",
        },
      }} />
      <Phase1ProcessingClient
        studyId={studyId}
        corpusDocCount={totalDocs}
        corpusChunkCount={totalChunks}
        bySourceType={bySourceType}
      />
    </>
  );
}
