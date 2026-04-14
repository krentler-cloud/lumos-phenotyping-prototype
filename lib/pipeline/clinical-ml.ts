/**
 * Phase 2 clinical ML pipeline.
 *
 * Pure TypeScript — no external ML libraries.
 *
 * Steps:
 *   1. Bayesian update — update Phase 1 corpus priors with observed outcomes
 *   2. Subtype assignment — likelihood-ratio from corpus distributions (F-2),
 *      or hardcoded thresholds as fallback for older Phase 1 reports
 *   3. Feature importance — Pearson correlation of each biomarker with response
 *   4. MADRS trajectory — mean MADRS per subtype at Wk 0/2/4/8
 */

import { BiomarkerDistribution } from '@/lib/pipeline/synthesize-phase1'

export interface ClinicalPatient {
  patient_code: string
  age: number
  sex: string
  prior_ad_trials: number
  baseline_hamd17: number
  baseline_madrs: number
  baseline_bdnf_ng_ml: number
  baseline_tnf_alpha_pg_ml: number
  baseline_il6_pg_ml: number
  baseline_crp_mg_l: number
  baseline_sleep_regularity: number
  baseline_anhedonia_subscale: number
  wk2_madrs: number | null
  wk4_madrs: number | null
  wk8_madrs: number | null
  wk2_bdnf: number | null
  wk4_il6: number | null
  response_status: 'responder' | 'nonresponder' | 'uncertain'
}

export interface SubtypeAssignment {
  patient_code: string
  subtype: 'A' | 'B' | 'C'
  reason: string
  assignment_method: 'likelihood_ratio' | 'threshold'
  llr_score?: number               // F-2: log-likelihood ratio (positive = responder-favored)
  llr_contributions?: {            // F-2: per-biomarker breakdown
    biomarker: string
    contribution: number
  }[]
}

export interface FeatureImportance {
  feature: string
  label: string
  importance: number   // 0-1 magnitude of Pearson r with response
  direction: 'positive' | 'negative'  // positive = higher value → more likely responder
}

export interface MadrsTrajectory {
  subtype: 'A' | 'B' | 'C' | 'Overall'
  label: string
  color: string
  wk0: number
  wk2: number
  wk4: number
  wk8: number
  n: number
}

export interface BayesianUpdateEntry {
  prior: number
  posterior: number
  n_effective: number
  ci_low: number   // 80% credible interval lower bound
  ci_high: number  // 80% credible interval upper bound
}

export interface BayesianUpdate {
  overall: BayesianUpdateEntry
  responder: BayesianUpdateEntry
  nonresponder: BayesianUpdateEntry
}

export interface SubtypeLabels {
  A: string   // responder-favored phenotype label
  B: string   // nonresponder-favored phenotype label
  C: string   // intermediate phenotype label
}

const DEFAULT_SUBTYPE_LABELS: SubtypeLabels = {
  A: 'Responder-Favored',
  B: 'Nonresponder-Favored',
  C: 'Intermediate',
}

/**
 * Resolve subtype display labels from Phase 1 phenotype_label fields.
 * Falls back to semantically correct generic labels for older reports.
 */
export function resolveSubtypeLabels(phase1Report?: {
  responder_profile?: { phenotype_label?: string }
  nonresponder_profile?: { phenotype_label?: string }
}): SubtypeLabels {
  return {
    A: phase1Report?.responder_profile?.phenotype_label ?? DEFAULT_SUBTYPE_LABELS.A,
    B: phase1Report?.nonresponder_profile?.phenotype_label ?? DEFAULT_SUBTYPE_LABELS.B,
    C: DEFAULT_SUBTYPE_LABELS.C,
  }
}

export interface Phase2MLResult {
  assignments: SubtypeAssignment[]
  feature_importance: FeatureImportance[]
  madrs_trajectories: MadrsTrajectory[]
  bayesian_update: BayesianUpdate
  responder_count: number
  nonresponder_count: number
  uncertain_count: number
  concordance_pct: number            // overall % (includes Subtype C as concordant)
  predictive_concordance_pct: number  // % for Subtypes A & B only (excludes C padding)
  subtype_ab_count: number            // how many patients are A or B (denominator for predictive)
  subtype_labels?: SubtypeLabels     // dynamic labels derived from Phase 1 phenotype profiles
}

