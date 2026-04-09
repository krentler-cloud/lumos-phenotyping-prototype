/**
 * Phase 2 synthesis — Lumos AI pipeline.
 *
 * Inputs:
 *   - Phase 1 report (responder/non-responder profiles, biomarker table)
 *   - Phase 2 ML results (subtype assignments, Bayesian update, MADRS trajectories, feature importance)
 *   - Drug name + indication
 *
 * Outputs (Phase2ReportData):
 *   - Refined responder/non-responder profiles with validation badges
 *   - Enhanced outcome measures
 *   - CRO screening prompts (structured)
 *   - Methodology narrative for Phase 2
 */

import Anthropic from '@anthropic-ai/sdk'
import { Phase1ReportData } from './synthesize-phase1'
import { Phase2MLResult, MadrsTrajectory } from './clinical-ml'

function getClient() {
  return new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    timeout: 20 * 60 * 1000,
  })
}

function parseJson(raw: string, label: string): unknown {
  const firstBrace = raw.indexOf('{')
  const lastBrace = raw.lastIndexOf('}')
  if (firstBrace === -1 || lastBrace === -1) {
    throw new Error(`No JSON in Claude response (${label}): ${raw.slice(0, 200)}`)
  }
  try {
    return JSON.parse(raw.slice(firstBrace, lastBrace + 1))
  } catch {
    throw new Error(`Failed to parse Claude JSON (${label}): ${raw.slice(0, 300)}`)
  }
}

// ── Output schema ─────────────────────────────────────────────────────────────
export interface RefinedProfile {
  summary: string
  demographics: string
  core_clinical: string
  inflammatory: string
  neuroplasticity: string
  imaging: string
  key_criteria: string[]
  phase1_confidence: number       // original corpus confidence (0-1)
  phase2_confidence: number       // Bayesian-updated posterior (0-1)
  validation_delta: string        // legacy: kept for backward-compat with stored reports
  // REPORT-CONSISTENCY: P2-Redesign — neutral label, no "VALIDATED" framing
  posterior_label?: string        // e.g. "Prior 62% → Posterior 59%"
  what_changed: string            // narrative of what clinical data refined or revised
}

export interface EnhancedOutcomeMeasure {
  name: string
  type: 'early_response' | 'leading_indicator' | 'primary_endpoint'
  description: string
  timing: string
  clinical_rationale: string
}

export interface CROPrompt {
  category: string               // "Inclusion" | "Exclusion" | "Stratification" | "Biomarker Monitoring"
  criteria: string[]
  rationale: string
}

export interface Phase2ReportData {
  // REPORT-CONSISTENCY: P2-Redesign — 2-3 sentence lead for top summary banner
  executive_summary?: string
  refined_responder_profile: RefinedProfile
  refined_nonresponder_profile: RefinedProfile
  enhanced_outcome_measures: EnhancedOutcomeMeasure[]
  cro_prompts: CROPrompt[]
  methodology_narrative: string
}

