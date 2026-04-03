import Anthropic from '@anthropic-ai/sdk'
import { PatientData, PhenotypeReport, MechanismContext, CompositeScore, BayesianPrior } from '@/lib/types'
import { MatchedChunk } from '@/lib/pipeline/search'

function getClient() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
}

function buildPatientSummary(data: PatientData): string {
  const treatments = data.prior_treatments
    .map(t => `${t.drug} ${t.dose_mg}mg (${t.duration_weeks}wk, response: ${t.response})`)
    .join('; ') || 'none'

  return `Patient profile for phenotyping analysis:
Age ${data.demographics.age}, ${data.demographics.sex}${data.demographics.weight_kg ? `, ${data.demographics.weight_kg}kg` : ''}.
Diagnosis: ${data.diagnosis.primary} (${data.diagnosis.severity}), ${data.diagnosis.episode_count} episode(s), ${data.diagnosis.duration_months} months duration, HAMD-17 score ${data.diagnosis.hamd_score}.
Prior treatments: ${treatments}.
Biomarkers: ${Object.entries(data.biomarkers).filter(([,v]) => v !== undefined).map(([k,v]) => `${k}: ${v}`).join(', ')}.
Genetics: ${Object.entries(data.genetics).filter(([,v]) => v !== undefined).map(([k,v]) => `${k}: ${v}`).join(', ')}.
Functional: sleep efficiency ${data.functional.sleep_efficiency_pct ?? 'N/A'}%, psychomotor retardation: ${data.functional.psychomotor_retardation ?? 'N/A'}, anhedonia: ${data.functional.anhedonia_present ?? 'N/A'}.`
}

function buildMechanismPreamble(ctx: MechanismContext | null): string {
  if (!ctx) return ''
  const receptors = ctx.receptor_profile
    .map(r => `${r.target}${r.ki_nm ? ` (Ki=${r.ki_nm}nM)` : ''}${r.selectivity_ratio ? ` ${r.selectivity_ratio}x selective` : ''}`)
    .join(', ')
  const pk = [
    ctx.pk_summary.half_life_h !== undefined ? `t½=${ctx.pk_summary.half_life_h}h` : '',
    ctx.pk_summary.bioavailability_pct !== undefined ? `F=${ctx.pk_summary.bioavailability_pct}%` : '',
    ctx.pk_summary.cmax_ng_ml !== undefined ? `Cmax=${ctx.pk_summary.cmax_ng_ml}ng/mL` : '',
  ].filter(Boolean).join(', ')

  return `DRUG MECHANISM CONTEXT (${ctx.drug_name}):
Mechanism: ${ctx.mechanism_class}
Receptor profile: ${receptors || 'see corpus'}
Neuroplasticity signal: ${ctx.neuroplasticity_signal}
PK summary: ${pk || 'see corpus'}
Safety signals: ${ctx.safety_signals.join('; ') || 'none flagged'}
Preclinical efficacy: ${ctx.efficacy_models.map(e => `${e.model}${e.effect_size !== undefined ? ` ES=${e.effect_size}` : ''}`).join(', ') || 'see corpus'}
`
}

function parseJson(rawOutput: string, label: string): unknown {
  const firstBrace = rawOutput.indexOf('{')
  const lastBrace = rawOutput.lastIndexOf('}')
  if (firstBrace === -1 || lastBrace === -1) {
    throw new Error(`No JSON object found in Claude response (${label}): ${rawOutput.slice(0, 200)}`)
  }
  const jsonString = rawOutput.slice(firstBrace, lastBrace + 1)
  try {
    return JSON.parse(jsonString)
  } catch (parseErr) {
    console.error(`[synthesize] JSON parse error (${label}):`, parseErr)
    console.error(`[synthesize] jsonString start:`, jsonString.slice(0, 300))
    console.error(`[synthesize] jsonString end:`, jsonString.slice(-300))
    throw new Error(`Failed to parse Claude response as JSON (${label}): ${rawOutput.slice(0, 200)}`)
  }
}

