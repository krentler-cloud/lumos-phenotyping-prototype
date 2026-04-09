import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

/**
 * POST /api/studies/[studyId]/cancel-phase2
 *
 * Cancels a stuck or in-progress phase2 run:
 * 1. Marks the current run as "error" so it shows in history as cancelled
 * 2. Unlinks phase2_run_id from the study so the landing page shows "Run Clinical Analysis"
 *
 * Safe to call at any time — if there's no run_id, it's a no-op.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ studyId: string }> }
) {
  const { studyId } = await params
  const supabase = createServiceClient()

  const { data: study } = await supabase
    .from('studies')
    .select('phase2_run_id')
    .eq('id', studyId)
    .single()

  if (study?.phase2_run_id) {
    await supabase
      .from('runs')
      .update({
        status: 'error',
        error_message: 'Cancelled by user',
      })
      .eq('id', study.phase2_run_id)
      .in('status', ['queued', 'processing'])

    await supabase
      .from('studies')
      .update({ phase2_run_id: null })
      .eq('id', studyId)
  }

  return NextResponse.json({ ok: true })
}
