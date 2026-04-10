/**
 * Fetch 13 clinical trials from ClinicalTrials.gov API v2 and ingest them
 * into the Lumos corpus directly via Supabase + embed pipeline.
 *
 * Usage: npx ts-node --project tsconfig.json scripts/ingest_clinical_trials.ts
 */

import * as dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import * as path from 'path'
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
dotenv.config({ path: path.resolve(__dirname, '../.env.local') })

import { createClient } from '@supabase/supabase-js'
// Voyage AI — direct REST API (SDK has broken ESM exports)

// ── Config ──────────────────────────────────────────────────────────────────

const NCT_IDS = [
  'NCT05624268',
  'NCT05711940',
  'NCT06809595',
  'NCT06741228',
  'NCT06793397',
  'NCT06308653',
  'NCT03537014',
  'NCT04077437',
  'NCT06954025',
  'NCT05746572',
  'NCT05800860',
  'NCT05660642',
  'NCT04673383',
]

const TRIALS_WITH_RESULTS = new Set([
  'NCT03537014',
  'NCT04077437',
  'NCT05800860',
  'NCT05660642',
  'NCT04673383',
])

const CT_API_BASE = 'https://clinicaltrials.gov/api/v2/studies'
const TARGET_CHARS = 512 * 4   // ~512 tokens
const OVERLAP_CHARS = 64 * 4   // ~64 token overlap
const EMBED_BATCH = 128

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const VOYAGE_API_URL = 'https://api.voyageai.com/v1/embeddings'
const VOYAGE_API_KEY = process.env.VOYAGE_API_KEY!

// ── ClinicalTrials.gov fetch ─────────────────────────────────────────────────

