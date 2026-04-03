import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

const VALID_SOURCE_TYPES = ['literature', 'clinical_trial', 'internal', 'regulatory']

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ docId: string }> }
) {
  const { docId } = await params
  const body = await req.json()
  const { source_type } = body

  if (!source_type || !VALID_SOURCE_TYPES.includes(source_type)) {
    return NextResponse.json(
      { error: `source_type must be one of: ${VALID_SOURCE_TYPES.join(', ')}` },
      { status: 400 }
    )
  }

  const supabase = createServiceClient()
  const { error } = await supabase
    .from('corpus_docs')
    .update({ source_type })
    .eq('id', docId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
