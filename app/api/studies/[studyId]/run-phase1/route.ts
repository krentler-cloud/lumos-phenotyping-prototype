import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

/**
 * POST /api/studies/[studyId]/run-phase1
 *
 * Creates a Phase 1 run record, links it to the study,
 * fires off async processing, and redirects to the processing page.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ studyId: string }> }
) {
  const { studyId } = await params
  const supabase = createServiceClient()

  // Build public-facing base URL (Railway sets x-forwarded-host)
  const forwarded = req.headers.get('x-forwarded-host')
  const proto = req.headers.get('x-forwarded-proto') ?? 'https'
  const explicitBase = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '')
  const publicBase = explicitBase ?? (forwarded ? `${proto}://${forwarded}` : req.nextUrl.origin)

  try {
    // 1. Verify study exists
    const { data: study, error: studyError } = await supabase
      .from('studies')
      .select('id, drug_name, indication, phase1_run_id')
      .eq('id', studyId)
      .single()

    if (studyError || !study) {
      return NextResponse.json({ error: 'Study not found' }, { status: 404 })
    }

    // 2. If a run already exists, check its status
    if (study.phase1_run_id) {
      const { data: existingRun } = await supabase
        .from('runs')
        .select('status')
        .eq('id', study.phase1_run_id)
        .single()

      // Active or complete — just redirect, don't create another
      if (existingRun?.status === 'processing' || existingRun?.status === 'complete') {
        const dest = existingRun.status === 'complete'
          ? `${publicBase}/studies/${studyId}/phase1/report`
          : `${publicBase}/studies/${studyId}/phase1/processing`
        return NextResponse.redirect(dest)
      }
      // queued (stuck/stale) or error — clear and re-run

      // Error state — clear the link and fall through to create a fresh run
      await supabase.from('studies').update({ phase1_run_id: null }).eq('id', studyId)
    }

    // 3. Create a run record (no patient_id — Phase 1 is drug-level)
    const { data: run, error: runError } = await supabase
      .from('runs')
      .insert({
        study_id: studyId,
        patient_id: null,
        phase: 'preclinical',
        status: 'queued',
        step_log: [],
      })
      .select()
      .single()

    if (runError || !run) {
      throw new Error(`Failed to create run: ${runError?.message}`)
    }

    // 4. Link run to study
    await supabase
      .from('studies')
      .update({ phase1_run_id: run.id })
      .eq('id', studyId)

    // 5. Kick off async processing — fire and forget
    fetch(`${publicBase}/api/studies/${studyId}/process-phase1`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': process.env.INTERNAL_API_SECRET ?? '',
      },
      body: JSON.stringify({ run_id: run.id }),
    }).catch(err => console.error('[run-phase1] Failed to kick off processing:', err))

    // 6. Redirect to processing page
    return NextResponse.redirect(`${publicBase}/studies/${studyId}/phase1/processing`)

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[run-phase1]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
