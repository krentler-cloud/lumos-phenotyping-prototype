/**
 * Generate 80 synthetic MDD patients for XYL-1001 Phase 2.
 * Keeps P001-P016 as-is, adds P017-P080 with realistic biomarker distributions.
 *
 * Run: npx tsx scripts/generate-patients.ts
 * Output: data/patients.csv (overwritten)
 */

import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// ── Seeded PRNG (deterministic) ──────────────────────────────────────────────
let seed = 42
function rand(): number {
  seed = (seed * 1664525 + 1013904223) & 0x7fffffff
  return seed / 0x7fffffff
}
function randRange(lo: number, hi: number): number {
  return lo + rand() * (hi - lo)
}
function randInt(lo: number, hi: number): number {
  return Math.floor(randRange(lo, hi + 1))
}
function pick<T>(arr: T[]): T {
  return arr[Math.floor(rand() * arr.length)]
}
function round1(v: number): number {
  return Math.round(v * 10) / 10
}
function round2(v: number): number {
  return Math.round(v * 100) / 100
}

// ── Gaussian via Box-Muller ──────────────────────────────────────────────────
function gaussian(mean: number, sd: number): number {
  const u1 = rand() || 0.001
  const u2 = rand()
  return mean + sd * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
}
function clampGaussian(mean: number, sd: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, gaussian(mean, sd)))
}

// ── Patient generation ───────────────────────────────────────────────────────

interface Patient {
  patient_code: string
  age: number
  sex: string
  subtype_label: string  // left empty — assigned by Phase 2 ML
  response_status: string
  val66met_genotype: string
  cyp2d6_status: string
  prior_ad_trial_count: number
  prior_ssri_exposure: boolean
  symptom_cluster: string
  baseline_bdnf_ng_ml: number
  baseline_il6_pg_ml: number
  baseline_crp_mg_l: number
  baseline_tnf_alpha_pg_ml: number
  baseline_hamd17: number
  baseline_madrs: number
  baseline_sleep_regularity: number
  baseline_anhedonia_subscale: number
  wk2_madrs: number
  wk4_madrs: number
  wk8_madrs: number
  wk2_bdnf: number
  wk4_il6: number
}

function genGenotype(status: string): string {
  const r = rand()
  if (status === 'responder') return r < 0.50 ? 'Val/Val' : r < 0.90 ? 'Val/Met' : 'Met/Met'
  if (status === 'nonresponder') return r < 0.20 ? 'Val/Val' : r < 0.55 ? 'Val/Met' : 'Met/Met'
  return r < 0.35 ? 'Val/Val' : r < 0.80 ? 'Val/Met' : 'Met/Met'  // uncertain
}

function genCYP(status: string): string {
  const r = rand()
  if (status === 'responder') return r < 0.75 ? 'EM' : r < 0.92 ? 'IM' : 'PM'
  if (status === 'nonresponder') return r < 0.50 ? 'EM' : r < 0.78 ? 'IM' : 'PM'
  return r < 0.65 ? 'EM' : r < 0.88 ? 'IM' : 'PM'
}

function genCluster(status: string): string {
  if (status === 'responder') return rand() < 0.65 ? 'anhedonia-dominant' : 'mixed'
  if (status === 'nonresponder') return rand() < 0.70 ? 'vegetative' : 'mixed'
  return 'mixed'
}

