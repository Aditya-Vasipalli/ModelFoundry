'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import type { ModelType } from '@/types'
import { AUTO_MODEL, MODEL_TYPES, type Speed, type Task } from '@/lib/models'
import { previewCsv, type CsvPreview } from '@/lib/csv'
import { AlertIcon, ArrowRightIcon, FileIcon, Spinner, UploadIcon, WandIcon } from './icons'

const MAX_BYTES = 50 * 1024 * 1024
const TASKS: { task: Task; title: string; blurb: string }[] = [
  { task: 'classification', title: 'Classification', blurb: 'Predict a category: yes/no, species, churn…' },
  { task: 'regression', title: 'Regression', blurb: 'Predict a number: price, demand, score…' },
]
const SPEED: Record<Speed, string> = { fast: 'Fast', medium: 'Medium', slow: 'Slower' }
const TEST_SPLITS = [0.1, 0.2, 0.3, 0.4]

function formatBytes(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="animate-fade-up">
      <h2 className="mb-3 flex items-center gap-2.5 text-sm font-medium text-zinc-200">
        <span className="flex size-5 items-center justify-center rounded-full border border-zinc-700 font-mono text-[11px] text-zinc-400">
          {n}
        </span>
        {title}
      </h2>
      {children}
    </section>
  )
}

