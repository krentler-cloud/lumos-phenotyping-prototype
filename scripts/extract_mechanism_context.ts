/**
 * One-time script: extract structured mechanism context from XYL-1001 clinical_trial docs.
 * Stores results in corpus_docs.metadata.mechanism_context for use in synthesis prompts.
 *
 * Run: cd /Users/bob/Sites/lumos-prototype && npx ts-node --project tsconfig.scripts.json scripts/extract_mechanism_context.ts
 */

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'
import * as dotenv from 'dotenv'

// Load env
dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

const EXTRACTION_PROMPT = `You are a pharmaceutical data extraction specialist. Extract structured mechanism and pharmacology data from the provided document text.

Return ONLY valid JSON with this exact schema (use null for any field not found in the text):
{
  "drug_name": "string or null",
  "mechanism_class": "string describing receptor mechanism (e.g. 'Gq/11-biased partial agonist at 5-HT2A') or null",
  "receptor_profile": [
    { "target": "receptor name", "ki_nm": number or null, "selectivity_ratio": number or null }
  ],
  "neuroplasticity_signal": "string describing neuroplasticity mechanism or null",
  "pk_summary": {
    "half_life_h": number or null,
    "bioavailability_pct": number or null,
    "cmax_ng_ml": number or null
  },
  "safety_signals": ["list of key safety observations"],
  "efficacy_models": [
    { "model": "animal model name", "effect_size": number or null, "p_value": number or null }
  ]
}

Extract only what is explicitly stated in the text. Do not infer or hallucinate values.`

async function extractFromDoc(docId: string, title: string, chunks: { content: string }[]): Promise<object | null> {
  // Combine chunk content (limit to ~6000 chars to stay within context)
  const combinedText = chunks
    .map(c => c.content)
    .join('\n\n')
    .slice(0, 6000)

  console.log(`  Extracting from "${title}" (${combinedText.length} chars)...`)

  try {
    const message = await anthropic.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 2000,
      system: 'Always respond with raw JSON only — no markdown, no code fences.',
      messages: [{
        role: 'user',
        content: `${EXTRACTION_PROMPT}\n\nDOCUMENT TEXT:\n${combinedText}`
      }]
    })

    const text = message.content
      .filter(b => b.type === 'text')
      .map(b => (b as { type: 'text'; text: string }).text)
      .join('')

    const first = text.indexOf('{')
    const last = text.lastIndexOf('}')
    if (first === -1 || last === -1) {
      console.warn(`  No JSON found for "${title}"`)
      return null
    }

    const parsed = JSON.parse(text.slice(first, last + 1))

    // Only keep if we got meaningful data
    if (!parsed.drug_name && !parsed.mechanism_class) {
      console.log(`  No mechanism data found for "${title}" — skipping`)
      return null
    }

    return parsed
  } catch (err) {
    console.error(`  Error extracting from "${title}":`, err instanceof Error ? err.message : err)
    return null
  }
}

async function main() {
  console.log('Fetching clinical_trial corpus docs...')

  const { data: docs, error } = await supabase
    .from('corpus_docs')
    .select('id, title, filename, metadata')
    .eq('source_type', 'clinical_trial')
    .eq('status', 'ready')

  if (error) { console.error('Failed to fetch docs:', error.message); process.exit(1) }
  if (!docs?.length) { console.log('No clinical_trial docs found.'); process.exit(0) }

  console.log(`Found ${docs.length} clinical_trial docs.\n`)

  let updated = 0
  let skipped = 0

  for (const doc of docs) {
    // Skip docs that already have mechanism_context extracted
    if (doc.metadata?.mechanism_context) {
      console.log(`Skipping "${doc.title}" — already extracted`)
      skipped++
      continue
    }

    console.log(`Processing: ${doc.title}`)

    // Fetch chunks for this doc
    const { data: chunks, error: chunkError } = await supabase
      .from('corpus_chunks')
      .select('content')
      .eq('doc_id', doc.id)
      .order('chunk_index')

    if (chunkError || !chunks?.length) {
      console.warn(`  No chunks found for "${doc.title}" — skipping`)
      continue
    }

    const context = await extractFromDoc(doc.id, doc.title, chunks)

    if (context) {
      const newMetadata = { ...(doc.metadata ?? {}), mechanism_context: context }
      const { error: updateError } = await supabase
        .from('corpus_docs')
        .update({ metadata: newMetadata })
        .eq('id', doc.id)

      if (updateError) {
        console.error(`  Failed to update "${doc.title}":`, updateError.message)
      } else {
        console.log(`  ✓ Stored mechanism context for "${doc.title}"`)
        updated++
      }
    }

    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 500))
  }

  console.log(`\nDone. ${updated} docs updated, ${skipped} already had context.`)
}

main().catch(console.error)
