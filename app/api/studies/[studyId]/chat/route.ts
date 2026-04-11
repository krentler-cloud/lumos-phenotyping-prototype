import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createServiceClient } from '@/lib/supabase/server'
import { embedText } from '@/lib/pipeline/embed'
import { searchCorpusWeighted, rerankChunks, MatchedChunk } from '@/lib/pipeline/search'
import { Phase1ReportData } from '@/lib/pipeline/synthesize-phase1'
import { formatPageContextForPrompt, LumosPageContext } from '@/lib/context/pageContext'

interface ChatHistoryMessage {
  role: 'user' | 'assistant'
  content: string
}

// ── Static context: everything from the stored analysis ───────────────────────
function buildAnalysisContext(
  drugName: string,
  indication: string,
  sponsor: string,
  phase1Report: Phase1ReportData | null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  phase2Report: Record<string, any> | null
): string {
  const lines: string[] = [
    '=== ANALYSIS CONTEXT ===',
    `Drug: ${drugName}  |  Indication: ${indication}  |  Sponsor: ${sponsor}`,
    '',
  ]

  if (!phase1Report) {
    // SCIENCE-FEEDBACK: P1-A
    lines.push('Planning Phase analysis: not yet complete.')
    lines.push('')
  } else {
    lines.push('--- PLANNING PHASE ANALYSIS (Phase 1) ---')
    lines.push(`Overall confidence: ${Math.round(phase1Report.overall_confidence * 100)}%`)
    lines.push('')

    // Phenotype profiles — full detail
    const rp = phase1Report.responder_profile
    if (rp) {
      lines.push(`RESPONDER PROFILE (subtype ${rp.primary_subtype}, confidence ${Math.round(rp.corpus_hypothesis_confidence * 100)}%)`)
      lines.push(`  Summary: ${rp.summary}`)
      lines.push(`  Demographics: ${rp.demographics}`)
      lines.push(`  Core clinical: ${rp.core_clinical}`)
      lines.push(`  Inflammatory: ${rp.inflammatory}`)
      lines.push(`  Neuroplasticity: ${rp.neuroplasticity}`)
      if (rp.imaging) lines.push(`  Imaging: ${rp.imaging}`)
      if (rp.key_inclusion_criteria?.length) {
        lines.push(`  Inclusion criteria: ${rp.key_inclusion_criteria.join(' | ')}`)
      }
      lines.push('')
    }

    const nr = phase1Report.nonresponder_profile
    if (nr) {
      lines.push(`NON-RESPONDER PROFILE (subtype ${nr.primary_subtype}, confidence ${Math.round(nr.corpus_hypothesis_confidence * 100)}%)`)
      lines.push(`  Summary: ${nr.summary}`)
      lines.push(`  Demographics: ${nr.demographics}`)
      lines.push(`  Core clinical: ${nr.core_clinical}`)
      lines.push(`  Inflammatory: ${nr.inflammatory}`)
      lines.push(`  Neuroplasticity: ${nr.neuroplasticity}`)
      if (nr.imaging) lines.push(`  Imaging: ${nr.imaging}`)
      if (nr.key_exclusion_criteria?.length) {
        lines.push(`  Exclusion criteria: ${nr.key_exclusion_criteria.join(' | ')}`)
      }
      lines.push('')
    }

    // Efficacy signals — full ranked detail
    if (phase1Report.biomarker_recommendations?.length) {
      lines.push('EFFICACY SIGNALS (ranked by Planning Phase signal strength):')
      phase1Report.biomarker_recommendations
        .sort((a, b) => a.rank - b.rank)
        .forEach(bm => {
          lines.push(`  ${bm.rank}. ${bm.name}${bm.unit ? ` (${bm.unit})` : ''} — domain: ${bm.domain}, priority: ${bm.priority_pct}%`)
          lines.push(`     Rationale: ${bm.preclinical_rationale}`)
          lines.push(`     Responder threshold: ${bm.responder_threshold}`)
          lines.push(`     Non-responder threshold: ${bm.nonresponder_threshold}`)
          lines.push(`     Collection: ${bm.collection_method} at ${bm.timing.join(', ')}`)
        })
      if (phase1Report.primary_endpoint_recommendation) {
        lines.push(`  Primary endpoint recommendation: ${phase1Report.primary_endpoint_recommendation}`)
      }
      if (phase1Report.early_response_indicator) {
        lines.push(`  Early response indicator: ${phase1Report.early_response_indicator}`)
      }
      lines.push('')
    }

    // Cross-species evidence — full detail
    if (phase1Report.cross_species_evidence?.length) {
      lines.push('CROSS-SPECIES EVIDENCE:')
      phase1Report.cross_species_evidence.forEach(ev => {
        lines.push(`  Model: ${ev.animal_model}  →  Human mapping: ${ev.human_subtype_mapping}  [${ev.signal_strength}]`)
        if (ev.key_biomarker_signals?.length) {
          lines.push(`  Biomarker signals: ${ev.key_biomarker_signals.join(', ')}`)
        }
        if (ev.corpus_ref) lines.push(`  Source: ${ev.corpus_ref}`)
      })
      lines.push('')
    }

    // Safety flags
    if (phase1Report.safety_flags?.length) {
      lines.push('SAFETY SIGNALS:')
      phase1Report.safety_flags.forEach(f => {
        lines.push(`  [${f.severity.toUpperCase()}] ${f.signal}: ${f.clinical_implication} (source: ${f.source})`)
      })
      lines.push('')
    }

    // Exploratory biomarkers
    if (phase1Report.exploratory_biomarkers?.length) {
      lines.push('EXPLORATORY BIOMARKERS (hypothesis-generating — not validated):')
      phase1Report.exploratory_biomarkers.forEach(bm => {
        lines.push(`  • ${bm.name} (${bm.biomarker_class}, evidence: ${bm.evidence_level}, feasibility: ${bm.feasibility})`)
        lines.push(`    Rationale: ${bm.rationale}`)
        lines.push(`    Learning objective: ${bm.learning_objective}`)
        if (bm.corpus_refs?.length) lines.push(`    Cited sources: ${bm.corpus_refs.join('; ')}`)
      })
      lines.push('')
    }

    // Protocol notes
    if (phase1Report.protocol_notes) {
      lines.push(`PROTOCOL NOTES: ${phase1Report.protocol_notes}`)
      lines.push('')
    }

    // Methodology narrative (full — enables answering "how does this work" questions)
    if (phase1Report.methodology_narrative) {
      lines.push('METHODOLOGY NARRATIVE (how the analysis was conducted):')
      lines.push(phase1Report.methodology_narrative)
      lines.push('')
    }
  }

  // Phase 2 clinical
  if (!phase2Report) {
    lines.push('Clinical analysis (Phase 2): not yet complete.')
  } else {
    lines.push('--- CLINICAL ANALYSIS (Phase 2) ---')
    const ml = phase2Report.ml_result
    if (ml) {
      lines.push(`Predicted subtype: ${ml.predicted_subtype ?? 'unknown'}`)
      lines.push(`Confidence score: ${ml.confidence_score !== undefined ? Math.round(ml.confidence_score * 100) + '%' : 'unknown'}`)
      if (ml.bayesian_posterior) {
        const bp = ml.bayesian_posterior
        lines.push(`Bayesian posterior — Subtype A: ${bp.subtype_a !== undefined ? Math.round(bp.subtype_a * 100) + '%' : '?'} | B: ${bp.subtype_b !== undefined ? Math.round(bp.subtype_b * 100) + '%' : '?'} | C: ${bp.subtype_c !== undefined ? Math.round(bp.subtype_c * 100) + '%' : '?'}`)
      }
      if (ml.shap_values?.length) {
        lines.push('SHAP feature attributions (all features):')
        const sorted = [...ml.shap_values].sort((a: { value: number }, b: { value: number }) => Math.abs(b.value) - Math.abs(a.value))
        sorted.forEach((s: { feature: string; value: number }) => {
          lines.push(`  ${s.feature}: ${s.value > 0 ? '+' : ''}${s.value.toFixed(4)}`)
        })
      }
    }
    if (phase2Report.executive_summary) {
      lines.push(`Executive summary: ${phase2Report.executive_summary}`)
    }
  }

  lines.push('')
  lines.push('=== END ANALYSIS CONTEXT ===')
  return lines.join('\n')
}

