import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { embedText, embedTexts } from '@/lib/pipeline/embed'
import { searchCorpusMultiAspect } from '@/lib/pipeline/search'
import { synthesizeReport } from '@/lib/pipeline/synthesize'
import { computeCompositeScore, computeBayesianPrior } from '@/lib/pipeline/score'
import { PatientData, StepLog, MechanismContext } from '@/lib/types'

// Internal route — protected by shared secret
export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-internal-secret')
  if (secret !== process.env.INTERNAL_API_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { run_id } = await req.json()
  if (!run_id) return NextResponse.json({ error: 'run_id required' }, { status: 400 })

  const supabase = createServiceClient()
  const stepLog: StepLog[] = []

  const log = async (step: string, status: StepLog['status'], detail?: string) => {
    stepLog.push({ step, status, ts: new Date().toISOString(), detail })
    await supabase.from('runs').update({ step_log: stepLog, updated_at: new Date().toISOString() }).eq('id', run_id)
  }

  try {
    await supabase.from('runs').update({ status: 'processing', started_at: new Date().toISOString() }).eq('id', run_id)

    // ── STEP 1: Load patient ──────────────────────────────────────────────────
    await log('Load patient data', 'running')
    const { data: run, error: runError } = await supabase
      .from('runs')
      .select('*, patients(*)')
      .eq('id', run_id)
      .single()

    if (runError || !run) throw new Error('Run not found')
    const patientData = run.patients.data as PatientData
    await log('Load patient data', 'complete')

    // ── STEP 1.5: Load drug mechanism context from DB (pre-extracted) ─────────
    await log('Load mechanism context', 'running')
    const { data: mechDocs } = await supabase
      .from('corpus_docs')
      .select('metadata')
      .eq('source_type', 'clinical_trial')
      .not('metadata->mechanism_context', 'is', null)

    // Merge all mechanism contexts into one (use first found as primary, or merge)
    let mechanismContext: MechanismContext | null = null
    if (mechDocs && mechDocs.length > 0) {
      // Use the IND briefing document context if present, otherwise first available
      const ctx = mechDocs.find((d: { metadata?: { mechanism_context?: { mechanism_class?: string } } }) => d.metadata?.mechanism_context?.mechanism_class)
      mechanismContext = ctx?.metadata?.mechanism_context ?? mechDocs[0]?.metadata?.mechanism_context ?? null
    }
    await log('Load mechanism context', mechanismContext ? 'complete' : 'complete', mechanismContext ? 'context loaded' : 'no pre-extracted context — will derive from corpus')

    // ── STEP 2: Build aspect embeddings ───────────────────────────────────────
    await log('Aspect embedding', 'running')
    const p = patientData
    const biomarkerText = Object.entries(p.biomarkers)
      .filter(([,v]) => v !== undefined)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ')
    const treatmentText = p.prior_treatments.map(t => `${t.drug} ${t.response}`).join(', ')

    const aspectTexts = {
      mechanism: `5-HT2A agonism neuroplasticity BDNF upregulation TrkB signaling psychoplastogen mechanism of action`,
      safety_pk: `pharmacokinetics half-life bioavailability dose-response adverse events safety profile toxicology`,
      biomarkers: `${biomarkerText} BDNF CRP TNF-alpha IL-6 cortisol inflammatory biomarkers`,
      clinical_profile: `MDD ${p.diagnosis.severity} HAMD-17 ${p.diagnosis.hamd_score} ${treatmentText} age ${p.demographics.age} ${p.demographics.sex} sleep ${p.functional.sleep_efficiency_pct}% anhedonia ${p.functional.anhedonia_present}`,
    }

    const [mechVec, safetyVec, biomarkerVec, clinicalVec] = await embedTexts(Object.values(aspectTexts))
    const aspects = {
      mechanism: mechVec,
      safety_pk: safetyVec,
      biomarkers: biomarkerVec,
      clinical_profile: clinicalVec,
    }
    await log('Aspect embedding', 'complete', '4 aspect vectors built')

    // ── STEP 3: Multi-aspect weighted vector search ───────────────────────────
    await log('Weighted corpus search', 'running')
    const matchedChunks = await searchCorpusMultiAspect(aspects, 30)
    await log('Weighted corpus search', 'complete', `${matchedChunks.length} unique chunks (4 aspects, source-boosted)`)

    // ── STEP 3.5: Compute real ML scores ─────────────────────────────────────
    await log('Score computation', 'running')
    const compositeScore = computeCompositeScore(patientData, matchedChunks, mechanismContext)
    const bayesianPrior = computeBayesianPrior(matchedChunks)
    await log('Score computation', 'complete', `composite: ${compositeScore.value}/100, dominant subtype: ${getDominantSubtype(bayesianPrior)}`)

    // ── STEP 4: Claude synthesis ──────────────────────────────────────────────
    await log('Claude synthesis', 'running')
    const { report, rawOutput } = await synthesizeReport(
      patientData,
      matchedChunks,
      mechanismContext,
      compositeScore,
      bayesianPrior
    )
    await log('Claude synthesis', 'complete', `phenotype: ${report.phenotype_label}`)

    // ── STEP 5: Store report ──────────────────────────────────────────────────
    await log('Store report', 'running')

    // Build extended_report — merge real-math scores with Claude's narrative fields
    const extendedReport = {
      composite_score: compositeScore,
      bayesian_prior: bayesianPrior,
      drug_mechanism: report.drug_mechanism ?? null,
      cross_species_mapping: report.cross_species_mapping ?? [],
      cro_screening_prompts: report.cro_screening_prompts ?? [],
      in_silico_twin: report.in_silico_twin ?? null,
    }

    const { error: reportError } = await supabase.from('reports').insert({
      run_id,
      report_type: 'preclinical',
      responder_prob: report.responder_probability,
      confidence: report.confidence,
      phenotype_label: report.phenotype_label,
      executive_summary: report.executive_summary,
      responder_profile: report.responder_profile,
      nonresponder_profile: report.nonresponder_profile,
      key_biomarkers: report.key_biomarkers,
      matched_corpus_refs: report.matched_corpus_refs,
      methodology_notes: report.methodology_notes,
      recommendations: report.recommendations,
      extended_report: extendedReport,
      raw_llm_output: { text: rawOutput },
    })

    if (reportError) throw new Error(`Failed to store report: ${reportError.message}`)
    await log('Store report', 'complete')

    await supabase.from('runs').update({
      status: 'complete',
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', run_id)

    return NextResponse.json({ ok: true })

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[runs/process]', message)
    await log('Error', 'error', message)
    await supabase.from('runs').update({
      status: 'error',
      error_message: message,
      updated_at: new Date().toISOString(),
    }).eq('id', run_id)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

function getDominantSubtype(prior: import('@/lib/types').BayesianPrior): string {
  const subtypes = [
    { label: 'A', mean: prior.subtype_a.mean },
    { label: 'B', mean: prior.subtype_b.mean },
    { label: 'C', mean: prior.subtype_c.mean },
  ]
  return subtypes.sort((a, b) => b.mean - a.mean)[0].label
}