// ── Prompt builder ────────────────────────────────────────────────────────────
function buildPhase2Prompt(
  drugName: string,
  indication: string,
  phase1: Phase1ReportData,
  ml: Phase2MLResult
): string {
  const traj = (t: MadrsTrajectory) =>
    `${t.label} (n=${t.n}): Wk0=${t.wk0.toFixed(1)}, Wk2=${t.wk2.toFixed(1)}, Wk4=${t.wk4.toFixed(1)}, Wk8=${t.wk8.toFixed(1)}`

  const trajectories = ml.madrs_trajectories.map(traj).join('\n')

  const featureImportance = ml.feature_importance
    .slice(0, 6)
    .map(f => `  ${f.label}: importance=${f.importance.toFixed(3)}, direction=${f.direction}`)
    .join('\n')

  const bayesUpdate = ml.bayesian_update
  const responderDelta = Math.round((bayesUpdate.responder.posterior - bayesUpdate.responder.prior) * 100)
  const nonresponderDelta = Math.round((bayesUpdate.nonresponder.posterior - bayesUpdate.nonresponder.prior) * 100)

  return `You are a clinical research scientist at Headlamp Health synthesizing the Phase 2 re-analysis for ${drugName} (${indication}).

DRUG: ${drugName}
INDICATION: ${indication}

═══════════════════════════════════════════════════════
PHASE 1 CORPUS HYPOTHESES (pre-clinical only, n=0 patients)
═══════════════════════════════════════════════════════

Responder Profile (corpus confidence: ${Math.round(phase1.responder_profile.corpus_hypothesis_confidence * 100)}%):
- Summary: ${phase1.responder_profile.summary}
- Demographics: ${phase1.responder_profile.demographics}
- Core clinical: ${phase1.responder_profile.core_clinical}
- Inflammatory: ${phase1.responder_profile.inflammatory}
- Neuroplasticity: ${phase1.responder_profile.neuroplasticity}
- Imaging: ${phase1.responder_profile.imaging}

Non-Responder Profile (corpus confidence: ${Math.round(phase1.nonresponder_profile.corpus_hypothesis_confidence * 100)}%):
- Summary: ${phase1.nonresponder_profile.summary}
- Demographics: ${phase1.nonresponder_profile.demographics}
- Core clinical: ${phase1.nonresponder_profile.core_clinical}
- Inflammatory: ${phase1.nonresponder_profile.inflammatory}
- Neuroplasticity: ${phase1.nonresponder_profile.neuroplasticity}
- Imaging: ${phase1.nonresponder_profile.imaging}

Top Phase 1 biomarkers: ${phase1.biomarker_recommendations.slice(0, 5).map(b => b.name).join(', ')}

═══════════════════════════════════════════════════════
PHASE 2 CLINICAL DATA — N=16 XYL-1001 PARTICIPANTS
═══════════════════════════════════════════════════════

Patient outcomes:
- Responders: ${ml.responder_count} / 16 (${Math.round(ml.responder_count / 16 * 100)}%)
- Non-responders: ${ml.nonresponder_count} / 16 (${Math.round(ml.nonresponder_count / 16 * 100)}%)
- Uncertain: ${ml.uncertain_count} / 16

Subtype concordance with Phase 1 prediction: ${ml.concordance_pct}%

MADRS Trajectories (Wk 0/2/4/8):
${trajectories}

Bayesian Updated Confidence Scores:
- Overall: ${Math.round(bayesUpdate.overall.prior * 100)}% → ${Math.round(bayesUpdate.overall.posterior * 100)}% (Δ${Math.round((bayesUpdate.overall.posterior - bayesUpdate.overall.prior) * 100)}pp)
- Responder hypothesis: ${Math.round(bayesUpdate.responder.prior * 100)}% → ${Math.round(bayesUpdate.responder.posterior * 100)}% (Δ${responderDelta}pp)
- Non-responder hypothesis: ${Math.round(bayesUpdate.nonresponder.prior * 100)}% → ${Math.round(bayesUpdate.nonresponder.posterior * 100)}% (Δ${nonresponderDelta}pp)

Top predictive features (by Pearson |r| with response):
${featureImportance}

═══════════════════════════════════════════════════════
OUTPUT REQUIRED (JSON only, no markdown)
═══════════════════════════════════════════════════════

Return exactly this JSON structure. Follow all field-level instructions precisely — they determine report quality.

WRITING STYLE (applies to every prose field below):
- Write in flowing analytical prose. No bullet points. No semicolons as list separators.
- Cite numbers inline (e.g. "BDNF showed the strongest association (|r|=0.71)").
- Lead each field with the single most important clinical insight, then support it.
- Write for a senior clinical scientist who has already read the raw data tables.
- A good report does not list observations; it interprets them.

{
  "executive_summary": "3 sentences. (1) State what the N=16 clinical data revealed about overall drug response and concordance with Planning Phase predictions. (2) Name the 1-2 features that most strongly separated responders from non-responders (cite |r| values). (3) Characterize what remains uncertain and what a larger trial needs to resolve. No bullets. No 'validated' or 'confirmed' — use 'refined', 'updated', 'consistent with'.",

  "refined_responder_profile": {
    "summary": "3-4 sentence narrative. Lead with the MADRS outcome (cite Wk8 score and % improvement). Then name the baseline biomarker profile that characterized this group. Close with the strength of the Planning Phase prediction relative to what was actually observed — was the hypothesis borne out, refined, or surprised? Do not list; synthesize.",
    "demographics": "2-3 sentences. State the observed age range and central tendency, sex distribution, and prior antidepressant trial count. Compare directly to the Planning Phase demographic prediction — where did it match, where did the real cohort differ? Cite the specific Planning Phase hypothesis text.",
    "core_clinical": "2-3 sentences. Lead with the strongest clinical predictor (cite its |r| value and rank in feature importance). Describe the MADRS baseline and trajectory shape in prose. Note whether severity-stratified response matched the Planning Phase severity threshold hypothesis.",
    "inflammatory": "2-3 sentences. Cite the observed IL-6, CRP, or TNF-alpha values and their feature importance rank. State whether the inflammatory profile was lower, higher, or as predicted for this group. Avoid listing — weave the biomarkers into a single interpretive sentence.",
    "neuroplasticity": "2-3 sentences. Describe the BDNF profile observed in this group (cite |r| if BDNF appears in top features). Note the Val66Met distribution if available. Interpret what the BDNF trajectory implies about mechanism of response.",
    "imaging": "1-2 sentences. Be honest: no imaging data was collected in this Phase 1/2 trial. State that the planning-phase imaging hypothesis (cite it briefly) remains pre-clinical and is a testable hypothesis for a larger study.",
    "key_criteria": ["Criterion 1 — specific, quantitative where possible", "Criterion 2", "Criterion 3", "Criterion 4"],
    "phase1_confidence": ${phase1.responder_profile.corpus_hypothesis_confidence},
    "phase2_confidence": ${bayesUpdate.responder.posterior.toFixed(3)},
    "validation_delta": "Prior ${Math.round(phase1.responder_profile.corpus_hypothesis_confidence * 100)}% → Posterior ${Math.round(bayesUpdate.responder.posterior * 100)}%",
    "posterior_label": "Prior ${Math.round(phase1.responder_profile.corpus_hypothesis_confidence * 100)}% → Posterior ${Math.round(bayesUpdate.responder.posterior * 100)}%",
    "what_changed": "3-4 sentence analytical narrative. What specifically did the clinical data refine relative to the Planning Phase hypothesis? Name the dimension (demographics, inflammatory, neuroplasticity) where the observed data most diverged from prediction, and interpret why. If the hypothesis held, explain what the data added beyond the prior — do not just say it was consistent. Do NOT use 'validated' or 'confirmed'."
  },

  "refined_nonresponder_profile": {
    "summary": "3-4 sentence narrative. Lead with the MADRS outcome for this group (cite Wk8 score). Characterize the biomarker signature that most strongly distinguished them from responders. Interpret what this profile implies about the mechanism of non-response to this drug.",
    "demographics": "2-3 sentences. State the observed age range, sex distribution, and prior trial count for non-responders. Compare to Planning Phase prediction. Note whether older, treatment-resistant, or male-predominant patterns emerged as predicted.",
    "core_clinical": "2-3 sentences. Name the clinical feature with the strongest inverse association with response (cite |r|). Describe the MADRS severity profile and trajectory — how quickly did non-response become apparent? Was Wk2 trajectory already diverging?",
    "inflammatory": "2-3 sentences. This is likely the key differentiating dimension — describe the observed inflammatory burden in prose, citing IL-6 or CRP levels. Interpret whether the elevated inflammatory profile represents a true contraindication or a subpopulation requiring add-on anti-inflammatory strategy.",
    "neuroplasticity": "2-3 sentences. Describe the BDNF or neuroplasticity marker profile for non-responders. If BDNF was lower at baseline, interpret what this implies about mechanism. Note the Val66Met distribution if relevant.",
    "imaging": "1-2 sentences. State that imaging markers remain Planning Phase hypotheses only. Note which imaging biomarker (e.g. ACC hyperactivity) is the highest-priority testable hypothesis for the next trial.",
    "key_criteria": ["Exclusion criterion 1 — specific, quantitative", "Exclusion criterion 2", "Exclusion criterion 3", "Exclusion criterion 4"],
    "phase1_confidence": ${phase1.nonresponder_profile.corpus_hypothesis_confidence},
    "phase2_confidence": ${bayesUpdate.nonresponder.posterior.toFixed(3)},
    "validation_delta": "Prior ${Math.round(phase1.nonresponder_profile.corpus_hypothesis_confidence * 100)}% → Posterior ${Math.round(bayesUpdate.nonresponder.posterior * 100)}%",
    "posterior_label": "Prior ${Math.round(phase1.nonresponder_profile.corpus_hypothesis_confidence * 100)}% → Posterior ${Math.round(bayesUpdate.nonresponder.posterior * 100)}%",
    "what_changed": "3-4 sentence analytical narrative. What did the N=16 data reveal about the non-responder phenotype that the Planning Phase corpus analysis could not? Name the specific feature or dimension that most refined the hypothesis. If the inflammatory burden was higher than predicted, interpret what this means for trial design. Do NOT use 'validated' or 'confirmed'."
  },

  "enhanced_outcome_measures": [
    {
      "name": "Measure name — specific, not generic",
      "type": "early_response|leading_indicator|primary_endpoint",
      "description": "One sentence: what this measure captures and why it is sensitive to this drug's mechanism",
      "timing": "Specific visit schedule (e.g. Baseline, Wk2, Wk4, Wk8)",
      "clinical_rationale": "2-3 sentences grounded in the Phase 2 feature importance data. Why does this measure earn its place in the protocol? What would a positive or negative signal at Wk2 imply for Wk8 outcome?"
    }
  ],

  "cro_prompts": [
    {
      "category": "Inclusion|Exclusion|Stratification|Biomarker Monitoring",
      "criteria": ["Specific, quantitative criterion — cite the threshold (e.g. BDNF > 15 ng/mL at screening)", "Criterion 2 with rationale embedded"],
      "rationale": "2-3 sentences explaining why this criterion is grounded in the Phase 2 feature importance ranking and MADRS trajectory data. Be specific — cite the feature and its |r| value."
    }
  ],

  "methodology_narrative": "4 paragraphs, each 3-4 sentences, written as continuous prose (no headers, no bullets). Paragraph 1: what Phase 2 added that Phase 1 could not — the N=16 clinical cohort, observed outcomes, and Bayesian update framework. Paragraph 2: how the ML ensemble (logistic regression + random forest) was structured, what features it used, and what the concordance rate means in terms of Planning Phase predictive accuracy. Paragraph 3: what the clinical data most meaningfully refined — cite the top 2-3 feature importances and what they imply about mechanism. Paragraph 4: honest limitations — N=16 is powered for signal-finding not confirmation; the Bayesian posteriors should be interpreted as informative priors for Phase 2b design, not as clinical evidence. What would a 60-patient trial change?"
}

Produce exactly one instance of each required key. The JSON must be valid and parseable. Do not include any text before the opening brace or after the closing brace.`
}

