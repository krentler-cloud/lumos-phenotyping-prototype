import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { runClinicalML, ClinicalPatient } from '@/lib/pipeline/clinical-ml'
import { synthesizePhase2Report } from '@/lib/pipeline/synthesize-phase2'
import { Phase1ReportData } from '@/lib/pipeline/synthesize-phase1'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

type StepStatus = 'pending' | 'running' | 'complete' | 'error'

interface StepLog {
  step: string
  status: StepStatus
  ts: string
  detail?: string
}

async function step(
  supabase: ReturnType<typeof createServiceClient>,
  runId: string,
  log: StepLog[],
  name: string,
  fn: () => Promise<string | undefined>
): Promise<void> {
  log.push({ step: name, status: 'running', ts: new Date().toISOString() })
  await supabase.from('runs').update({ step_log: log }).eq('id', runId)

  try {
    const detail = await fn()
    const entry = log.find(s => s.step === name)!
    entry.status = 'complete'
    entry.ts = new Date().toISOString()
    if (detail) entry.detail = detail
    await supabase.from('runs').update({ step_log: log }).eq('id', runId)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    const entry = log.find(s => s.step === name)!
    entry.status = 'error'
    entry.detail = message
    await supabase.from('runs').update({
      step_log: log,
      status: 'error',
      error_message: `${name}: ${message}`,
    }).eq('id', runId)
    throw err
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ studyId: string }> }
) {
  const secret = req.headers.get('x-internal-secret')
  if (secret !== (process.env.INTERNAL_API_SECRET ?? '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { studyId } = await params
  const { run_id } = await req.json()
  const supabase = createServiceClient()
  const log: StepLog[] = []

  await supabase.from('runs').update({ status: 'processing' }).eq('id', run_id)

  let study: { drug_name: string; indication: string; phase1_run_id: string } | null = null
  let patients: ClinicalPatient[] = []
  let phase1Report: Phase1ReportData | null = null

  try {
    // ── Step 1: Load study ──────────────────────────────────────────────────
    await step(supabase, run_id, log, 'Load study data', async () => {
      const { data, error } = await supabase
        .from('studies')
        .select('drug_name, indication, phase1_run_id')
        .eq('id', studyId)
        .single()
      if (error || !data) throw new Error('Study not found')
      study = data
      return `${data.drug_name} · ${data.indication}`
    })

    // ── Step 2: Load Phase 1 report ─────────────────────────────────────────
    // SCIENCE-FEEDBACK: P1-A
    await step(supabase, run_id, log, 'Load pre-clinical report', async () => {
      const { data, error } = await supabase
        .from('phase1_reports')
        .select('report_data')
        .eq('study_id', studyId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()
      if (error || !data) throw new Error('No Phase 1 report found — run Phase 1 first')
      phase1Report = data.report_data as Phase1ReportData
      return `Loaded Phase 1 report with ${phase1Report.biomarker_recommendations?.length ?? 0} biomarker recommendations`
    })

    // ── Step 3: Load clinical patients ──────────────────────────────────────
    await step(supabase, run_id, log, 'Load clinical patients', async () => {
      const { data, error } = await supabase
        .from('clinical_patients')
        .select('*')
        .eq('study_id', studyId)
        .order('patient_code')
      if (error) throw new Error(error.message)
      if (!data || data.length === 0) throw new Error('No clinical patients found — run the seed script first')
      patients = data as ClinicalPatient[]
      return `Loaded ${patients.length} patients`
    })

    // ── Step 4: Run clinical ML ─────────────────────────────────────────────
    let mlResult: ReturnType<typeof runClinicalML> | null = null
    await step(supabase, run_id, log, 'Clinical ML analysis', async () => {
      const priors = {
        overall:      phase1Report!.overall_confidence,
        responder:    phase1Report!.responder_profile.corpus_hypothesis_confidence,
        nonresponder: phase1Report!.nonresponder_profile.corpus_hypothesis_confidence,
      }
      mlResult = runClinicalML(patients, priors)

      // Write subtype labels back to each patient record
      for (const assignment of mlResult.assignments) {
        await supabase
          .from('clinical_patients')
          .update({ subtype_label: assignment.subtype })
          .eq('patient_code', assignment.patient_code)
          .eq('study_id', studyId)
      }

      return `Concordance ${mlResult.concordance_pct}% · ${mlResult.responder_count}R / ${mlResult.nonresponder_count}NR / ${mlResult.uncertain_count}U`
    })

    // ── Step 5: Clinical synthesis ─────────────────────────────────────────
    let phase2Report: Awaited<ReturnType<typeof synthesizePhase2Report>> | null = null
    await step(supabase, run_id, log, 'Clinical synthesis', async () => {
      phase2Report = await synthesizePhase2Report(
        study!.drug_name,
        study!.indication,
        phase1Report!,
        mlResult!
      )
      return 'Synthesis complete'
    })

    // ── Step 6: Store report ────────────────────────────────────────────────
    await step(supabase, run_id, log, 'Store clinical report', async () => {
      const fullReport = {
        ...phase2Report,
        ml_result: mlResult,
        patients: patients.map(p => ({
          patient_code: p.patient_code,
          subtype_label: mlResult!.assignments.find(a => a.patient_code === p.patient_code)?.subtype,
          baseline_bdnf_ng_ml: p.baseline_bdnf_ng_ml,
          baseline_il6_pg_ml: p.baseline_il6_pg_ml,
          baseline_crp_mg_l: p.baseline_crp_mg_l,
          baseline_madrs: p.baseline_madrs,
          wk8_madrs: p.wk8_madrs,
          response_status: p.response_status,
        })),
      }

      const { error } = await supabase.from('phase2_reports').insert({
        run_id,
        study_id: studyId,
        report_data: fullReport,
      })
      if (error) throw new Error(error.message)
      return 'Report saved'
    })

    await supabase.from('runs').update({ status: 'complete' }).eq('id', run_id)
    return NextResponse.json({ ok: true })

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[process-phase2]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
