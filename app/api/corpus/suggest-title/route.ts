import { NextRequest, NextResponse } from 'next/server'
import { titleFromFilename } from '@/lib/pipeline/titler'

/**
 * POST /api/corpus/suggest-title
 * Body: { filename: string }
 * Returns: { title: string }
 *
 * Called client-side after a file is dropped in single-file mode.
 * Uses Haiku to generate a clean academic title from the filename.
 * Fast (~0.5s) — shown to the user before they click Ingest.
 */
export async function POST(req: NextRequest) {
  try {
    const { filename } = await req.json()
    if (!filename || typeof filename !== 'string') {
      return NextResponse.json({ error: 'filename required' }, { status: 400 })
    }

    const title = await titleFromFilename(filename)
    return NextResponse.json({ title })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[suggest-title]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
