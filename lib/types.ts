// ── Patient Data ─────────────────────────────────────────────────────────────

export interface PatientData {
  demographics: {
    age: number
    sex: string
    weight_kg?: number
  }
  diagnosis: {
    primary: string
    severity: string
    episode_count: number
    duration_months: number
    hamd_score: number
  }
  prior_treatments: Array<{
    drug: string
    dose_mg: number
    response: string
    duration_weeks: number
  }>
  biomarkers: {
    bdnf_serum_ng_ml?: number
    crp_mg_l?: number
    tnf_alpha_pg_ml?: number
    il6_pg_ml?: number
    cortisol_am_ug_dl?: number
    tryptophan_ratio?: number
    [key: string]: number | undefined
  }
  genetics: {
    sert_genotype?: string
    comt_val158met?: string
    bdnf_val66met?: string
    [key: string]: string | undefined
  }
  functional: {
    sleep_efficiency_pct?: number
    psychomotor_retardation?: boolean
    anhedonia_present?: boolean
    [key: string]: number | boolean | undefined
  }
  study_drug?: {
    id: string
    dose_mg?: number
    route?: string
    phase?: string
  }
}

// ── Run & Report ─────────────────────────────────────────────────────────────

export interface StepLog {
  step: string
  status: 'pending' | 'running' | 'complete' | 'error'
  ts: string
  detail?: string
}

export interface RunStatus {
  run_id: string
  status: 'queued' | 'processing' | 'complete' | 'error'
  step_log: StepLog[]
  completed_at: string | null
  error_message: string | null
}

export interface BiomarkerEntry {
  name: string
  direction: 'elevated' | 'reduced' | 'normal'
  significance: string
}

export interface KeyBiomarker {
  name: string
  patient_value: string
  reference_range: string
  interpretation: string
}

export interface CorpusRef {
  title: string
  source_type: string
  excerpt: string
  relevance_note: string
}

// ── Extended Pre-Clinical Report Types ───────────────────────────────────────

export interface CompositeScoreComponent {
  label: string
  weight: number
  raw: number
  contribution: number
}

export interface CompositeScore {
  value: number  // 0–100
  components: CompositeScoreComponent[]
  formula: string
  interpretation: string
}

export interface BayesianSubtype {
  alpha: number
  beta: number
  mean: number  // alpha / (alpha + beta)
  label: string
}

export interface BayesianPrior {
  subtype_a: BayesianSubtype
  subtype_b: BayesianSubtype
  subtype_c: BayesianSubtype
  evidence_basis: string
  total_evidence_chunks: number
}

export interface CrossSpeciesMapping {
  animal_model: string   // "FST" | "CMS" | "LH"
  human_subtype: string  // "Subtype A" | "Subtype B" | "Subtype C"
  signal_strength: 'strong' | 'moderate' | 'weak'
  key_features: string[]
}

export interface ReceptorProfile {
  target: string
  ki_nm?: number
  selectivity_ratio?: number
}

export interface PkSummary {
  half_life_h?: number
  bioavailability_pct?: number
  cmax_ng_ml?: number
}

export interface EfficacyModel {
  model: string
  effect_size?: number
  p_value?: number
}

export interface MechanismContext {
  drug_name: string
  mechanism_class: string
  receptor_profile: ReceptorProfile[]
  neuroplasticity_signal: string
  pk_summary: PkSummary
  safety_signals: string[]
  efficacy_models: EfficacyModel[]
}

export interface AnalogOverlap {
  drug: string
  overlap_pct: number
  shared_mechanisms: string[]
}

export interface DrugMechanism extends MechanismContext {
  analog_overlaps: AnalogOverlap[]
}

export interface CROScreeningCategory {
  category: string
  prompts: string[]
}

export interface InSilicoProjection {
  analog: string
  responder_overlap_pct: number
  nonresponder_overlap_pct: number
}

export interface InSilicoTwin {
  projections: InSilicoProjection[]
  phenotype_shape: string
}

// ── Full Report ───────────────────────────────────────────────────────────────

export interface PhenotypeReport {
  // Core fields (Claude-generated)
  responder_probability: number
  confidence: number
  phenotype_label: 'High Responder' | 'Moderate Responder' | 'Non-Responder'
  executive_summary: string
  responder_profile: {
    description: string
    biomarkers: BiomarkerEntry[]
  }
  nonresponder_profile: {
    description: string
    biomarkers: BiomarkerEntry[]
  }
  key_biomarkers: KeyBiomarker[]
  matched_corpus_refs: CorpusRef[]
  methodology_notes: string
  recommendations: string[]

  // Extended pre-clinical fields (some from real math, some Claude-generated)
  composite_score?: CompositeScore          // real math
  bayesian_prior?: BayesianPrior            // real math
  drug_mechanism?: DrugMechanism            // from extracted context + Claude
  cross_species_mapping?: CrossSpeciesMapping[]  // Claude-generated
  cro_screening_prompts?: CROScreeningCategory[] // Claude-generated
  in_silico_twin?: InSilicoTwin            // Claude-generated
}

// ── Chat ─────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  corpus_sources?: number  // how many chunks grounded this response
}
