'use client'

import { useState } from 'react'
import { FeatureSchema } from '@/types'

interface PredictionFormProps {
  modelId: string
  isClassification: boolean
  features: FeatureSchema[] | null
}

export default function PredictionForm({ modelId, features }: PredictionFormProps) {
  // Initialize state with default values based on the schema
  const getInitialState = () => {
    const initialState: Record<string, string> = {}
    if (features) {
      features.forEach(f => {
        initialState[f.name] = f.type === 'categorical' && f.categories?.length ? f.categories[0] : ''
      })
    }
    return initialState
  }

  const [inputs, setInputs] = useState<Record<string, string>>(getInitialState())
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ prediction: unknown; probability?: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handlePredict = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setResult(null)

    // Convert numeric strings to numbers
    const payloadFeatures: Record<string, string | number> = {}
    for (const [k, v] of Object.entries(inputs)) {
      payloadFeatures[k] = isNaN(Number(v)) ? v : Number(v)
    }

    try {
      const apiUrl = process.env.NEXT_PUBLIC_ML_API_URL ?? 'http://localhost:8000'
      const res = await fetch(`${apiUrl}/api/v1/models/${modelId}/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ features: payloadFeatures }),
      })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      setResult(data)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Prediction failed')
    } finally {
      setLoading(false)
    }
  }

  if (!features || features.length === 0) {
    return (
      <div className="glass p-6 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>
        No feature schema available. Please wait for the model to finish training or re-train it.
      </div>
    )
  }

  return (
    <div className="glass p-6">
      <h2 className="text-lg font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Make a Prediction</h2>
      <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
        Fill out the required features below. The model automatically excluded any irrelevant or highly correlated columns.
      </p>

      <form onSubmit={handlePredict}>
        <div className="flex flex-col gap-4 mb-6">
          {features.map(field => (
            <div key={field.name} className="flex flex-col gap-1">
              <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                {field.name}
              </label>
              {field.type === 'categorical' && field.categories ? (
                <select
                  className="input"
                  value={inputs[field.name]}
                  onChange={e => setInputs(prev => ({ ...prev, [field.name]: e.target.value }))}
                  required
                >
                  <option value="" disabled>Select {field.name}</option>
                  {field.categories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="number"
                  step="any"
                  className="input"
                  placeholder={`Enter ${field.name}...`}
                  value={inputs[field.name]}
                  onChange={e => setInputs(prev => ({ ...prev, [field.name]: e.target.value }))}
                  required
                />
              )}
            </div>
          ))}
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg text-sm"
            style={{ background: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.3)', color: 'var(--error)' }}>
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="btn-primary w-full"
          style={{ padding: '12px 20px' }}
        >
          {loading ? (
            <>
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin inline-block mr-2" />
              Predicting...
            </>
          ) : '⚡ Predict'}
        </button>
      </form>

      {/* Result */}
      {result && (
        <div className="mt-6 p-5 rounded-xl text-center"
          style={{ background: 'rgba(34,211,163,0.06)', border: '1px solid rgba(34,211,163,0.2)' }}>
          <div className="text-xs font-medium mb-2" style={{ color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Prediction
          </div>
          <div className="text-3xl font-extrabold mb-2" style={{ color: 'var(--success)' }}>
            {String(result.prediction)}
          </div>
          {result.probability !== undefined && (
            <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Confidence: <strong style={{ color: 'var(--text-primary)' }}>
                {(result.probability * 100).toFixed(1)}%
              </strong>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