export default function UploadForm() {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<CsvPreview | null>(null)
  const [targetColumn, setTargetColumn] = useState('')
  const [task, setTask] = useState<Task>('classification')
  const [modelType, setModelType] = useState<ModelType | null>(null)
  const [excluded, setExcluded] = useState<string[]>([])
  const [testSize, setTestSize] = useState(0.2)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [name, setName] = useState('')
  const [dragging, setDragging] = useState(false)
  const [reading, setReading] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const target = preview?.columns.find((c) => c.name === targetColumn)
  const suggestedTask = target?.task

  const acceptFile = async (f: File | undefined) => {
    if (!f) return
    setError(null)
    if (!/\.(csv|txt)$/i.test(f.name)) return setError('Please choose a .csv file.')
    if (f.size > MAX_BYTES) return setError(`That file is ${formatBytes(f.size)} — the limit is 50 MB.`)
    setReading(true)
    try {
      const p = await previewCsv(f)
      setFile(f)
      setPreview(p)
      setName(f.name.replace(/\.(csv|txt)$/i, ''))
      setTargetColumn('') // force an explicit choice
      setModelType(null)
      setExcluded([])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read that file.')
    } finally {
      setReading(false)
    }
  }

  const chooseTarget = (col: string) => {
    setTargetColumn(col)
    setExcluded((cols) => cols.filter((c) => c !== col))
    const suggested = preview?.columns.find((c) => c.name === col)?.task ?? 'classification'
    setTask(suggested)
    setModelType(AUTO_MODEL[suggested])
  }

  const chooseTask = (t: Task) => {
    setTask(t)
    setModelType(AUTO_MODEL[t])
  }

  const toggleExcluded = (col: string) =>
    setExcluded((cols) => (cols.includes(col) ? cols.filter((c) => c !== col) : [...cols, col]))

  const featureCount = (preview?.columns.length ?? 0) - 1 - excluded.length

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file || !targetColumn || !modelType) return
    setLoading(true)
    setError(null)

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Your session expired — sign in again.')

      // Upload dataset to Supabase Storage. Windows reports CSVs as
      // application/vnd.ms-excel, which the bucket rejects, and the client takes
      // a Blob's MIME type from the Blob itself — so re-wrap it as text/csv.
      const safeName = file.name.replace(/[^\w.-]+/g, '_')
      const datasetPath = `${user.id}/${Date.now()}_${safeName}`
      const { error: uploadError } = await supabase.storage
        .from('datasets')
        .upload(datasetPath, new Blob([file], { type: 'text/csv' }), { contentType: 'text/csv' })
      if (uploadError) throw new Error(uploadError.message)

      // Create training job row
      const { error: insertError } = await supabase.from('training_jobs').insert({
        user_id: user.id,
        dataset_name: name.trim() || file.name,
        dataset_path: datasetPath,
        target_column: targetColumn,
        model_type: modelType,
        options: { exclude_columns: excluded, test_size: testSize },
      })
      if (insertError) {
        // Clean up the upload; quota messages from the database are already readable
        await supabase.storage.from('datasets').remove([datasetPath])
        throw new Error(insertError.message)
      }

      router.push('/dashboard')
      router.refresh()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <Step n={1} title="Upload a dataset">
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          onChange={(e) => { acceptFile(e.target.files?.[0]); e.target.value = '' }}
        />
        {file && preview ? (
          <div className="card overflow-hidden">
            <div className="flex items-center gap-3 p-4">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-950 text-zinc-300">
                <FileIcon size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-zinc-100">{file.name}</p>
                <p className="text-xs text-zinc-500">
                  {formatBytes(file.size)} · {preview.columns.length} columns · {preview.sampled ? '≈' : ''}{preview.estimatedRows.toLocaleString('en-US')} rows
                </p>
              </div>
              <button type="button" onClick={() => fileRef.current?.click()} className="btn btn-secondary btn-sm">
                Change
              </button>
            </div>
            <div className="overflow-x-auto border-t border-zinc-800">
              <table className="w-full text-left font-mono text-xs">
                <thead>
                  <tr className="border-b border-zinc-800 bg-zinc-950/60">
                    {preview.columns.map((c) => (
                      <th key={c.name} className="px-3 py-2 font-medium whitespace-nowrap text-zinc-300">
                        {c.name}
                        <span className="ml-1.5 font-sans text-[10px] font-normal text-zinc-600">{c.kind === 'numeric' ? '123' : 'abc'}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((row, i) => (
                    <tr key={i} className="border-b border-zinc-800/50 last:border-0">
                      {preview.columns.map((c, j) => (
                        <td key={c.name} className="max-w-48 truncate px-3 py-1.5 whitespace-nowrap text-zinc-500">{row[j]}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); acceptFile(e.dataTransfer.files?.[0]) }}
            className={`flex w-full cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-6 py-12 text-center transition-colors sm:py-16 ${
              dragging ? 'border-zinc-400 bg-zinc-900' : 'border-zinc-700 bg-zinc-900/30 hover:border-zinc-500 hover:bg-zinc-900/60'
            }`}
          >
            <span className="mb-4 flex size-12 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-950 text-zinc-300">
              {reading ? <Spinner size={18} /> : <UploadIcon size={20} />}
            </span>
            <span className="text-sm font-medium text-zinc-100">
              <span className="hidden sm:inline">Drop a CSV here or </span>
              <span className="underline decoration-zinc-600 underline-offset-4 sm:no-underline">
                <span className="sm:hidden">Choose a CSV file</span>
                <span className="hidden sm:inline">browse</span>
              </span>
            </span>
            <span className="mt-1.5 text-xs text-zinc-500">Header row required · up to 50 MB · comma, semicolon or tab separated</span>
          </button>
        )}
      </Step>

      {preview && (
        <Step n={2} title="What should the model predict?">
          <select className="input" value={targetColumn} onChange={(e) => chooseTarget(e.target.value)} required>
            <option value="" disabled>Select the target column…</option>
            {preview.columns.map((c) => (
              <option key={c.name} value={c.name}>{c.name}</option>
            ))}
          </select>
          {target && (
            <p className="mt-2 text-xs text-zinc-500">
              {target.kind === 'numeric' ? 'Numeric' : 'Text'} column with {target.distinct}
              {preview.sampled ? '+' : ''} distinct value{target.distinct === 1 ? '' : 's'} — looks like a{' '}
              <span className="text-zinc-300">{target.task}</span> problem.
              {target.kind === 'text' && target.distinct > 50 && ' That is a lot of classes; accuracy may be low.'}
            </p>
          )}
        </Step>
      )}

      {preview && targetColumn && (
        <Step n={3} title="Choose a model">
          <div className="mb-4 flex gap-1 rounded-lg border border-zinc-800 bg-zinc-950 p-1" role="radiogroup" aria-label="Task">
            {TASKS.map((t) => (
              <button
                key={t.task}
                type="button"
                role="radio"
                aria-checked={task === t.task}
                onClick={() => chooseTask(t.task)}
                className={`flex-1 rounded-md px-3 py-2 text-left transition-colors ${task === t.task ? 'bg-zinc-800' : 'hover:bg-zinc-900'}`}
              >
                <span className={`block text-sm font-medium ${task === t.task ? 'text-zinc-100' : 'text-zinc-400'}`}>
                  {t.title}
                  {suggestedTask === t.task && <span className="ml-2 text-[10px] font-normal text-emerald-300">suggested</span>}
                </span>
                <span className="mt-0.5 hidden text-xs text-zinc-500 sm:block">{t.blurb}</span>
              </button>
            ))}
          </div>

          <label className={`mb-3 flex cursor-pointer gap-3 rounded-xl border p-4 transition-colors ${
            modelType === AUTO_MODEL[task] ? 'border-emerald-400/50 bg-emerald-500/5' : 'border-zinc-800 bg-zinc-950/50 hover:border-zinc-700'
          }`}>
            <input type="radio" name="model" value={AUTO_MODEL[task]} checked={modelType === AUTO_MODEL[task]}
              onChange={() => setModelType(AUTO_MODEL[task])} className="mt-1 size-4 shrink-0 accent-emerald-400" />
            <span className="min-w-0">
              <span className="flex flex-wrap items-center gap-2 text-sm font-medium text-zinc-100">
                <WandIcon size={15} className="text-emerald-300" /> Auto: find the best model
                <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-px text-[10px] font-medium text-emerald-300">Recommended</span>
              </span>
              <span className="mt-1 block text-xs leading-relaxed text-zinc-500">
                Compares 7 algorithms with cross-validation and keeps the most accurate. Takes a little longer.
              </span>
            </span>
          </label>

          <p className="mb-2 text-xs text-zinc-500">Or choose an algorithm</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {(Object.keys(MODEL_TYPES) as ModelType[])
              .filter((type) => MODEL_TYPES[type].task === task && !MODEL_TYPES[type].auto)
              .map((type) => {
                const info = MODEL_TYPES[type]
                const selected = modelType === type
                return (
                  <label
                    key={type}
                    className={`flex cursor-pointer gap-3 rounded-xl border p-3.5 transition-colors ${
                      selected ? 'border-zinc-400 bg-zinc-900' : 'border-zinc-800 bg-zinc-950/50 hover:border-zinc-700'
                    }`}
                  >
                    <input type="radio" name="model" value={type} checked={selected} onChange={() => setModelType(type)}
                      className="mt-0.5 size-4 shrink-0 accent-zinc-100" />
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2 text-sm font-medium text-zinc-100">
                        {info.label}
                        <span className="text-[10px] font-normal text-zinc-500">{SPEED[info.speed]}</span>
                      </span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-zinc-500">{info.description}</span>
                    </span>
                  </label>
                )
              })}
          </div>
          {suggestedTask && task !== suggestedTask && (
            <p className="mt-3 flex items-center gap-2 text-xs text-amber-300">
              <AlertIcon size={14} />
              “{targetColumn}” looks like a {suggestedTask} target — training may fail or perform poorly.
            </p>
          )}
        </Step>
      )}

      {preview && targetColumn && modelType && (
        <Step n={4} title="Options">
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            aria-expanded={showAdvanced}
            className="flex w-full items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-950/50 px-4 py-3 text-left text-sm text-zinc-300 transition-colors hover:border-zinc-700"
          >
            <span>
              {featureCount} input column{featureCount === 1 ? '' : 's'} · {Math.round(testSize * 100)}% held out for testing
            </span>
            <span className="shrink-0 text-xs text-zinc-500">{showAdvanced ? 'Hide' : 'Customise'}</span>
          </button>
          {showAdvanced && (
            <div className="mt-3 animate-fade-up space-y-5 rounded-xl border border-zinc-800 bg-zinc-950/50 p-4">
              <div>
                <p className="label">Input columns</p>
                <p className="mb-2.5 text-xs text-zinc-500">Click a column to leave it out, e.g. IDs or values you won’t know at prediction time.</p>
                <div className="flex flex-wrap gap-1.5">
                  {preview.columns.filter((c) => c.name !== targetColumn).map((c) => {
                    const off = excluded.includes(c.name)
                    return (
                      <button
                        key={c.name}
                        type="button"
                        aria-pressed={!off}
                        onClick={() => toggleExcluded(c.name)}
                        className={`rounded-md border px-2.5 py-1 font-mono text-xs transition-colors ${
                          off ? 'border-zinc-800 text-zinc-600 line-through' : 'border-zinc-700 bg-zinc-900 text-zinc-200 hover:border-zinc-500'
                        }`}
                      >
                        {c.name}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div>
                <p className="label">Test split</p>
                <p className="mb-2.5 text-xs text-zinc-500">Share of rows kept aside to measure accuracy honestly.</p>
                <div className="flex gap-1.5" role="radiogroup" aria-label="Test split">
                  {TEST_SPLITS.map((v) => (
                    <button
                      key={v}
                      type="button"
                      role="radio"
                      aria-checked={testSize === v}
                      onClick={() => setTestSize(v)}
                      className={`h-9 flex-1 rounded-lg border font-mono text-xs transition-colors sm:flex-none sm:px-4 ${
                        testSize === v ? 'border-zinc-300 bg-zinc-100 text-zinc-950' : 'border-zinc-800 text-zinc-300 hover:border-zinc-700'
                      }`}
                    >
                      {Math.round(v * 100)}%
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </Step>
      )}

      {preview && targetColumn && modelType && (
        <Step n={5} title="Name it and train">
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              className="input sm:h-12"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Model name"
              maxLength={120}
              aria-label="Model name"
            />
            <button type="submit" disabled={loading || featureCount < 1} className="btn btn-primary btn-lg w-full sm:w-auto">
              {loading ? <Spinner /> : null}
              {loading ? 'Uploading…' : 'Train model'}
              {!loading && <ArrowRightIcon />}
            </button>
          </div>
          <p className="mt-3 text-xs text-zinc-500">
            {MODEL_TYPES[modelType].auto ? 'Auto mode usually takes under a minute.' : 'Training usually takes a few seconds.'}{' '}
            The uploaded file is deleted as soon as training finishes.
          </p>
        </Step>
      )}

      {error && (
        <div className="flex gap-2.5 rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-300" role="alert">
          <AlertIcon className="mt-0.5 shrink-0" />
          {error}
        </div>
      )}
    </form>
  )
}
