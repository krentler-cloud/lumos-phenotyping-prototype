/**
 * Seed N=16 synthetic MDD patients for XYL-1001 Phase 1 trial.
 *
 * Design intent:
 *   Subtype A (n=7): Low-BDNF / TrkB-intact — predicted responders by Phase 1 corpus hypothesis
 *   Subtype B (n=6): High-inflammatory (IL-6/CRP elevated) — predicted non-responders
 *   Subtype C (n=3): Mixed / intermediate — uncertain response
 *
 * Run: npx ts-node --project tsconfig.json scripts/seed_clinical_patients.ts
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as fs from 'fs'
import * as path from 'path'

// Load .env.local manually
const envPath = path.resolve(process.cwd(), '.env.local')
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    const val = trimmed.slice(eq + 1).trim()
    if (key && !process.env[key]) process.env[key] = val
  }
}

const STUDY_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface Patient {
  study_id: string
  patient_code: string
  baseline_hamd17: number
  baseline_madrs: number
  baseline_bdnf_ng_ml: number
  baseline_tnf_alpha_pg_ml: number
  baseline_il6_pg_ml: number
  baseline_crp_mg_l: number
  baseline_sleep_regularity: number
  baseline_anhedonia_subscale: number
  prior_ad_trials: number
  age: number
  sex: string
  wk2_madrs: number
  wk4_madrs: number
  wk8_madrs: number
  wk2_bdnf: number
  wk4_il6: number
  response_status: 'responder' | 'nonresponder' | 'uncertain'
}

// ── Subtype A: Low BDNF, normal inflammatory — Responders ────────────────────
// XYL-1001 TrkB agonism drives BDNF-pathway recovery in this subtype.
const subtypeA: Patient[] = [
  {
    study_id: STUDY_ID, patient_code: 'XYL-001',
    baseline_hamd17: 24, baseline_madrs: 32,
    baseline_bdnf_ng_ml: 9.2, baseline_tnf_alpha_pg_ml: 1.9, baseline_il6_pg_ml: 1.8, baseline_crp_mg_l: 0.8,
    baseline_sleep_regularity: 0.52, baseline_anhedonia_subscale: 9, prior_ad_trials: 2, age: 34, sex: 'F',
    wk2_madrs: 26, wk4_madrs: 19, wk8_madrs: 13, wk2_bdnf: 11.8, wk4_il6: 1.6, response_status: 'responder',
  },
  {
    study_id: STUDY_ID, patient_code: 'XYL-002',
    baseline_hamd17: 26, baseline_madrs: 34,
    baseline_bdnf_ng_ml: 11.4, baseline_tnf_alpha_pg_ml: 2.1, baseline_il6_pg_ml: 2.0, baseline_crp_mg_l: 1.1,
    baseline_sleep_regularity: 0.48, baseline_anhedonia_subscale: 8, prior_ad_trials: 1, age: 41, sex: 'M',
    wk2_madrs: 28, wk4_madrs: 20, wk8_madrs: 14, wk2_bdnf: 14.3, wk4_il6: 1.8, response_status: 'responder',
  },
  {
    study_id: STUDY_ID, patient_code: 'XYL-003',
    baseline_hamd17: 22, baseline_madrs: 29,
    baseline_bdnf_ng_ml: 8.7, baseline_tnf_alpha_pg_ml: 1.7, baseline_il6_pg_ml: 1.6, baseline_crp_mg_l: 0.7,
    baseline_sleep_regularity: 0.55, baseline_anhedonia_subscale: 10, prior_ad_trials: 3, age: 28, sex: 'F',
    wk2_madrs: 23, wk4_madrs: 16, wk8_madrs: 11, wk2_bdnf: 11.2, wk4_il6: 1.5, response_status: 'responder',
  },
  {
    study_id: STUDY_ID, patient_code: 'XYL-004',
    baseline_hamd17: 25, baseline_madrs: 33,
    baseline_bdnf_ng_ml: 13.1, baseline_tnf_alpha_pg_ml: 2.3, baseline_il6_pg_ml: 2.2, baseline_crp_mg_l: 1.3,
    baseline_sleep_regularity: 0.44, baseline_anhedonia_subscale: 7, prior_ad_trials: 2, age: 52, sex: 'M',
    wk2_madrs: 27, wk4_madrs: 21, wk8_madrs: 15, wk2_bdnf: 16.4, wk4_il6: 1.9, response_status: 'responder',
  },
  {
    study_id: STUDY_ID, patient_code: 'XYL-005',
    baseline_hamd17: 23, baseline_madrs: 31,
    baseline_bdnf_ng_ml: 10.8, baseline_tnf_alpha_pg_ml: 2.0, baseline_il6_pg_ml: 1.9, baseline_crp_mg_l: 1.0,
    baseline_sleep_regularity: 0.50, baseline_anhedonia_subscale: 9, prior_ad_trials: 1, age: 37, sex: 'F',
    wk2_madrs: 25, wk4_madrs: 18, wk8_madrs: 12, wk2_bdnf: 13.7, wk4_il6: 1.7, response_status: 'responder',
  },
  {
    study_id: STUDY_ID, patient_code: 'XYL-006',
    baseline_hamd17: 27, baseline_madrs: 35,
    baseline_bdnf_ng_ml: 12.3, baseline_tnf_alpha_pg_ml: 2.2, baseline_il6_pg_ml: 2.1, baseline_crp_mg_l: 1.2,
    baseline_sleep_regularity: 0.46, baseline_anhedonia_subscale: 8, prior_ad_trials: 2, age: 45, sex: 'M',
    wk2_madrs: 29, wk4_madrs: 22, wk8_madrs: 15, wk2_bdnf: 15.6, wk4_il6: 1.8, response_status: 'responder',
  },
  {
    study_id: STUDY_ID, patient_code: 'XYL-007',
    baseline_hamd17: 24, baseline_madrs: 32,
    baseline_bdnf_ng_ml: 7.9, baseline_tnf_alpha_pg_ml: 1.8, baseline_il6_pg_ml: 1.5, baseline_crp_mg_l: 0.6,
    baseline_sleep_regularity: 0.53, baseline_anhedonia_subscale: 10, prior_ad_trials: 4, age: 31, sex: 'F',
    wk2_madrs: 26, wk4_madrs: 18, wk8_madrs: 12, wk2_bdnf: 10.1, wk4_il6: 1.4, response_status: 'responder',
  },
]

// ── Subtype B: Elevated IL-6/CRP — Non-responders ────────────────────────────
// High baseline inflammation blunts TrkB-mediated neuroplasticity response.
const subtypeB: Patient[] = [
  {
    study_id: STUDY_ID, patient_code: 'XYL-008',
    baseline_hamd17: 28, baseline_madrs: 38,
    baseline_bdnf_ng_ml: 18.3, baseline_tnf_alpha_pg_ml: 3.9, baseline_il6_pg_ml: 5.8, baseline_crp_mg_l: 4.2,
    baseline_sleep_regularity: 0.61, baseline_anhedonia_subscale: 5, prior_ad_trials: 3, age: 48, sex: 'F',
    wk2_madrs: 36, wk4_madrs: 33, wk8_madrs: 31, wk2_bdnf: 18.9, wk4_il6: 5.6, response_status: 'nonresponder',
  },
  {
    study_id: STUDY_ID, patient_code: 'XYL-009',
    baseline_hamd17: 26, baseline_madrs: 36,
    baseline_bdnf_ng_ml: 20.1, baseline_tnf_alpha_pg_ml: 4.1, baseline_il6_pg_ml: 6.2, baseline_crp_mg_l: 5.1,
    baseline_sleep_regularity: 0.58, baseline_anhedonia_subscale: 4, prior_ad_trials: 2, age: 55, sex: 'M',
    wk2_madrs: 34, wk4_madrs: 32, wk8_madrs: 30, wk2_bdnf: 20.4, wk4_il6: 6.0, response_status: 'nonresponder',
  },
  {
    study_id: STUDY_ID, patient_code: 'XYL-010',
    baseline_hamd17: 29, baseline_madrs: 39,
    baseline_bdnf_ng_ml: 16.7, baseline_tnf_alpha_pg_ml: 3.6, baseline_il6_pg_ml: 4.9, baseline_crp_mg_l: 3.8,
    baseline_sleep_regularity: 0.63, baseline_anhedonia_subscale: 6, prior_ad_trials: 4, age: 43, sex: 'F',
    wk2_madrs: 37, wk4_madrs: 34, wk8_madrs: 32, wk2_bdnf: 17.1, wk4_il6: 4.8, response_status: 'nonresponder',
  },
  {
    study_id: STUDY_ID, patient_code: 'XYL-011',
    baseline_hamd17: 27, baseline_madrs: 37,
    baseline_bdnf_ng_ml: 22.4, baseline_tnf_alpha_pg_ml: 4.8, baseline_il6_pg_ml: 7.1, baseline_crp_mg_l: 6.3,
    baseline_sleep_regularity: 0.57, baseline_anhedonia_subscale: 4, prior_ad_trials: 2, age: 58, sex: 'M',
    wk2_madrs: 35, wk4_madrs: 33, wk8_madrs: 31, wk2_bdnf: 22.8, wk4_il6: 7.0, response_status: 'nonresponder',
  },
  {
    study_id: STUDY_ID, patient_code: 'XYL-012',
    baseline_hamd17: 28, baseline_madrs: 38,
    baseline_bdnf_ng_ml: 17.9, baseline_tnf_alpha_pg_ml: 3.7, baseline_il6_pg_ml: 5.4, baseline_crp_mg_l: 4.6,
    baseline_sleep_regularity: 0.60, baseline_anhedonia_subscale: 5, prior_ad_trials: 3, age: 39, sex: 'F',
    wk2_madrs: 36, wk4_madrs: 34, wk8_madrs: 32, wk2_bdnf: 18.2, wk4_il6: 5.3, response_status: 'nonresponder',
  },
  {
    study_id: STUDY_ID, patient_code: 'XYL-013',
    baseline_hamd17: 30, baseline_madrs: 40,
    baseline_bdnf_ng_ml: 19.6, baseline_tnf_alpha_pg_ml: 4.5, baseline_il6_pg_ml: 6.8, baseline_crp_mg_l: 5.7,
    baseline_sleep_regularity: 0.56, baseline_anhedonia_subscale: 4, prior_ad_trials: 1, age: 50, sex: 'M',
    wk2_madrs: 38, wk4_madrs: 35, wk8_madrs: 33, wk2_bdnf: 19.9, wk4_il6: 6.7, response_status: 'nonresponder',
  },
]

// ── Subtype C: Mixed — Uncertain ──────────────────────────────────────────────
// Intermediate biomarker profile; partial MADRS response observed.
const subtypeC: Patient[] = [
  {
    study_id: STUDY_ID, patient_code: 'XYL-014',
    baseline_hamd17: 25, baseline_madrs: 34,
    baseline_bdnf_ng_ml: 15.2, baseline_tnf_alpha_pg_ml: 2.8, baseline_il6_pg_ml: 3.1, baseline_crp_mg_l: 2.4,
    baseline_sleep_regularity: 0.54, baseline_anhedonia_subscale: 7, prior_ad_trials: 2, age: 36, sex: 'F',
    wk2_madrs: 29, wk4_madrs: 25, wk8_madrs: 22, wk2_bdnf: 16.8, wk4_il6: 2.9, response_status: 'uncertain',
  },
  {
    study_id: STUDY_ID, patient_code: 'XYL-015',
    baseline_hamd17: 24, baseline_madrs: 33,
    baseline_bdnf_ng_ml: 14.8, baseline_tnf_alpha_pg_ml: 2.6, baseline_il6_pg_ml: 3.4, baseline_crp_mg_l: 2.1,
    baseline_sleep_regularity: 0.49, baseline_anhedonia_subscale: 7, prior_ad_trials: 3, age: 44, sex: 'M',
    wk2_madrs: 28, wk4_madrs: 24, wk8_madrs: 21, wk2_bdnf: 16.3, wk4_il6: 3.2, response_status: 'uncertain',
  },
  {
    study_id: STUDY_ID, patient_code: 'XYL-016',
    baseline_hamd17: 26, baseline_madrs: 35,
    baseline_bdnf_ng_ml: 16.1, baseline_tnf_alpha_pg_ml: 2.5, baseline_il6_pg_ml: 2.8, baseline_crp_mg_l: 1.9,
    baseline_sleep_regularity: 0.51, baseline_anhedonia_subscale: 8, prior_ad_trials: 2, age: 38, sex: 'F',
    wk2_madrs: 30, wk4_madrs: 26, wk8_madrs: 23, wk2_bdnf: 17.5, wk4_il6: 2.6, response_status: 'uncertain',
  },
]

async function seed() {
  const patients = [...subtypeA, ...subtypeB, ...subtypeC]
  console.log(`Seeding ${patients.length} patients for study ${STUDY_ID}...`)

  // Clear existing patients for this study first
  const { error: delError } = await supabase
    .from('clinical_patients')
    .delete()
    .eq('study_id', STUDY_ID)

  if (delError) {
    console.error('Failed to clear existing patients:', delError.message)
    process.exit(1)
  }

  const { error } = await supabase.from('clinical_patients').insert(patients)
  if (error) {
    console.error('Seed failed:', error.message)
    process.exit(1)
  }

  console.log(`✓ Seeded ${patients.length} patients:`)
  console.log(`  Subtype A (responders): ${subtypeA.length}`)
  console.log(`  Subtype B (non-responders): ${subtypeB.length}`)
  console.log(`  Subtype C (uncertain): ${subtypeC.length}`)
}

seed()
