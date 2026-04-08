/**
 * Haiku-powered document title generation.
 *
 * Used in two places:
 *   - /api/corpus/suggest-title  (single-file: filename → suggested title, shown before upload)
 *   - /api/corpus/ingest         (folder mode: extracted text → stored title, no user review)
 */

import Anthropic from '@anthropic-ai/sdk'

function getClient() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
}

/**
 * Generate a clean academic title from a filename.
 * Used client-side suggestion for single-file uploads (no file content available yet).
 * Fast: ~0.5s, costs ~$0.00005.
 */
export async function titleFromFilename(filename: string): Promise<string> {
  const client = getClient()
  // Strip extension and common suffixes
  const bare = filename
    .replace(/\.(pdf|docx|csv)$/i, '')
    .replace(/\s*\(\d+\)\s*$/, '')   // trailing " (1)", " (2)" etc.
    .replace(/[-_]/g, ' ')
    .trim()

  const msg = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 60,
    messages: [{
      role: 'user',
      content: `Convert this document filename into a clean, professional academic title (max 10 words, title case, no quotes, no punctuation at end):\n\n${bare}\n\nTitle:`,
    }],
  })

  const raw = msg.content
    .filter(b => b.type === 'text')
    .map(b => (b as { type: 'text'; text: string }).text)
    .join('')
    .trim()

  // Strip any leading/trailing quotes or punctuation Haiku might add
  return raw.replace(/^["']|["']$/g, '').replace(/\.$/, '').trim() || bare
}

/**
 * Generate a clean academic title from extracted document text.
 * Used server-side during folder ingest (content is already parsed).
 * More accurate than filename-based generation.
 * Fast: ~0.8s, costs ~$0.0001.
 */
export async function titleFromText(textExcerpt: string, fallbackFilename: string): Promise<string> {
  const client = getClient()
  const excerpt = textExcerpt.slice(0, 800).trim()

  if (!excerpt) return titleFromFilename(fallbackFilename)

  const msg = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 60,
    messages: [{
      role: 'user',
      content: `You are a librarian cataloguing scientific documents. Read this opening excerpt and generate a clean, professional title (max 10 words, title case, no quotes, no punctuation at end). Return only the title — no explanation.\n\nExcerpt:\n${excerpt}\n\nTitle:`,
    }],
  })

  const raw = msg.content
    .filter(b => b.type === 'text')
    .map(b => (b as { type: 'text'; text: string }).text)
    .join('')
    .trim()

  return raw.replace(/^["']|["']$/g, '').replace(/\.$/, '').trim() || fallbackFilename.replace(/\.(pdf|docx|csv)$/i, '')
}
