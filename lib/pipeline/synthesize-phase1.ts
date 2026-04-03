import Anthropic from '@anthropic-ai/sdk'
import { MechanismContext, BayesianPrior } from '@/lib/types'
import { MatchedChunk } from '@/lib/pipeline/search'
import { computeMaxTokens } from '@/lib/pipeline/tokens'

function getClient() {
  return new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    timeout: 30 * 60 * 1000, // 30 minutes — bypasses SDK's 10-min non-streaming guard
  })
}

function parseJson(rawOutput: string, label: string): unknown {
  const firstBrace = rawOutput.indexOf('{')
  const lastBrace = rawOutput.lastIndexOf('}')
  if (firstBrace === -1 || lastBrace === -1) {
    throw new Error(`No JSON found in Claude response (${label}): ${rawOutput.slice(0, 200)}`)
  }
  const jsonString = rawOutput.slice(firstBrace, lastBrace + 1)
  try {
    return JSON.parse(jsonString)
  } catch {
    throw new Error(`Failed to parse Claude response as JSON (${label}): ${rawOutput.slice(0, 300)}`)
  }
}

function buildMechanismPreamble(ctx: MechanismContext | null, drugName: string): string {
  if (!ctx) return `Drug: ${drugName}\nNo pre-extracted mechanism context available — derive from corpus.\n`
  const receptors = ctx.receptor_profile
    .map(r => `${r.target}${r.ki_nm ? ` Ki=${r.ki_nm}nM` : ''}${r.selectivity_ratio ? ` ${r.selectivity_ratio}x selective` : ''}`)
    .join(', ')
  const pk = [
    ctx.pk_summary.half_life_h !== undefined ? `t½=${ctx.pk_summary.half_life_h}h` : '',
    ctx.pk_summary.bioavailability_pct !== undefined ? `F=${ctx.pk_summary.bioavailability_pct}%` : '',
  ].filter(Boolean).join(', ')

  return `DRUG: ${ctx.drug_name}
Mechanism class: ${ctx.mechanism_class}
Receptor profile: ${receptors || 'see corpus'}
Neuroplasticity signal: ${ctx.neuroplasticity_signal}
PK summary: ${pk || 'see corpus'}
Safety signals: ${ctx.safety_signals.join('; ') || 'none flagged'}
Preclinical efficacy: ${ctx.efficacy_models.map(e => `${e.model}${e.effect_size !== undefined ? ` ES=${e.effect_size}` : ''}`).join(', ') || 'see corpus'}
`
}

