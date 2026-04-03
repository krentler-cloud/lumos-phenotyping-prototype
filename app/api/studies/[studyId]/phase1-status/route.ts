import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

/**
 * GET /api/studies/[studyId]/phase1-status
 * Returns the current status of the Phase 1 run for this study.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ studyId: string }> }
) {
  const { studyId } = await params
  const supabase = createServiceClient()

  const { data: study, error: studyError } = await supabase
    .from('studies')
    .select('phase1_run_id')
    .eq('id', studyId)
    .single()

  if (studyError || !study?.phase1_run_id) {
    return NextResponse.json({ status: 'queued', step_log: [] })
  }

  const { data: run, error: runError } = await supabase
    .from('runs')
    .select('id, status, step_log, completed_at, error_message')
    .eq('id', study.phase1_run_id)
    .single()

  if (runError || !run) {
    return NextResponse.json({ status: 'queued', step_log: [] })
  }

  return NextResponse.json({
    run_id: run.id,
    status: run.status,
    step_log: run.step_log ?? [],
    completed_at: run.completed_at,
    error_message: run.error_message,
  })
}
