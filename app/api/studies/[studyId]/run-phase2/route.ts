import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { runPhase2Processing } from '../process-phase2/route'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ studyId: string }> }
) {
  const { studyId } = await params
  const supabase = createServiceClient()

  // Build public-facing base URL (for redirects)
  const forwarded = req.headers.get('x-forwarded-host')
  const proto = req.headers.get('x-forwarded-proto') ?? 'https'
  const explicitBase = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '')
  const publicBase = explicitBase ?? (forwarded ? `${proto}://${forwarded}` : req.nextUrl.origin)

  try {
    const { data: study, error: studyError } = await supabase
      .from('studies')
      .select('id, drug_name, indication, phase1_run_id, phase2_run_id')
      .eq('id', studyId)
      .single()

    if (studyError || !study) {
      return NextResponse.json({ error: 'Study not found' }, { status: 404 })
    }

    // Phase 1 must be complete first
    if (!study.phase1_run_id) {
      return NextResponse.json({ error: 'Phase 1 must be completed before running Phase 2' }, { status: 400 })
    }

    // Check Phase 1 is actually complete, not still processing
    const { data: phase1Run } = await supabase
      .from('runs')
      .select('status')
      .eq('id', study.phase1_run_id)
      .single()

    if (phase1Run?.status === 'processing' || phase1Run?.status === 'queued') {
      return NextResponse.json({
        error: 'Planning Phase analysis is still running. Please wait for it to complete before starting Clinical Analysis.',
        phase1_status: phase1Run.status,
      }, { status: 409 })
    }

    // If a Phase 2 run already exists, redirect to its current state
    if (study.phase2_run_id) {
      const { data: existingRun } = await supabase
        .from('runs')
        .select('status')
        .eq('id', study.phase2_run_id)
        .single()

      if (existingRun?.status === 'processing') {
        return NextResponse.redirect(`${publicBase}/studies/${studyId}/phase2/processing`)
      }
      if (existingRun?.status === 'complete') {
        return NextResponse.redirect(`${publicBase}/studies/${studyId}/phase2/subtyping`)
      }
      // queued (stuck/stale) or error — clear and re-run
      await supabase.from('studies').update({ phase2_run_id: null }).eq('id', studyId)
    }

    // Create the run record
    const { data: run, error: runError } = await supabase
      .from('runs')
      .insert({
        study_id: studyId,
        patient_id: null,
        phase: 'clinical',
        status: 'queued',
        step_log: [],
      })
      .select()
      .single()

    if (runError || !run) {
      throw new Error(`Failed to create run: ${runError?.message}`)
    }

    await supabase.from('studies').update({ phase2_run_id: run.id }).eq('id', studyId)

    // Kick off async processing as a background promise (no HTTP hop)
    // Railway runs a persistent Node.js server, so unhandled background promises
    // continue running after the response is sent — no proxy timeout risk.
    runPhase2Processing(studyId, run.id).catch(err =>
      console.error('[run-phase2] processing error:', err)
    )

    return NextResponse.redirect(`${publicBase}/studies/${studyId}/phase2/processing`)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[run-phase2]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
