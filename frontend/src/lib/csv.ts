/** Minimal CSV sniffing for the upload screen: header, a sample of rows, column hints. */

export interface ColumnInfo {
  name: string
  kind: 'numeric' | 'text'
  distinct: number
  /** Suggested task if this column were the target */
  task: 'classification' | 'regression'
}

export interface CsvPreview {
  columns: ColumnInfo[]
  rows: string[][]
  estimatedRows: number
  /** True when only the start of a large file was read, so counts are estimates */
  sampled: boolean
}

const MISSING = new Set(['', '?', 'na', 'n/a', 'nan', 'null', 'none', '#n/a'])

export function detectDelimiter(firstLine: string) {
  const candidates = [',', ';', '\t', '|']
  let best = ',', bestCount = 0
  for (const d of candidates) {
    let count = 0, quoted = false
    for (const ch of firstLine) {
      if (ch === '"') quoted = !quoted
      else if (ch === d && !quoted) count++
    }
    if (count > bestCount) [best, bestCount] = [d, count]
  }
  return best
}

/** RFC-4180-ish parser: quoted fields, escaped quotes, newlines inside quotes. */
export function parseRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = []
  let row: string[] = [], field = '', quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++ }
      else if (ch === '"') quoted = false
      else field += ch
    } else if (ch === '"') quoted = true
    else if (ch === delimiter) { row.push(field); field = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(field); rows.push(row); row = []; field = ''
    } else field += ch
  }
  if (field || row.length) { row.push(field); rows.push(row) }
  return rows.filter((r) => r.some((c) => c.trim() !== ''))
}

const SAMPLE_BYTES = 512 * 1024

export async function previewCsv(file: File): Promise<CsvPreview> {
  const truncated = file.size > SAMPLE_BYTES
  let text = await file.slice(0, SAMPLE_BYTES).text()
  text = text.replace(/^﻿/, '')
  // Drop a possibly cut-off last line when we only read part of the file
  if (truncated) text = text.slice(0, text.lastIndexOf('\n'))

  const delimiter = detectDelimiter(text.split(/\r?\n/, 1)[0] ?? '')
  const [header = [], ...rows] = parseRows(text, delimiter)
  const names = header.map((h, i) => h.trim() || `column_${i + 1}`)
  if (names.length < 2) throw new Error('Could not find at least two columns. Is this a CSV file with a header row?')
  if (rows.length < 10) throw new Error('The file needs at least 10 data rows to train a model.')

  const columns: ColumnInfo[] = names.map((name, i) => {
    const values = rows.map((r) => (r[i] ?? '').trim()).filter((v) => !MISSING.has(v.toLowerCase()))
    const numeric = values.length > 0 && values.filter((v) => v !== '' && !isNaN(Number(v))).length / values.length >= 0.95
    const distinct = new Set(values).size
    const integerLike = numeric && values.every((v) => Number.isInteger(Number(v)))
    const task = !numeric || (integerLike && distinct <= 10) || distinct <= 2 ? 'classification' : 'regression'
    return { name, kind: numeric ? 'numeric' : 'text', distinct, task }
  })

  const sampleBytes = new Blob([text]).size
  const estimatedRows = truncated ? Math.round((rows.length * file.size) / sampleBytes) : rows.length
  return { columns, rows: rows.slice(0, 5), estimatedRows, sampled: truncated }
}

/** Parses a whole CSV file into a header and rows of strings. */
export async function parseCsv(file: File): Promise<{ header: string[]; rows: string[][] }> {
  const text = (await file.text()).replace(/^\uFEFF/, '')
  const delimiter = detectDelimiter(text.split(/\r?\n/, 1)[0] ?? '')
  const [header = [], ...rows] = parseRows(text, delimiter)
  return { header: header.map((h, i) => h.trim() || `column_${i + 1}`), rows }
}

/** Serialises rows to CSV, quoting fields that need it. */
export function toCsv(header: string[], rows: (string | number | boolean | null | undefined)[][]) {
  const cell = (v: string | number | boolean | null | undefined) => {
    const s = v == null ? '' : String(v)
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n')
}
