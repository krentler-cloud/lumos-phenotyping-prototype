import { createServiceClient } from '@/lib/supabase/server'

// ── Retry helper ──────────────────────────────────────────────────────────────
// Supabase RPC calls return { data, error } — they don't throw. This helper
// retries when the error looks transient (502, 503, 504, or raw HTML from
// Cloudflare/Supabase gateway errors). Truncates error messages so a full
// 502 HTML page doesn't get surfaced to users.

const TRANSIENT_PATTERN = /502|503|504|bad\s*gateway|<!DOCTYPE/i

async function retryRpc<T>(
  label: string,
  fn: () => Promise<{ data: T | null; error: { message: string } | null }>,
  maxAttempts = 4
): Promise<T> {
  let lastMessage = 'unknown error'
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const { data, error } = await fn()
    if (!error) return data as T
    lastMessage = error.message ?? ''
    const isTransient = TRANSIENT_PATTERN.test(lastMessage)
    if (!isTransient || attempt >= maxAttempts) break
    const delay = 1000 * Math.pow(2, attempt - 1) // 1s → 2s → 4s
    await new Promise(r => setTimeout(r, delay))
  }
  // Truncate raw HTML / very long messages
  const summary = lastMessage.startsWith('<')
    ? `Supabase gateway error (502/503) — try again in a few seconds`
    : lastMessage.slice(0, 300)
  throw new Error(`${label} failed: ${summary}`)
}

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
  return retryRpc('Vector search', () =>
    supabase.rpc('match_corpus_chunks', {
      query_embedding: queryVector,
      match_count: topK,
    })
  )
}

/**
 * Cosine search with optional source-type boosting.
 * Source boost removed from defaults — reserved slots (in searchCorpusMultiAspect)
 * now guarantee clinical trial representation. The 1.5x boost was overkill with
 * reserved slots, causing clinical trial docs to monopolize the entire retrieval
 * pool and drowning out the 7,700-paper literature corpus.
 */
export async function searchCorpusWeighted(
  queryVector: number[],
  topK: number = 30,
  sourceBoost: Record<string, number> = {}
): Promise<MatchedChunk[]> {
  const supabase = createServiceClient()
  return retryRpc('Weighted vector search', () =>
    supabase.rpc('match_corpus_chunks_weighted', {
      query_embedding: queryVector,
      match_count: topK,
      source_boost: sourceBoost,
    })
  )
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

  // Reserve slots for high-value source types (clinical trial + regulatory docs).
  // Guarantees IND/trial evidence appears regardless of corpus size.
  const RESERVED_SLOTS = 5
  const RESERVED_TYPES = new Set(['clinical_trial', 'regulatory'])

  const reserved = capped.filter(c => RESERVED_TYPES.has(c.source_type)).slice(0, RESERVED_SLOTS)
  const reservedIds = new Set(reserved.map(c => c.chunk_id))

  // General pool: fill remaining slots. Cap reserved source types so their
  // total (reserved + general) doesn't exceed 15 — the study is hypothetical
  // and the IND docs are synthetic, so literature should dominate.
  const generalTarget = finalK - reserved.length
  const MAX_RESERVED_TYPE_TOTAL = 15
  const maxReservedTypeInGeneral = MAX_RESERVED_TYPE_TOTAL - reserved.length

  const generalTypeCounts = new Map<string, number>()
  const general: MatchedChunk[] = []
  for (const chunk of capped) {
    if (reservedIds.has(chunk.chunk_id)) continue
    if (general.length >= generalTarget) break
    const typeCount = generalTypeCounts.get(chunk.source_type) ?? 0
    // Cap reserved source types (clinical_trial, regulatory) to keep total ≤ 15
    if (RESERVED_TYPES.has(chunk.source_type) && typeCount >= maxReservedTypeInGeneral) continue
    general.push(chunk)
    generalTypeCounts.set(chunk.source_type, typeCount + 1)
  }

  // If we have room left after type caps, backfill with any remaining chunks
  if (general.length < generalTarget) {
    const generalIds = new Set(general.map(c => c.chunk_id))
    for (const chunk of capped) {
      if (general.length >= generalTarget) break
      if (reservedIds.has(chunk.chunk_id) || generalIds.has(chunk.chunk_id)) continue
      general.push(chunk)
    }
  }

  // Merge: reserved first (highest priority), then general by similarity
  const final = [...reserved, ...general]

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

// ── Reranking ──────────────────────────────────────────────────────────────────

export interface RankedChunk extends MatchedChunk {
  rerank_score: number
}

/**
 * Build a composite rerank query from all aspect texts.
 * Gives the reranker full context about what matters in a single pass.
 *
 * NOTE: Drug name is intentionally excluded. The reranker's cross-attention
 * strongly prefers chunks mentioning the drug by name, which biases toward
 * internal IND docs and drops all general literature evidence. The phenotype-
 * oriented aspect texts already capture the scientific relevance signal.
 */
export function buildRerankQuery(
  _drugName: string,
  indication: string,
  aspectTexts: Record<string, string>
): string {
  const composite = `${indication} patient phenotyping: ${Object.values(aspectTexts).join('; ')}`
  return composite.slice(0, 1000) // Voyage rerank query limit
}

const VOYAGE_RERANK_URL = 'https://api.voyageai.com/v1/rerank'

/**
 * Rerank chunks using Voyage AI rerank-2 cross-attention model.
 * Returns chunks sorted by rerank_score descending.
 * Falls back to similarity-sorted chunks if the API fails.
 */
export async function rerankChunks(
  query: string,
  chunks: MatchedChunk[],
  topK: number = 50
): Promise<RankedChunk[]> {
  const apiKey = process.env.VOYAGE_API_KEY
  if (!apiKey) {
    console.warn('[rerank] VOYAGE_API_KEY not set — falling back to similarity sort')
    return chunks.slice(0, topK).map(c => ({ ...c, rerank_score: c.similarity }))
  }

  try {
    const res = await fetch(VOYAGE_RERANK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'rerank-2',
        query,
        documents: chunks.map(c => c.content),
        top_k: Math.min(topK, chunks.length),
      }),
    })

    if (!res.ok) {
      const body = await res.text()
      console.error(`[rerank] Voyage API error (${res.status}): ${body.slice(0, 300)}`)
      console.warn('[rerank] Falling back to similarity sort')
      return chunks.slice(0, topK).map(c => ({ ...c, rerank_score: c.similarity }))
    }

    const json = await res.json() as {
      data: { index: number; relevance_score: number }[]
    }

    const ranked: RankedChunk[] = json.data.map(r => ({
      ...chunks[r.index],
      rerank_score: r.relevance_score,
    }))

    // Already sorted by relevance_score from the API, but ensure descending
    ranked.sort((a, b) => b.rerank_score - a.rerank_score)

    return ranked
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error(`[rerank] Failed: ${msg}`)
    console.warn('[rerank] Falling back to similarity sort')
    return chunks.slice(0, topK).map(c => ({ ...c, rerank_score: c.similarity }))
  }
}
