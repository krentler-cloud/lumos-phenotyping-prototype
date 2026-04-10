/**
 * Re-embed all corpus chunks using Voyage AI voyage-3.
 * Run after migration 010_voyage_embeddings.sql sets embeddings to NULL.
 *
 * Usage: npx ts-node --project tsconfig.scripts.json scripts/reembed-corpus.ts
 *
 * Idempotent — only processes chunks where embedding IS NULL.
 * Safe to interrupt and re-run.
 */

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const VOYAGE_API_URL = 'https://api.voyageai.com/v1/embeddings'
const VOYAGE_API_KEY = process.env.VOYAGE_API_KEY!

const EMBED_BATCH = 128
const UPDATE_BATCH = 50

async function embedTexts(texts: string[]): Promise<number[][]> {
  const embeddings: number[][] = []
  for (let i = 0; i < texts.length; i += EMBED_BATCH) {
    const batch = texts.slice(i, i + EMBED_BATCH)
    const res = await fetch(VOYAGE_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${VOYAGE_API_KEY}` },
      body: JSON.stringify({ input: batch, model: 'voyage-3' }),
    })
    if (!res.ok) throw new Error(`Voyage embed failed: ${res.status} ${await res.text()}`)
    const json = await res.json() as { data: { embedding: number[]; index: number }[] }
    embeddings.push(...json.data.sort((a, b) => a.index - b.index).map(d => d.embedding))
  }
  return embeddings
}

async function main() {
  // Count total chunks needing embeddings
  const { count } = await supabase
    .from('corpus_chunks')
    .select('id', { count: 'exact', head: true })
    .is('embedding', null)

  console.log(`[reembed] ${count ?? 0} chunks need embedding`)
  if (!count || count === 0) {
    console.log('[reembed] Nothing to do.')
    return
  }

  let processed = 0

  // Process in pages to avoid loading everything into memory
  while (processed < count) {
    const { data: chunks, error } = await supabase
      .from('corpus_chunks')
      .select('id, content')
      .is('embedding', null)
      .order('id')
      .limit(EMBED_BATCH)

    if (error) {
      console.error('[reembed] Query error:', error.message)
      break
    }
    if (!chunks || chunks.length === 0) break

    const texts = chunks.map(c => c.content)
    const embeddings = await embedTexts(texts)

    // Batch update embeddings
    for (let i = 0; i < chunks.length; i += UPDATE_BATCH) {
      const batchEnd = Math.min(i + UPDATE_BATCH, chunks.length)
      const updates = []
      for (let j = i; j < batchEnd; j++) {
        updates.push(
          supabase
            .from('corpus_chunks')
            .update({ embedding: JSON.stringify(embeddings[j]) })
            .eq('id', chunks[j].id)
        )
      }
      await Promise.all(updates)
    }

    processed += chunks.length
    console.log(`[reembed] ${processed}/${count} chunks embedded`)
  }

  console.log(`[reembed] Done. ${processed} chunks re-embedded with voyage-3.`)
}

main().catch(err => {
  console.error('[reembed] Fatal:', err)
  process.exit(1)
})