async function fetchTrial(nctId: string): Promise<Record<string, unknown>> {
  const url = `${CT_API_BASE}/${nctId}?format=json`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${nctId}`)
  return res.json()
}

// ── Text formatting ──────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatTrial(nctId: string, data: any): string {
  const proto = data?.protocolSection ?? {}
  const id = proto?.identificationModule ?? {}
  const status = proto?.statusModule ?? {}
  const sponsor = proto?.sponsorCollaboratorsModule ?? {}
  const desc = proto?.descriptionModule ?? {}
  const conditions = proto?.conditionsModule ?? {}
  const design = proto?.designModule ?? {}
  const arms = proto?.armsInterventionsModule ?? {}
  const outcomes = proto?.outcomesModule ?? {}
  const eligibility = proto?.eligibilityModule ?? {}
  const contacts = proto?.contactsLocationsModule ?? {}
  const results = data?.resultsSection ?? {}

  const lines: string[] = []

  // Header
  lines.push(`# ${nctId} — ${id.officialTitle ?? id.briefTitle ?? nctId}`)
  lines.push('')

  // Identification
  lines.push('## Identification')
  lines.push(`- **NCT ID:** ${nctId}`)
  lines.push(`- **Brief Title:** ${id.briefTitle ?? 'N/A'}`)
  lines.push(`- **Official Title:** ${id.officialTitle ?? 'N/A'}`)
  lines.push(`- **Organization:** ${id.organization?.fullName ?? 'N/A'}`)
  lines.push('')

  // Status
  lines.push('## Status')
  lines.push(`- **Overall Status:** ${status.overallStatus ?? 'N/A'}`)
  lines.push(`- **Start Date:** ${status.startDateStruct?.date ?? 'N/A'}`)
  lines.push(`- **Primary Completion Date:** ${status.primaryCompletionDateStruct?.date ?? 'N/A'}`)
  lines.push(`- **Completion Date:** ${status.completionDateStruct?.date ?? 'N/A'}`)
  lines.push(`- **Study First Posted:** ${status.studyFirstPostDateStruct?.date ?? 'N/A'}`)
  lines.push(`- **Last Update Posted:** ${status.lastUpdatePostDateStruct?.date ?? 'N/A'}`)
  lines.push('')

  // Sponsor
  const leadSponsor = sponsor.leadSponsor?.name ?? 'N/A'
  const collabs = (sponsor.collaborators ?? []).map((c: { name?: string }) => c.name).join(', ')
  lines.push('## Sponsor')
  lines.push(`- **Lead Sponsor:** ${leadSponsor}`)
  if (collabs) lines.push(`- **Collaborators:** ${collabs}`)
  lines.push('')

  // Description
  if (desc.briefSummary) {
    lines.push('## Summary')
    lines.push(desc.briefSummary.trim())
    lines.push('')
  }
  if (desc.detailedDescription) {
    lines.push('## Detailed Description')
    lines.push(desc.detailedDescription.trim())
    lines.push('')
  }

  // Conditions
  const condList = conditions.conditions ?? []
  const keywords = conditions.keywords ?? []
  if (condList.length || keywords.length) {
    lines.push('## Conditions & Keywords')
    if (condList.length) lines.push(`- **Conditions:** ${condList.join(', ')}`)
    if (keywords.length) lines.push(`- **Keywords:** ${keywords.join(', ')}`)
    lines.push('')
  }

  // Design
  lines.push('## Study Design')
  lines.push(`- **Study Type:** ${design.studyType ?? 'N/A'}`)
  lines.push(`- **Phase:** ${(design.phases ?? []).join(', ') || 'N/A'}`)
  const ei = design.enrollmentInfo
  lines.push(`- **Enrollment:** ${ei?.count ?? 'N/A'} (${ei?.type ?? 'N/A'})`)
  const dInfo = design.designInfo ?? {}
  if (dInfo.allocation) lines.push(`- **Allocation:** ${dInfo.allocation}`)
  if (dInfo.interventionModel) lines.push(`- **Intervention Model:** ${dInfo.interventionModel}`)
  if (dInfo.primaryPurpose) lines.push(`- **Primary Purpose:** ${dInfo.primaryPurpose}`)
  if (dInfo.maskingInfo?.masking) lines.push(`- **Masking:** ${dInfo.maskingInfo.masking}`)
  lines.push('')

  // Arms & Interventions
  const armList = arms.armGroups ?? []
  const interventionList = arms.interventions ?? []
  if (armList.length) {
    lines.push('## Arms')
    for (const arm of armList) {
      lines.push(`### ${arm.label ?? 'Arm'} (${arm.type ?? ''})`)
      if (arm.description) lines.push(arm.description.trim())
      if (arm.interventionNames?.length) {
        lines.push(`- Interventions: ${arm.interventionNames.join(', ')}`)
      }
      lines.push('')
    }
  }
  if (interventionList.length) {
    lines.push('## Interventions')
    for (const iv of interventionList) {
      lines.push(`### ${iv.name ?? 'Intervention'} (${iv.type ?? ''})`)
      if (iv.description) lines.push(iv.description.trim())
      if (iv.armGroupLabels?.length) {
        lines.push(`- Arms: ${iv.armGroupLabels.join(', ')}`)
      }
      if (iv.otherNames?.length) {
        lines.push(`- Other Names: ${iv.otherNames.join(', ')}`)
      }
      lines.push('')
    }
  }

  // Outcomes
  const primary = outcomes.primaryOutcomes ?? []
  const secondary = outcomes.secondaryOutcomes ?? []
  const other = outcomes.otherOutcomes ?? []
  if (primary.length) {
    lines.push('## Primary Outcomes')
    for (const o of primary) {
      lines.push(`- **${o.measure ?? 'Measure'}** (Time Frame: ${o.timeFrame ?? 'N/A'})`)
      if (o.description) lines.push(`  ${o.description}`)
    }
    lines.push('')
  }
  if (secondary.length) {
    lines.push('## Secondary Outcomes')
    for (const o of secondary) {
      lines.push(`- **${o.measure ?? 'Measure'}** (Time Frame: ${o.timeFrame ?? 'N/A'})`)
      if (o.description) lines.push(`  ${o.description}`)
    }
    lines.push('')
  }
  if (other.length) {
    lines.push('## Other Outcomes')
    for (const o of other) {
      lines.push(`- **${o.measure ?? 'Measure'}** (Time Frame: ${o.timeFrame ?? 'N/A'})`)
    }
    lines.push('')
  }

  // Eligibility
  if (eligibility.eligibilityCriteria) {
    lines.push('## Eligibility Criteria')
    lines.push(`- **Sex:** ${eligibility.sex ?? 'N/A'}`)
    lines.push(`- **Minimum Age:** ${eligibility.minimumAge ?? 'N/A'}`)
    lines.push(`- **Maximum Age:** ${eligibility.maximumAge ?? 'N/A'}`)
    lines.push(`- **Healthy Volunteers:** ${eligibility.healthyVolunteers ?? 'N/A'}`)
    lines.push('')
    lines.push(eligibility.eligibilityCriteria.trim())
    lines.push('')
  }

  // Locations (summary only)
  const locs = contacts?.locations ?? []
  if (locs.length) {
    const countries = [...new Set(locs.map((l: { country?: string }) => l.country).filter(Boolean))]
    lines.push('## Locations')
    lines.push(`- **Countries:** ${countries.join(', ')}`)
    lines.push(`- **Site Count:** ${locs.length}`)
    lines.push('')
  }

  // Results (if present)
  if (Object.keys(results).length > 0) {
    lines.push('## Results')

    const partFlow = results.participantFlowModule
    if (partFlow) {
      lines.push('### Participant Flow')
      const groups = partFlow.groups ?? []
      for (const g of groups) {
        lines.push(`- **${g.title ?? 'Group'}:** ${g.description ?? ''}`)
      }
      const periods = partFlow.periods ?? []
      for (const p of periods) {
        lines.push(`\n**Period: ${p.title ?? ''}**`)
        const milestones = p.milestones ?? []
        for (const m of milestones) {
          const counts = (m.achievements ?? []).map((a: { groupId?: string; numSubjects?: string }) =>
            `${a.groupId}: n=${a.numSubjects}`).join(', ')
          lines.push(`- ${m.type ?? m.title ?? ''}: ${counts}`)
        }
      }
      lines.push('')
    }

    const baseline = results.baselineCharacteristicsModule
    if (baseline) {
      lines.push('### Baseline Characteristics')
      const measures = baseline.measures ?? []
      for (const m of measures) {
        if (!m.title) continue
        lines.push(`\n**${m.title}**`)
        const classes = m.classes ?? []
        for (const cls of classes) {
          const cats = cls.categories ?? []
          for (const cat of cats) {
            const measurements = cat.measurements ?? []
            const vals = measurements.map((meas: { groupId?: string; value?: string; spread?: string }) =>
              `${meas.groupId}: ${meas.value}${meas.spread ? ' ±' + meas.spread : ''}`).join(', ')
            const label = cat.title ?? cls.title ?? ''
            if (label || vals) lines.push(`- ${label}: ${vals}`)
          }
        }
      }
      lines.push('')
    }

    const outcomeResults = results.outcomeMeasuresModule
    if (outcomeResults) {
      lines.push('### Outcome Measure Results')
      const measures = outcomeResults.outcomeMeasures ?? []
      for (const m of measures) {
        lines.push(`\n**${m.type === 'PRIMARY' ? 'PRIMARY' : 'SECONDARY'}: ${m.title ?? ''}**`)
        if (m.description) lines.push(m.description)
        lines.push(`- Time Frame: ${m.timeFrame ?? 'N/A'}`)
        const groups = m.groups ?? []
        const classes = m.classes ?? []
        for (const cls of classes) {
          for (const cat of cls.categories ?? []) {
            for (const meas of cat.measurements ?? []) {
              const grp = groups.find((g: { id?: string; title?: string }) => g.id === meas.groupId)
              const val = meas.value !== undefined ? meas.value : 'N/A'
              const spread = meas.spread ? ` ±${meas.spread}` : ''
              const lci = meas.lowerLimit !== undefined ? ` [${meas.lowerLimit}, ${meas.upperLimit}]` : ''
              lines.push(`- ${grp?.title ?? meas.groupId}: ${val}${spread}${lci}`)
            }
          }
        }
        // Statistical analyses
        const analyses = m.analyses ?? []
        for (const a of analyses) {
          if (a.pValue !== undefined) {
            lines.push(`- p-value: ${a.pValue} (${a.statisticalMethod ?? ''})`)
          }
          if (a.ciPctValue !== undefined) {
            lines.push(`- ${a.ciPctValue}% CI: [${a.ciLowerLimit}, ${a.ciUpperLimit}]`)
          }
          if (a.estimateComment) lines.push(`- Note: ${a.estimateComment}`)
        }
      }
      lines.push('')
    }

    const adverseEvents = results.adverseEventsModule
    if (adverseEvents) {
      lines.push('### Adverse Events Summary')
      lines.push(`- **Frequency Threshold:** ${adverseEvents.frequencyThreshold ?? 'N/A'}%`)
      lines.push(`- **Time Frame:** ${adverseEvents.timeFrame ?? 'N/A'}`)
      if (adverseEvents.description) lines.push(adverseEvents.description)
      lines.push('')

      const eventGroups = adverseEvents.eventGroups ?? []
      if (eventGroups.length) {
        lines.push('**Event Groups:**')
        for (const g of eventGroups) {
          lines.push(`- **${g.title ?? g.id}:** n=${g.deathsNumAffected ?? 0} deaths, n=${g.seriousNumAffected ?? 0} serious, n=${g.otherNumAffected ?? 0} other AEs (of ${g.deathsNumAtRisk ?? '?'} at risk)`)
        }
        lines.push('')
      }

      const serious = adverseEvents.seriousEvents ?? []
      if (serious.length) {
        lines.push('**Serious Adverse Events (≥1 subject):**')
        for (const e of serious) {
          const counts = (e.stats ?? []).map((s: { groupId?: string; numAffected?: number; numAtRisk?: number }) =>
            `${s.groupId}: ${s.numAffected}/${s.numAtRisk}`).join(', ')
          lines.push(`- ${e.term ?? ''} (${e.organSystem ?? ''}): ${counts}`)
        }
        lines.push('')
      }

      const other = adverseEvents.otherEvents ?? []
      if (other.length) {
        lines.push(`**Other Adverse Events (≥${adverseEvents.frequencyThreshold ?? 5}%):**`)
        for (const e of other) {
          const counts = (e.stats ?? []).map((s: { groupId?: string; numAffected?: number; numAtRisk?: number }) =>
            `${s.groupId}: ${s.numAffected}/${s.numAtRisk}`).join(', ')
          lines.push(`- ${e.term ?? ''} (${e.organSystem ?? ''}): ${counts}`)
        }
        lines.push('')
      }
    }
  } else if (TRIALS_WITH_RESULTS.has(nctId)) {
    lines.push('## Results')
    lines.push('Note: Results were expected for this trial but were not present in the ClinicalTrials.gov API response at time of ingestion.')
    lines.push('')
  }

  return lines.join('\n')
}