// ── CALL 1: Phenotype characterization (Opus + full corpus) ──────────────────
function buildPhenotypePrompt(
  drugName: string,
  indication: string,
  chunks: MatchedChunk[],
  mechanismContext: MechanismContext | null,
  bayesianPrior: BayesianPrior
): string {
  const mechPreamble = buildMechanismPreamble(mechanismContext, drugName)

  const excerpts = chunks
    .slice(0, 20)
    .map((c, i) => `[${i + 1}] "${c.title}" (${c.source_type}${c.aspect ? `, aspect: ${c.aspect}` : ''}) — similarity: ${c.similarity.toFixed(3)}\n${c.content}`)
    .join('\n\n---\n\n')

  const priorSummary = `Subtype A (Acute-Responsive / FST-like): α=${bayesianPrior.subtype_a.alpha}, β=${bayesianPrior.subtype_a.beta}, posterior mean=${bayesianPrior.subtype_a.mean}
Subtype B (Stress-Sensitised / CMS-like): α=${bayesianPrior.subtype_b.alpha}, β=${bayesianPrior.subtype_b.beta}, posterior mean=${bayesianPrior.subtype_b.mean}
Subtype C (Treatment-Resistant / LH-like): α=${bayesianPrior.subtype_c.alpha}, β=${bayesianPrior.subtype_c.beta}, posterior mean=${bayesianPrior.subtype_c.mean}
Evidence basis: ${bayesianPrior.evidence_basis}`

  return `You are Lumos AI, a precision neuroscience platform used by Headlamp Health to generate pre-clinical phenotyping reports for drug companies running neuroplastogen trials.

${mechPreamble}

BAYESIAN SUBTYPE PRIORS (computed from corpus animal-model evidence):
${priorSummary}

TOP MATCHED CORPUS EXCERPTS (${chunks.length} chunks, multi-aspect weighted search):
${excerpts}

TASK:
This is a PRE-CLINICAL analysis for ${drugName} in ${indication}. There is NO patient-level data yet.
Based entirely on the corpus evidence above, characterize the predicted responder and non-responder phenotypes for ${drugName}.

For each phenotype profile, derive specific, evidence-grounded predictions across five dimensions:
- DEMOGRAPHICS: age range, sex distribution, illness duration, episode history
- CORE CLINICAL: primary symptom clusters, severity markers, key rating scale thresholds (MADRS, HAMD-17)
- INFLAMMATORY: cytokine profiles, CRP thresholds, inflammatory subtype classification
- NEUROPLASTICITY: BDNF thresholds, TrkB signaling capacity, relevant genotype markers
- IMAGING: fMRI DMN patterns, EEG markers if supported by corpus

Ground every claim in specific corpus evidence. Use exact thresholds where the corpus provides them.
Assign a corpus_hypothesis_confidence (0.0–1.0) reflecting how strongly the corpus supports each profile.

OUTPUT FORMAT — respond with valid JSON only, no prose outside the JSON:
{
  "responder_profile": {
    "corpus_hypothesis_confidence": 0.00,
    "summary": "",
    "demographics": "",
    "core_clinical": "",
    "inflammatory": "",
    "neuroplasticity": "",
    "imaging": "",
    "key_inclusion_criteria": [""],
    "primary_subtype": "A|B|A+B"
  },
  "nonresponder_profile": {
    "corpus_hypothesis_confidence": 0.00,
    "summary": "",
    "demographics": "",
    "core_clinical": "",
    "inflammatory": "",
    "neuroplasticity": "",
    "imaging": "",
    "key_exclusion_criteria": [""],
    "primary_subtype": "C"
  },
  "cross_species_evidence": [
    {
      "animal_model": "",
      "human_subtype_mapping": "",
      "signal_strength": "strong|moderate|weak",
      "key_biomarker_signals": [""],
      "corpus_ref": ""
    }
  ],
  "safety_flags": [
    {
      "signal": "",
      "source": "",
      "severity": "high|medium|low",
      "clinical_implication": ""
    }
  ],
  "methodology_narrative": "",
  "overall_confidence": 0.00
}`
}

// ── CALL 2: Biomarker protocol (Sonnet — structured recommendation table) ────
function buildBiomarkerPrompt(
  drugName: string,
  indication: string,
  mechanismContext: MechanismContext | null,
  coreReport: Record<string, unknown>
): string {
  const mechPreamble = buildMechanismPreamble(mechanismContext, drugName)

  return `You are Lumos AI generating a prioritized biomarker collection protocol for a Phase 1 clinical trial of ${drugName} in ${indication}.

${mechPreamble}

PHENOTYPE PROFILES ALREADY DERIVED:
Responder summary: ${(coreReport.responder_profile as Record<string,unknown>)?.summary ?? ''}
Non-responder summary: ${(coreReport.nonresponder_profile as Record<string,unknown>)?.summary ?? ''}

TASK:
Generate a ranked biomarker collection protocol for the Phase 1 clinical trial.
For each biomarker, provide:
- The preclinical rationale grounded in the drug mechanism
- A specific threshold signal (what value = responder signal vs non-responder signal)
- Recommended collection timing (which trial visits)
- Collection method (standard clinical test)
- Priority score (0–100) based on preclinical signal strength

Focus on biomarkers with the strongest mechanistic rationale for ${drugName} specifically.
Include 6–9 biomarkers spanning inflammatory, neuroplasticity, behavioral, and imaging domains.

OUTPUT FORMAT — respond with valid JSON only, no prose outside the JSON:
{
  "biomarker_recommendations": [
    {
      "rank": 1,
      "name": "",
      "unit": "",
      "preclinical_rationale": "",
      "threshold_signal": "",
      "responder_threshold": "",
      "nonresponder_threshold": "",
      "timing": ["Baseline", "Wk 2", "Wk 4", "Wk 8"],
      "collection_method": "",
      "priority_pct": 0,
      "domain": "inflammatory|neuroplasticity|behavioral|imaging|genetic"
    }
  ],
  "protocol_notes": "",
  "primary_endpoint_recommendation": "",
  "early_response_indicator": ""
}`
}