// ── Biomarker name → patient field mapping ──────────────────────────────────
const BIOMARKER_FIELD_MAP: Record<string, keyof ClinicalPatient> = {
  'BDNF':      'baseline_bdnf_ng_ml',
  'IL-6':      'baseline_il6_pg_ml',
  'CRP':       'baseline_crp_mg_l',
  'TNF-ALPHA': 'baseline_tnf_alpha_pg_ml',
  'MADRS':     'baseline_madrs',
}

// Log of normal PDF: log N(x | μ, σ) = -0.5 * ln(2π) - ln(σ) - (x-μ)²/(2σ²)
const LOG_2PI = Math.log(2 * Math.PI)
function logNormalPdf(x: number, mu: number, sigma: number): number {
  const z = (x - mu) / sigma
  return -0.5 * LOG_2PI - Math.log(sigma) - 0.5 * z * z
}

// F-2: Log-likelihood ratio threshold for subtype assignment.
// τ = 1.0 means one group is ~2.7x more likely than the other.
const LLR_THRESHOLD = 1.0

// Per-biomarker contribution clamp to prevent a single extreme outlier
// from dominating the total LLR.
const MAX_CONTRIBUTION = 5.0

interface LLRResult {
  llr: number
  contributions: { biomarker: string; contribution: number }[]
  n_used: number
}

/**
 * F-2: Compute log-likelihood ratio for a single patient against corpus distributions.
 * Positive LLR = biomarker profile more consistent with responder population.
 * Negative LLR = more consistent with nonresponder population.
 */
function computePatientLLR(
  patient: ClinicalPatient,
  distributions: BiomarkerDistribution[]
): LLRResult {
  let llr = 0
  const contributions: { biomarker: string; contribution: number }[] = []

  for (const dist of distributions) {
    // Both populations need valid mean + SD
    if (dist.responder.mean == null || dist.responder.sd == null) continue
    if (dist.nonresponder.mean == null || dist.nonresponder.sd == null) continue
    // SD must be positive (avoid division by zero)
    if (dist.responder.sd <= 0 || dist.nonresponder.sd <= 0) continue

    // Map biomarker name to patient field
    const field = BIOMARKER_FIELD_MAP[dist.biomarker.toUpperCase()]
    if (!field) continue
    const value = patient[field]
    if (typeof value !== 'number' || isNaN(value)) continue

    const respLL = logNormalPdf(value, dist.responder.mean, dist.responder.sd)
    const nonrespLL = logNormalPdf(value, dist.nonresponder.mean, dist.nonresponder.sd)
    const raw = respLL - nonrespLL
    // Clamp to prevent single outlier from dominating
    const clamped = Math.max(-MAX_CONTRIBUTION, Math.min(MAX_CONTRIBUTION, raw))

    llr += clamped
    contributions.push({ biomarker: dist.biomarker, contribution: clamped })
  }

  // Sort by absolute contribution descending for explainability
  contributions.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))

  return { llr, contributions, n_used: contributions.length }
}

// ── 1. Subtype assignment ───────────────────────────────────────────────────
// F-2: When corpus distributions are available (≥2 biomarkers with complete
// responder + nonresponder stats), use likelihood-ratio approach. Otherwise
// fall back to hardcoded thresholds for backward compatibility.

