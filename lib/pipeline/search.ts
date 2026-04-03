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

/**
 * Multi-aspect search: runs one weighted query per aspect, deduplicates by
 * chunk_id (keeping the best similarity score), returns top topK results.
 *
 * @param aspects  Map of aspect label → embedding vector
 * @param topK     Number of unique chunks to return
 */
export async function searchCorpusMultiAspect(
  aspects: Record<string, number[]>,
  topK: number = 35
): Promise<MatchedChunk[]> {
  const perAspectK = Math.ceil(topK * 1.5)

  // Run all aspect searches in parallel
  const results = await Promise.all(
    Object.entries(aspects).map(async ([aspect, vector]) => {
      const chunks = await searchCorpusWeighted(vector, perAspectK)
      return chunks.map(c => ({ ...c, aspect }))
    })
  )

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

  // Sort by best similarity and return top topK
  return Array.from(best.values())
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK)
}
