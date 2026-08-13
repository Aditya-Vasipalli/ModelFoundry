'use client'

import { useState } from 'react'

interface PredictionFormProps {
  modelId: string
  isClassification: boolean
}

export default function PredictionForm({ modelId, isClassification }: PredictionFormProps) {
  const [inputs, setInputs] = useState<Record<string, string>>({})
  const [newKey, setNewKey] = useState('')
  const [newVal, setNewVal] = useState('')
  const [fields, setFields] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ prediction: unknown; probability?: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const addField = () => {
    if (!newKey.trim()) return
    setFields(prev => [...prev, newKey.trim()])
    setInputs(prev => ({ ...prev, [newKey.trim()]: newVal.trim() }))
    setNewKey('')
    setNewVal('')
  }

  const handlePredict = async () => {
    setLoading(true)
    setError(null)
    setResult(null)

    // Convert numeric strings to numbers
    const features: Record<string, string | number> = {}
    for (const [k, v] of Object.entries(inputs)) {
      features[k] = isNaN(Number(v)) ? v : Number(v)
    }

    try {
      const apiUrl = process.env.NEXT_PUBLIC_ML_API_URL ?? 'http://localhost:8000'
      const res = await fetch(`${apiUrl}/api/v1/models/${modelId}/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ features }),
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

  return (
    <div className="glass p-6">
      <h2 className="text-lg font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Make a Prediction</h2>
      <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
        Add features by name and value, then click Predict.
      </p>

      {/* Add fields */}
      <div className="flex gap-2 mb-4">
        <input
          className="input flex-1"
          placeholder="Feature name (e.g. age)"
          value={newKey}
          onChange={e => setNewKey(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addField()}
        />
        <input
          className="input flex-1"
          placeholder="Value (e.g. 32)"
          value={newVal}
          onChange={e => setNewVal(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addField()}
        />
        <button className="btn-ghost" onClick={addField} style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>
          + Add
        </button>
      </div>

      {/* Feature list */}
      {fields.length > 0 && (
        <div className="flex flex-col gap-2 mb-6">
          {fields.map(field => (
            <div key={field} className="flex items-center gap-3 p-3 rounded-xl"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <span className="text-sm font-medium flex-1" style={{ color: 'var(--text-secondary)' }}>{field}</span>
              <input
                className="input"
                style={{ width: '140px' }}
                value={inputs[field] ?? ''}
                onChange={e => setInputs(prev => ({ ...prev, [field]: e.target.value }))}
              />
              <button
                onClick={() => {
                  setFields(prev => prev.filter(f => f !== field))
                  setInputs(prev => { const n = { ...prev }; delete n[field]; return n })
                }}
                style={{ color: 'var(--error)', fontSize: '18px', background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1 }}
              >×</button>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 rounded-lg text-sm"
          style={{ background: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.3)', color: 'var(--error)' }}>
          {error}
        </div>
      )}

      <button
        onClick={handlePredict}
        disabled={loading || fields.length === 0}
        className="btn-primary w-full"
        style={{ padding: '12px 20px' }}
      >
        {loading ? (
          <>
            <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" />
            Predicting...
          </>
        ) : '⚡ Predict'}
      </button>

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
