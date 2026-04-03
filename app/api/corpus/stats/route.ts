import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

interface CorpusDocRow {
  source_type: string
  chunk_count: number | null
  status: string
  created_at: string
}

export async function GET() {
  try {
    const supabase = createServiceClient()

    const { data: docs, error } = await supabase
      .from('corpus_docs')
      .select('source_type, chunk_count, status, created_at')
      .eq('status', 'ready')

    if (error) throw new Error(error.message)

    const rows = (docs ?? []) as CorpusDocRow[]
    const totalDocs = rows.length
    const totalChunks = rows.reduce((sum: number, d: CorpusDocRow) => sum + (d.chunk_count ?? 0), 0)

    const bySourceType: Record<string, number> = {}
    for (const doc of rows) {
      bySourceType[doc.source_type] = (bySourceType[doc.source_type] ?? 0) + 1
    }

    const lastUpdated = rows.length > 0
      ? rows.sort((a: CorpusDocRow, b: CorpusDocRow) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0].created_at
      : null

    return NextResponse.json({ total_docs: totalDocs, total_chunks: totalChunks, by_source_type: bySourceType, last_updated: lastUpdated })

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