// ── CALL 1: Clinical analysis — Opus with full corpus chunks ────────────────
// Produces the core report fields that require deep corpus grounding.
function buildAnalysisPrompt(
  patientData: PatientData,
  chunks: MatchedChunk[],
  mechanismContext: MechanismContext | null,
  compositeScore: CompositeScore,
  bayesianPrior: BayesianPrior
): string {
  const patientSummary = buildPatientSummary(patientData)
  const mechanismPreamble = buildMechanismPreamble(mechanismContext)

  const excerpts = chunks
    .map((c, i) => `[${i + 1}] "${c.title}" (${c.source_type}${c.aspect ? `, aspect: ${c.aspect}` : ''}) — similarity: ${c.similarity.toFixed(3)}\n${c.content}`)
    .join('\n\n---\n\n')

  const priorSummary = `Subtype A (Acute-Responsive): α=${bayesianPrior.subtype_a.alpha}, β=${bayesianPrior.subtype_a.beta}, mean=${bayesianPrior.subtype_a.mean}
Subtype B (Stress-Sensitised): α=${bayesianPrior.subtype_b.alpha}, β=${bayesianPrior.subtype_b.beta}, mean=${bayesianPrior.subtype_b.mean}
Subtype C (Treatment-Resistant): α=${bayesianPrior.subtype_c.alpha}, β=${bayesianPrior.subtype_c.beta}, mean=${bayesianPrior.subtype_c.mean}
Basis: ${bayesianPrior.evidence_basis}`

  return `You are Lumos AI, a clinical research assistant specializing in pre-clinical patient phenotyping and treatment response prediction for neuroplastogen drug development.

${mechanismPreamble}
PRE-COMPUTED SCORES (do NOT re-derive these — interpret them in your analysis):
Composite biomarker-corpus alignment score: ${compositeScore.value}/100 — ${compositeScore.interpretation}
Bayesian subtype priors (Beta-Binomial from corpus evidence):
${priorSummary}

PATIENT DATA:
${patientSummary}

TOP MATCHED CORPUS EXCERPTS (${chunks.length} chunks, source-weighted cosine similarity):
${excerpts}

TASK:
Produce the core clinical phenotyping analysis. Ground every conclusion in the corpus excerpts above.

OUTPUT FORMAT — respond with valid JSON only, no prose outside the JSON:
{
  "responder_probability": 0.00,
  "confidence": 0.00,
  "phenotype_label": "",
  "executive_summary": "",
  "responder_profile": {
    "description": "",
    "biomarkers": [{ "name": "", "direction": "elevated|reduced|normal", "significance": "" }]
  },
  "nonresponder_profile": {
    "description": "",
    "biomarkers": [{ "name": "", "direction": "elevated|reduced|normal", "significance": "" }]
  },
  "key_biomarkers": [
    { "name": "", "patient_value": "", "reference_range": "", "interpretation": "" }
  ],
  "matched_corpus_refs": [
    { "title": "", "source_type": "", "excerpt": "", "relevance_note": "" }
  ],
  "methodology_notes": "",
  "recommendations": [""]
}

Rules:
- phenotype_label must be exactly: "High Responder", "Moderate Responder", or "Non-Responder"
- responder_probability and confidence must be numbers between 0.00 and 1.00
- matched_corpus_refs: cite 4–6 of the most relevant excerpts with specific relevance notes
- key_biomarkers: include all biomarkers present in the patient data`
}

