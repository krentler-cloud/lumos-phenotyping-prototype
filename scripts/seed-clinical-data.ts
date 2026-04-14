/**
 * Seed clinical data from CSV files into Supabase.
 * Supersedes seed_clinical_patients.ts — uses CSV as source of truth.
 *
 * Reads:
 *   data/patients.csv       → clinical_patients table
 *   data/sad_mad_cohorts.csv → sad_mad_cohorts table
 *
 * Idempotent: upserts by (study_id, patient_code) and (study_id, cohort_name).
 *
 * Run: npx ts-node --project tsconfig.json scripts/seed-clinical-data.ts
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

// Load .env.local manually
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const envPath = path.resolve(__dirname, '..', '.env.local')
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

function parseCSV(filePath: string): Record<string, string>[] {
  const content = fs.readFileSync(filePath, 'utf8')
  const lines = content.trim().split('\n')
  const headers = lines[0].split(',').map(h => h.trim())
  return lines.slice(1).map(line => {
    const values = line.split(',').map(v => v.trim())
    const row: Record<string, string> = {}
    headers.forEach((h, i) => { row[h] = values[i] ?? '' })
    return row
  })
}

function num(v: string | undefined): number | null {
  if (!v || v === '') return null
  const n = parseFloat(v)
  return isNaN(n) ? null : n
}

function bool(v: string | undefined): boolean | null {
  if (!v || v === '') return null
  return v.toLowerCase() === 'true'
}

async function seedPatients() {
  const dataDir = path.resolve(__dirname, '..', 'data')
  const csvPath = path.join(dataDir, 'patients.csv')
  const rows = parseCSV(csvPath)

  console.log(`Seeding ${rows.length} patients from ${csvPath}`)

  const patients = rows.map(r => ({
    study_id:                  STUDY_ID,
    patient_code:              r.patient_code,
    age:                       parseInt(r.age || '35', 10),
    sex:                       r.sex || 'F',
    subtype_label:             r.subtype_label || null,
    response_status:           r.response_status || 'uncertain',
    val66met_genotype:         r.val66met_genotype || null,
    cyp2d6_status:             r.cyp2d6_status || null,
    prior_ssri_exposure:       bool(r.prior_ssri_exposure),
    symptom_cluster:           r.symptom_cluster || null,
    prior_ad_trials:           num(r.prior_ad_trial_count) ?? 0,
    baseline_bdnf_ng_ml:       num(r.baseline_bdnf_ng_ml) ?? 0,
    baseline_il6_pg_ml:        num(r.baseline_il6_pg_ml) ?? 0,
    baseline_crp_mg_l:         num(r.baseline_crp_mg_l) ?? 0,
    baseline_tnf_alpha_pg_ml:  num(r.baseline_tnf_alpha_pg_ml) ?? 0,
    baseline_hamd17:           num(r.baseline_hamd17) ?? 0,
    baseline_madrs:            num(r.baseline_madrs) ?? 0,
    baseline_sleep_regularity: num(r.baseline_sleep_regularity) ?? 0.5,
    baseline_anhedonia_subscale: num(r.baseline_anhedonia_subscale) ?? 6,
    wk2_madrs:                 num(r.wk2_madrs),
    wk4_madrs:                 num(r.wk4_madrs),
    wk8_madrs:                 num(r.wk8_madrs),
    wk2_bdnf:                  num(r.wk2_bdnf),
    wk4_il6:                   num(r.wk4_il6),
  }))

  const { error } = await supabase
    .from('clinical_patients')
    .upsert(patients, { onConflict: 'study_id,patient_code' })

  if (error) {
    console.error('Error seeding patients:', error.message)
    process.exit(1)
  }
  console.log(`✓ ${patients.length} patients upserted`)
}

async function seedSadMad() {
  const dataDir = path.resolve(__dirname, '..', 'data')
  const csvPath = path.join(dataDir, 'sad_mad_cohorts.csv')
  const rows = parseCSV(csvPath)

  console.log(`Seeding ${rows.length} SAD/MAD cohorts from ${csvPath}`)

  const cohorts = rows.map(r => ({
    study_id:              STUDY_ID,
    phase:                 r.phase,
    cohort_name:           r.cohort_name,
    dose_mg:               num(r.dose_mg) ?? 0,
    n_active:              parseInt(r.n_active || '0', 10),
    n_placebo:             parseInt(r.n_placebo || '0', 10),
    status:                r.status || 'Complete',
    cmax_mean_ng_ml:       num(r.cmax_mean_ng_ml),
    cmax_sd:               num(r.cmax_sd),
    tmax_mean_h:           num(r.tmax_mean_h),
    auc0t_mean:            num(r.auc0t_mean),
    half_life_mean_h:      num(r.half_life_mean_h),
    bioavailability_pct:   num(r.bioavailability_pct),
    accumulation_ratio:    num(r.accumulation_ratio),
    bdnf_pct_change_day14: num(r.bdnf_pct_change_day14),
    bdnf_pct_change_sd:    num(r.bdnf_pct_change_sd),
    bdnf_p_value:          num(r.bdnf_p_value),
    il6_pct_change_day14:  num(r.il6_pct_change_day14),
    crp_pct_change_day14:  num(r.crp_pct_change_day14),
    ae_rate_pct:           num(r.ae_rate_pct) ?? 0,
    ae_max_grade:          Math.round(num(r.ae_max_grade) ?? 0),
    discontinuations:      Math.round(num(r.discontinuations) ?? 0),
    ae_description:        r.ae_description || null,
  }))

  const { error } = await supabase
    .from('sad_mad_cohorts')
    .upsert(cohorts, { onConflict: 'study_id,cohort_name' })

  if (error) {
    console.error('Error seeding SAD/MAD cohorts:', error.message)
    process.exit(1)
  }
  console.log(`✓ ${cohorts.length} SAD/MAD cohort rows upserted`)
}

async function main() {
  console.log('=== Lumos Clinical Data Seed ===')
  await seedPatients()
  await seedSadMad()
  console.log('=== Done ===')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
