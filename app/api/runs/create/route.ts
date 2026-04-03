import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { PatientData } from '@/lib/types'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { patient_data, study_id, phase } = body as {
      patient_data: PatientData
      study_id: string
      phase: 'preclinical' | 'clinical'
    }

    if (!patient_data || !study_id || !phase) {
      return NextResponse.json({ error: 'patient_data, study_id, and phase are required' }, { status: 400 })
    }

    const supabase = createServiceClient()

    // Create patient record
    const patientCode = `PT-${Date.now().toString(36).toUpperCase()}`
    const { data: patient, error: patientError } = await supabase
      .from('patients')
      .insert({ study_id, patient_code: patientCode, data: patient_data, source_type: 'synthetic' })
      .select()
      .single()

    if (patientError) throw new Error(`Failed to create patient: ${patientError.message}`)

    // Create run record
    const { data: run, error: runError } = await supabase
      .from('runs')
      .insert({ patient_id: patient.id, study_id, phase, status: 'queued', step_log: [] })
      .select()
      .single()

    if (runError) throw new Error(`Failed to create run: ${runError.message}`)

    // Kick off processing async — fire and forget
    const baseUrl = req.nextUrl.origin
    fetch(`${baseUrl}/api/runs/process`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': process.env.INTERNAL_API_SECRET ?? '',
      },
      body: JSON.stringify({ run_id: run.id }),
    }).catch(err => console.error('[runs/create] Failed to kick off processing:', err))

    return NextResponse.json({ run_id: run.id, status: 'queued' })

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[runs/create]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
