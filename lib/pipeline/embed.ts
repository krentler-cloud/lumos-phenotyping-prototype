const VOYAGE_API_URL = 'https://api.voyageai.com/v1/embeddings'
const BATCH_SIZE = 128
const MODEL = 'voyage-3'

interface VoyageEmbedResponse {
  data: { embedding: number[]; index: number }[]
  usage: { total_tokens: number }
}

/**
 * Embed an array of strings using Voyage AI voyage-3.
 * Batches in groups of 128 to stay within API limits.
 * Returns an array of 1024-dimensional embedding vectors.
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  const apiKey = process.env.VOYAGE_API_KEY
  if (!apiKey) throw new Error('VOYAGE_API_KEY is not set')

  const embeddings: number[][] = []

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE)
    const res = await fetch(VOYAGE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ input: batch, model: MODEL }),
    })

    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Voyage AI embed failed (${res.status}): ${body.slice(0, 300)}`)
    }

    const json: VoyageEmbedResponse = await res.json()
    const sorted = json.data
      .sort((a, b) => a.index - b.index)
      .map(item => item.embedding)

    embeddings.push(...sorted)
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
