import mammoth from 'mammoth'

// pdf-parse v2 uses a class-based API
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PDFParse } = require('pdf-parse')

export async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: buffer })
  await parser.load()
  const result = await parser.getText()
  return result.text as string
}

export async function extractTextFromDOCX(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer })
  return result.value
}

/**
 * Extract plain text from a CSV buffer.
 * Converts rows to "key: value" lines so the chunker treats it as natural language.
 */
export async function extractTextFromCSV(buffer: Buffer): Promise<string> {
  const raw = buffer.toString('utf8')
  const lines = raw.split(/\r?\n/).filter(l => l.trim())
  if (lines.length === 0) return ''

  // Parse headers from first row
  const headers = parseCSVRow(lines[0])

  const blocks: string[] = []

  // First block: column summary
  blocks.push(`Columns: ${headers.join(', ')}`)

  // Each data row becomes a labeled block
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVRow(lines[i])
    const pairs = headers.map((h, idx) => `${h}: ${values[idx] ?? ''}`)
    blocks.push(`Row ${i}: ${pairs.join(' | ')}`)
  }

  return blocks.join('\n')
}

function parseCSVRow(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  result.push(current.trim())
  return result
}

/**
 * Auto-detect file type from filename and extract text.
 * Supports .pdf, .docx, and .csv.
 */
export async function extractText(buffer: Buffer, filename: string): Promise<string> {
  const lower = filename.toLowerCase()
  if (lower.endsWith('.pdf'))  return extractTextFromPDF(buffer)
  if (lower.endsWith('.docx')) return extractTextFromDOCX(buffer)
  if (lower.endsWith('.csv'))  return extractTextFromCSV(buffer)
  throw new Error(`Unsupported file type: ${filename}. Please upload a .pdf, .docx, or .csv file.`)
}
