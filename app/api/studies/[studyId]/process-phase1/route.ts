import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { embedTexts } from '@/lib/pipeline/embed'
import { searchCorpusMultiAspect } from '@/lib/pipeline/search'
import { computeBayesianPrior } from '@/lib/pipeline/score'
import { synthesizePhase1Report, synthesizeExploratoryBiomarkers, synthesizeCorpusIntelligence, SadMadCohort } from '@/lib/pipeline/synthesize-phase1'
import { StepLog, MechanismContext } from '@/lib/types'

export async function runPhase1Processing(studyId: string, runId: string): Promise<void> {
  const supabase = createServiceClient()
  const stepLog: StepLog[] = []

  const log = async (step: string, status: StepLog['status'], detail?: string) => {
    stepLog.push({ step, status, ts: new Date().toISOString(), detail })
    await supabase
      .from('runs')
      .update({ step_log: stepLog, updated_at: new Date().toISOString() })
      .eq('id', runId)
  }

  try {
    await supabase.from('runs').update({
      status: 'processing',
      started_at: new Date().toISOString(),
    }).eq('id', runId)

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

    // ── STEP 3: Build phenotype-oriented aspect embeddings ──────────────────────
    // SCIENCE-FEEDBACK P2-F — aspects rewritten from drug-descriptive (mechanism, efficacy,
    // biomarkers, safety_pk) to phenotype-oriented queries that retrieve evidence about
    // *who responds* rather than *what the drug does*.
    await log('Aspect embedding', 'running')

    const aspectTexts = {
      responder_profile: `BDNF elevation neuroplasticity synaptic plasticity 5-HT2A agonist responder treatment response Val66Met Val/Val TrkB MADRS reduction remission`,
      nonresponder_profile: `inflammatory subtype treatment resistance elevated CRP IL-6 TNF-alpha non-responder flat BDNF prior antidepressant failure TRD immune activation`,
      biomarker_stratification: `biomarker threshold cutoff clinical stratification BDNF serum ng/mL IL-6 pg/mL treatment response prediction validated prospective`,
      analog_outcomes: `psilocybin ketamine 5-HT2A clinical trial MADRS remission responder outcome Phase 2 MDD randomized controlled`,
    }

    const [responderVec, nonresponderVec, stratVec, analogVec] = await embedTexts(
      Object.values(aspectTexts)
    )

    const aspects: Record<string, number[]> = {
      responder_profile: responderVec,
      nonresponder_profile: nonresponderVec,
      biomarker_stratification: stratVec,
      analog_outcomes: analogVec,
    }
    await log('Aspect embedding', 'complete', '4 phenotype-oriented aspect vectors built')

    // ── STEP 4: Multi-aspect weighted corpus search ────────────────────────────
    await log('Weighted corpus search', 'running')
    // 25 final chunks balances evidence coverage against Opus prompt size (~13K chunk tokens).
    // 40 was causing 10+ minute Opus calls; 25 should complete in 3-6 minutes.
    const { chunks: matchedChunks, stats: searchStats } = await searchCorpusMultiAspect(aspects, 25, 80, 3)
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

    // ── STEP 7: Phenotype synthesis ────────────────────────────────────────
    await log('Phenotype synthesis', 'running')
    const report = await synthesizePhase1Report(
      drugName,
      indication,
      matchedChunks,
      mechanismContext,
      bayesianPrior,
      sadMadCohorts.length > 0 ? sadMadCohorts : undefined,
      // Stream progress: update step_log detail every 15s so the UI shows token count
      async (detail) => { await log('Phenotype synthesis', 'running', detail) }
    )
    const diag = report._opus_diagnostics
    await log(
      'Phenotype synthesis',
      'complete',
      diag
        ? `${diag.duration_sec}s | in=${diag.input_tokens} out=${diag.output_tokens} stop=${diag.stop_reason} | prompt=${diag.prompt_chars} chars, budget=${diag.max_tokens_budget} | confidence: ${report.overall_confidence.toFixed(2)}, biomarkers: ${report.biomarker_recommendations.length}`
        : `responder confidence: ${report.overall_confidence.toFixed(2)}, biomarkers: ${report.biomarker_recommendations.length}`
    )

    // ── STEP 8: Store report ───────────────────────────────────────────────────
    await log('Store report', 'running')

    const { error: reportError } = await supabase.from('phase1_reports').insert({
      run_id: runId,
      study_id: studyId,
      report_data: report,
    })

    if (reportError) throw new Error(`Failed to store Phase 1 report: ${reportError.message}`)
    await log('Store report', 'complete')

    // ── STEPS 8+9: Exploratory biomarkers + Corpus intelligence (parallel, non-blocking) ──
    // These are independent of each other — run them concurrently to cut tail time.
    await log('Exploratory biomarker synthesis', 'running')
    await log('Corpus intelligence synthesis', 'running')

    const exploratoryPromise = (async () => {
      try {
        const exploratoryBiomarkers = await synthesizeExploratoryBiomarkers(
          drugName,
          indication,
          matchedChunks,
          report
        )
        await supabase.from('phase1_reports')
          .update({ report_data: { ...report, exploratory_biomarkers: exploratoryBiomarkers } })
          .eq('run_id', runId)
        await log(
          'Exploratory biomarker synthesis',
          'complete',
          `${exploratoryBiomarkers.length} exploratory signals identified`
        )
        return exploratoryBiomarkers
      } catch (exploratoryErr: unknown) {
        const exploratoryMsg = exploratoryErr instanceof Error ? exploratoryErr.message : 'Unknown error'
        console.error('[process-phase1] exploratory biomarkers failed (non-blocking):', exploratoryMsg)
        await log('Exploratory biomarker synthesis', 'error', exploratoryMsg)
        return null
      }
    })()

    const corpusPromise = (async () => {
      try {
        const corpusIntelligence = await synthesizeCorpusIntelligence(
          drugName,
          indication,
          matchedChunks,
          searchStats
        )
        return corpusIntelligence
      } catch (corpusErr: unknown) {
        const corpusMsg = corpusErr instanceof Error ? corpusErr.message : 'Unknown error'
        console.error('[process-phase1] corpus intelligence failed (non-blocking):', corpusMsg)
        await log('Corpus intelligence synthesis', 'error', corpusMsg)
        return null
      }
    })()

    const [exploratoryResult, corpusIntelligence] = await Promise.all([exploratoryPromise, corpusPromise])

    // Merge both results into the stored report in a single update
    if (exploratoryResult || corpusIntelligence) {
      const { data: currentReportRow } = await supabase
        .from('phase1_reports')
        .select('report_data')
        .eq('run_id', runId)
        .single()
      const currentReportData = (currentReportRow?.report_data ?? report) as Record<string, unknown>
      const merged = {
        ...currentReportData,
        ...(exploratoryResult ? { exploratory_biomarkers: exploratoryResult } : {}),
        ...(corpusIntelligence ? { corpus_intelligence: corpusIntelligence } : {}),
      }
      await supabase.from('phase1_reports')
        .update({ report_data: merged })
        .eq('run_id', runId)
    }

    if (corpusIntelligence) {
      await log(
        'Corpus intelligence synthesis',
        'complete',
        `${corpusIntelligence.corpus_gaps.length} gaps identified, ${corpusIntelligence.corpus_strengths.length} strengths`
      )
    }

    // Mark run complete
    await supabase.from('runs').update({
      status: 'complete',
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', runId)

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[process-phase1]', message)
    await log('Error', 'error', message)
    await supabase.from('runs').update({
      status: 'error',
      error_message: message,
      updated_at: new Date().toISOString(),
    }).eq('id', runId)
  }
}

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

  await runPhase1Processing(studyId, run_id)
  return NextResponse.json({ ok: true })
}
