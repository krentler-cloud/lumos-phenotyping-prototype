import Anthropic from '@anthropic-ai/sdk'
import { MechanismContext, BayesianPrior, ExploratoryBiomarker } from '@/lib/types'
import { MatchedChunk, MultiAspectSearchStats } from '@/lib/pipeline/search'
import { computeMaxTokens } from '@/lib/pipeline/tokens'

// SCIENCE-FEEDBACK: P1-F — SAD/MAD cohort type for synthesis injection
export interface SadMadCohort {
  phase: 'SAD' | 'MAD'
  cohort_name: string
  dose_mg: number
  n_active: number
  status: string
  cmax_mean_ng_ml?: number | null
  half_life_mean_h?: number | null
  bioavailability_pct?: number | null
  accumulation_ratio?: number | null
  bdnf_pct_change_day14?: number | null
  bdnf_p_value?: number | null
  il6_pct_change_day14?: number | null
  crp_pct_change_day14?: number | null
  ae_rate_pct: number
  ae_max_grade: number
  discontinuations: number
  ae_description?: string | null
}

// SCIENCE-FEEDBACK: P1-F — build a concise SAD/MAD summary block for the synthesis prompt
function buildSadMadBlock(cohorts: SadMadCohort[]): string {
  if (!cohorts || cohorts.length === 0) return ''

  const sadRows = cohorts.filter(c => c.phase === 'SAD')
  const madRows = cohorts.filter(c => c.phase === 'MAD')

  const sadLines = sadRows.map(c =>
    `  ${c.cohort_name}: Cmax=${c.cmax_mean_ng_ml ?? '—'} ng/mL, t½=${c.half_life_mean_h ?? '—'}h, F=${c.bioavailability_pct ?? '—'}%, AE rate=${c.ae_rate_pct}% (max grade ${c.ae_max_grade}), discontinuations=${c.discontinuations}${c.ae_description ? ` [${c.ae_description}]` : ''}`
  ).join('\n')

  const madLines = madRows.map(c =>
    `  ${c.cohort_name}: Cmax=${c.cmax_mean_ng_ml ?? '—'} ng/mL, accum ratio=${c.accumulation_ratio ?? '—'}, BDNF Δ=${c.bdnf_pct_change_day14 != null ? `+${c.bdnf_pct_change_day14}%` : '—'} (p=${c.bdnf_p_value ?? '—'}), IL-6 Δ=${c.il6_pct_change_day14 != null ? `${c.il6_pct_change_day14}%` : '—'}, CRP Δ=${c.crp_pct_change_day14 != null ? `${c.crp_pct_change_day14}%` : '—'}, AE rate=${c.ae_rate_pct}% (max grade ${c.ae_max_grade}), status=${c.status}`
  ).join('\n')

  const sections = []
  if (sadLines) sections.push(`SAD (Single Ascending Dose) — PK Summary:\n${sadLines}`)
  if (madLines) sections.push(`MAD (Multiple Ascending Dose, 14-day) — PD + Safety:\n${madLines}`)

  return `\nHUMAN PHASE 1 SAD/MAD DATA (actual XYL-1001 clinical data — integrate with corpus predictions):\n${sections.join('\n\n')}\n`
}

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

// ── Evidence Compression (Sonnet, parallel by aspect) ──────────────────────────

export interface EvidenceFinding {
  claim: string
  threshold_or_value: string
  doc_title: string
  source_type: string
  study_quality: string  // RCT, observational, animal, meta-analysis, case_report
  sample_size?: string
  p_value?: string
  contradicts?: string   // Note if this contradicts another finding
}

export interface DimensionBrief {
  dimension: string         // e.g. "responder_profile"
  findings: EvidenceFinding[]
  summary: string           // 2-3 sentence synthesis
  chunk_count: number
}

export interface EvidenceBrief {
  dimension_briefs: DimensionBrief[]
  total_chunks_analyzed: number
  compression_ratio: string
}

/**
 * Compress reranked chunks into a structured evidence brief using parallel Sonnet calls.
 * Splits chunks by aspect tag into 4 groups, each processed independently.
 * Output is ~3,000-5,000 tokens — much smaller than raw chunks (~25K+).
 */
