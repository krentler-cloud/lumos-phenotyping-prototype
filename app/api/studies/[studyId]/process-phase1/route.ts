import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { embedTexts } from '@/lib/pipeline/embed'
import { searchCorpusMultiAspect } from '@/lib/pipeline/search'
import { computeBayesianPrior } from '@/lib/pipeline/score'
import { synthesizePhase1Report, synthesizeExploratoryBiomarkers, SadMadCohort } from '@/lib/pipeline/synthesize-phase1'
import { StepLog, MechanismContext } from '@/lib/types'

// Internal route — protected by shared secret
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ studyId: string }> }
) {
  const secret = req.headers.get('x-internal-secret')
  if (secret !== process.env.INTERNAL_API_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { studyId } = await params
  const { run_id } = await req.json()
  if (!run_id) return NextResponse.json({ error: 'run_id required' }, { status: 400 })

  const supabase = createServiceClient()
  const stepLog: StepLog[] = []

  const log = async (step: string, status: StepLog['status'], detail?: string) => {
    stepLog.push({ step, status, ts: new Date().toISOString(), detail })
    await supabase
      .from('runs')
      .update({ step_log: stepLog, updated_at: new Date().toISOString() })
      .eq('id', run_id)
  }

  try {
    await supabase.from('runs').update({
      status: 'processing',
      started_at: new Date().toISOString(),
    }).eq('id', run_id)

    // ── STEP 1: Load study + drug context ──────────────────────────────────────
    await log('Load study data', 'running')
    const { data: study, error: studyError } = await supabase
      .from('studies')
      .select('drug_name, indication')
      .eq('id', studyId)
      .single()

    if (studyError || !study) throw new Error('Study not found')
    const { drug_name: drugName, indication } = study
    await log('Load study data', 'complete', `${drugName} — ${indication}`)

    // ── STEP 2: Load mechanism context (pre-extracted from IND docs) ───────────
    await log('Load mechanism context', 'running')
    const { data: mechDocs } = await supabase
      .from('corpus_docs')
      .select('metadata')
      .eq('source_type', 'clinical_trial')
      .not('metadata->mechanism_context', 'is', null)

    let mechanismContext: MechanismContext | null = null
    if (mechDocs && mechDocs.length > 0) {
      const ctx = mechDocs.find((d: { metadata: { mechanism_context?: { mechanism_class?: string } } }) =>
        d.metadata?.mechanism_context?.mechanism_class
      )
      mechanismContext =
        ctx?.metadata?.mechanism_context ??
        mechDocs[0]?.metadata?.mechanism_context ??
        null
    }
    await log(
      'Load mechanism context',
      'complete',
      mechanismContext ? `${mechanismContext.mechanism_class} — context loaded` : 'no pre-extracted context'
    )

    // ── STEP 3: Build drug-level aspect embeddings ─────────────────────────────
    await log('Aspect embedding', 'running')
    const mechClass = mechanismContext?.mechanism_class ?? '5-HT2A agonism'
    const receptors = mechanismContext?.receptor_profile
      .map(r => r.target)
      .join(', ') ?? '5-HT2A, AMPA, mGluR'

    const aspectTexts = {
      mechanism: `${drugName} ${mechClass} ${receptors} neuroplasticity BDNF TrkB synaptic plasticity psychoplastogen`,
      efficacy: `forced swim test FST chronic mild stress CMS learned helplessness LH animal model MDD responder prediction antidepressant efficacy`,
      biomarkers: `BDNF serum ng/mL CRP mg/L IL-6 pg/mL TNF-alpha inflammatory biomarkers threshold responder non-responder stratification`,
      safety_pk: `${drugName} pharmacokinetics half-life bioavailability dose-response adverse events safety profile toxicology clinical trial`,
    }

    const [mechVec, efficacyVec, biomarkerVec, safetyVec] = await embedTexts(
      Object.values(aspectTexts)
    )

    const aspects: Record<string, number[]> = {
      mechanism: mechVec,
      efficacy: efficacyVec,
      biomarkers: biomarkerVec,
      safety_pk: safetyVec,
    }
    await log('Aspect embedding', 'complete', '4 drug-level aspect vectors built')

    // ── STEP 4: Multi-aspect weighted corpus search ────────────────────────────
    await log('Weighted corpus search', 'running')
    const { chunks: matchedChunks, stats: searchStats } = await searchCorpusMultiAspect(aspects, 40, 80, 3)
    await log(
      'Weighted corpus search',
      'complete',
      `${searchStats.rawCandidates} raw → ${searchStats.afterDedup} deduped → ${searchStats.afterCap} after per-doc cap (max 3) → ${searchStats.finalSent} sent to Claude | sim p50=${searchStats.similarityP50} p75=${searchStats.similarityP75} min=${searchStats.similarityMin.toFixed(3)}`
    )

    // ── STEP 5: Compute Bayesian subtype priors ────────────────────────────────
    await log('Bayesian prior computation', 'running')
    const bayesianPrior = computeBayesianPrior(matchedChunks)
    const dominant = [
      { label: 'A', mean: bayesianPrior.subtype_a.mean },
      { label: 'B', mean: bayesianPrior.subtype_b.mean },
      { label: 'C', mean: bayesianPrior.subtype_c.mean },
    ].sort((a, b) => b.mean - a.mean)[0]
    await log(
      'Bayesian prior computation',
      'complete',
      `dominant corpus subtype: ${dominant.label} (mean=${dominant.mean.toFixed(2)})`
    )

    // ── STEP 6: Load SAD/MAD cohort data (non-blocking — enriches synthesis if present) ─
    // SCIENCE-FEEDBACK: P1-F
    let sadMadCohorts: SadMadCohort[] = []
    try {
      const { data: sadMadData } = await supabase
        .from('sad_mad_cohorts')
        .select('*')
        .eq('study_id', studyId)
        .order('phase')
        .order('dose_mg')
      if (sadMadData && sadMadData.length > 0) {
        sadMadCohorts = sadMadData as SadMadCohort[]
        await log('Load SAD/MAD data', 'complete', `${sadMadCohorts.length} cohort rows loaded (SAD + MAD)`)
      } else {
        await log('Load SAD/MAD data', 'complete', 'No SAD/MAD data for this study — proceeding without')
      }
    } catch {
      await log('Load SAD/MAD data', 'complete', 'Table not yet migrated — skipping')
    }

    // ── STEP 7: Claude synthesis (Opus → phenotypes, Sonnet → biomarkers) ──────
    await log('Phenotype synthesis (Opus)', 'running')
    const report = await synthesizePhase1Report(
      drugName,
      indication,
      matchedChunks,
      mechanismContext,
      bayesianPrior,
      sadMadCohorts.length > 0 ? sadMadCohorts : undefined
    )
    await log(
      'Phenotype synthesis (Opus)',
      'complete',
      `responder confidence: ${report.overall_confidence.toFixed(2)}, biomarkers: ${report.biomarker_recommendations.length}`
    )

    // ── STEP 8: Store report ───────────────────────────────────────────────────
    await log('Store report', 'running')

    const { error: reportError } = await supabase.from('phase1_reports').insert({
      run_id,
      study_id: studyId,
      report_data: report,
    })

    if (reportError) throw new Error(`Failed to store Phase 1 report: ${reportError.message}`)
    await log('Store report', 'complete')

    // ── STEP 8: Exploratory biomarker synthesis (non-blocking — won't fail the run) ──
    await log('Exploratory biomarker synthesis', 'running')
    try {
      const exploratoryBiomarkers = await synthesizeExploratoryBiomarkers(
        drugName,
        indication,
        matchedChunks,
        report
      )
      // Merge into the stored report_data
      await supabase.from('phase1_reports')
        .update({ report_data: { ...report, exploratory_biomarkers: exploratoryBiomarkers } })
        .eq('run_id', run_id)
      await log(
        'Exploratory biomarker synthesis',
        'complete',
        `${exploratoryBiomarkers.length} exploratory signals identified`
      )
    } catch (exploratoryErr: unknown) {
      const exploratoryMsg = exploratoryErr instanceof Error ? exploratoryErr.message : 'Unknown error'
      console.error('[process-phase1] exploratory biomarkers failed (non-blocking):', exploratoryMsg)
      await log('Exploratory biomarker synthesis', 'error', exploratoryMsg)
      // Non-blocking: continue to mark run complete
    }

    // Mark run complete
    await supabase.from('runs').update({
      status: 'complete',
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', run_id)

    return NextResponse.json({ ok: true })

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[process-phase1]', message)
    await log('Error', 'error', message)
    await supabase.from('runs').update({
      status: 'error',
      error_message: message,
      updated_at: new Date().toISOString(),
    }).eq('id', run_id)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