export interface Phase1ReportData {
  responder_profile: {
    corpus_hypothesis_confidence: number
    summary: string
    demographics: string
    core_clinical: string
    inflammatory: string
    neuroplasticity: string
    imaging: string
    key_inclusion_criteria: string[]
    primary_subtype: string
  }
  nonresponder_profile: {
    corpus_hypothesis_confidence: number
    summary: string
    demographics: string
    core_clinical: string
    inflammatory: string
    neuroplasticity: string
    imaging: string
    key_exclusion_criteria: string[]
    primary_subtype: string
  }
  cross_species_evidence: {
    animal_model: string
    human_subtype_mapping: string
    signal_strength: string
    key_biomarker_signals: string[]
    corpus_ref: string
  }[]
  safety_flags: {
    signal: string
    source: string
    severity: string
    clinical_implication: string
  }[]
  biomarker_recommendations: {
    rank: number
    name: string
    unit: string
    preclinical_rationale: string
    threshold_signal: string
    responder_threshold: string
    nonresponder_threshold: string
    timing: string[]
    collection_method: string
    priority_pct: number
    domain: string
  }[]
  protocol_notes: string
  primary_endpoint_recommendation: string
  early_response_indicator: string
  methodology_narrative: string
  overall_confidence: number
}

export async function synthesizePhase1Report(
  drugName: string,
  indication: string,
  chunks: MatchedChunk[],
  mechanismContext: MechanismContext | null,
  bayesianPrior: BayesianPrior
): Promise<Phase1ReportData> {
  const client = getClient()

  // ── Call 1: Phenotype profiles (Opus + full corpus) ───────────────────────
  const phenotypePrompt = buildPhenotypePrompt(drugName, indication, chunks, mechanismContext, bayesianPrior)

  const phenotypeSystem = 'You are a clinical research assistant. Respond with raw JSON only — no markdown, no code fences, no prose before or after. Start your response with { and end with }.'
  const phenotypeMaxTokens = computeMaxTokens('claude-opus-4-6', phenotypePrompt, phenotypeSystem)
  console.log(`[synthesize-phase1] Opus max_tokens = ${phenotypeMaxTokens}, prompt chars = ${phenotypePrompt.length}`)
  const phenotypeStream = await client.messages.stream({
    model: 'claude-opus-4-6',
    max_tokens: phenotypeMaxTokens,
    system: phenotypeSystem,
    messages: [
      { role: 'user', content: phenotypePrompt },
    ],
  })

  const phenotypeMsg = await phenotypeStream.finalMessage()

  if (phenotypeMsg.stop_reason === 'max_tokens') {
    throw new Error('Phase 1 Call 1 (phenotype) hit max_tokens — response truncated.')
  }

  const rawPhenotype = phenotypeMsg.content
    .filter(b => b.type === 'text')
    .map(b => (b as { type: 'text'; text: string }).text)
    .join('')

  const coreReport = parseJson(rawPhenotype, 'phase1-phenotype') as Record<string, unknown>

  // ── Call 2: Biomarker protocol (Sonnet — compact, no chunks needed) ───────
  const biomarkerPrompt = buildBiomarkerPrompt(drugName, indication, mechanismContext, coreReport)

  const biomarkerSystem = 'You are a clinical research assistant. Respond with raw JSON only — no markdown, no code fences, no prose before or after. Start your response with { and end with }.'
  const biomarkerStream = await client.messages.stream({
    model: 'claude-sonnet-4-5',
    max_tokens: computeMaxTokens('claude-sonnet-4-5', biomarkerPrompt, biomarkerSystem),
    system: biomarkerSystem,
    messages: [
      { role: 'user', content: biomarkerPrompt },
    ],
  })

  const biomarkerMsg = await biomarkerStream.finalMessage()

  if (biomarkerMsg.stop_reason === 'max_tokens') {
    throw new Error('Phase 1 Call 2 (biomarker protocol) hit max_tokens — response truncated.')
  }

  const rawBiomarker = biomarkerMsg.content
    .filter(b => b.type === 'text')
    .map(b => (b as { type: 'text'; text: string }).text)
    .join('')

  const biomarkerReport = parseJson(rawBiomarker, 'phase1-biomarker') as Record<string, unknown>

  return {
    ...(coreReport as Omit<Phase1ReportData, 'biomarker_recommendations' | 'protocol_notes' | 'primary_endpoint_recommendation' | 'early_response_indicator'>),
    ...(biomarkerReport as Pick<Phase1ReportData, 'biomarker_recommendations' | 'protocol_notes' | 'primary_endpoint_recommendation' | 'early_response_indicator'>),
  }
}
