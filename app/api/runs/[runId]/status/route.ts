import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  try {
    const { runId } = await params
    const supabase = createServiceClient()

    const { data: run, error } = await supabase
      .from('runs')
      .select('id, status, step_log, completed_at, error_message')
      .eq('id', runId)
      .single()

    if (error || !run) {
      return NextResponse.json({ error: 'Run not found' }, { status: 404 })
    }

    return NextResponse.json({
      run_id: run.id,
      status: run.status,
      step_log: run.step_log ?? [],
      completed_at: run.completed_at,
      error_message: run.error_message,
    })

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
