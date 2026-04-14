import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  try {
    const supabase = createServiceClient()
    const url = new URL(req.url)
    const page = parseInt(url.searchParams.get('page') ?? '1')
    const pageSize = parseInt(url.searchParams.get('pageSize') ?? '100')
    const sourceType = url.searchParams.get('source_type')
    const offset = (page - 1) * pageSize

    // Get total count
    let countQuery = supabase
      .from('corpus_docs')
      .select('*', { count: 'exact', head: true })
    if (sourceType) countQuery = countQuery.eq('source_type', sourceType)
    const { count } = await countQuery

    // Get page of docs
    let dataQuery = supabase
      .from('corpus_docs')
      .select('id, title, source_type, chunk_count, status, created_at, filename, metadata')
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1)
    if (sourceType) dataQuery = dataQuery.eq('source_type', sourceType)
    const { data, error } = await dataQuery

    if (error) throw new Error(error.message)
    return NextResponse.json({ docs: data ?? [], total: count ?? 0, page, pageSize })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
