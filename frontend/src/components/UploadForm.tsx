'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import type { ModelType } from '@/types'
import { MODEL_TYPES, type Task } from '@/lib/models'
import { previewCsv, type CsvPreview } from '@/lib/csv'
import { AlertIcon, ArrowRightIcon, FileIcon, Spinner, UploadIcon } from './icons'

const MAX_BYTES = 50 * 1024 * 1024
const TASKS: { task: Task; title: string; blurb: string }[] = [
  { task: 'classification', title: 'Classification', blurb: 'Predict a category — yes/no, species, churn…' },
  { task: 'regression', title: 'Regression', blurb: 'Predict a number — price, demand, score…' },
]

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
  const [modelType, setModelType] = useState<ModelType | null>(null)
  const [modelTouched, setModelTouched] = useState(false)
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
      setModelTouched(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read that file.')
    } finally {
      setReading(false)
    }
  }

  const chooseTarget = (col: string) => {
    setTargetColumn(col)
    const task = preview?.columns.find((c) => c.name === col)?.task
    if (task && !modelTouched) {
      setModelType(task === 'classification' ? 'random_forest_classifier' : 'random_forest_regressor')
    }
  }

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
      if (uploadError) throw uploadError

      // Create training job row
      const { error: insertError } = await supabase.from('training_jobs').insert({
        user_id: user.id,
        dataset_name: name.trim() || file.name,
        dataset_path: datasetPath,
        target_column: targetColumn,
        model_type: modelType,
      })
      if (insertError) throw insertError

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
                  {formatBytes(file.size)} · {preview.columns.length} columns · ≈{preview.estimatedRows.toLocaleString('en-US')} rows
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
              {preview.estimatedRows > preview.rows.length ? '+' : ''} distinct values — looks like a{' '}
              <span className="text-zinc-300">{target.task}</span> problem.
              {target.kind === 'text' && target.distinct > 50 && ' That is a lot of classes; accuracy may be low.'}
            </p>
          )}
        </Step>
      )}

      {preview && targetColumn && (
        <Step n={3} title="Choose a model">
          <div className="grid gap-4 md:grid-cols-2">
            {TASKS.map(({ task, title, blurb }) => (
              <fieldset key={task} className={`space-y-2 ${suggestedTask && suggestedTask !== task ? 'opacity-60' : ''}`}>
                <legend className="mb-2 text-xs text-zinc-500">
                  <span className="font-medium text-zinc-300">{title}</span> · {blurb}
                </legend>
                {(Object.keys(MODEL_TYPES) as ModelType[])
                  .filter((type) => MODEL_TYPES[type].task === task)
                  .map((type) => {
                    const info = MODEL_TYPES[type]
                    const selected = modelType === type
                    const recommended = suggestedTask === task && type.startsWith('random_forest')
                    return (
                      <label
                        key={type}
                        className={`flex cursor-pointer gap-3 rounded-xl border p-3.5 transition-colors ${
                          selected ? 'border-zinc-400 bg-zinc-900' : 'border-zinc-800 bg-zinc-950/50 hover:border-zinc-700'
                        }`}
                      >
                        <input
                          type="radio"
                          name="model"
                          value={type}
                          checked={selected}
                          onChange={() => { setModelType(type); setModelTouched(true) }}
                          className="mt-0.5 size-4 shrink-0 accent-zinc-100"
                        />
                        <span className="min-w-0">
                          <span className="flex flex-wrap items-center gap-2 text-sm font-medium text-zinc-100">
                            {info.label}
                            {recommended && (
                              <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-px text-[10px] font-medium text-emerald-300">
                                Recommended
                              </span>
                            )}
                          </span>
                          <span className="mt-0.5 block text-xs leading-relaxed text-zinc-500">{info.description}</span>
                        </span>
                      </label>
                    )
                  })}
              </fieldset>
            ))}
          </div>
          {modelType && suggestedTask && MODEL_TYPES[modelType].task !== suggestedTask && (
            <p className="mt-3 flex items-center gap-2 text-xs text-amber-300">
              <AlertIcon size={14} />
              “{targetColumn}” looks like a {suggestedTask} target — training may fail or perform poorly.
            </p>
          )}
        </Step>
      )}

      {preview && targetColumn && modelType && (
        <Step n={4} title="Name it and train">
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              className="input sm:h-12"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Model name"
              maxLength={80}
              aria-label="Model name"
            />
            <button type="submit" disabled={loading} className="btn btn-primary btn-lg w-full sm:w-auto">
              {loading ? <Spinner /> : null}
              {loading ? 'Uploading…' : 'Train model'}
              {!loading && <ArrowRightIcon />}
            </button>
          </div>
          <p className="mt-3 text-xs text-zinc-500">
            Training usually takes a few seconds. The uploaded file is deleted as soon as training finishes.
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
