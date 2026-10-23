'use client'

import { useRef, useState } from 'react'
import type { FeatureSchema } from '@/types'
import { parseCsv, toCsv } from '@/lib/csv'
import { AlertIcon, FileIcon, Spinner, UploadIcon } from './icons'

const MAX_ROWS = 10_000
const MAX_BYTES = 5 * 1024 * 1024
const CHUNK = 1000

interface Row { prediction: string | number | boolean; probability?: number }

export default function BatchPredict({ modelId, features, targetColumn }: {
  modelId: string
  features: FeatureSchema[]
  targetColumn: string
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [data, setData] = useState<{ header: string[]; rows: string[][] } | null>(null)
  const [results, setResults] = useState<Row[] | null>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const featureNames = features.map((f) => f.name)
  const matched = data ? featureNames.filter((f) => data.header.includes(f)) : []
  const missing = data ? featureNames.filter((f) => !data.header.includes(f)) : []

  const choose = async (f: File | undefined) => {
    if (!f) return
    setError(null)
    setResults(null)
    if (f.size > MAX_BYTES) return setError('Batch files can be up to 5 MB.')
    try {
      const parsed = await parseCsv(f)
      if (!parsed.rows.length) return setError('The file has no data rows.')
      if (parsed.rows.length > MAX_ROWS) return setError(`Batch files can have up to ${MAX_ROWS.toLocaleString('en-US')} rows.`)
      setFile(f)
      setData(parsed)
    } catch {
      setError('Couldn’t read that file as CSV.')
    }
  }

  const run = async () => {
    if (!data) return
    setError(null)
    setResults(null)
    const indexes = featureNames.map((f) => data.header.indexOf(f))
    const all: Row[] = []
    try {
      for (let start = 0; start < data.rows.length; start += CHUNK) {
        setProgress(start / data.rows.length)
        const rows = data.rows.slice(start, start + CHUNK).map((row) => {
          const obj: Record<string, string | null> = {}
          featureNames.forEach((name, k) => {
            const value = indexes[k] >= 0 ? row[indexes[k]]?.trim() : ''
            obj[name] = value ? value : null
          })
          return obj
        })
        const res = await fetch(`/api/v1/models/${modelId}/predict/batch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rows }),
        })
        const body = await res.json().catch(() => null)
        if (!res.ok) throw new Error(body?.detail ?? `Request failed (${res.status})`)
        all.push(...body.predictions)
      }
      setResults(all)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Batch prediction failed')
    } finally {
      setProgress(null)
    }
  }

  const download = () => {
    if (!data || !results) return
    const hasProbability = results.some((r) => r.probability !== undefined)
    const header = [...data.header, `predicted_${targetColumn}`, ...(hasProbability ? ['confidence'] : [])]
    const rows = data.rows.map((row, i) => [
      ...row,
      results[i]?.prediction,
      ...(hasProbability ? [results[i]?.probability?.toFixed(4)] : []),
    ])
    const url = URL.createObjectURL(new Blob([toCsv(header, rows)], { type: 'text/csv' }))
    const a = Object.assign(document.createElement('a'), {
      href: url,
      download: `${(file?.name ?? 'predictions').replace(/\.csv$/i, '')}-predictions.csv`,
    })
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <section className="card p-5 sm:p-6">
      <h2 className="text-base font-semibold text-zinc-100">Batch predictions</h2>
      <p className="mt-1 text-sm text-zinc-400">
        Upload a CSV with the same columns as your training data to score up to {MAX_ROWS.toLocaleString('en-US')} rows at once.
      </p>

      <input ref={fileRef} type="file" accept=".csv,text/csv" className="sr-only"
        onChange={(e) => { choose(e.target.files?.[0]); e.target.value = '' }} />

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        {data && file ? (
          <div className="flex min-w-0 flex-1 items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-950 p-3">
            <FileIcon size={18} className="shrink-0 text-zinc-400" />
            <div className="min-w-0">
              <p className="truncate text-sm text-zinc-200">{file.name}</p>
              <p className="text-xs text-zinc-500">
                {data.rows.length.toLocaleString('en-US')} rows · {matched.length} of {featureNames.length} model inputs found
              </p>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => fileRef.current?.click()} className="btn btn-secondary">
            <UploadIcon size={15} /> Choose CSV
          </button>
        )}
        {data && (
          <div className="flex gap-2">
            <button type="button" onClick={() => fileRef.current?.click()} className="btn btn-ghost">Change</button>
            <button type="button" onClick={run} disabled={progress !== null || matched.length === 0} className="btn btn-primary">
              {progress !== null ? <><Spinner size={14} /> {Math.round(progress * 100)}%</> : 'Run predictions'}
            </button>
          </div>
        )}
      </div>

      {data && missing.length > 0 && matched.length > 0 && (
        <p className="mt-3 text-xs text-amber-300">
          Missing columns ({missing.join(', ')}) will be filled with typical values from the training data.
        </p>
      )}
      {data && matched.length === 0 && (
        <p className="mt-3 text-xs text-red-300">None of the model’s input columns ({featureNames.join(', ')}) are in this file.</p>
      )}
      {error && (
        <p className="mt-3 flex items-center gap-2 text-sm text-red-300"><AlertIcon size={14} /> {error}</p>
      )}

      {results && data && (
        <div className="mt-5 animate-fade-up">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-sm text-zinc-300">
              <span className="font-medium text-emerald-300">{results.length.toLocaleString('en-US')}</span> predictions ready
            </p>
            <button type="button" onClick={download} className="btn btn-primary btn-sm">Download CSV</button>
          </div>
          <div className="overflow-x-auto rounded-lg border border-zinc-800">
            <table className="w-full text-left font-mono text-xs">
              <thead className="bg-zinc-950/60 text-zinc-400">
                <tr>
                  {matched.slice(0, 5).map((c) => <th key={c} className="px-3 py-2 font-medium whitespace-nowrap">{c}</th>)}
                  <th className="px-3 py-2 font-medium whitespace-nowrap text-zinc-100">predicted {targetColumn}</th>
                  {results[0]?.probability !== undefined && <th className="px-3 py-2 text-right font-medium">confidence</th>}
                </tr>
              </thead>
              <tbody>
                {results.slice(0, 8).map((r, i) => (
                  <tr key={i} className="border-t border-zinc-800/60">
                    {matched.slice(0, 5).map((c) => (
                      <td key={c} className="max-w-40 truncate px-3 py-1.5 text-zinc-500">{data.rows[i][data.header.indexOf(c)]}</td>
                    ))}
                    <td className="px-3 py-1.5 text-zinc-100">{String(r.prediction)}</td>
                    {r.probability !== undefined && (
                      <td className="px-3 py-1.5 text-right text-zinc-400 tabular-nums">{(r.probability * 100).toFixed(1)}%</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {results.length > 8 && <p className="mt-2 text-xs text-zinc-500">Showing 8 of {results.length.toLocaleString('en-US')} rows — download for the full file.</p>}
        </div>
      )}
    </section>
  )
}
