/**
 * Phase 2 clinical ML pipeline.
 *
 * Pure TypeScript — no external ML libraries.
 *
 * Steps:
 *   1. Bayesian update — update Phase 1 corpus priors with observed outcomes
 *   2. Threshold clustering — assign each patient to Subtype A / B / C
 *   3. Feature importance — Pearson correlation of each biomarker with response
 *   4. MADRS trajectory — mean MADRS per subtype at Wk 0/2/4/8
 */

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

export interface BayesianUpdate {
  overall: { prior: number; posterior: number; n_effective: number }
  responder: { prior: number; posterior: number; n_effective: number }
  nonresponder: { prior: number; posterior: number; n_effective: number }
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
}

// ── 1. Threshold-based subtype clustering ────────────────────────────────────
// Grounded in the Phase 1 corpus hypothesis:
//   Subtype A: BDNF < 15 ng/mL (TrkB-deficit responders)
//   Subtype B: IL-6 ≥ 4 pg/mL (high-inflammatory non-responders)
//   Subtype C: all others (mixed)
export function assignSubtypes(patients: ClinicalPatient[]): SubtypeAssignment[] {
  return patients.map(p => {
    if (p.baseline_bdnf_ng_ml < 15 && p.baseline_il6_pg_ml < 3.5) {
      return {
        patient_code: p.patient_code,
        subtype: 'A',
        reason: `BDNF ${p.baseline_bdnf_ng_ml} ng/mL < 15 threshold (TrkB-deficit phenotype)`,
      }
    }
    if (p.baseline_il6_pg_ml >= 4.0) {
      return {
        patient_code: p.patient_code,
        subtype: 'B',
        reason: `IL-6 ${p.baseline_il6_pg_ml} pg/mL ≥ 4.0 threshold (high-inflammatory phenotype)`,
      }
    }
    return {
      patient_code: p.patient_code,
      subtype: 'C',
      reason: `Intermediate BDNF (${p.baseline_bdnf_ng_ml} ng/mL) and IL-6 (${p.baseline_il6_pg_ml} pg/mL)`,
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
  assignments: SubtypeAssignment[]
): MadrsTrajectory[] {
  const subtypeMap = new Map(assignments.map(a => [a.patient_code, a.subtype]))

  const groups: Record<string, ClinicalPatient[]> = { A: [], B: [], C: [], Overall: [] }
  for (const p of patients) {
    const st = subtypeMap.get(p.patient_code) ?? 'C'
    groups[st].push(p)
    groups['Overall'].push(p)
  }

  const config: Record<string, { label: string; color: string }> = {
    A:       { label: 'Subtype A — TrkB-Deficit', color: '#22C55E' },
    B:       { label: 'Subtype B — High-Inflammatory', color: '#EF4444' },
    C:       { label: 'Subtype C — Mixed', color: '#F59E0B' },
    Overall: { label: 'Overall (N=16)', color: '#4F8EF7' },
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
export function computeBayesianUpdate(
  patients: ClinicalPatient[],
  phase1Priors: { overall: number; responder: number; nonresponder: number }
): BayesianUpdate {
  const N_EFF = 20  // effective prior sample size from corpus

  const responders = patients.filter(p => p.response_status === 'responder').length
  const nonresponders = patients.filter(p => p.response_status === 'nonresponder').length
  const n = patients.length

  function update(prior: number, k: number, n_obs: number) {
    const alpha0 = prior * N_EFF
    const beta0 = (1 - prior) * N_EFF
    const posterior = (alpha0 + k) / (alpha0 + beta0 + n_obs)
    return { prior, posterior, n_effective: N_EFF + n_obs }
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
  phase1Priors: { overall: number; responder: number; nonresponder: number }
): Phase2MLResult {
  const assignments = assignSubtypes(patients)
  const featureImportance = computeFeatureImportance(patients)
  const madrsTrajectories = computeMadrsTrajectories(patients, assignments)
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
  }
}
