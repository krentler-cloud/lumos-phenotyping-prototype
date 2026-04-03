/**
 * Seed script: generates 20 synthetic MDD patient records
 * Run with: npx ts-node scripts/seed_patients.ts
 *
 * Distribution:
 *   8 High Responder   — elevated BDNF, low inflammation, SERT l/l
 *   6 Moderate Responder — mixed biomarker profile
 *   6 Non-Responder    — low BDNF, elevated inflammation, SERT s/s, multiple failures
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import * as path from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config({ path: path.resolve(__dirname, '../.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function rand(min: number, max: number, dp = 1) {
  return parseFloat((Math.random() * (max - min) + min).toFixed(dp))
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

const STUDY_ID = 'STUDY-001'

const patients = [
  // ── HIGH RESPONDERS (8) ──────────────────────────────────────────────────
  {
    patient_code: 'PT-HR-001',
    profile: 'high',
    demographics: { age: 34, sex: 'F', weight_kg: 68 },
    diagnosis: { primary: 'MDD', severity: 'moderate', episode_count: 1, duration_months: 8, hamd_score: 18 },
    prior_treatments: [{ drug: 'sertraline', dose_mg: 100, response: 'partial', duration_weeks: 10 }],
    biomarkers: { bdnf_serum_ng_ml: 17.4, crp_mg_l: 1.2, tnf_alpha_pg_ml: 14.1, il6_pg_ml: 2.1, cortisol_am_ug_dl: 14.2, tryptophan_ratio: 0.11 },
    genetics: { sert_genotype: 'l/l', comt_val158met: 'met/met', bdnf_val66met: 'val/val' },
    functional: { sleep_efficiency_pct: 82, psychomotor_retardation: false, anhedonia_present: true },
  },
  {
    patient_code: 'PT-HR-002',
    profile: 'high',
    demographics: { age: 41, sex: 'M', weight_kg: 82 },
    diagnosis: { primary: 'MDD', severity: 'moderate', episode_count: 2, duration_months: 12, hamd_score: 20 },
    prior_treatments: [{ drug: 'escitalopram', dose_mg: 10, response: 'partial', duration_weeks: 8 }],
    biomarkers: { bdnf_serum_ng_ml: 19.1, crp_mg_l: 0.9, tnf_alpha_pg_ml: 12.8, il6_pg_ml: 1.8, cortisol_am_ug_dl: 13.1, tryptophan_ratio: 0.13 },
    genetics: { sert_genotype: 'l/l', comt_val158met: 'val/met', bdnf_val66met: 'val/val' },
    functional: { sleep_efficiency_pct: 79, psychomotor_retardation: false, anhedonia_present: false },
  },
  {
    patient_code: 'PT-HR-003',
    profile: 'high',
    demographics: { age: 28, sex: 'F', weight_kg: 61 },
    diagnosis: { primary: 'MDD', severity: 'mild-moderate', episode_count: 1, duration_months: 6, hamd_score: 16 },
    prior_treatments: [],
    biomarkers: { bdnf_serum_ng_ml: 21.3, crp_mg_l: 0.7, tnf_alpha_pg_ml: 11.2, il6_pg_ml: 1.4, cortisol_am_ug_dl: 12.8, tryptophan_ratio: 0.14 },
    genetics: { sert_genotype: 'l/l', comt_val158met: 'met/met', bdnf_val66met: 'val/val' },
    functional: { sleep_efficiency_pct: 85, psychomotor_retardation: false, anhedonia_present: false },
  },
  {
    patient_code: 'PT-HR-004',
    profile: 'high',
    demographics: { age: 52, sex: 'F', weight_kg: 74 },
    diagnosis: { primary: 'MDD', severity: 'moderate', episode_count: 2, duration_months: 14, hamd_score: 21 },
    prior_treatments: [{ drug: 'fluoxetine', dose_mg: 20, response: 'partial', duration_weeks: 12 }],
    biomarkers: { bdnf_serum_ng_ml: 16.8, crp_mg_l: 1.4, tnf_alpha_pg_ml: 15.3, il6_pg_ml: 2.4, cortisol_am_ug_dl: 15.6, tryptophan_ratio: 0.10 },
    genetics: { sert_genotype: 'l/l', comt_val158met: 'val/val', bdnf_val66met: 'val/val' },
    functional: { sleep_efficiency_pct: 76, psychomotor_retardation: false, anhedonia_present: true },
  },
  {
    patient_code: 'PT-HR-005',
    profile: 'high',
    demographics: { age: 37, sex: 'M', weight_kg: 78 },
    diagnosis: { primary: 'MDD', severity: 'moderate', episode_count: 1, duration_months: 10, hamd_score: 19 },
    prior_treatments: [{ drug: 'venlafaxine', dose_mg: 75, response: 'partial', duration_weeks: 8 }],
    biomarkers: { bdnf_serum_ng_ml: 18.2, crp_mg_l: 1.1, tnf_alpha_pg_ml: 13.4, il6_pg_ml: 2.0, cortisol_am_ug_dl: 13.9, tryptophan_ratio: 0.12 },
    genetics: { sert_genotype: 'l/l', comt_val158met: 'met/met', bdnf_val66met: 'val/val' },
    functional: { sleep_efficiency_pct: 80, psychomotor_retardation: false, anhedonia_present: false },
  },
  {
    patient_code: 'PT-HR-006',
    profile: 'high',
    demographics: { age: 45, sex: 'F', weight_kg: 65 },
    diagnosis: { primary: 'MDD', severity: 'mild-moderate', episode_count: 2, duration_months: 9, hamd_score: 17 },
    prior_treatments: [{ drug: 'citalopram', dose_mg: 20, response: 'partial', duration_weeks: 10 }],
    biomarkers: { bdnf_serum_ng_ml: 20.1, crp_mg_l: 0.8, tnf_alpha_pg_ml: 11.8, il6_pg_ml: 1.6, cortisol_am_ug_dl: 12.4, tryptophan_ratio: 0.13 },
    genetics: { sert_genotype: 'l/l', comt_val158met: 'val/met', bdnf_val66met: 'val/val' },
    functional: { sleep_efficiency_pct: 83, psychomotor_retardation: false, anhedonia_present: false },
  },
  {
    patient_code: 'PT-HR-007',
    profile: 'high',
    demographics: { age: 31, sex: 'M', weight_kg: 85 },
    diagnosis: { primary: 'MDD', severity: 'moderate', episode_count: 1, duration_months: 7, hamd_score: 18 },
    prior_treatments: [],
    biomarkers: { bdnf_serum_ng_ml: 22.5, crp_mg_l: 0.6, tnf_alpha_pg_ml: 10.9, il6_pg_ml: 1.3, cortisol_am_ug_dl: 11.8, tryptophan_ratio: 0.15 },
    genetics: { sert_genotype: 'l/l', comt_val158met: 'met/met', bdnf_val66met: 'val/val' },
    functional: { sleep_efficiency_pct: 88, psychomotor_retardation: false, anhedonia_present: false },
  },
  {
    patient_code: 'PT-HR-008',
    profile: 'high',
    demographics: { age: 58, sex: 'F', weight_kg: 71 },
    diagnosis: { primary: 'MDD', severity: 'moderate', episode_count: 3, duration_months: 16, hamd_score: 22 },
    prior_treatments: [
      { drug: 'sertraline', dose_mg: 150, response: 'partial', duration_weeks: 12 },
      { drug: 'bupropion', dose_mg: 150, response: 'partial', duration_weeks: 8 },
    ],
    biomarkers: { bdnf_serum_ng_ml: 15.9, crp_mg_l: 1.6, tnf_alpha_pg_ml: 16.2, il6_pg_ml: 2.7, cortisol_am_ug_dl: 16.4, tryptophan_ratio: 0.09 },
    genetics: { sert_genotype: 'l/l', comt_val158met: 'val/val', bdnf_val66met: 'val/val' },
    functional: { sleep_efficiency_pct: 72, psychomotor_retardation: false, anhedonia_present: true },
  },

  // ── MODERATE RESPONDERS (6) ──────────────────────────────────────────────
  {
    patient_code: 'PT-MR-001',
    profile: 'moderate',
    demographics: { age: 34, sex: 'F', weight_kg: 68 },
    diagnosis: { primary: 'MDD', severity: 'moderate-severe', episode_count: 2, duration_months: 18, hamd_score: 24 },
    prior_treatments: [
      { drug: 'sertraline', dose_mg: 150, response: 'partial', duration_weeks: 12 },
      { drug: 'escitalopram', dose_mg: 20, response: 'none', duration_weeks: 8 },
    ],
    biomarkers: { bdnf_serum_ng_ml: 14.2, crp_mg_l: 2.1, tnf_alpha_pg_ml: 22.4, il6_pg_ml: 3.8, cortisol_am_ug_dl: 18.9, tryptophan_ratio: 0.082 },
    genetics: { sert_genotype: 's/l', comt_val158met: 'val/val', bdnf_val66met: 'met/met' },
    functional: { sleep_efficiency_pct: 68, psychomotor_retardation: true, anhedonia_present: true },
  },
  {
    patient_code: 'PT-MR-002',
    profile: 'moderate',
    demographics: { age: 47, sex: 'M', weight_kg: 90 },
    diagnosis: { primary: 'MDD', severity: 'moderate', episode_count: 3, duration_months: 20, hamd_score: 23 },
    prior_treatments: [
      { drug: 'fluoxetine', dose_mg: 40, response: 'partial', duration_weeks: 16 },
      { drug: 'mirtazapine', dose_mg: 30, response: 'partial', duration_weeks: 10 },
    ],
    biomarkers: { bdnf_serum_ng_ml: 13.1, crp_mg_l: 2.8, tnf_alpha_pg_ml: 24.1, il6_pg_ml: 4.2, cortisol_am_ug_dl: 19.8, tryptophan_ratio: 0.077 },
    genetics: { sert_genotype: 's/l', comt_val158met: 'val/met', bdnf_val66met: 'val/met' },
    functional: { sleep_efficiency_pct: 64, psychomotor_retardation: true, anhedonia_present: true },
  },
  {
    patient_code: 'PT-MR-003',
    profile: 'moderate',
    demographics: { age: 39, sex: 'F', weight_kg: 72 },
    diagnosis: { primary: 'MDD', severity: 'moderate-severe', episode_count: 2, duration_months: 15, hamd_score: 22 },
    prior_treatments: [{ drug: 'venlafaxine', dose_mg: 150, response: 'partial', duration_weeks: 14 }],
    biomarkers: { bdnf_serum_ng_ml: 12.8, crp_mg_l: 2.4, tnf_alpha_pg_ml: 21.6, il6_pg_ml: 3.5, cortisol_am_ug_dl: 17.4, tryptophan_ratio: 0.085 },
    genetics: { sert_genotype: 's/l', comt_val158met: 'val/val', bdnf_val66met: 'met/met' },
    functional: { sleep_efficiency_pct: 66, psychomotor_retardation: false, anhedonia_present: true },
  },
  {
    patient_code: 'PT-MR-004',
    profile: 'moderate',
    demographics: { age: 55, sex: 'M', weight_kg: 88 },
    diagnosis: { primary: 'MDD', severity: 'moderate', episode_count: 4, duration_months: 24, hamd_score: 21 },
    prior_treatments: [
      { drug: 'citalopram', dose_mg: 40, response: 'partial', duration_weeks: 12 },
      { drug: 'bupropion', dose_mg: 300, response: 'partial', duration_weeks: 16 },
    ],
    biomarkers: { bdnf_serum_ng_ml: 11.9, crp_mg_l: 3.1, tnf_alpha_pg_ml: 25.8, il6_pg_ml: 4.9, cortisol_am_ug_dl: 20.1, tryptophan_ratio: 0.074 },
    genetics: { sert_genotype: 's/l', comt_val158met: 'val/met', bdnf_val66met: 'val/met' },
    functional: { sleep_efficiency_pct: 61, psychomotor_retardation: true, anhedonia_present: true },
  },
  {
    patient_code: 'PT-MR-005',
    profile: 'moderate',
    demographics: { age: 43, sex: 'F', weight_kg: 66 },
    diagnosis: { primary: 'MDD', severity: 'moderate-severe', episode_count: 2, duration_months: 17, hamd_score: 23 },
    prior_treatments: [
      { drug: 'sertraline', dose_mg: 100, response: 'partial', duration_weeks: 10 },
    ],
    biomarkers: { bdnf_serum_ng_ml: 13.5, crp_mg_l: 2.6, tnf_alpha_pg_ml: 23.2, il6_pg_ml: 4.1, cortisol_am_ug_dl: 18.2, tryptophan_ratio: 0.080 },
    genetics: { sert_genotype: 's/l', comt_val158met: 'val/val', bdnf_val66met: 'met/met' },
    functional: { sleep_efficiency_pct: 65, psychomotor_retardation: false, anhedonia_present: true },
  },
  {
    patient_code: 'PT-MR-006',
    profile: 'moderate',
    demographics: { age: 36, sex: 'M', weight_kg: 79 },
    diagnosis: { primary: 'MDD', severity: 'moderate', episode_count: 3, duration_months: 22, hamd_score: 22 },
    prior_treatments: [
      { drug: 'escitalopram', dose_mg: 20, response: 'partial', duration_weeks: 12 },
      { drug: 'duloxetine', dose_mg: 60, response: 'partial', duration_weeks: 8 },
    ],
    biomarkers: { bdnf_serum_ng_ml: 12.2, crp_mg_l: 2.9, tnf_alpha_pg_ml: 24.7, il6_pg_ml: 4.4, cortisol_am_ug_dl: 19.3, tryptophan_ratio: 0.078 },
    genetics: { sert_genotype: 's/l', comt_val158met: 'val/met', bdnf_val66met: 'val/met' },
    functional: { sleep_efficiency_pct: 63, psychomotor_retardation: true, anhedonia_present: true },
  },

  // ── NON-RESPONDERS (6) ───────────────────────────────────────────────────
  {
    patient_code: 'PT-NR-001',
    profile: 'non',
    demographics: { age: 48, sex: 'F', weight_kg: 76 },
    diagnosis: { primary: 'MDD', severity: 'severe', episode_count: 5, duration_months: 36, hamd_score: 29 },
    prior_treatments: [
      { drug: 'sertraline', dose_mg: 200, response: 'none', duration_weeks: 12 },
      { drug: 'venlafaxine', dose_mg: 225, response: 'none', duration_weeks: 12 },
      { drug: 'lithium', dose_mg: 900, response: 'none', duration_weeks: 16 },
    ],
    biomarkers: { bdnf_serum_ng_ml: 7.2, crp_mg_l: 5.8, tnf_alpha_pg_ml: 38.4, il6_pg_ml: 8.1, cortisol_am_ug_dl: 26.4, tryptophan_ratio: 0.051 },
    genetics: { sert_genotype: 's/s', comt_val158met: 'val/val', bdnf_val66met: 'met/met' },
    functional: { sleep_efficiency_pct: 48, psychomotor_retardation: true, anhedonia_present: true },
  },
  {
    patient_code: 'PT-NR-002',
    profile: 'non',
    demographics: { age: 62, sex: 'M', weight_kg: 94 },
    diagnosis: { primary: 'MDD', severity: 'severe', episode_count: 6, duration_months: 48, hamd_score: 31 },
    prior_treatments: [
      { drug: 'fluoxetine', dose_mg: 60, response: 'none', duration_weeks: 16 },
      { drug: 'mirtazapine', dose_mg: 45, response: 'none', duration_weeks: 12 },
      { drug: 'quetiapine', dose_mg: 300, response: 'none', duration_weeks: 20 },
    ],
    biomarkers: { bdnf_serum_ng_ml: 6.1, crp_mg_l: 6.9, tnf_alpha_pg_ml: 42.1, il6_pg_ml: 9.4, cortisol_am_ug_dl: 28.9, tryptophan_ratio: 0.044 },
    genetics: { sert_genotype: 's/s', comt_val158met: 'val/val', bdnf_val66met: 'met/met' },
    functional: { sleep_efficiency_pct: 42, psychomotor_retardation: true, anhedonia_present: true },
  },
  {
    patient_code: 'PT-NR-003',
    profile: 'non',
    demographics: { age: 54, sex: 'F', weight_kg: 81 },
    diagnosis: { primary: 'MDD', severity: 'severe', episode_count: 4, duration_months: 30, hamd_score: 28 },
    prior_treatments: [
      { drug: 'citalopram', dose_mg: 40, response: 'none', duration_weeks: 12 },
      { drug: 'bupropion', dose_mg: 450, response: 'none', duration_weeks: 16 },
      { drug: 'lamotrigine', dose_mg: 200, response: 'none', duration_weeks: 20 },
    ],
    biomarkers: { bdnf_serum_ng_ml: 8.4, crp_mg_l: 5.2, tnf_alpha_pg_ml: 35.6, il6_pg_ml: 7.6, cortisol_am_ug_dl: 25.1, tryptophan_ratio: 0.055 },
    genetics: { sert_genotype: 's/s', comt_val158met: 'val/val', bdnf_val66met: 'met/met' },
    functional: { sleep_efficiency_pct: 51, psychomotor_retardation: true, anhedonia_present: true },
  },
  {
    patient_code: 'PT-NR-004',
    profile: 'non',
    demographics: { age: 38, sex: 'M', weight_kg: 83 },
    diagnosis: { primary: 'MDD', severity: 'severe', episode_count: 4, duration_months: 28, hamd_score: 27 },
    prior_treatments: [
      { drug: 'escitalopram', dose_mg: 40, response: 'none', duration_weeks: 12 },
      { drug: 'duloxetine', dose_mg: 120, response: 'none', duration_weeks: 16 },
    ],
    biomarkers: { bdnf_serum_ng_ml: 7.8, crp_mg_l: 4.9, tnf_alpha_pg_ml: 33.8, il6_pg_ml: 7.2, cortisol_am_ug_dl: 24.6, tryptophan_ratio: 0.058 },
    genetics: { sert_genotype: 's/s', comt_val158met: 'val/val', bdnf_val66met: 'met/met' },
    functional: { sleep_efficiency_pct: 53, psychomotor_retardation: true, anhedonia_present: true },
  },
  {
    patient_code: 'PT-NR-005',
    profile: 'non',
    demographics: { age: 65, sex: 'F', weight_kg: 69 },
    diagnosis: { primary: 'MDD', severity: 'severe', episode_count: 7, duration_months: 60, hamd_score: 32 },
    prior_treatments: [
      { drug: 'sertraline', dose_mg: 200, response: 'none', duration_weeks: 16 },
      { drug: 'phenelzine', dose_mg: 60, response: 'none', duration_weeks: 12 },
      { drug: 'lithium', dose_mg: 1200, response: 'none', duration_weeks: 24 },
    ],
    biomarkers: { bdnf_serum_ng_ml: 5.4, crp_mg_l: 7.8, tnf_alpha_pg_ml: 46.2, il6_pg_ml: 11.2, cortisol_am_ug_dl: 31.4, tryptophan_ratio: 0.039 },
    genetics: { sert_genotype: 's/s', comt_val158met: 'val/val', bdnf_val66met: 'met/met' },
    functional: { sleep_efficiency_pct: 38, psychomotor_retardation: true, anhedonia_present: true },
  },
  {
    patient_code: 'PT-NR-006',
    profile: 'non',
    demographics: { age: 44, sex: 'M', weight_kg: 91 },
    diagnosis: { primary: 'MDD', severity: 'severe', episode_count: 5, duration_months: 40, hamd_score: 30 },
    prior_treatments: [
      { drug: 'venlafaxine', dose_mg: 300, response: 'none', duration_weeks: 16 },
      { drug: 'mirtazapine', dose_mg: 45, response: 'none', duration_weeks: 12 },
      { drug: 'aripiprazole', dose_mg: 15, response: 'none', duration_weeks: 16 },
    ],
    biomarkers: { bdnf_serum_ng_ml: 6.8, crp_mg_l: 6.4, tnf_alpha_pg_ml: 40.3, il6_pg_ml: 8.8, cortisol_am_ug_dl: 27.6, tryptophan_ratio: 0.047 },
    genetics: { sert_genotype: 's/s', comt_val158met: 'val/val', bdnf_val66met: 'met/met' },
    functional: { sleep_efficiency_pct: 44, psychomotor_retardation: true, anhedonia_present: true },
  },
]

async function seed() {
  console.log(`Seeding ${patients.length} synthetic patients into Supabase...`)

  const rows = patients.map(p => ({
    study_id: STUDY_ID,
    patient_code: p.patient_code,
    source_type: 'synthetic' as const,
    data: {
      demographics: p.demographics,
      diagnosis: p.diagnosis,
      prior_treatments: p.prior_treatments,
      biomarkers: p.biomarkers,
      genetics: p.genetics,
      functional: p.functional,
      study_drug: { id: STUDY_ID, route: 'oral', phase: 'preclinical' },
    },
  }))

  const { data, error } = await supabase.from('patients').insert(rows).select('id, patient_code')

  if (error) {
    console.error('Seed failed:', error.message)
    process.exit(1)
  }

  console.log(`✓ Inserted ${data.length} patients:`)
  data.forEach(p => console.log(`  ${p.patient_code} — ${p.id}`))

  // Suppress unused var warnings
  void rand; void pick
}

seed()