// ── Chunking (mirrors lib/pipeline/chunk.ts) ─────────────────────────────────

function chunkText(text: string): { content: string; index: number; tokenEstimate: number }[] {
  const normalised = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  const paragraphs = normalised.split(/\n\n+/).filter(p => p.trim().length > 0)

  const chunks: { content: string; index: number; tokenEstimate: number }[] = []
  let current = ''

  for (const para of paragraphs) {
    const p = para.trim()
    if (p.length > TARGET_CHARS) {
      if (current.trim()) {
        chunks.push({ content: current.trim(), index: chunks.length, tokenEstimate: Math.ceil(current.length / 4) })
        current = ''
      }
      let start = 0
      while (start < p.length) {
        chunks.push({ content: p.slice(start, start + TARGET_CHARS).trim(), index: chunks.length, tokenEstimate: TARGET_CHARS / 4 })
        start += TARGET_CHARS - OVERLAP_CHARS
      }
      continue
    }
    if ((current + '\n\n' + p).length > TARGET_CHARS && current.trim()) {
      chunks.push({ content: current.trim(), index: chunks.length, tokenEstimate: Math.ceil(current.length / 4) })
      current = current.slice(-OVERLAP_CHARS) + '\n\n' + p
    } else {
      current = current ? current + '\n\n' + p : p
    }
  }
  if (current.trim()) {
    chunks.push({ content: current.trim(), index: chunks.length, tokenEstimate: Math.ceil(current.length / 4) })
  }
  return chunks
}