export function assignSubtypes(
  patients: ClinicalPatient[],
  distributions?: BiomarkerDistribution[]
): SubtypeAssignment[] {
  // Check if we have enough distributions for LLR
  const usableDists = distributions?.filter(d =>
    d.responder.mean != null && d.responder.sd != null && d.responder.sd > 0 &&
    d.nonresponder.mean != null && d.nonresponder.sd != null && d.nonresponder.sd > 0 &&
    BIOMARKER_FIELD_MAP[d.biomarker.toUpperCase()]
  ) ?? []

  const useLLR = usableDists.length >= 2

  return patients.map(p => {
    if (useLLR) {
      const result = computePatientLLR(p, usableDists)
      const topContrib = result.contributions.slice(0, 3)
        .map(c => `${c.biomarker} ${c.contribution > 0 ? '+' : ''}${c.contribution.toFixed(2)}`)
        .join(', ')

      if (result.llr > LLR_THRESHOLD) {
        return {
          patient_code: p.patient_code,
          subtype: 'A',
          reason: `LLR +${result.llr.toFixed(2)} (responder-favored) from ${result.n_used} biomarkers: ${topContrib}`,
          assignment_method: 'likelihood_ratio' as const,
          llr_score: result.llr,
          llr_contributions: result.contributions,
        }
      }
      if (result.llr < -LLR_THRESHOLD) {
        return {
          patient_code: p.patient_code,
          subtype: 'B',
          reason: `LLR ${result.llr.toFixed(2)} (nonresponder-favored) from ${result.n_used} biomarkers: ${topContrib}`,
          assignment_method: 'likelihood_ratio' as const,
          llr_score: result.llr,
          llr_contributions: result.contributions,
        }
      }
      return {
        patient_code: p.patient_code,
        subtype: 'C',
        reason: `LLR ${result.llr.toFixed(2)} (indeterminate, |LLR| ≤ ${LLR_THRESHOLD}) from ${result.n_used} biomarkers: ${topContrib}`,
        assignment_method: 'likelihood_ratio' as const,
        llr_score: result.llr,
        llr_contributions: result.contributions,
      }
    }

    // Fallback: hardcoded thresholds (pre-F-2 behavior)
    if (p.baseline_bdnf_ng_ml < 15 && p.baseline_il6_pg_ml < 3.5) {
      return {
        patient_code: p.patient_code,
        subtype: 'A',
        reason: `BDNF ${p.baseline_bdnf_ng_ml} ng/mL < 15 threshold (responder-favored phenotype)`,
        assignment_method: 'threshold' as const,
      }
    }
    if (p.baseline_il6_pg_ml >= 4.0) {
      return {
        patient_code: p.patient_code,
        subtype: 'B',
        reason: `IL-6 ${p.baseline_il6_pg_ml} pg/mL ≥ 4.0 threshold (nonresponder-favored phenotype)`,
        assignment_method: 'threshold' as const,
      }
    }
    return {
      patient_code: p.patient_code,
      subtype: 'C',
      reason: `Intermediate BDNF (${p.baseline_bdnf_ng_ml} ng/mL) and IL-6 (${p.baseline_il6_pg_ml} pg/mL)`,
      assignment_method: 'threshold' as const,
    }
  })
}

// ── 2. Pearson correlation feature importance ─────────────────────────────────
// Encodes response_status as: responder=1, nonresponder=-1, uncertain=0
// Computes |r| for each biomarker and ranks them.
function pearsonR(xs: number[], ys: number[]): number {
  const n = xs.length
  if (n < 2) return 0
  const mx = xs.reduce((a, b) => a + b, 0) / n
  const my = ys.reduce((a, b) => a + b, 0) / n
  let num = 0, dx2 = 0, dy2 = 0
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx
    const dy = ys[i] - my
    num += dx * dy
    dx2 += dx * dx
    dy2 += dy * dy
  }
  const denom = Math.sqrt(dx2 * dy2)
  return denom === 0 ? 0 : num / denom
}

export function computeFeatureImportance(patients: ClinicalPatient[]): FeatureImportance[] {
  const responseNums = patients.map(p =>
    p.response_status === 'responder' ? 1 : p.response_status === 'nonresponder' ? -1 : 0
  )

  const features: { key: keyof ClinicalPatient; label: string }[] = [
    { key: 'baseline_bdnf_ng_ml',      label: 'Baseline BDNF' },
    { key: 'baseline_il6_pg_ml',       label: 'Baseline IL-6' },
    { key: 'baseline_crp_mg_l',        label: 'Baseline CRP' },
    { key: 'baseline_tnf_alpha_pg_ml', label: 'Baseline TNF-α' },
    { key: 'baseline_anhedonia_subscale', label: 'Anhedonia Subscale' },
    { key: 'baseline_sleep_regularity', label: 'Sleep Regularity' },
    { key: 'baseline_hamd17',          label: 'Baseline HAMD-17' },
    { key: 'prior_ad_trials',          label: 'Prior AD Trials' },
    { key: 'age',                      label: 'Age' },
  ]

  return features
    .map(f => {
      const vals = patients.map(p => p[f.key] as number)
      const r = pearsonR(vals, responseNums)
      return {
        feature: f.key,
        label: f.label,
        importance: Math.abs(r),
        direction: r >= 0 ? 'positive' as const : 'negative' as const,
      }
    })
    .sort((a, b) => b.importance - a.importance)
}

