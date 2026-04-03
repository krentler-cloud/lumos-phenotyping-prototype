import OpenAI from 'openai'

function getClient() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
}

const BATCH_SIZE = 100
const MODEL = 'text-embedding-3-small'

/**
 * Embed an array of strings using OpenAI text-embedding-3-small.
 * Batches in groups of 100 to stay within API limits.
 * Returns an array of 1536-dimensional embedding vectors.
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  const embeddings: number[][] = []

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE)
    const response = await getClient().embeddings.create({
      model: MODEL,
      input: batch,
    })
    // Results come back in order
    const batchEmbeddings = response.data
      .sort((a, b) => a.index - b.index)
      .map(item => item.embedding)

    embeddings.push(...batchEmbeddings)
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
