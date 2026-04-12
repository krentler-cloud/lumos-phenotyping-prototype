import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = createServiceClient()

    // Use count queries — PostgREST default row limit is 1,000 which silently truncates
    const [totalResult, chunkResult, litResult, ctResult, regResult, latestResult] = await Promise.all([
      supabase.from('corpus_docs').select('*', { count: 'exact', head: true }).eq('status', 'ready'),
      supabase.from('corpus_chunks').select('*', { count: 'exact', head: true }),
      supabase.from('corpus_docs').select('*', { count: 'exact', head: true }).eq('status', 'ready').eq('source_type', 'literature'),
      supabase.from('corpus_docs').select('*', { count: 'exact', head: true }).eq('status', 'ready').eq('source_type', 'clinical_trial'),
      supabase.from('corpus_docs').select('*', { count: 'exact', head: true }).eq('status', 'ready').eq('source_type', 'regulatory'),
      supabase.from('corpus_docs').select('created_at').eq('status', 'ready').order('created_at', { ascending: false }).limit(1).single(),
    ])

    const bySourceType: Record<string, number> = {}
    if (litResult.count) bySourceType['literature'] = litResult.count
    if (ctResult.count) bySourceType['clinical_trial'] = ctResult.count
    if (regResult.count) bySourceType['regulatory'] = regResult.count

    return NextResponse.json({
      total_docs: totalResult.count ?? 0,
      total_chunks: chunkResult.count ?? 0,
      by_source_type: bySourceType,
      last_updated: latestResult.data?.created_at ?? null,
    })

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
