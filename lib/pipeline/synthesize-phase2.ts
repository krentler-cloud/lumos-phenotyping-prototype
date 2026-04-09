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

Return exactly this JSON structure:

{
  "executive_summary": "2-3 plain-English sentences summarizing what the N=16 clinical data refined or revised about the Planning Phase hypotheses, and what remains uncertain. This sits at the top of the final report. Do NOT use 'validated' or 'confirmed' — use 'refined', 'updated', 'consistent with'.",
  "refined_responder_profile": {
    "summary": "Updated 1-2 sentence profile integrating clinical validation",
    "demographics": "Refined demographics based on observed responder characteristics",
    "core_clinical": "Refined clinical features confirmed by data",
    "inflammatory": "Inflammatory profile validated or revised",
    "neuroplasticity": "Neuroplasticity markers confirmed or revised",
    "imaging": "Imaging markers (may remain pre-clinical hypothesis)",
    "key_criteria": ["Criterion 1", "Criterion 2", "Criterion 3"],
    "phase1_confidence": ${phase1.responder_profile.corpus_hypothesis_confidence},
    "phase2_confidence": ${bayesUpdate.responder.posterior.toFixed(3)},
    "validation_delta": "Prior ${Math.round(phase1.responder_profile.corpus_hypothesis_confidence * 100)}% → Posterior ${Math.round(bayesUpdate.responder.posterior * 100)}%",
    "posterior_label": "Prior ${Math.round(phase1.responder_profile.corpus_hypothesis_confidence * 100)}% → Posterior ${Math.round(bayesUpdate.responder.posterior * 100)}%",
    "what_changed": "2-3 sentences describing what the clinical data refined, updated, or revised about this Planning Phase hypothesis. Do NOT use the words 'validated' or 'confirmed' — use 'refined', 'updated', 'consistent with', 'revised'."
  },
  "refined_nonresponder_profile": {
    "summary": "Updated non-responder profile",
    "demographics": "...",
    "core_clinical": "...",
    "inflammatory": "...",
    "neuroplasticity": "...",
    "imaging": "...",
    "key_criteria": ["Criterion 1", "Criterion 2", "Criterion 3"],
    "phase1_confidence": ${phase1.nonresponder_profile.corpus_hypothesis_confidence},
    "phase2_confidence": ${bayesUpdate.nonresponder.posterior.toFixed(3)},
    "validation_delta": "Prior ${Math.round(phase1.nonresponder_profile.corpus_hypothesis_confidence * 100)}% → Posterior ${Math.round(bayesUpdate.nonresponder.posterior * 100)}%",
    "posterior_label": "Prior ${Math.round(phase1.nonresponder_profile.corpus_hypothesis_confidence * 100)}% → Posterior ${Math.round(bayesUpdate.nonresponder.posterior * 100)}%",
    "what_changed": "2-3 sentences describing what the clinical data refined, updated, or revised about this Planning Phase hypothesis. Do NOT use the words 'validated' or 'confirmed' — use 'refined', 'updated', 'consistent with', 'revised'."
  },
  "enhanced_outcome_measures": [
    {
      "name": "Measure name",
      "type": "early_response|leading_indicator|primary_endpoint",
      "description": "What this measure captures",
      "timing": "When to assess",
      "clinical_rationale": "Why this measure now, post-clinical data"
    }
  ],
  "cro_prompts": [
    {
      "category": "Inclusion|Exclusion|Stratification|Biomarker Monitoring",
      "criteria": ["Specific criterion 1", "Specific criterion 2"],
      "rationale": "Why this criterion, grounded in Phase 2 data"
    }
  ],
  "methodology_narrative": "3-4 paragraph narrative explaining: (1) what Phase 2 added vs Phase 1, (2) how the Bayesian update worked, (3) what the clinical data confirmed/revised, (4) confidence in the Phase 2 findings and what remains to be validated in a larger trial."
}

Produce exactly one instance of each required key. Be specific, cite the clinical data patterns (MADRS trajectories, feature importances, concordance rate). Do not hedge excessively — but frame Phase 2 findings as a posterior update on the Planning Phase hypotheses, not as formal validation. Avoid the word "validated" throughout.`
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
