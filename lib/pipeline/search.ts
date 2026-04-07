import { createServiceClient } from '@/lib/supabase/server'

export interface MatchedChunk {
  chunk_id: string
  doc_id: string
  title: string
  source_type: string
  content: string
  similarity: number
  aspect?: string  // which query aspect retrieved this chunk
}

/**
 * Original single-vector cosine search (unchanged — used by existing runs).
 */
export async function searchCorpus(
  queryVector: number[],
  topK: number = 20
): Promise<MatchedChunk[]> {
  const supabase = createServiceClient()

  const { data, error } = await supabase.rpc('match_corpus_chunks', {
    query_embedding: queryVector,
    match_count: topK,
  })

  if (error) throw new Error(`Vector search failed: ${error.message}`)

  return data as MatchedChunk[]
}

/**
 * Source-type-boosted cosine search.
 * Clinical trial docs get 1.20x, regulatory docs get 1.15x.
 */
export async function searchCorpusWeighted(
  queryVector: number[],
  topK: number = 30,
  sourceBoost: Record<string, number> = { clinical_trial: 1.20, regulatory: 1.15 }
): Promise<MatchedChunk[]> {
  const supabase = createServiceClient()

  const { data, error } = await supabase.rpc('match_corpus_chunks_weighted', {
    query_embedding: queryVector,
    match_count: topK,
    source_boost: sourceBoost,
  })

  if (error) throw new Error(`Weighted vector search failed: ${error.message}`)

  return data as MatchedChunk[]
}

export interface MultiAspectSearchStats {
  rawCandidates: number
  afterDedup: number
  afterCap: number
  finalSent: number
  similarityMin: number
  similarityMax: number
  similarityMean: number
  similarityP50: number
  similarityP75: number
}

/**
 * Multi-aspect search: runs one weighted query per aspect, deduplicates by
 * chunk_id (keeping the best similarity score), applies a per-doc chunk cap
 * to prevent large docs from crowding out smaller ones, then returns the
 * top finalK results.
 *
 * @param aspects      Map of aspect label → embedding vector
 * @param finalK       Number of chunks to return to the caller (sent to Claude)
 * @param rawPerAspect Raw candidates to fetch per aspect before dedup + capping
 * @param maxPerDoc    Max chunks any single document may contribute
 */
export async function searchCorpusMultiAspect(
  aspects: Record<string, number[]>,
  finalK: number = 20,
  rawPerAspect: number = 80,
  maxPerDoc: number = 3
): Promise<{ chunks: MatchedChunk[]; stats: MultiAspectSearchStats }> {
  // Run all aspect searches in parallel
  const results = await Promise.all(
    Object.entries(aspects).map(async ([aspect, vector]) => {
      const chunks = await searchCorpusWeighted(vector, rawPerAspect)
      return chunks.map(c => ({ ...c, aspect }))
    })
  )

  const rawCandidates = results.reduce((n, r) => n + r.length, 0)

  // Deduplicate: keep best similarity score per chunk_id
  const best = new Map<string, MatchedChunk>()
  for (const chunks of results) {
    for (const chunk of chunks) {
      const existing = best.get(chunk.chunk_id)
      if (!existing || chunk.similarity > existing.similarity) {
        best.set(chunk.chunk_id, chunk)
      }
    }
  }

  const afterDedup = best.size

  // Sort by similarity descending, then apply per-doc cap
  const sorted = Array.from(best.values()).sort((a, b) => b.similarity - a.similarity)
  const docCounts = new Map<string, number>()
  const capped: MatchedChunk[] = []
  for (const chunk of sorted) {
    const count = docCounts.get(chunk.doc_id) ?? 0
    if (count < maxPerDoc) {
      capped.push(chunk)
      docCounts.set(chunk.doc_id, count + 1)
    }
  }

  const afterCap = capped.length
  const final = capped.slice(0, finalK)

  // Compute similarity stats over the final set
  const sims = final.map(c => c.similarity).sort((a, b) => a - b)
  const mean = sims.length ? sims.reduce((s, v) => s + v, 0) / sims.length : 0
  const p50 = sims.length ? sims[Math.floor(sims.length * 0.5)] : 0
  const p75 = sims.length ? sims[Math.floor(sims.length * 0.75)] : 0

  const stats: MultiAspectSearchStats = {
    rawCandidates,
    afterDedup,
    afterCap,
    finalSent: final.length,
    similarityMin: sims[0] ?? 0,
    similarityMax: sims[sims.length - 1] ?? 0,
    similarityMean: Math.round(mean * 1000) / 1000,
    similarityP50: Math.round(p50 * 1000) / 1000,
    similarityP75: Math.round(p75 * 1000) / 1000,
  }

  return { chunks: final, stats }
}