export async function compressToEvidenceBrief(
  chunks: MatchedChunk[],
  drugName: string,
  indication: string,
  onProgress?: (detail: string) => Promise<void>
): Promise<EvidenceBrief> {
  const client = getClient()

  // Split chunks into groups by aspect tag
  const groups: Record<string, MatchedChunk[]> = {}
  for (const chunk of chunks) {
    const key = chunk.aspect ?? 'untagged'
    if (!groups[key]) groups[key] = []
    groups[key].push(chunk)
  }

  // Redistribute untagged chunks round-robin to smallest groups
  const untagged = groups['untagged'] ?? []
  delete groups['untagged']
  const groupKeys = Object.keys(groups)
  if (groupKeys.length > 0) {
    for (let i = 0; i < untagged.length; i++) {
      const smallest = groupKeys.reduce((a, b) => groups[a].length <= groups[b].length ? a : b)
      groups[smallest].push(untagged[i])
    }
  }

  const startTime = Date.now()

  // Build parallel Sonnet calls — one per aspect group
  const dimensionPromises = Object.entries(groups).map(async ([aspect, aspectChunks]) => {
    const excerpts = aspectChunks
      .map((c, i) => `[${i + 1}] "${c.title}" (${c.source_type})\n${c.content.slice(0, 600)}`)
      .join('\n\n---\n\n')

    const prompt = `You are extracting structured evidence findings from scientific corpus excerpts about ${drugName} in ${indication}.

ASPECT: ${aspect}
EXCERPTS (${aspectChunks.length} chunks):
${excerpts}

TASK:
Extract every quantitative finding relevant to patient phenotyping and treatment response. For each finding, capture:
- The specific claim or observation
- Any threshold value, effect size, Ki value, p-value, or sample size
- The source document title (exactly as shown in brackets)
- Study quality: RCT, observational, animal_model, meta-analysis, case_report, or review
- Note contradictions between studies explicitly

OUTPUT FORMAT — respond with valid JSON only:
{
  "findings": [
    {
      "claim": "specific finding",
      "threshold_or_value": "quantitative value if present, empty string if qualitative",
      "doc_title": "exact document title",
      "source_type": "clinical_trial|literature|regulatory",
      "study_quality": "RCT|observational|animal_model|meta-analysis|case_report|review",
      "sample_size": "N=X if reported",
      "p_value": "p=X if reported",
      "contradicts": "note if this contradicts another finding in this set"
    }
  ],
  "summary": "2-3 sentence synthesis of the key findings from this aspect group"
}`

    const system = 'Extract structured evidence findings. Respond with raw JSON only — no markdown, no code fences.'
    const maxTokens = computeMaxTokens('claude-sonnet-4-5', prompt, system)

    const stream = await client.messages.stream({
      model: 'claude-sonnet-4-5',
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: prompt }],
    })

    const msg = await stream.finalMessage()
    const raw = msg.content
      .filter(b => b.type === 'text')
      .map(b => (b as { type: 'text'; text: string }).text)
      .join('')

    const parsed = parseJson(raw, `evidence-${aspect}`) as {
      findings: EvidenceFinding[]
      summary: string
    }

    return {
      dimension: aspect,
      findings: parsed.findings ?? [],
      summary: parsed.summary ?? '',
      chunk_count: aspectChunks.length,
    } as DimensionBrief
  })

  if (onProgress) {
    await onProgress(`compressing ${chunks.length} chunks across ${Object.keys(groups).length} dimensions...`)
  }

  const dimensionBriefs = await Promise.all(dimensionPromises)

  const durationSec = Math.round((Date.now() - startTime) / 1000)
  const totalFindings = dimensionBriefs.reduce((n, d) => n + d.findings.length, 0)

  return {
    dimension_briefs: dimensionBriefs,
    total_chunks_analyzed: chunks.length,
    compression_ratio: `${chunks.length} chunks → ${totalFindings} findings (${durationSec}s)`,
  }
}

/**
 * Format an EvidenceBrief as a text block for injection into the Opus prompt.
 */
