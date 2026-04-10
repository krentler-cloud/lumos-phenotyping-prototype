import { VoyageAIClient } from 'voyageai'

function getClient() {
  return new VoyageAIClient({ apiKey: process.env.VOYAGE_API_KEY })
}

const BATCH_SIZE = 128
const MODEL = 'voyage-multimodal-3'

/**
 * Embed an array of strings using Voyage AI voyage-multimodal-3.
 * Batches in groups of 128 to stay within API limits.
 * Returns an array of 1024-dimensional embedding vectors.
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  const embeddings: number[][] = []

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE)
    const response = await getClient().embed({
      input: batch,
      model: MODEL,
    })
    // Results come back in order; sort by index as a safety measure
    const items = (response.data ?? [])
      .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
      .map(item => item.embedding!)

    embeddings.push(...items)
  }

  return embeddings
}

/**
 * Embed a single string. Convenience wrapper.
 */
export async function embedText(text: string): Promise<number[]> {
  const results = await embedTexts([text])
  return results[0]
}
