'use client'

import { useRef, useState } from 'react'
import type { FeatureSchema, PredictionResult } from '@/types'
import { AlertIcon, RefreshIcon, Spinner, ZapIcon } from './icons'

interface PredictionFormProps {
  modelId: string
  isClassification: boolean
  features: FeatureSchema[] | null
  targetColumn: string
  backendOnline: boolean
  /** Where the form is shown, for usage stats */
  source?: 'web' | 'share'
}

function initialValues(features: FeatureSchema[]) {
  const values: Record<string, string> = {}
  for (const f of features) {
    if (f.default !== undefined) values[f.name] = String(f.default)
    else values[f.name] = f.type === 'categorical' && f.categories?.length ? f.categories[0] : ''
  }
  return values
}

function formatValue(value: PredictionResult['prediction']) {
  if (typeof value !== 'number') return String(value)
  if (Number.isInteger(value)) return value.toLocaleString('en-US')
  return Math.abs(value) >= 1000
    ? value.toLocaleString('en-US', { maximumFractionDigits: 2 })
    : Number(value.toPrecision(5)).toString()
}

function formatRange(f: FeatureSchema) {
  if (f.min === undefined || f.max === undefined) return null
  const fmt = (v: number) => (Math.abs(v) >= 1000 ? Math.round(v).toLocaleString('en-US') : Number(v.toPrecision(4)))
  return `Trained on ${fmt(f.min)} – ${fmt(f.max)}`
}