function makeResponder(code: string): Patient {
  const age = randInt(22, 52)
  const sex = rand() < 0.60 ? 'F' : 'M'
  const bdnf = round1(clampGaussian(25, 4, 18, 33))
  const il6 = round1(clampGaussian(2.8, 1.2, 1.0, 5.5))
  const crp = round1(clampGaussian(1.2, 0.6, 0.3, 3.0))
  const tnf = round1(clampGaussian(6.2, 1.5, 3.0, 10.0))
  const madrs = randInt(23, 36)
  const hamd = Math.round(madrs * randRange(0.70, 0.82))
  const priorAd = randInt(0, 3)
  const sleep = round2(clampGaussian(0.54, 0.08, 0.35, 0.70))
  const anhedonia = randInt(7, 12)

  // MADRS trajectory: strong response (≥50% reduction by Wk8)
  const wk2 = Math.round(madrs * randRange(0.75, 0.92))
  const wk4 = Math.round(madrs * randRange(0.42, 0.60))
  const wk8 = Math.round(madrs * randRange(0.15, 0.42))  // ensures ≥50% reduction

  const wk2Bdnf = round1(bdnf * randRange(1.05, 1.30))
  const wk4Il6 = round1(il6 * randRange(0.65, 0.92))

  return {
    patient_code: code, age, sex, subtype_label: '',
    response_status: 'responder',
    val66met_genotype: genGenotype('responder'),
    cyp2d6_status: genCYP('responder'),
    prior_ad_trial_count: priorAd,
    prior_ssri_exposure: priorAd > 0 || rand() < 0.3,
    symptom_cluster: genCluster('responder'),
    baseline_bdnf_ng_ml: bdnf, baseline_il6_pg_ml: il6,
    baseline_crp_mg_l: crp, baseline_tnf_alpha_pg_ml: tnf,
    baseline_hamd17: hamd, baseline_madrs: madrs,
    baseline_sleep_regularity: sleep, baseline_anhedonia_subscale: anhedonia,
    wk2_madrs: wk2, wk4_madrs: wk4, wk8_madrs: wk8,
    wk2_bdnf: wk2Bdnf, wk4_il6: wk4Il6,
  }
}

function makeNonresponder(code: string): Patient {
  const age = randInt(33, 62)
  const sex = rand() < 0.45 ? 'F' : 'M'
  const bdnf = round1(clampGaussian(13, 3.5, 7, 21))
  const il6 = round1(clampGaussian(8.5, 2.5, 4.5, 15.0))
  const crp = round1(clampGaussian(4.2, 1.3, 2.0, 7.5))
  const tnf = round1(clampGaussian(13, 2.5, 8.0, 20.0))
  const madrs = randInt(25, 39)
  const hamd = Math.round(madrs * randRange(0.72, 0.84))
  const priorAd = randInt(2, 6)
  const sleep = round2(clampGaussian(0.32, 0.06, 0.18, 0.44))
  const anhedonia = randInt(2, 7)

  // MADRS trajectory: minimal response (<25% reduction)
  const wk2 = Math.round(madrs * randRange(0.88, 1.02))
  const wk4 = Math.round(madrs * randRange(0.82, 0.97))
  const wk8 = Math.round(madrs * randRange(0.76, 0.94))  // <25% reduction

  const wk2Bdnf = round1(bdnf * randRange(0.92, 1.06))
  const wk4Il6 = round1(il6 * randRange(0.93, 1.12))

  return {
    patient_code: code, age, sex, subtype_label: '',
    response_status: 'nonresponder',
    val66met_genotype: genGenotype('nonresponder'),
    cyp2d6_status: genCYP('nonresponder'),
    prior_ad_trial_count: priorAd,
    prior_ssri_exposure: true,
    symptom_cluster: genCluster('nonresponder'),
    baseline_bdnf_ng_ml: bdnf, baseline_il6_pg_ml: il6,
    baseline_crp_mg_l: crp, baseline_tnf_alpha_pg_ml: tnf,
    baseline_hamd17: hamd, baseline_madrs: madrs,
    baseline_sleep_regularity: sleep, baseline_anhedonia_subscale: anhedonia,
    wk2_madrs: wk2, wk4_madrs: wk4, wk8_madrs: wk8,
    wk2_bdnf: wk2Bdnf, wk4_il6: wk4Il6,
  }
}

function makeUncertain(code: string): Patient {
  const age = randInt(25, 50)
  const sex = rand() < 0.50 ? 'F' : 'M'
  const bdnf = round1(clampGaussian(18.5, 2.5, 13, 24))
  const il6 = round1(clampGaussian(5.2, 1.0, 3.2, 7.5))
  const crp = round1(clampGaussian(2.3, 0.6, 1.0, 4.0))
  const tnf = round1(clampGaussian(8.5, 1.5, 5.5, 12.0))
  const madrs = randInt(22, 33)
  const hamd = Math.round(madrs * randRange(0.71, 0.82))
  const priorAd = randInt(1, 3)
  const sleep = round2(clampGaussian(0.46, 0.07, 0.32, 0.58))
  const anhedonia = randInt(5, 9)

  // MADRS trajectory: partial response (25-49% reduction)
  const wk2 = Math.round(madrs * randRange(0.80, 0.94))
  const wk4 = Math.round(madrs * randRange(0.62, 0.78))
  const wk8 = Math.round(madrs * randRange(0.52, 0.73))

  const wk2Bdnf = round1(bdnf * randRange(1.00, 1.18))
  const wk4Il6 = round1(il6 * randRange(0.80, 1.02))

  return {
    patient_code: code, age, sex, subtype_label: '',
    response_status: 'uncertain',
    val66met_genotype: genGenotype('uncertain'),
    cyp2d6_status: genCYP('uncertain'),
    prior_ad_trial_count: priorAd,
    prior_ssri_exposure: priorAd > 0 || rand() < 0.4,
    symptom_cluster: genCluster('uncertain'),
    baseline_bdnf_ng_ml: bdnf, baseline_il6_pg_ml: il6,
    baseline_crp_mg_l: crp, baseline_tnf_alpha_pg_ml: tnf,
    baseline_hamd17: hamd, baseline_madrs: madrs,
    baseline_sleep_regularity: sleep, baseline_anhedonia_subscale: anhedonia,
    wk2_madrs: wk2, wk4_madrs: wk4, wk8_madrs: wk8,
    wk2_bdnf: wk2Bdnf, wk4_il6: wk4Il6,
  }
}