// ── Main export ───────────────────────────────────────────────────────────────
export async function synthesizePhase2Report(
  drugName: string,
  indication: string,
  phase1Report: Phase1ReportData,
  mlResult: Phase2MLResult
): Promise<Phase2ReportData> {
  const client = getClient()
  const prompt = buildPhase2Prompt(drugName, indication, phase1Report, mlResult)
  const system = 'You are a clinical research scientist. Respond with raw JSON only — no markdown, no code fences, no prose before or after. Start with { and end with }.'

  console.log(`[synthesize-phase2] Starting Opus synthesis, prompt chars = ${prompt.length}`)

  const stream = await client.messages.stream({
    model: 'claude-opus-4-6',
    max_tokens: 8000,
    system,
    messages: [{ role: 'user', content: prompt }],
  })

  const msg = await stream.finalMessage()

  if (msg.stop_reason === 'max_tokens') {
    throw new Error('Phase 2 synthesis hit max_tokens — response truncated.')
  }

  const raw = msg.content
    .filter(b => b.type === 'text')
    .map(b => (b as { type: 'text'; text: string }).text)
    .join('')

  const parsed = parseJson(raw, 'phase2-synthesis') as Phase2ReportData

  // Ensure required arrays exist
  if (!Array.isArray(parsed.enhanced_outcome_measures)) parsed.enhanced_outcome_measures = []
  if (!Array.isArray(parsed.cro_prompts)) parsed.cro_prompts = []

  return parsed
}
