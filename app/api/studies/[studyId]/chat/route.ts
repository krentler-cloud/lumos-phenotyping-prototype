import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createServiceClient } from '@/lib/supabase/server'
import { Phase1ReportData } from '@/lib/pipeline/synthesize-phase1'

interface ChatHistoryMessage {
  role: 'user' | 'assistant'
  content: string
}

function buildContextBlock(
  drugName: string,
  indication: string,
  sponsor: string,
  phase1Report: Phase1ReportData | null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  phase2Report: Record<string, any> | null
): string {
  const lines: string[] = [
    '=== ANALYSIS CONTEXT ===',
    `Drug: ${drugName}`,
    `Indication: ${indication}`,
    `Sponsor: ${sponsor}`,
    '',
  ]

  if (phase1Report) {
    lines.push('--- PRE-CLINICAL ANALYSIS (Phase 1) ---')
    lines.push(`Overall confidence: ${Math.round(phase1Report.overall_confidence * 100)}%`)
    lines.push('')

    if (phase1Report.responder_profile) {
      lines.push(`Predicted responder subtype: ${phase1Report.responder_profile.primary_subtype}`)
      lines.push(`Responder confidence: ${Math.round(phase1Report.responder_profile.corpus_hypothesis_confidence * 100)}%`)
      lines.push(`Responder summary: ${phase1Report.responder_profile.summary}`)
      lines.push(`Responder — demographics: ${phase1Report.responder_profile.demographics}`)
      lines.push(`Responder — inflammatory: ${phase1Report.responder_profile.inflammatory}`)
      lines.push(`Responder — neuroplasticity: ${phase1Report.responder_profile.neuroplasticity}`)
      lines.push('')
    }

    if (phase1Report.nonresponder_profile) {
      lines.push(`Predicted non-responder subtype: ${phase1Report.nonresponder_profile.primary_subtype}`)
      lines.push(`Non-responder confidence: ${Math.round(phase1Report.nonresponder_profile.corpus_hypothesis_confidence * 100)}%`)
      lines.push(`Non-responder summary: ${phase1Report.nonresponder_profile.summary}`)
      lines.push(`Non-responder — inflammatory: ${phase1Report.nonresponder_profile.inflammatory}`)
      lines.push(`Non-responder — neuroplasticity: ${phase1Report.nonresponder_profile.neuroplasticity}`)
      lines.push('')
    }

    if (phase1Report.biomarker_recommendations?.length) {
      lines.push('Efficacy signals (ranked):')
      phase1Report.biomarker_recommendations
        .sort((a, b) => a.rank - b.rank)
        .forEach(bm => {
          lines.push(`  ${bm.rank}. ${bm.name} (${bm.domain}) — priority: ${bm.priority_pct}%`)
          lines.push(`     Rationale: ${bm.preclinical_rationale}`)
          lines.push(`     Responder threshold: ${bm.responder_threshold}`)
          lines.push(`     Non-responder threshold: ${bm.nonresponder_threshold}`)
        })
      lines.push('')
    }

    if (phase1Report.cross_species_evidence?.length) {
      lines.push('Cross-species evidence:')
      phase1Report.cross_species_evidence.forEach(ev => {
        lines.push(`  - ${ev.animal_model} → ${ev.human_subtype_mapping} [${ev.signal_strength}]`)
        if (ev.corpus_ref) lines.push(`    Source: ${ev.corpus_ref}`)
      })
      lines.push('')
    }

    if (phase1Report.safety_flags?.length) {
      lines.push('Safety signals:')
      phase1Report.safety_flags.forEach(f => {
        lines.push(`  - ${f.signal} [${f.severity}]: ${f.clinical_implication}`)
      })
      lines.push('')
    }

    if (phase1Report.exploratory_biomarkers?.length) {
      lines.push('Exploratory biomarkers (hypothesis-generating, not validated):')
      phase1Report.exploratory_biomarkers.forEach(bm => {
        lines.push(`  - ${bm.name} (${bm.biomarker_class}, ${bm.evidence_level}): ${bm.rationale}`)
      })
      lines.push('')
    }
  } else {
    lines.push('Pre-clinical analysis: not yet complete.')
    lines.push('')
  }

  if (phase2Report) {
    lines.push('--- CLINICAL ANALYSIS (Phase 2) ---')
    const ml = phase2Report.ml_result
    if (ml) {
      lines.push(`Predicted subtype: ${ml.predicted_subtype ?? 'unknown'}`)
      lines.push(`Confidence score: ${ml.confidence_score !== undefined ? Math.round(ml.confidence_score * 100) + '%' : 'unknown'}`)
      if (ml.bayesian_posterior) {
        const bp = ml.bayesian_posterior
        lines.push(`Bayesian posterior: Subtype A=${bp.subtype_a !== undefined ? Math.round(bp.subtype_a * 100) + '%' : '?'}, B=${bp.subtype_b !== undefined ? Math.round(bp.subtype_b * 100) + '%' : '?'}, C=${bp.subtype_c !== undefined ? Math.round(bp.subtype_c * 100) + '%' : '?'}`)
      }
      if (ml.shap_values?.length) {
        lines.push('SHAP feature attributions (top features):')
        const top = [...ml.shap_values]
          .sort((a: { value: number }, b: { value: number }) => Math.abs(b.value) - Math.abs(a.value))
          .slice(0, 6)
        top.forEach((s: { feature: string; value: number }) => {
          lines.push(`  ${s.feature}: ${s.value > 0 ? '+' : ''}${s.value.toFixed(3)}`)
        })
      }
    }
    if (phase2Report.executive_summary) {
      lines.push(`Clinical executive summary: ${phase2Report.executive_summary}`)
    }
    lines.push('')
  } else {
    lines.push('Clinical analysis: not yet complete.')
    lines.push('')
  }

  lines.push('=== END CONTEXT ===')
  return lines.join('\n')
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ studyId: string }> }
) {
  const { studyId } = await params

  let body: { message: string; history?: ChatHistoryMessage[] }
  try {
    body = await req.json()
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }

  const { message, history = [] } = body
  if (!message?.trim()) return new Response('message required', { status: 400 })

  const supabase = createServiceClient()

  // Fetch study
  const { data: study } = await supabase
    .from('studies')
    .select('drug_name, indication, sponsor, phase1_run_id, phase2_run_id')
    .eq('id', studyId)
    .single()

  if (!study) return new Response('Study not found', { status: 404 })

  // Fetch Phase 1 report
  let phase1Report: Phase1ReportData | null = null
  if (study.phase1_run_id) {
    const { data: p1Row } = await supabase
      .from('phase1_reports')
      .select('report_data')
      .eq('run_id', study.phase1_run_id)
      .single()
    if (p1Row) phase1Report = p1Row.report_data as Phase1ReportData
  }

  // Fetch Phase 2 report
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let phase2Report: Record<string, any> | null = null
  if (study.phase2_run_id) {
    const { data: p2Row } = await supabase
      .from('phase2_reports')
      .select('report_data')
      .eq('study_id', studyId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    if (p2Row) phase2Report = p2Row.report_data as Record<string, unknown>
  }

  const contextBlock = buildContextBlock(
    study.drug_name,
    study.indication,
    study.sponsor,
    phase1Report,
    phase2Report
  )

  const systemPrompt = `You are a clinical AI assistant embedded in the Lumos AI platform by Headlamp Health.
You answer questions about a specific pre-clinical and/or clinical analysis for a named drug and indication.

Rules:
- Only cite evidence from the provided analysis context. Do not introduce external knowledge as if it were from this analysis.
- When referencing biomarkers, quote exact thresholds and confidence values from the context.
- If asked about something not covered in the context, say so clearly and explain what data would be needed.
- Be concise and precise. Responses should be 2–4 short paragraphs maximum unless a list is genuinely more useful.
- Do not use markdown headers. Plain prose and occasional bullet lists only.
- You may acknowledge general scientific knowledge to explain mechanisms, but always anchor back to what the analysis actually found.`

  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    timeout: 5 * 60 * 1000,
  })

  // Build messages: inject context as a synthetic first exchange
  const messages: { role: 'user' | 'assistant'; content: string }[] = [
    {
      role: 'user',
      content: `Here is the full analysis context for this study:\n\n${contextBlock}\n\nI understand. I'm ready to answer questions about this analysis.`,
    },
    {
      role: 'assistant',
      content: `Understood. I have the complete pre-clinical${phase2Report ? ' and clinical' : ''} analysis context for ${study.drug_name} in ${study.indication}. I'm ready to answer your questions — I'll ground all responses in what this analysis actually found.`,
    },
    ...history.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    { role: 'user', content: message },
  ]

  const stream = await client.messages.stream({
    model: 'claude-sonnet-4-5',
    max_tokens: 1500,
    system: systemPrompt,
    messages,
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

  return new Response(readableStream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