// ── Read existing P001-P016 and generate P017-P080 ───────────────────────────

const dataDir = path.resolve(__dirname, '..', 'data')
const csvPath = path.join(dataDir, 'patients.csv')
const existingContent = fs.readFileSync(csvPath, 'utf8').trim()
const existingLines = existingContent.split('\n')
const header = existingLines[0]
const existingRows = existingLines.slice(1) // P001-P016

// Target: 36 responders, 24 nonresponders, 20 uncertain = 80 total
// Existing: 7 responders, 5 nonresponders, 4 uncertain = 16
// New: 29 responders, 19 nonresponders, 16 uncertain = 64

const newPatients: Patient[] = []
let idx = 17

// 29 new responders
for (let i = 0; i < 29; i++) {
  newPatients.push(makeResponder(`XYL-P${String(idx).padStart(3, '0')}`))
  idx++
}
// 19 new nonresponders
for (let i = 0; i < 19; i++) {
  newPatients.push(makeNonresponder(`XYL-P${String(idx).padStart(3, '0')}`))
  idx++
}
// 16 new uncertain
for (let i = 0; i < 16; i++) {
  newPatients.push(makeUncertain(`XYL-P${String(idx).padStart(3, '0')}`))
  idx++
}

// Convert to CSV rows
function toCSVRow(p: Patient): string {
  return [
    p.patient_code, p.age, p.sex, p.subtype_label, p.response_status,
    p.val66met_genotype, p.cyp2d6_status, p.prior_ad_trial_count,
    p.prior_ssri_exposure, p.symptom_cluster,
    p.baseline_bdnf_ng_ml, p.baseline_il6_pg_ml, p.baseline_crp_mg_l,
    p.baseline_tnf_alpha_pg_ml, p.baseline_hamd17, p.baseline_madrs,
    p.baseline_sleep_regularity, p.baseline_anhedonia_subscale,
    p.wk2_madrs, p.wk4_madrs, p.wk8_madrs, p.wk2_bdnf, p.wk4_il6,
  ].join(',')
}

const newRows = newPatients.map(toCSVRow)
const allLines = [header, ...existingRows, ...newRows]
fs.writeFileSync(csvPath, allLines.join('\n') + '\n')

// Stats
const all = [...existingRows.map(l => l.split(',')[4]), ...newPatients.map(p => p.response_status)]
const resp = all.filter(s => s === 'responder').length
const nonr = all.filter(s => s === 'nonresponder').length
const unc = all.filter(s => s === 'uncertain').length
console.log(`Generated ${allLines.length - 1} patients → ${csvPath}`)
console.log(`  Responders: ${resp}, Nonresponders: ${nonr}, Uncertain: ${unc}`)

// Validate MADRS reductions
let violations = 0
for (const p of newPatients) {
  const reduction = (p.baseline_madrs - p.wk8_madrs) / p.baseline_madrs
  if (p.response_status === 'responder' && reduction < 0.50) {
    console.warn(`  ⚠ ${p.patient_code}: responder but only ${Math.round(reduction * 100)}% MADRS reduction`)
    violations++
  }
  if (p.response_status === 'nonresponder' && reduction >= 0.25) {
    console.warn(`  ⚠ ${p.patient_code}: nonresponder but ${Math.round(reduction * 100)}% MADRS reduction`)
    violations++
  }
}
if (violations === 0) console.log('  ✓ All MADRS trajectories consistent with response status')