// ── Format retrieved corpus chunks for injection ───────────────────────────────
function buildCorpusBlock(chunks: MatchedChunk[]): string {
  if (!chunks.length) return ''
  const items = chunks.map((c, i) =>
    `[${i + 1}] "${c.title}" (${c.source_type}, relevance: ${(c.similarity * 100).toFixed(1)}%)\n${c.content.trim()}`
  )
  return [
    '=== CORPUS EVIDENCE (retrieved for this question) ===',
    ...items.flatMap((item, i) => (i < items.length - 1 ? [item, '---'] : [item])),
    '=== END CORPUS EVIDENCE ===',
  ].join('\n\n')
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ studyId: string }> }
) {
  const { studyId } = await params

  let body: { message: string; history?: ChatHistoryMessage[]; pageContext?: LumosPageContext }
  try {
    body = await req.json()
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }

  const { message, history = [], pageContext } = body
  if (!message?.trim()) return new Response('message required', { status: 400 })

  const supabase = createServiceClient()

  // ── Parallel: fetch study + embed query simultaneously ────────────────────────
  const [{ data: study }, queryVector] = await Promise.all([
    supabase
      .from('studies')
      .select('drug_name, indication, sponsor, phase1_run_id, phase2_run_id')
      .eq('id', studyId)
      .single(),
    embedText(message),
  ])

  if (!study) return new Response('Study not found', { status: 404 })

  // ── Parallel: fetch reports + search corpus + corpus count ───────────────────
  const [phase1Row, phase2Row, corpusChunks, corpusCountRow] = await Promise.all([
    study.phase1_run_id
      ? supabase.from('phase1_reports').select('report_data').eq('run_id', study.phase1_run_id).single()
      : Promise.resolve({ data: null }),
    study.phase2_run_id
      ? supabase
          .from('phase2_reports')
          .select('report_data')
          .eq('study_id', studyId)
          .order('created_at', { ascending: false })
          .limit(1)
          .single()
      : Promise.resolve({ data: null }),
    // Fetch 20 candidates, rerank to top 8 for better relevance at scale
    searchCorpusWeighted(queryVector, 20).then(raw => rerankChunks(message, raw, 8)),
    supabase.from('corpus_docs').select('*', { count: 'exact', head: true }),
  ])

  const corpusDocCount = corpusCountRow.count ?? 'unknown'

  const phase1Report = (phase1Row.data?.report_data ?? null) as Phase1ReportData | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const phase2Report = (phase2Row.data?.report_data ?? null) as Record<string, any> | null

  const analysisContext = buildAnalysisContext(
    study.drug_name,
    study.indication,
    study.sponsor,
    phase1Report,
    phase2Report
  )

  const corpusBlock = buildCorpusBlock(corpusChunks)

  // ── System prompt ──────────────────────────────────────────────────────────────
  const systemPrompt = `You are a clinical AI assistant embedded in the Lumos AI platform by Headlamp Health. You answer questions about the Planning Phase and clinical analysis for ${study.drug_name} in ${study.indication}.

LUMOS AI PLATFORM FACTS (use these when describing the system — do not invent alternatives):
- Corpus: ${corpusDocCount} pre-clinical scientific documents (literature, regulatory filings, clinical trial reports) — NOT a patient database or profile database
- Search method: Supabase pgvector cosine similarity search — NOT FAISS, NOT Pinecone, NOT any other vector database
- Per-query retrieval: 8 corpus chunks are retrieved and provided in the CORPUS EVIDENCE block below; synthesis runs use 20 chunks
- Source boost: clinical trial documents receive a 1.20x score boost; regulatory documents 1.15x — manually tuned, not data-derived
- Patient data: the N=16 Phase 2 cohort is the only human patient data in the system; all other evidence is pre-clinical
- NEVER invent statistics, document counts, profile numbers, or technical implementation details about the Lumos AI platform. If you don't know a platform fact, say so rather than estimating.

You have two sources of evidence for every response:
1. ANALYSIS CONTEXT — structured outputs from the pipeline (phenotype profiles, efficacy signals, ML results, methodology narrative)
2. CORPUS EVIDENCE — raw passages retrieved from the scientific corpus specifically for the current question

HOW TO ANSWER:
- When a question is about a specific threshold, mechanism, or finding: search the CORPUS EVIDENCE for supporting text and quote it directly, naming the document
- When a question challenges a pipeline step: explain what the step did, why that approach was chosen, and be honest about its limitations
- When corpus evidence contradicts or doesn't support a pipeline conclusion: say so — don't paper over gaps
- Distinguish clearly: "this is established neuroscience" vs "this is what this analysis found" vs "this is speculative"

HONEST LIMITATIONS TO ACKNOWLEDGE WHEN RELEVANT:
- Bayesian subtype priors count FST/CMS/LH model mentions in corpus chunks as a proxy for response evidence — they are not derived from observed response rates
- Efficacy signal thresholds (e.g. BDNF > 15 ng/mL) were synthesized by the Lumos AI pipeline from the top corpus chunks — corpus citation verification was not performed; the CORPUS EVIDENCE block for any given question is the way to check whether the source text actually contains that threshold
- Exploratory biomarkers are constrained to cite corpus documents but carry hallucination risk — treat as hypotheses requiring human expert verification before acting on them
- Confidence scores reflect corpus evidence consistency, not clinical validation; no human trial data has been collected yet
- The weighted source boost (1.20x for clinical trial docs) is a manually tuned design parameter, not a data-derived weight

FORMAT: Answer in 3–4 sentences. Expand to a short paragraph (5–6 sentences) only for genuinely complex mechanistic questions. Never restate or summarize the question. No preamble ("It's worth noting that...", "This is a complex topic..."). When corpus evidence has a specific value or threshold, cite it inline with the document title in quotes — do not paraphrase into vagueness. A tight 3–4 item bullet list is acceptable when it communicates better than prose (e.g. ranked predictors) — not in addition to prose. No markdown headers.${pageContext ? `\n\n${formatPageContextForPrompt(pageContext)}` : ''}`

  // ── Build message history ──────────────────────────────────────────────────────
  // Inject analysis context as a synthetic first exchange (done once, not per-turn)
  // Inject corpus evidence as part of the current user message (fresh per-turn)
  const currentUserContent = corpusBlock
    ? `${corpusBlock}\n\nQUESTION: ${message}`
    : message

  const messages: { role: 'user' | 'assistant'; content: string }[] = [
    {
      role: 'user',
      content: `Here is the complete analysis context for this study:\n\n${analysisContext}\n\nI have reviewed the full context. Ready for questions.`,
    },
    {
      role: 'assistant',
      content: `Understood — I have the complete Planning Phase${phase2Report ? ' and clinical' : ''} analysis context for ${study.drug_name} in ${study.indication}, including the methodology narrative, efficacy signals, phenotype profiles, and confidence scores. I also have ${corpusChunks.length} corpus passages retrieved for your first question. Go ahead.`,
    },
    ...history.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    { role: 'user', content: currentUserContent },
  ]

  // ── Stream response ────────────────────────────────────────────────────────────
  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    timeout: 5 * 60 * 1000,
  })

  const stream = await client.messages.stream({
    model: 'claude-sonnet-4-5',
    max_tokens: 2000,
    system: systemPrompt,
    messages,
  })

  // Send chunk count as a header so the client can show "grounded in N sources"
  const headers = new Headers({
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-cache',
    'X-Corpus-Sources': String(corpusChunks.length),
  })

  const readableStream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()
      try {
        for await (const event of stream) {
          if (
            event.type === 'content_block_delta' &&
            event.delta.type === 'text_delta'
          ) {
            controller.enqueue(encoder.encode(event.delta.text))
          }
        }
      } finally {
        controller.close()
      }
    },
  })

  return new Response(readableStream, { headers })
}
