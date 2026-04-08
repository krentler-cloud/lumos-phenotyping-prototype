import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

const VALID_SOURCE_TYPES = ['literature', 'clinical_trial', 'internal', 'regulatory']

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ docId: string }> }
) {
  const { docId } = await params
  const body = await req.json()
  const { source_type, title } = body

  // Must provide at least one field to update
  if (!source_type && !title) {
    return NextResponse.json(
      { error: 'Provide source_type and/or title to update' },
      { status: 400 }
    )
  }

  if (source_type && !VALID_SOURCE_TYPES.includes(source_type)) {
    return NextResponse.json(
      { error: `source_type must be one of: ${VALID_SOURCE_TYPES.join(', ')}` },
      { status: 400 }
    )
  }

  if (title !== undefined && (typeof title !== 'string' || title.trim().length === 0)) {
    return NextResponse.json({ error: 'title must be a non-empty string' }, { status: 400 })
  }

  const update: Record<string, string> = {}
  if (source_type) update.source_type = source_type
  if (title) update.title = title.trim()

  const supabase = createServiceClient()
  const { error } = await supabase
    .from('corpus_docs')
    .update(update)
    .eq('id', docId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ docId: string }> }
) {
  const { docId } = await params
  const supabase = createServiceClient()

  // corpus_chunks rows cascade-delete automatically via ON DELETE CASCADE FK
  // Storage file is cleaned up best-effort (non-blocking)
  const { data: doc } = await supabase
    .from('corpus_docs')
    .select('storage_path')
    .eq('id', docId)
    .single()

  const { error } = await supabase
    .from('corpus_docs')
    .delete()
    .eq('id', docId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Best-effort storage cleanup — don't fail the request if this errors
  if (doc?.storage_path) {
    supabase.storage.from('corpus-docs').remove([doc.storage_path]).catch(() => {})
  }

  return NextResponse.json({ ok: true })
}
