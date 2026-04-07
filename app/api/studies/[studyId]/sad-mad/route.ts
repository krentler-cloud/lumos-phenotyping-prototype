import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ studyId: string }> }
) {
  const { studyId } = await params
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('sad_mad_cohorts')
    .select('*')
    .eq('study_id', studyId)
    .order('phase')
    .order('dose_mg')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ cohorts: data ?? [] })
}
