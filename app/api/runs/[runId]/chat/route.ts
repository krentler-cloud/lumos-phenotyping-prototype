import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createServiceClient } from '@/lib/supabase/server'
import { embedText } from '@/lib/pipeline/embed'
import { searchCorpusWeighted, rerankChunks } from '@/lib/pipeline/search'

const SYSTEM_PROMPT = `You are Lumos AI, a clinical research assistant. You answer questions about a specific patient phenotyping report and the underlying scientific corpus.

PLATFORM FACTS:
- Corpus evidence is retrieved by embedding similarity and reranked by Lumos AI's cross-attention model for precision selection
- The 8 corpus chunks below are the top reranked results for the current question
- Synthesis reports are generated from a broader evidence base (100 candidates reranked to 50, compressed to structured findings)

Rules:
- Answer ONLY based on the provided report data and corpus excerpts. Do not use outside knowledge.
- Cite specific corpus sources when relevant (use the title).
- Be concise and precise. Use plain language — avoid unnecessary jargon.
- If the answer is not in the provided context, say so clearly.
- Do not speculate beyond the evidence.`

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  const { runId } = await params

  try {
    const { message, history = [] } = await req.json()
    if (!message) return new Response('message required', { status: 400 })

    const supabase = createServiceClient()

    // Fetch the report for this run
    const { data: report, error: reportError } = await supabase
      .from('reports')
      .select('phenotype_label, responder_prob, confidence, executive_summary, key_biomarkers, recommendations, extended_report')
      .eq('run_id', runId)
      .single()

    if (reportError || !report) {
      return new Response('Report not found', { status: 404 })
    }

    // Embed user message and retrieve relevant corpus chunks
    const queryVec = await embedText(message)
    const rawChunks = await searchCorpusWeighted(queryVec, 20)
    const chunks = await rerankChunks(message, rawChunks, 8)

    const corpusContext = chunks
      .map((c, i) => `[${i + 1}] "${c.title}" (${c.source_type}):\n${c.content}`)
      .join('\n\n---\n\n')

    const reportContext = `REPORT SUMMARY:
Phenotype: ${report.phenotype_label}
Responder probability: ${(report.responder_prob * 100).toFixed(0)}%
Confidence: ${(report.confidence * 100).toFixed(0)}%
${report.extended_report?.composite_score ? `Composite score: ${report.extended_report.composite_score.value}/100` : ''}

Executive summary: ${report.executive_summary}

Key biomarkers: ${JSON.stringify(report.key_biomarkers ?? [], null, 2)}

Recommendations: ${(report.recommendations ?? []).join('; ')}`

    const userPrompt = `REPORT CONTEXT:\n${reportContext}\n\nCORPUS EXCERPTS (${chunks.length} retrieved):\n${corpusContext}\n\nUSER QUESTION: ${message}`

    // Build message history for multi-turn
    const messages: Anthropic.MessageParam[] = [
      ...history.map((h: { role: string; content: string }) => ({
        role: h.role as 'user' | 'assistant',
        content: h.content,
      })),
      { role: 'user', content: userPrompt },
    ]

    // Stream the response
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const stream = await client.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 1500,
      system: SYSTEM_PROMPT,
      messages,
      stream: true,
    })

    // Return a ReadableStream that forwards Claude's token stream
    const encoder = new TextEncoder()
    const readable = new ReadableStream({
      async start(controller) {
        // Send corpus source count as first metadata chunk
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ sources: chunks.length })}\n\n`))

        for await (const event of stream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ token: event.delta.text })}\n\n`))
          }
          if (event.type === 'message_stop') {
            controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          }
        }
        controller.close()
      },
    })

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    })

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[chat]', message)
    return new Response(JSON.stringify({ error: message }), { status: 500 })
  }
}