// ── 3. MADRS trajectory by subtype ───────────────────────────────────────────
function mean(nums: number[]): number {
  if (nums.length === 0) return 0
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

export function computeMadrsTrajectories(
  patients: ClinicalPatient[],
  assignments: SubtypeAssignment[],
  labels?: SubtypeLabels
): MadrsTrajectory[] {
  const subtypeMap = new Map(assignments.map(a => [a.patient_code, a.subtype]))

  const groups: Record<string, ClinicalPatient[]> = { A: [], B: [], C: [], Overall: [] }
  for (const p of patients) {
    const st = subtypeMap.get(p.patient_code) ?? 'C'
    groups[st].push(p)
    groups['Overall'].push(p)
  }

  const resolved = labels ?? DEFAULT_SUBTYPE_LABELS
  const config: Record<string, { label: string; color: string }> = {
    A:       { label: `Subtype A — ${resolved.A}`, color: '#22C55E' },
    B:       { label: `Subtype B — ${resolved.B}`, color: '#EF4444' },
    C:       { label: `Subtype C — ${resolved.C}`, color: '#F59E0B' },
    Overall: { label: `Overall (N=${patients.length})`, color: '#4F8EF7' },
  }

  return (['A', 'B', 'C', 'Overall'] as const).map(st => {
    const pts = groups[st]
    return {
      subtype: st,
      label: config[st].label,
      color: config[st].color,
      wk0: mean(pts.map(p => p.baseline_madrs)),
      wk2: mean(pts.map(p => p.wk2_madrs ?? p.baseline_madrs)),
      wk4: mean(pts.map(p => p.wk4_madrs ?? p.baseline_madrs)),
      wk8: mean(pts.map(p => p.wk8_madrs ?? p.baseline_madrs)),
      n: pts.length,
    }
  })
}

// ── 4. Bayesian update of Phase 1 corpus priors ───────────────────────────────
// Phase 1 priors are Beta-Binomial; we update with observed counts.
// Beta(α₀ + k, β₀ + n - k) where α₀/β₀ derived from prior mean + N_eff.
/**
 * Approximate Beta distribution quantile using the normal approximation.
 * For α, β > 1 (which we always have with N_EFF=20), this is accurate to ~1%.
 * Returns the p-th quantile of Beta(α, β).
 */
function betaQuantile(p: number, alpha: number, beta: number): number {
  // Normal approximation to the Beta distribution
  const mean = alpha / (alpha + beta)
  const variance = (alpha * beta) / ((alpha + beta) ** 2 * (alpha + beta + 1))
  const sd = Math.sqrt(variance)

  // Inverse normal CDF (Beasley-Springer-Moro approximation)
  const a = [0, -3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02,
    1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00]
  const b = [0, -5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02,
    6.680131188771972e+01, -1.328068155288572e+01]

  const q = p - 0.5
  let r: number, x: number

  if (Math.abs(q) <= 0.425) {
    r = 0.180625 - q * q
    x = q * (((((((a[7]! * r + a[6]!) * r + a[5]!) * r + a[4]!) * r + a[3]!) * r + a[2]!) * r + a[1]!) * r + a[0]!) /
      (((((((b[7]! * r + b[6]!) * r + b[5]!) * r + b[4]!) * r + b[3]!) * r + b[2]!) * r + b[1]!) * r + 1)
  } else {
    r = q < 0 ? p : 1 - p
    r = Math.sqrt(-Math.log(r))
    if (r <= 5) {
      r -= 1.6
      x = (((((((2.32121276858e-1 * r + 1.23355425968) * r + 2.44024637934) * r + 2.04231210245) * r + 1.0) * r + 0.774545014427) * r + 0.27061061505) * r + 0.0886226899) /
        (((((((1.05075007164e-2 * r + 1.0) * r + 1.73036321538) * r + 1.43831968536) * r + 5.76949722146e-1) * r + 0.1394191378) * r + 0.0160431634) * r + 1.0)
    } else {
      r -= 5
      x = (((((((2.01033439929e-7 * r + 2.71155556874e-5) * r + 1.24266094738e-3) * r + 2.65321895265e-2) * r + 2.96560571828e-1) * r + 1.78482653991) * r + 5.46378491116) * r + 6.65790464350) /
        (((((((2.04426310338e-15 * r + 1.42151175831e-5) * r + 1.84631831751e-3) * r + 4.21668723009e-2) * r + 3.37267071087e-1) * r + 1.0) * r + 1.0) * r + 1.0)
    }
    if (q < 0) x = -x
  }

  // Clamp to [0, 1]
  return Math.max(0, Math.min(1, mean + sd * x))
}

export function computeBayesianUpdate(
  patients: ClinicalPatient[],
  phase1Priors: { overall: number; responder: number; nonresponder: number }
): BayesianUpdate {
  const N_EFF = 20  // effective prior sample size from corpus

  const responders = patients.filter(p => p.response_status === 'responder').length
  const nonresponders = patients.filter(p => p.response_status === 'nonresponder').length
  const n = patients.length

  function update(prior: number, k: number, n_obs: number): BayesianUpdateEntry {
    const alpha0 = prior * N_EFF
    const beta0 = (1 - prior) * N_EFF
    const alphaPost = alpha0 + k
    const betaPost = beta0 + (n_obs - k)
    const posterior = alphaPost / (alphaPost + betaPost)

    // 80% credible interval (10th and 90th percentiles)
    const ci_low = betaQuantile(0.10, alphaPost, betaPost)
    const ci_high = betaQuantile(0.90, alphaPost, betaPost)

    return { prior, posterior, n_effective: N_EFF + n_obs, ci_low, ci_high }
  }

  return {
    overall:      update(phase1Priors.overall,      responders, n),
    responder:    update(phase1Priors.responder,    responders, responders + nonresponders),
    nonresponder: update(phase1Priors.nonresponder, nonresponders, responders + nonresponders),
  }
}

// ── Main entry point ──────────────────────────────────────────────────────────
export function runClinicalML(
  patients: ClinicalPatient[],
  phase1Priors: { overall: number; responder: number; nonresponder: number },
  distributions?: BiomarkerDistribution[],
  subtypeLabels?: SubtypeLabels
): Phase2MLResult {
  const assignments = assignSubtypes(patients, distributions)
  const featureImportance = computeFeatureImportance(patients)
  const madrsTrajectories = computeMadrsTrajectories(patients, assignments, subtypeLabels)
  const bayesianUpdate = computeBayesianUpdate(patients, phase1Priors)

  const responderCount    = patients.filter(p => p.response_status === 'responder').length
  const nonresponderCount = patients.filter(p => p.response_status === 'nonresponder').length
  const uncertainCount    = patients.filter(p => p.response_status === 'uncertain').length

  // SCIENCE-FEEDBACK F-6 — report concordance two ways to avoid Subtype C inflation.
  // "Overall" includes Subtype C (always concordant — uncertain is expected).
  // "Predictive" excludes Subtype C to show how well A/B actually predict response.
  const abAssignments = assignments.filter(a => a.subtype === 'A' || a.subtype === 'B')
  const predictiveConcordant = abAssignments.filter(a => {
    const p = patients.find(pt => pt.patient_code === a.patient_code)!
    if (a.subtype === 'A') return p.response_status === 'responder'
    if (a.subtype === 'B') return p.response_status === 'nonresponder'
    return false
  }).length
  const predictiveConcordancePct = abAssignments.length > 0
    ? Math.round((predictiveConcordant / abAssignments.length) * 100)
    : 0

  const subtypeCCount = assignments.filter(a => a.subtype === 'C').length
  const overallConcordant = predictiveConcordant + subtypeCCount
  const concordancePct = Math.round((overallConcordant / patients.length) * 100)

  return {
    assignments,
    feature_importance: featureImportance,
    madrs_trajectories: madrsTrajectories,
    bayesian_update: bayesianUpdate,
    responder_count: responderCount,
    nonresponder_count: nonresponderCount,
    uncertain_count: uncertainCount,
    concordance_pct: concordancePct,
    predictive_concordance_pct: predictiveConcordancePct,
    subtype_ab_count: abAssignments.length,
    subtype_labels: subtypeLabels,
  }
}
