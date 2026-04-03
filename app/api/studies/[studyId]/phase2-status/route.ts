import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ studyId: string }> }
) {
  const { studyId } = await params
  const supabase = createServiceClient()

  const { data: study } = await supabase
    .from('studies')
    .select('phase2_run_id')
    .eq('id', studyId)
    .single()

  if (!study?.phase2_run_id) {
    return NextResponse.json({ status: 'not_started', step_log: [] })
  }

  const { data: run } = await supabase
    .from('runs')
    .select('status, step_log, error_message')
    .eq('id', study.phase2_run_id)
    .single()

  if (!run) return NextResponse.json({ status: 'not_started', step_log: [] })

  return NextResponse.json({
    status: run.status,
    step_log: run.step_log ?? [],
    error_message: run.error_message,
  })
}