// ── Embedding ─────────────────────────────────────────────────────────────────

async function embedTexts(texts: string[]): Promise<number[][]> {
  const embeddings: number[][] = []
  for (let i = 0; i < texts.length; i += EMBED_BATCH) {
    const batch = texts.slice(i, i + EMBED_BATCH)
    const res = await fetch(VOYAGE_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${VOYAGE_API_KEY}` },
      body: JSON.stringify({ input: batch, model: 'voyage-3' }),
    })
    if (!res.ok) throw new Error(`Voyage embed failed: ${res.status} ${await res.text()}`)
    const json = await res.json() as { data: { embedding: number[]; index: number }[] }
    embeddings.push(...json.data.sort((a, b) => a.index - b.index).map(d => d.embedding))
  }
  return embeddings
}

// ── Ingest one trial ─────────────────────────────────────────────────────────

async function ingestTrial(nctId: string): Promise<void> {
  console.log(`\n[${nctId}] Fetching from ClinicalTrials.gov...`)

  let trialData: Record<string, unknown>
  try {
    trialData = await fetchTrial(nctId)
  } catch (e) {
    console.error(`[${nctId}] FETCH FAILED: ${e}`)
    return
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const proto = (trialData as any)?.protocolSection ?? {}
  const id = proto?.identificationModule ?? {}
  const officialTitle = id.officialTitle ?? id.briefTitle ?? nctId
  const title = `${nctId} — ${officialTitle}`
  const filename = `${nctId}.md`

  // Deduplication check
  const { data: existing } = await supabase
    .from('corpus_docs')
    .select('id, status')
    .eq('filename', filename)
    .maybeSingle()

  if (existing?.status === 'ready') {
    console.log(`[${nctId}] Already ingested (doc_id=${existing.id}) — skipping`)
    return
  }
  if (existing) {
    console.log(`[${nctId}] Removing stale record (status=${existing.status})...`)
    await supabase.from('corpus_docs').delete().eq('id', existing.id)
  }

  const text = formatTrial(nctId, trialData)
  const chunks = chunkText(text)
  console.log(`[${nctId}] Formatted: ${text.length} chars, ${chunks.length} chunks`)

  // Insert doc record
  const { data: doc, error: docErr } = await supabase
    .from('corpus_docs')
    .insert({ title, source_type: 'clinical_trial', filename, status: 'processing' })
    .select()
    .single()

  if (docErr || !doc) {
    console.error(`[${nctId}] DB insert failed: ${docErr?.message}`)
    return
  }

  // Embed
  console.log(`[${nctId}] Embedding ${chunks.length} chunks...`)
  let embeddings: number[][]
  try {
    embeddings = await embedTexts(chunks.map(c => c.content))
  } catch (e) {
    console.error(`[${nctId}] Embedding failed: ${e}`)
    await supabase.from('corpus_docs').update({ status: 'error' }).eq('id', doc.id)
    return
  }

  // Insert chunks in batches of 50
  const chunkRows = chunks.map((c, i) => ({
    doc_id: doc.id,
    chunk_index: c.index,
    content: c.content,
    embedding: JSON.stringify(embeddings[i]),
    token_count: c.tokenEstimate,
  }))

  for (let i = 0; i < chunkRows.length; i += 50) {
    const { error: chunkErr } = await supabase.from('corpus_chunks').insert(chunkRows.slice(i, i + 50))
    if (chunkErr) {
      console.error(`[${nctId}] Chunk insert batch ${i / 50} failed: ${chunkErr.message}`)
      await supabase.from('corpus_docs').update({ status: 'error' }).eq('id', doc.id)
      return
    }
  }

  // Mark ready
  await supabase.from('corpus_docs').update({
    status: 'ready',
    char_count: text.length,
    chunk_count: chunks.length,
  }).eq('id', doc.id)

  const hasResults = Object.keys((trialData as Record<string, unknown>)?.resultsSection ?? {}).length > 0
  console.log(`[${nctId}] ✓ Ingested — ${chunks.length} chunks, results: ${hasResults ? 'YES' : 'no'}, doc_id=${doc.id}`)
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Ingesting ${NCT_IDS.length} clinical trials from ClinicalTrials.gov\n`)

  for (const nctId of NCT_IDS) {
    await ingestTrial(nctId)
    // Small delay to be polite to the CT.gov API
    await new Promise(r => setTimeout(r, 500))
  }

  console.log('\nDone.')
}

main().catch(e => { console.error(e); process.exit(1) })