// ── CALL 2: Extended narrative — Sonnet with core report as context ──────────
// Produces cross-species mapping, CRO prompts, in silico twin, drug mechanism.
// No raw chunks needed — works from the core report + mechanism context.
function buildExtendedPrompt(
  patientData: PatientData,
  mechanismContext: MechanismContext | null,
  compositeScore: CompositeScore,
  coreReport: Partial<PhenotypeReport>
): string {
  const patientSummary = buildPatientSummary(patientData)
  const mechanismPreamble = buildMechanismPreamble(mechanismContext)

  return `You are Lumos AI, a clinical research assistant specializing in pre-clinical patient phenotyping for neuroplastogen drug development.

${mechanismPreamble}
COMPOSITE SCORE: ${compositeScore.value}/100 — ${compositeScore.interpretation}

PATIENT DATA:
${patientSummary}

CORE ANALYSIS (already completed):
Phenotype: ${coreReport.phenotype_label} (responder probability: ${coreReport.responder_probability}, confidence: ${coreReport.confidence})
Summary: ${coreReport.executive_summary}
Key biomarkers: ${JSON.stringify(coreReport.key_biomarkers ?? [])}

TASK:
Using the core analysis above, generate the extended research fields below. These are narrative and structured synthesis — do not repeat the core fields.

OUTPUT FORMAT — respond with valid JSON only, no prose outside the JSON:
{
  "cross_species_mapping": [
    {
      "animal_model": "",
      "human_subtype": "",
      "signal_strength": "strong|moderate|weak",
      "key_features": [""]
    }
  ],
  "cro_screening_prompts": [
    {
      "category": "",
      "prompts": [""]
    }
  ],
  "in_silico_twin": {
    "projections": [
      { "analog": "", "responder_overlap_pct": 0, "nonresponder_overlap_pct": 0 }
    ],
    "phenotype_shape": ""
  },
  "drug_mechanism": {
    "drug_name": "",
    "mechanism_class": "",
    "receptor_profile": [{ "target": "", "ki_nm": null, "selectivity_ratio": null }],
    "neuroplasticity_signal": "",
    "pk_summary": { "half_life_h": null, "bioavailability_pct": null, "cmax_ng_ml": null },
    "safety_signals": [""],
    "efficacy_models": [{ "model": "", "effect_size": null, "p_value": null }],
    "analog_overlaps": [{ "drug": "", "overlap_pct": 0, "shared_mechanisms": [""] }]
  }
}

Rules:
- cross_species_mapping: identify 2–3 animal models from the drug mechanism context and map each to a human MDD subtype
- cro_screening_prompts: provide 4–6 categories (e.g. Anhedonia, Sleep, Biomarkers, Treatment History, Neuroimaging, Genetics) with 2–4 specific screening questions each
- in_silico_twin.projections: estimate overlap % for psilocybin, ketamine, and XYL-1001. XYL-1001 is the drug being evaluated — its projection must reflect the specific patient's biomarker profile against the XYL-1001 IND corpus data. If the patient has strong non-responder signals for XYL-1001 (e.g. high TNF-α, met/met BDNF genotype), XYL-1001 responder_overlap_pct should be lower than the analog drugs, not higher
- drug_mechanism: populate from the DRUG MECHANISM CONTEXT above; fill numeric fields where data exists, null where not available`
}

export async function synthesizeReport(
  patientData: PatientData,
  chunks: MatchedChunk[],
  mechanismContext: MechanismContext | null,
  compositeScore: CompositeScore,
  bayesianPrior: BayesianPrior
): Promise<{ report: PhenotypeReport; rawOutput: string }> {
  const client = getClient()

  // ── Call 1: Core clinical analysis (Opus + full chunks) ───────────────────
  const analysisPrompt = buildAnalysisPrompt(patientData, chunks, mechanismContext, compositeScore, bayesianPrior)

  const analysisMessage = await client.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 6000,
    system: 'You are a clinical research assistant. Always respond with raw JSON only — no markdown, no code fences, no prose before or after the JSON object.',
    messages: [
      { role: 'user', content: analysisPrompt },
      { role: 'assistant', content: '{' },
    ],
  })

  if (analysisMessage.stop_reason === 'max_tokens') {
    throw new Error('Call 1 (core analysis) hit max_tokens limit — response was truncated. Reduce chunk count or output field verbosity.')
  }

  const rawCore = '{' + analysisMessage.content
    .filter(b => b.type === 'text')
    .map(b => (b as { type: 'text'; text: string }).text)
    .join('')

  const coreReport = parseJson(rawCore, 'core') as Partial<PhenotypeReport>

  // ── Call 2: Extended narrative fields (Sonnet — no chunks needed) ─────────
  const extendedPrompt = buildExtendedPrompt(patientData, mechanismContext, compositeScore, coreReport)

  const extendedMessage = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 5000,
    system: 'You are a clinical research assistant. Always respond with raw JSON only — no markdown, no code fences, no prose before or after the JSON object.',
    messages: [
      { role: 'user', content: extendedPrompt },
      { role: 'assistant', content: '{' },
    ],
  })

  if (extendedMessage.stop_reason === 'max_tokens') {
    throw new Error('Call 2 (extended fields) hit max_tokens limit — response was truncated.')
  }

  const rawExtended = '{' + extendedMessage.content
    .filter(b => b.type === 'text')
    .map(b => (b as { type: 'text'; text: string }).text)
    .join('')

  const extendedFields = parseJson(rawExtended, 'extended') as Partial<PhenotypeReport>

  // ── Merge both outputs into a single PhenotypeReport ─────────────────────
  const report: PhenotypeReport = {
    ...(coreReport as PhenotypeReport),
    cross_species_mapping: extendedFields.cross_species_mapping ?? [],
    cro_screening_prompts: extendedFields.cro_screening_prompts ?? [],
    in_silico_twin: extendedFields.in_silico_twin ?? undefined,
    drug_mechanism: extendedFields.drug_mechanism ?? undefined,
  }

  return { report, rawOutput: rawCore + '\n\n---EXTENDED---\n\n' + rawExtended }
}
