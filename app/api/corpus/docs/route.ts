import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  try {
    const supabase = createServiceClient()
    const url = new URL(req.url)
    const page = parseInt(url.searchParams.get('page') ?? '1')
    const pageSize = parseInt(url.searchParams.get('pageSize') ?? '100')
    const offset = (page - 1) * pageSize

    // Get total count
    const { count } = await supabase
      .from('corpus_docs')
      .select('*', { count: 'exact', head: true })

    // Get page of docs
    const { data, error } = await supabase
      .from('corpus_docs')
      .select('id, title, source_type, chunk_count, status, created_at, filename, metadata')
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1)

    if (error) throw new Error(error.message)
    return NextResponse.json({ docs: data ?? [], total: count ?? 0, page, pageSize })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