function formatEvidenceBrief(brief: EvidenceBrief): string {
  return brief.dimension_briefs.map(d => {
    const findingLines = d.findings.map((f, i) => {
      const parts = [`  ${i + 1}. ${f.claim}`]
      if (f.threshold_or_value) parts.push(`     Value: ${f.threshold_or_value}`)
      parts.push(`     Source: "${f.doc_title}" (${f.source_type}, ${f.study_quality})`)
      if (f.sample_size) parts.push(`     N: ${f.sample_size}`)
      if (f.p_value) parts.push(`     p: ${f.p_value}`)
      if (f.contradicts) parts.push(`     ⚠ Contradicts: ${f.contradicts}`)
      return parts.join('\n')
    }).join('\n')
    return `── ${d.dimension.toUpperCase()} (${d.chunk_count} chunks analyzed) ──\nSummary: ${d.summary}\nFindings:\n${findingLines}`
  }).join('\n\n')
}

// ── CALL 1: Phenotype characterization (Opus + evidence brief) ─────────────────
function buildPhenotypePrompt(
  drugName: string,
  indication: string,
  chunks: MatchedChunk[],
  mechanismContext: MechanismContext | null,
  bayesianPrior: BayesianPrior,
  sadMadCohorts?: SadMadCohort[],
  evidenceBrief?: EvidenceBrief
): string {
  const mechPreamble = buildMechanismPreamble(mechanismContext, drugName)

  // When evidence brief is available, use structured findings instead of raw chunks
  const evidenceSection = evidenceBrief
    ? `STRUCTURED EVIDENCE BRIEF (compressed from ${evidenceBrief.total_chunks_analyzed} corpus chunks by Lumos AI evidence extraction):\n${formatEvidenceBrief(evidenceBrief)}`
    : chunks
        .map((c, i) => `[${i + 1}] "${c.title}" (${c.source_type}${c.aspect ? `, aspect: ${c.aspect}` : ''}) — similarity: ${c.similarity.toFixed(3)}\n${c.content}`)
        .join('\n\n---\n\n')

  const priorSummary = `Subtype A (Acute-Responsive / FST-like): α=${bayesianPrior.subtype_a.alpha}, β=${bayesianPrior.subtype_a.beta}, posterior mean=${bayesianPrior.subtype_a.mean}
Subtype B (Stress-Sensitised / CMS-like): α=${bayesianPrior.subtype_b.alpha}, β=${bayesianPrior.subtype_b.beta}, posterior mean=${bayesianPrior.subtype_b.mean}
Subtype C (Treatment-Resistant / LH-like): α=${bayesianPrior.subtype_c.alpha}, β=${bayesianPrior.subtype_c.beta}, posterior mean=${bayesianPrior.subtype_c.mean}
Evidence basis: ${bayesianPrior.evidence_basis}`

  // SCIENCE-FEEDBACK: P1-F — inject SAD/MAD human data when available
  const sadMadBlock = buildSadMadBlock(sadMadCohorts ?? [])

  // SCIENCE-FEEDBACK: P1-A — prompt label only; JSON field names (preclinical_rationale etc.) are intentionally preserved
  return `You are Lumos AI, a precision neuroscience platform used by Headlamp Health to generate Planning Phase phenotyping reports for drug companies running neuroplastogen trials.

${mechPreamble}

BAYESIAN SUBTYPE PRIORS (computed from corpus animal-model evidence):
${priorSummary}
${sadMadBlock}
${evidenceSection}

TASK:
This is a PLANNING PHASE analysis for ${drugName} in ${indication}.${sadMadCohorts && sadMadCohorts.length > 0 ? ' SAD/MAD human Phase 1 data is provided above — integrate actual PK, biomarker, and safety findings with corpus predictions. Where human data conflicts with corpus predictions, note the discordance explicitly.' : ' There is NO patient-level data yet.'}
Based entirely on the corpus evidence above, characterize the predicted responder and non-responder phenotypes for ${drugName}.

For each phenotype profile, derive specific, evidence-grounded predictions across five dimensions:
- DEMOGRAPHICS: age range, sex distribution, illness duration, episode history
- CORE CLINICAL: primary symptom clusters, severity markers, key rating scale thresholds (MADRS, HAMD-17)
- INFLAMMATORY: cytokine profiles, CRP thresholds, inflammatory subtype classification
- NEUROPLASTICITY: BDNF thresholds, TrkB signaling capacity, relevant genotype markers
- IMAGING: fMRI DMN patterns, EEG markers if supported by corpus

// FORMATTING: Dimension field format guidance
DIMENSION FIELD FORMAT (demographics, core_clinical, inflammatory, neuroplasticity, imaging):
Prefer 3–4 semicolon-separated data points per field — each citing a specific threshold, value, sex/age range, or measurable characteristic. Short prose fragments work when they read naturally as scan-able bullets. Avoid long flowing sentences — each point should stand alone as a data point.
Example: "Female-predominant (F:M ~2:1); Age 25–45 (median ~32); First or second MDD episode; No prior treatment resistance"

Ground every claim in specific corpus evidence. Use exact thresholds where the corpus provides them.
Assign a corpus_hypothesis_confidence (0.0–1.0) reflecting how strongly the corpus supports each profile.

// SCIENCE-FEEDBACK: P1-B — confidence score interpretation instruction
When reporting confidence scores, always include a one-sentence plain-English interpretation of what the score reflects in the methodology_narrative field (e.g., "strength of corpus evidence, not predicted probability of patient response"). Never present scores as standalone numbers without context.

// SCIENCE-FEEDBACK: P1-D — BDNF grey zone
For BDNF-based inclusion criteria, always address the grey zone between the inclusion threshold and exclusion threshold. If corpus evidence is insufficient to define a rule for intermediate values, flag this explicitly as an open protocol question in key_inclusion_criteria (e.g., "BDNF 15–25 ng/mL: indeterminate zone — protocol decision required").

// SCIENCE-FEEDBACK: P1-E — mixed phenotype tiebreaker
When generating phenotype classification criteria, always address patients who meet criteria for more than one subtype simultaneously. Either provide a hierarchical decision rule (e.g., biomarker profile takes precedence over treatment history when they conflict) or flag explicitly as a protocol gap in key_inclusion_criteria or key_exclusion_criteria. Do not leave mixed-phenotype patients unclassified.

// SCIENCE-FEEDBACK: F2-A — FDA safety requirements MOVED to Call 2 (Sonnet biomarker protocol)
// where they are more relevant to protocol design than phenotype characterization.

// SCIENCE-FEEDBACK: F2-B — behavioral profile dimensions
BEHAVIORAL PROFILE: For each phenotype's demographics field, include expected patterns for: sleep quality (ISI or PSQI score range), appetite and weight changes, alcohol intake, caffeine intake, and physical activity level. These behavioral features correlate with inflammatory and neuroplasticity biomarker states and are standard MDD clinical characterization.

// SCIENCE-FEEDBACK: F2-C — EEG specificity
For the imaging dimension, specifically address: quantitative EEG (qEEG) frontal alpha asymmetry as a responder predictor, sleep EEG architecture (REM latency, slow-wave sleep percentage), and any source localization findings if corpus evidence supports them. EEG biomarkers are increasingly relevant in MDD subtyping and neuroplastogen trials.

// SCIENCE-FEEDBACK: F2-D — sex-specific biomarker reference ranges
SEX-SPECIFIC REFERENCE RANGES: When reporting BDNF, CRP, and IL-6 thresholds in the neuroplasticity and inflammatory dimensions, note that established sex differences exist (BDNF is generally higher in premenopausal women; CRP and IL-6 vary with hormonal status and BMI). If applying uniform thresholds across sexes, flag this as a known limitation in methodology_narrative.

// SCIENCE-FEEDBACK: F2-E — Val66Met ancestry caveat
ANCESTRY CONSIDERATION: The BDNF Val66Met Met allele frequency varies by ancestry (~20–25% in European populations, ~40–50% in East Asian populations). Note in methodology_narrative that genotypic stratification will not behave uniformly across ancestry groups in diverse trial populations. Flag as a pharmacogenetic equity consideration.

// FORMATTING: Key criteria format guidance
KEY CRITERIA FORMAT (key_inclusion_criteria and key_exclusion_criteria arrays):
Keep criteria concise and quantitative. Aim for "[Biomarker/Feature] [threshold/condition]" format. Brief parenthetical context is acceptable when needed for clarity (e.g. "BDNF ≥ 25 ng/mL at screening (ELISA)"). Avoid full sentences or embedded rationale — criteria should be scannable, not explanatory.

// EXECUTIVE SUMMARY: Write a concise 3–4 sentence plain-English overview of the entire analysis for the executive_summary field. Cover: (1) which patient subtypes are predicted to respond and why in one sentence; (2) which patients should be excluded and the key risk in one sentence; (3) the single most important biomarker or screening criterion; (4) the overall level of corpus evidence support and its key limitation. Write for a clinical development lead — no jargon, no model names, no corpus references. This will appear at the top of the report as the first thing a reader sees.

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
  "executive_summary": "",
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

// SCIENCE-FEEDBACK: P1-C — BDNF efficacy signal contradiction guard
CRITICAL CONSISTENCY CHECK: If the corpus contains a warning or negative finding about using a specific biomarker as an efficacy marker (for example, Calder et al. 2025 meta-analysis found SMD=0.024, p=0.64 for post-dose peripheral BDNF as an efficacy endpoint), do NOT list that same biomarker as a positive responder signal without explicitly noting the contradiction in the preclinical_rationale field and explaining which evidence takes precedence and why. Silence on the contradiction is not acceptable — if you include a biomarker despite conflicting evidence, state the conflict directly.

// SCIENCE-FEEDBACK: F2-A — FDA-standard safety requirements for serotonergic MDD trials
// (Moved from Call 1 phenotype prompt — these are protocol/safety items, not phenotype dimensions)
SAFETY REQUIREMENTS (FDA standard for serotonergic MDD trials — include in protocol_notes):
1. SEROTONIN SYNDROME: For any 5-HT2A-active compound, address concomitant serotonergic medication risk. Specify required washout periods for SSRIs (≥2 weeks), SNRIs (≥2 weeks), and MAOIs (≥14 days minimum). Connect the non-responder 5-HT2A downregulation signal to the washout requirement — incomplete washout is both a safety hazard and a mechanistic confounder.
2. SUICIDALITY MONITORING: FDA requires prospective C-SSRS monitoring in all MDD trials regardless of mechanism. Include C-SSRS at baseline and post-dose timepoints in protocol_notes. MADRS Item 10 ≥5 as an exclusion criterion is necessary but insufficient without a prospective monitoring protocol.
3. PLACEBO RESPONSE RULE: MDD trials have 30–50% placebo response rates. State in protocol_notes what classification applies when a patient shows ≥50% MADRS reduction WITHOUT corresponding biomarker change (BDNF, IL-6, CRP).
4. FDA NOTES: Flag any class-level safety signals or black-box warnings relevant to the mechanism of action in protocol_notes.

// SCIENCE-FEEDBACK: F2-F — rater reliability and site qualification
RATER RELIABILITY: MADRS and HAMD-17 are sensitive to inter-rater variability and rater drift across sites. Include in protocol_notes a recommendation for rater certification requirements (structured interview training, inter-rater reliability checks at study initiation) and whether central rater review is recommended given the trial size and site count.

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
  executive_summary?: string
  methodology_narrative: string
  overall_confidence: number
  exploratory_biomarkers?: ExploratoryBiomarker[]
  corpus_intelligence?: CorpusIntelligence
  _opus_diagnostics?: {
    duration_sec: number
    input_tokens?: number
    output_tokens?: number
    stop_reason?: string | null
    prompt_chars: number
    max_tokens_budget: number
  }
}

export interface CorpusIntelligence {
  source_breakdown: { clinical_trial: number; regulatory: number; literature: number; internal: number }
  similarity_stats: { p50: number; p75: number; min: number; total_chunks: number }
  corpus_strengths: string[]
  corpus_gaps: string[]
  recommended_searches: string[]
  overall_verdict: string
}

export async function synthesizePhase1Report(
  drugName: string,
  indication: string,
  chunks: MatchedChunk[],
  mechanismContext: MechanismContext | null,
  bayesianPrior: BayesianPrior,
  sadMadCohorts?: SadMadCohort[],
  onProgress?: (detail: string) => Promise<void>,
  evidenceBrief?: EvidenceBrief
): Promise<Phase1ReportData> {
  const client = getClient()

  // ── Call 1: Phenotype profiles (Opus + evidence brief or raw chunks) ──────
  const phenotypePrompt = buildPhenotypePrompt(drugName, indication, chunks, mechanismContext, bayesianPrior, sadMadCohorts, evidenceBrief)

  const phenotypeSystem = 'You are a clinical research assistant. Respond with raw JSON only — no markdown, no code fences, no prose before or after. Start your response with { and end with }.'
  const phenotypeMaxTokens = computeMaxTokens('claude-opus-4-6', phenotypePrompt, phenotypeSystem)
  const estimatedInputTokens = Math.ceil(phenotypePrompt.length / 3.5)
  console.log(`[synthesize-phase1] Opus max_tokens = ${phenotypeMaxTokens}, prompt chars = ${phenotypePrompt.length}, est input tokens = ${estimatedInputTokens}`)

  const synthesisStartTime = Date.now()
  const MAX_ATTEMPTS = 3
  const STALL_TIMEOUT_MS = 60_000 // abort and retry if no tokens for 60 seconds
  const PROGRESS_INTERVAL_MS = 15_000

  let phenotypeMsg: Anthropic.Message | null = null

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController()
    const opusStartTime = Date.now()
    let outputChars = 0
    let lastProgressUpdate = 0
    let lastTokenTime = Date.now()

    // Stall detector: abort if no tokens arrive for 60 seconds
    const stallCheck = setInterval(() => {
      if (Date.now() - lastTokenTime > STALL_TIMEOUT_MS) {
        console.error(`[synthesize-phase1] Opus stalled — no tokens for ${STALL_TIMEOUT_MS / 1000}s (attempt ${attempt}/${MAX_ATTEMPTS}, ~${Math.round(outputChars / 4)} tokens generated)`)
        controller.abort()
      }
    }, 10_000)

    try {
      const phenotypeStream = await client.messages.stream(
        {
          model: 'claude-opus-4-6',
          max_tokens: phenotypeMaxTokens,
          system: phenotypeSystem,
          messages: [{ role: 'user', content: phenotypePrompt }],
        },
        { signal: controller.signal }
      )

      // Stream progress: count output chars, reset stall timer, periodically update step_log
      phenotypeStream.on('text', (text) => {
        outputChars += text.length
        lastTokenTime = Date.now()
        const now = lastTokenTime
        if (onProgress && now - lastProgressUpdate > PROGRESS_INTERVAL_MS) {
          lastProgressUpdate = now
          const elapsedSec = Math.round((now - opusStartTime) / 1000)
          const approxTokens = Math.round(outputChars / 4)
          const attemptLabel = attempt > 1 ? ` (attempt ${attempt})` : ''
          onProgress(`generating... ~${approxTokens.toLocaleString()} tokens (${elapsedSec}s)${attemptLabel}`).catch(() => {})
        }
      })

      phenotypeMsg = await phenotypeStream.finalMessage()
      clearInterval(stallCheck)
      break // success — exit retry loop
    } catch (err) {
      clearInterval(stallCheck)
      const msg = err instanceof Error ? err.message : 'Unknown error'
      const isAbort = msg.includes('abort') || msg.includes('Abort')
      if (isAbort && attempt < MAX_ATTEMPTS) {
        console.warn(`[synthesize-phase1] Opus stalled on attempt ${attempt}, retrying...`)
        if (onProgress) {
          await onProgress(`stalled at ~${Math.round(outputChars / 4)} tokens — retrying (attempt ${attempt + 1}/${MAX_ATTEMPTS})...`).catch(() => {})
        }
        // Brief pause before retry
        await new Promise(r => setTimeout(r, 2000))
        continue
      }
      throw err // non-stall error or max attempts exhausted
    }
  }

  if (!phenotypeMsg) throw new Error('Opus synthesis failed after all retry attempts')

  const opusDurationSec = Math.round((Date.now() - synthesisStartTime) / 1000)
  const usage = phenotypeMsg.usage
  console.log(`[synthesize-phase1] Opus done in ${opusDurationSec}s | input=${usage?.input_tokens} output=${usage?.output_tokens} stop=${phenotypeMsg.stop_reason}`)

  // Attach diagnostics to the report so they surface in step_log
  const _opusDiagnostics = {
    duration_sec: opusDurationSec,
    input_tokens: usage?.input_tokens,
    output_tokens: usage?.output_tokens,
    stop_reason: phenotypeMsg.stop_reason,
    prompt_chars: phenotypePrompt.length,
    max_tokens_budget: phenotypeMaxTokens,
  }

  if (phenotypeMsg.stop_reason === 'max_tokens') {
    throw new Error(`Phase 1 Call 1 (phenotype) hit max_tokens — response truncated. Diagnostics: input=${usage?.input_tokens} output=${usage?.output_tokens} duration=${opusDurationSec}s`)
  }

  const rawPhenotype = phenotypeMsg!.content
    .filter((b: { type: string }) => b.type === 'text')
    .map((b: { type: string; text?: string }) => b.text ?? '')
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
    _opus_diagnostics: _opusDiagnostics,
  }
}

// ── CALL 3: Exploratory biomarkers (Sonnet — supplemental, non-blocking) ──────
export async function synthesizeExploratoryBiomarkers(
  drugName: string,
  indication: string,
  chunks: MatchedChunk[],
  primaryReport: Phase1ReportData
): Promise<ExploratoryBiomarker[]> {
  const client = getClient()

  const alreadyValidated = (primaryReport.biomarker_recommendations ?? [])
    .map((b: { name: string; domain: string }) => `- ${b.name} (${b.domain})`)
    .join('\n')

  const excerpts = chunks
    .slice(0, 20)
    .map((c, i) => `[${i + 1}] "${c.title}" (${c.source_type}) — ${c.content.slice(0, 400)}`)
    .join('\n\n---\n\n')

  const prompt = `You are a translational neuroscience researcher at Headlamp AI analyzing pre-clinical corpus evidence for ${drugName} in ${indication}.

The primary efficacy signal panel has already been established. Your task is to identify EXPLORATORY biomarkers — signals that emerge from the corpus evidence that are NOT yet in the standard protocol and warrant hypothesis-driven investigation.

ALREADY ESTABLISHED EFFICACY SIGNALS (DO NOT REPEAT):
${alreadyValidated || '(none yet)'}

TOP CORPUS EXCERPTS:
${excerpts}

TASK:
Generate 6–8 exploratory biomarker hypotheses that:
- Appear in the corpus but are speculative or understudied relative to ${drugName}'s mechanism
- Draw from adjacent mechanisms: neuroinflammation, synaptic remodeling, HPA axis, circadian biology, microbiome-gut-brain axis, epigenetics
- Are clearly labeled as hypothesis-generating, not validated protocol markers

For each exploratory biomarker, cite the specific corpus document(s) that hint at the signal. Be precise about the learning objective — what measurement in what assay at what timepoint would test this hypothesis.

OUTPUT FORMAT — respond with valid JSON only, no markdown, no code fences:
{
  "exploratory_biomarkers": [
    {
      "name": "",
      "biomarker_class": "neuroinflammatory|synaptic plasticity|HPA axis|circadian|metabolic|genetic|imaging",
      "rationale": "",
      "evidence_level": "emerging|preclinical_only|theoretical",
      "corpus_refs": [""],
      "learning_objective": "",
      "feasibility": "high|moderate|low"
    }
  ]
}`

  const system = 'You are a clinical research assistant. Respond with raw JSON only — no markdown, no code fences, no prose before or after. Start your response with { and end with }.'
  // Sonnet is sufficient — this is a hypothesis brainstorm from 20 truncated chunks, not deep synthesis
  const stream = await client.messages.stream({
    model: 'claude-sonnet-4-5',
    max_tokens: computeMaxTokens('claude-sonnet-4-5', prompt, system),
    system,
    messages: [{ role: 'user', content: prompt }],
  })

  const msg = await stream.finalMessage()
  const raw = msg.content
    .filter(b => b.type === 'text')
    .map(b => (b as { type: 'text'; text: string }).text)
    .join('')

  const parsed = parseJson(raw, 'exploratory-biomarkers') as { exploratory_biomarkers?: unknown[] }
  return (parsed.exploratory_biomarkers ?? []) as ExploratoryBiomarker[]
}

// ── CALL 4: Corpus Intelligence (Sonnet — non-blocking, gap analysis) ──────────
export async function synthesizeCorpusIntelligence(
  drugName: string,
  indication: string,
  chunks: MatchedChunk[],
  searchStats: MultiAspectSearchStats
): Promise<CorpusIntelligence> {
  const client = getClient()

  // Compute source breakdown from actual chunks
  const source_breakdown = { clinical_trial: 0, regulatory: 0, literature: 0, internal: 0 }
  for (const chunk of chunks) {
    const t = chunk.source_type as keyof typeof source_breakdown
    if (t in source_breakdown) source_breakdown[t]++
    else source_breakdown.literature++ // fallback
  }

  const similarity_stats = {
    p50: searchStats.similarityP50,
    p75: searchStats.similarityP75,
    min: searchStats.similarityMin,
    total_chunks: searchStats.finalSent,
  }

  // Build chunk summary for Claude (titles + source types)
  const chunkSummary = chunks
    .map((c, i) => `[${i + 1}] "${c.title}" (${c.source_type}, sim=${c.similarity.toFixed(3)})`)
    .join('\n')

  const prompt = `You are a scientific corpus analyst for Lumos AI reviewing the evidence retrieved to support a pre-clinical phenotyping analysis of ${drugName} in ${indication}.

RETRIEVED CORPUS SUMMARY (${chunks.length} chunks sent to Claude Opus for synthesis):
${chunkSummary}

SOURCE TYPE BREAKDOWN:
- Clinical trial documents: ${source_breakdown.clinical_trial} chunks
- Regulatory documents: ${source_breakdown.regulatory} chunks
- Literature: ${source_breakdown.literature} chunks
- Internal: ${source_breakdown.internal} chunks

SIMILARITY STATS (cosine similarity vs. 4 query aspects):
- Median similarity: ${similarity_stats.p50}
- P75 similarity: ${similarity_stats.p75}
- Min similarity: ${similarity_stats.min.toFixed(3)}

TASK:
Analyze the retrieved corpus for ${drugName} (${indication}) and produce a structured gap analysis. Based on the document titles and source types above:

1. CORPUS STRENGTHS: What types of evidence are well-represented? (2–4 items)
2. CORPUS GAPS: What key evidence types are missing or underrepresented that would strengthen the analysis? Be specific — name the missing study types, mechanisms, or biomarkers. (3–5 items)
3. RECOMMENDED SEARCHES: Specific literature search queries that would fill the most important gaps. (3–5 items, each ≤15 words)
4. OVERALL VERDICT: One concise sentence summarising the corpus coverage quality for this analysis.

Respond with raw JSON only:
{
  "corpus_strengths": ["..."],
  "corpus_gaps": ["..."],
  "recommended_searches": ["..."],
  "overall_verdict": "..."
}`

  const system = 'You are a clinical research assistant. Respond with raw JSON only — no markdown, no code fences, no prose before or after. Start your response with { and end with }.'
  const stream = await client.messages.stream({
    model: 'claude-sonnet-4-5',
    max_tokens: computeMaxTokens('claude-sonnet-4-5', prompt, system),
    system,
    messages: [{ role: 'user', content: prompt }],
  })

  const msg = await stream.finalMessage()
  const raw = msg.content
    .filter(b => b.type === 'text')
    .map(b => (b as { type: 'text'; text: string }).text)
    .join('')

  const parsed = parseJson(raw, 'corpus-intelligence') as {
    corpus_strengths?: string[]
    corpus_gaps?: string[]
    recommended_searches?: string[]
    overall_verdict?: string
  }

  return {
    source_breakdown,
    similarity_stats,
    corpus_strengths: parsed.corpus_strengths ?? [],
    corpus_gaps: parsed.corpus_gaps ?? [],
    recommended_searches: parsed.recommended_searches ?? [],
    overall_verdict: parsed.overall_verdict ?? '',
  }
}
