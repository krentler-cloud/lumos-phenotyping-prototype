/**
 * Paragraph-aware text chunker.
 * Splits on double newlines first, then enforces token limit per chunk.
 * Target: ~512 tokens per chunk, 64-token overlap.
 *
 * Approximation: 1 token ≈ 4 characters (OpenAI rule of thumb).
 */

const TARGET_TOKENS = 512
const OVERLAP_TOKENS = 64

/**
 * Estimate chars-per-token for a text sample.
 * CJK characters (Chinese, Japanese, Korean) tokenize at ~1 char/token.
 * Latin/ASCII text tokenizes at ~4 chars/token.
 * Mixed text gets a weighted estimate.
 */
function charsPerToken(sample: string): number {
  const cjk = (sample.match(/[\u3000-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF]/g) ?? []).length
  const ratio = cjk / Math.max(sample.length, 1)
  // Interpolate: 0% CJK → 4 chars/token, 100% CJK → 1.2 chars/token
  return 4 - ratio * (4 - 1.2)
}

const TARGET_CHARS = (text: string) => Math.round(TARGET_TOKENS * charsPerToken(text))
const OVERLAP_CHARS = (text: string) => Math.round(OVERLAP_TOKENS * charsPerToken(text))

export interface Chunk {
  content: string
  index: number
  tokenEstimate: number
}

export function chunkText(text: string): Chunk[] {
  // Normalise whitespace
  const normalised = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()

  // Compute char targets once from a representative sample
  const sample = normalised.slice(0, 2000)
  const targetChars = TARGET_CHARS(sample)
  const overlapChars = OVERLAP_CHARS(sample)

  // Split into paragraphs
  const paragraphs = normalised.split(/\n\n+/).filter(p => p.trim().length > 0)

  const chunks: Chunk[] = []
  let currentChunk = ''

  for (const para of paragraphs) {
    const paraText = para.trim()

    // If the paragraph itself exceeds the target, hard-split it
    if (paraText.length > targetChars) {
      // Flush current chunk first
      if (currentChunk.trim()) {
        chunks.push(makeChunk(currentChunk.trim(), chunks.length))
        currentChunk = ''
      }
      // Hard-split the long paragraph
      const subChunks = hardSplit(paraText, targetChars, overlapChars)
      for (const sub of subChunks) {
        chunks.push(makeChunk(sub, chunks.length))
      }
      continue
    }

    // Would adding this paragraph exceed the target?
    if ((currentChunk + '\n\n' + paraText).length > targetChars && currentChunk.trim()) {
      chunks.push(makeChunk(currentChunk.trim(), chunks.length))
      // Start next chunk with overlap from tail of previous
      const overlap = currentChunk.slice(-overlapChars)
      currentChunk = overlap + '\n\n' + paraText
    } else {
      currentChunk = currentChunk ? currentChunk + '\n\n' + paraText : paraText
    }
  }

  // Flush remainder
  if (currentChunk.trim()) {
    chunks.push(makeChunk(currentChunk.trim(), chunks.length))
  }

  return chunks
}

function hardSplit(text: string, targetChars: number, overlapChars: number): string[] {
  const result: string[] = []
  let start = 0
  while (start < text.length) {
    const end = start + targetChars
    result.push(text.slice(start, end).trim())
    start = end - overlapChars
  }
  return result.filter(s => s.length > 0)
}

function makeChunk(content: string, index: number): Chunk {
  return {
    content,
    index,
    tokenEstimate: Math.ceil(content.length / charsPerToken(content)),
  }
}
