import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { extractText } from '@/lib/pipeline/extract'
import { chunkText } from '@/lib/pipeline/chunk'
import { embedTexts } from '@/lib/pipeline/embed'
import { titleFromText } from '@/lib/pipeline/titler'

export async function POST(req: NextRequest) {
  let docId: string | null = null
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const titleParam = formData.get('title') as string | null
    const sourceType = formData.get('source_type') as string | null
    const autoTitle = formData.get('auto_title') === 'true'

    if (!file || !sourceType) {
      return NextResponse.json({ error: 'file and source_type are required' }, { status: 400 })
    }
    if (!autoTitle && !titleParam) {
      return NextResponse.json({ error: 'title is required (or set auto_title=true)' }, { status: 400 })
    }

    const validSourceTypes = ['literature', 'clinical_trial', 'internal', 'regulatory']
    if (!validSourceTypes.includes(sourceType)) {
      return NextResponse.json({ error: `source_type must be one of: ${validSourceTypes.join(', ')}` }, { status: 400 })
    }

    const supabase = createServiceClient()

    // 1. Deduplication check — look for an existing doc with the same filename
    const { data: existing } = await supabase
      .from('corpus_docs')
      .select('id, status')
      .eq('filename', file.name)
      .maybeSingle()

    if (existing) {
      if (existing.status === 'ready') {
        // Already ingested successfully — skip to avoid duplicate chunks
        return NextResponse.json({ doc_id: existing.id, skipped: true, status: 'ready' })
      }
      // error or stuck processing — delete and re-ingest (chunks cascade via FK)
      await supabase.from('corpus_docs').delete().eq('id', existing.id)
    }

    // 2. Insert corpus_docs record (status: processing)
    // For auto_title mode, use filename as placeholder — updated to real title after extraction
    const placeholderTitle = titleParam || file.name.replace(/\.(pdf|docx|csv)$/i, '')
    const { data: doc, error: docError } = await supabase
      .from('corpus_docs')
      .insert({
        title: placeholderTitle,
        source_type: sourceType,
        filename: file.name,
        status: 'processing',
      })
      .select()
      .single()

    if (docError) throw new Error(`Failed to create corpus doc: ${docError.message}`)
    docId = doc.id

    // 2. Upload raw file to Supabase Storage
    const fileBuffer = Buffer.from(await file.arrayBuffer())
    // Sanitize filename: replace spaces and special chars to avoid storage path issues
    const safeFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const storagePath = `${doc.id}/${safeFilename}`

    const { error: uploadError } = await supabase.storage
      .from('corpus-docs')
      .upload(storagePath, fileBuffer, { contentType: file.type || 'application/octet-stream' })

    if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`)

    // 3. Extract text (supports .pdf, .docx, .csv)
    const rawText = await extractText(fileBuffer, file.name)
    // Strip null bytes and unpaired surrogates — PostgreSQL rejects these in UTF-8
    const text = rawText.replace(/\u0000/g, '').replace(/[\uD800-\uDFFF]/g, '')

    // 3b. Auto-generate title from extracted text if requested (folder mode)
    const title = autoTitle
      ? await titleFromText(text, file.name).catch(() => file.name.replace(/\.(pdf|docx|csv)$/i, ''))
      : titleParam!

    // 4. Chunk text
    const chunks = chunkText(text)
    if (chunks.length === 0) {
      throw new Error(`No text could be extracted from "${file.name}". The file may be a scanned image PDF, corrupted, or use an unsupported encoding.`)
    }

    // 5. Embed all chunks
    const chunkTexts = chunks.map(c => c.content)
    const embeddings = await embedTexts(chunkTexts)

    // 6. Batch insert chunks with embeddings
    const chunkRows = chunks.map((chunk, i) => ({
      doc_id: doc.id,
      chunk_index: chunk.index,
      content: chunk.content,
      embedding: JSON.stringify(embeddings[i]),
      token_count: chunk.tokenEstimate,
    }))

    // Insert in batches of 50 to avoid request size limits
    const INSERT_BATCH = 50
    for (let i = 0; i < chunkRows.length; i += INSERT_BATCH) {
      const batch = chunkRows.slice(i, i + INSERT_BATCH)
      const { error: chunkError } = await supabase.from('corpus_chunks').insert(batch)
      if (chunkError) throw new Error(`Chunk insert failed: ${chunkError.message}`)
    }

    // 7. Update corpus_docs to ready (include generated title if auto_title mode)
    await supabase
      .from('corpus_docs')
      .update({
        status: 'ready',
        char_count: text.length,
        chunk_count: chunks.length,
        storage_path: storagePath,
        ...(autoTitle ? { title } : {}),
      })
      .eq('id', doc.id)

    return NextResponse.json({ doc_id: doc.id, chunk_count: chunks.length, status: 'ready', title })

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[corpus/ingest]', message)
    // Mark the doc as failed so it shows up in the UI instead of getting stuck
    if (docId) {
      const supabase = createServiceClient()
      await supabase
        .from('corpus_docs')
        .update({ status: 'error', metadata: { error: message } })
        .eq('id', docId)
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
