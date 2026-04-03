import { PatientData, CompositeScore, BayesianPrior, MechanismContext } from '@/lib/types'
import { MatchedChunk } from '@/lib/pipeline/search'

// ── Reference ranges for normalisation ───────────────────────────────────────
// Values represent the "responder-favourable" range seen in neuroplastogen literature
const BIOMARKER_REFS: Record<string, { low: number; high: number; responderFavourable: 'high' | 'low'; label: string }> = {
  bdnf_serum_ng_ml:   { low: 8,    high: 32,   responderFavourable: 'high', label: 'BDNF ng/mL' },
  crp_mg_l:           { low: 0,    high: 3,    responderFavourable: 'low',  label: 'CRP mg/L' },
  tnf_alpha_pg_ml:    { low: 0,    high: 12,   responderFavourable: 'low',  label: 'TNF-α pg/mL' },
  il6_pg_ml:          { low: 0,    high: 3,    responderFavourable: 'low',  label: 'IL-6 pg/mL' },
  cortisol_am_ug_dl:  { low: 6,    high: 18,   responderFavourable: 'low',  label: 'Cortisol AM μg/dL' },
  tryptophan_ratio:   { low: 0.06, high: 0.12, responderFavourable: 'high', label: 'Tryptophan Ratio' },
}

// Source type weights for contribution scoring
const SOURCE_WEIGHTS: Record<string, number> = {
  clinical_trial: 1.20,
  regulatory:     1.15,
  literature:     1.00,
  internal:       1.05,
}

// Animal model keywords → subtype mapping
const SUBTYPE_KEYWORDS: Record<string, 'a' | 'b' | 'c'> = {
  'forced swim':        'a',
  'fst':                'a',
  'sucrose preference': 'b',
  'chronic mild stress': 'b',
  'cms':                'b',
  'learned helplessness': 'c',
  'lh model':           'c',
  'corticosterone':     'b',
  'social defeat':      'c',
}

// ── Composite Score ───────────────────────────────────────────────────────────

/**
 * Compute S = Σ(w_analog * B_biomarker) + Σ(w_mech * P_pk)
 *
 * B_biomarker: how well each patient biomarker aligns with responder range (0–1)
 * P_pk: how well PK params align with therapeutic window (0–1, from mechanism context)
 * w_analog: source-type weight of the matched chunks
 */
export function computeCompositeScore(
  patient: PatientData,
  matchedChunks: MatchedChunk[],
  mechanismContext: MechanismContext | null
): CompositeScore {
  const components = []

  // ── Biomarker alignment term: Σ(w_analog * B_biomarker) ──────────────────
  const avgSourceWeight =
    matchedChunks.reduce((s, c) => s + (SOURCE_WEIGHTS[c.source_type] ?? 1.0), 0) /
    Math.max(matchedChunks.length, 1)

  for (const [key, value] of Object.entries(patient.biomarkers)) {
    if (value === undefined) continue
    const ref = BIOMARKER_REFS[key]
    if (!ref) continue

    // Normalise value — allow values outside range to produce negative alignment
    const range = ref.high - ref.low
    const normalised = (value - ref.low) / range  // can exceed 0–1 for out-of-range values
    const alignment = ref.responderFavourable === 'high' ? normalised : 1 - normalised
    // Clamp to [-1, 1] so extreme values show as strongly negative but not unbounded
    const clampedAlignment = Math.max(-1, Math.min(1, alignment))

    const contribution = avgSourceWeight * clampedAlignment * 15
    components.push({
      label: ref.label,
      weight: avgSourceWeight,
      raw: clampedAlignment,
      contribution: Math.round(contribution * 10) / 10,
    })
  }

  // ── PK alignment term: Σ(w_mech * P_pk) ─────────────────────────────────
  let pkContribution = 0
  if (mechanismContext) {
    // Score based on half-life (target 4–12h for psychoplastogens)
    const hl = mechanismContext.pk_summary.half_life_h
    if (hl !== undefined) {
      const pkAlignment = hl >= 4 && hl <= 12 ? 1.0 : hl >= 2 && hl <= 20 ? 0.6 : 0.2
      pkContribution = 1.15 * pkAlignment * 12
      components.push({
        label: 'PK half-life alignment',
        weight: 1.15,
        raw: pkAlignment,
        contribution: Math.round(pkContribution * 10) / 10,
      })
    }
    // Bioavailability bonus
    const ba = mechanismContext.pk_summary.bioavailability_pct
    if (ba !== undefined) {
      const baAlignment = ba >= 60 ? 1.0 : ba >= 30 ? 0.6 : 0.3
      const baContribution = 1.15 * baAlignment * 8
      pkContribution += baContribution
      components.push({
        label: 'Bioavailability alignment',
        weight: 1.15,
        raw: baAlignment,
        contribution: Math.round(baContribution * 10) / 10,
      })
    }
  }

  const rawTotal = components.reduce((s, c) => s + c.contribution, 0)
  // Normalise to 0–100 (max possible ≈ 6 biomarkers * 18 + 20 PK = ~128)
  const maxPossible = 128
  const value = Math.min(100, Math.round((rawTotal / maxPossible) * 100))

  const interpretation =
    value >= 70 ? 'Strong biomarker-corpus alignment — favourable responder signal'
    : value >= 45 ? 'Moderate alignment — mixed responder signal, further biomarker collection recommended'
    : 'Weak alignment — non-responder signal predominant or insufficient biomarker data'

  return {
    value,
    components,
    formula: 'S = Σ(w_analog × B_biomarker) + Σ(w_mech × P_pk)',
    interpretation,
  }
}

// ── Bayesian Prior (Beta-Binomial) ────────────────────────────────────────────

/**
 * Count animal model / subtype evidence from matched chunk content,
 * then compute Beta-Binomial posteriors for each subtype.
 *
 * Alpha = 1 + evidence_for_subtype  (Beta prior α=1 = uniform start)
 * Beta  = 1 + evidence_against_subtype
 * Mean  = α / (α + β)
 */
export function computeBayesianPrior(matchedChunks: MatchedChunk[]): BayesianPrior {
  const counts = { a: 0, b: 0, c: 0 }
  let total = 0

  for (const chunk of matchedChunks) {
    const text = chunk.content.toLowerCase()
    let matched = false
    for (const [keyword, subtype] of Object.entries(SUBTYPE_KEYWORDS)) {
      if (text.includes(keyword)) {
        counts[subtype]++
        matched = true
      }
    }
    if (matched) total++
  }

  const makeSubtype = (count: number, rest: number, label: string): import('@/lib/types').BayesianSubtype => {
    const alpha = 1 + count
    const beta = 1 + rest
    return { alpha, beta, mean: Math.round((alpha / (alpha + beta)) * 1000) / 1000, label }
  }

  const totalCounts = counts.a + counts.b + counts.c || 1

  return {
    subtype_a: makeSubtype(counts.a, counts.b + counts.c, 'Acute-Responsive (FST-like)'),
    subtype_b: makeSubtype(counts.b, counts.a + counts.c, 'Stress-Sensitised (CMS-like)'),
    subtype_c: makeSubtype(counts.c, counts.a + counts.b, 'Treatment-Resistant (LH-like)'),
    evidence_basis: `Beta-Binomial posteriors derived from ${total} evidence-bearing corpus chunks (${totalCounts} animal model mentions across ${matchedChunks.length} retrieved chunks)`,
    total_evidence_chunks: matchedChunks.length,
  }
}