export default function PredictionForm({ modelId, isClassification, features, targetColumn, backendOnline, source = 'web' }: PredictionFormProps) {
  const [inputs, setInputs] = useState<Record<string, string>>(() => initialValues(features ?? []))
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<PredictionResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const resultRef = useRef<HTMLDivElement>(null)

  if (!features || features.length === 0) {
    return (
      <div className="card p-6 text-center text-sm text-zinc-400">
        This model has no input schema. Re-train it to generate the prediction form.
      </div>
    )
  }

  const set = (name: string, value: string) => setInputs((prev) => ({ ...prev, [name]: value }))

  const handlePredict = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const payload: Record<string, string | number | null> = {}
    for (const f of features) {
      const raw = inputs[f.name]?.trim() ?? ''
      // Blank numbers are sent as null; the model fills them with the training median
      payload[f.name] = f.type === 'numeric' ? (raw === '' ? null : Number(raw)) : raw
    }

    try {
      const res = await fetch(`/api/v1/models/${modelId}/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-ModelFoundry-Source': source },
        body: JSON.stringify({ features: payload }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.detail ?? `Request failed (${res.status})`)
      setResult(data)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Prediction failed')
    } finally {
      setLoading(false)
      // On phones the result card sits below the form — bring it into view
      requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }))
    }
  }

  const topProbabilities = result?.probabilities?.slice(0, 5) ?? []

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
      <form onSubmit={handlePredict} className="card p-5 sm:p-6">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-zinc-100">Try the model</h2>
            <p className="mt-1 text-sm text-zinc-400">
              {features.some((f) => f.default !== undefined)
                ? 'Pre-filled with typical values from the training data. Change any input and predict.'
                : 'Blank number fields use typical values from the training data.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => { setInputs(initialValues(features)); setResult(null); setError(null) }}
            className="btn btn-ghost btn-sm -mt-1 -mr-2"
            title="Reset inputs"
          >
            <RefreshIcon size={14} />
            <span className="hidden sm:inline">Reset</span>
          </button>
        </div>

        {!backendOnline && (
          <div className="mb-5 flex gap-2.5 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-sm text-amber-200">
            <AlertIcon className="mt-0.5 shrink-0" />
            <span>The prediction server looks offline. Predictions will work again once it is back up.</span>
          </div>
        )}

        <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
          {features.map((field) => {
            const id = `f-${field.name}`
            const categories = field.categories ?? []
            const segmented = field.type === 'categorical' && categories.length > 0 && categories.length <= 4
            const range = field.type === 'numeric' ? formatRange(field) : null
            return (
              <div key={field.name} className={segmented && categories.some((c) => c.length > 14) ? 'sm:col-span-2' : ''}>
                <label htmlFor={segmented ? undefined : id} className="label truncate" title={field.name}>
                  {field.name}
                </label>
                {segmented ? (
                  <div role="radiogroup" aria-label={field.name} className="flex flex-wrap gap-1.5">
                    {categories.map((cat) => {
                      const active = inputs[field.name] === cat
                      return (
                        <button
                          key={cat}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          onClick={() => set(field.name, cat)}
                          className={`h-10 min-w-12 flex-1 rounded-lg border px-3 text-sm font-medium transition-colors ${
                            active
                              ? 'border-zinc-300 bg-zinc-100 text-zinc-950'
                              : 'border-zinc-800 bg-zinc-950 text-zinc-300 hover:border-zinc-700'
                          }`}
                        >
                          {cat}
                        </button>
                      )
                    })}
                  </div>
                ) : field.type === 'categorical' ? (
                  <select id={id} className="input" value={inputs[field.name]} onChange={(e) => set(field.name, e.target.value)}>
                    {categories.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    id={id}
                    type="number"
                    step={field.integer ? 1 : 'any'}
                    inputMode={field.integer ? 'numeric' : 'decimal'}
                    className="input font-mono tabular-nums placeholder:font-sans"
                    placeholder="Blank = typical value"
                    value={inputs[field.name]}
                    onChange={(e) => set(field.name, e.target.value)}
                  />
                )}
                {range && <p className="mt-1.5 text-xs text-zinc-600">{range}</p>}
              </div>
            )
          })}
        </div>

        <button type="submit" disabled={loading} className="btn btn-primary btn-lg mt-6 w-full">
          {loading ? <Spinner /> : <ZapIcon />}
          {loading ? 'Predicting…' : 'Predict'}
        </button>
      </form>

      {/* Result */}
      <div ref={resultRef} className="card scroll-mb-4 p-5 sm:p-6 lg:sticky lg:top-20" aria-live="polite">
        <p className="text-xs font-medium tracking-wide text-zinc-500 uppercase">
          Predicted <span className="normal-case">{targetColumn}</span>
        </p>

        {error ? (
          <div className="mt-3 flex gap-2.5 text-sm text-red-300">
            <AlertIcon className="mt-0.5 shrink-0" />
            <span className="break-words">{error}</span>
          </div>
        ) : result ? (
          <div key={JSON.stringify(result)} className="animate-fade-up">
            <p className="mt-2 font-mono text-4xl font-semibold tracking-tight break-words text-zinc-50">
              {formatValue(result.prediction)}
            </p>
            {result.probability !== undefined && (
              <p className="mt-1 text-sm text-zinc-400">
                <span className="font-medium text-emerald-300">{(result.probability * 100).toFixed(1)}%</span> confidence
              </p>
            )}

            {topProbabilities.length > 1 && (
              <div className="mt-5 space-y-3 border-t border-zinc-800 pt-5">
                {topProbabilities.map((p, i) => (
                  <div key={String(p.label)}>
                    <div className="mb-1 flex justify-between gap-3 text-xs">
                      <span className="truncate text-zinc-300">{String(p.label)}</span>
                      <span className="font-mono text-zinc-500 tabular-nums">{(p.probability * 100).toFixed(1)}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
                      <div
                        className={`h-full rounded-full transition-[width] duration-500 ${i === 0 ? 'bg-emerald-400' : 'bg-zinc-500'}`}
                        style={{ width: `${Math.max(p.probability * 100, 1)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <p className="mt-3 text-sm leading-relaxed text-zinc-500">
            {loading
              ? 'Running the model…'
              : `Fill in the inputs and press Predict to see the ${isClassification ? 'predicted class and confidence' : 'predicted value'}.`}
          </p>
        )}
      </div>
    </div>
  )
}
