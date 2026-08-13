'use client'

import { useState, useRef } from 'react'
import { createClient } from '@/utils/supabase/client'
import { ModelType } from '@/types'
import { useRouter } from 'next/navigation'

const MODEL_OPTIONS: { value: ModelType; label: string; type: string }[] = [
  { value: 'logistic_regression', label: 'Logistic Regression', type: 'Classification' },
  { value: 'random_forest_classifier', label: 'Random Forest Classifier', type: 'Classification' },
  { value: 'linear_regression', label: 'Linear Regression', type: 'Regression' },
  { value: 'random_forest_regressor', label: 'Random Forest Regressor', type: 'Regression' },
]

export default function UploadForm() {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [columns, setColumns] = useState<string[]>([])
  const [targetColumn, setTargetColumn] = useState('')
  const [modelType, setModelType] = useState<ModelType>('random_forest_classifier')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [step, setStep] = useState<'upload' | 'configure'>('upload')

  const parseColumns = (csvText: string) => {
    const firstLine = csvText.split('\n')[0]
    return firstLine.split(',').map(c => c.trim().replace(/^"|"$/g, ''))
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f)
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      const cols = parseColumns(text)
      setColumns(cols)
      setTargetColumn(cols[cols.length - 1] || '')
      setStep('configure')
    }
    reader.readAsText(f)
  }

  const handleSubmit = async () => {
    if (!file || !targetColumn || !modelType) return
    setLoading(true)
    setError(null)

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      // Upload dataset to Supabase Storage
      const datasetPath = `${user.id}/${Date.now()}_${file.name}`
      const { error: uploadError } = await supabase.storage
        .from('datasets')
        .upload(datasetPath, file)
      if (uploadError) throw uploadError

      // Create training job row
      const { error: insertError } = await supabase
        .from('training_jobs')
        .insert({
          user_id: user.id,
          dataset_name: file.name,
          dataset_path: datasetPath,
          target_column: targetColumn,
          model_type: modelType,
        })
      if (insertError) throw insertError

      router.push('/dashboard')
      router.refresh()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="glass p-8 max-w-xl w-full">
      <h2 className="text-xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Train a New Model</h2>
      <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>Upload a CSV and configure your training job</p>

      {error && (
        <div className="mb-4 p-3 rounded-lg text-sm"
          style={{ background: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.3)', color: 'var(--error)' }}>
          {error}
        </div>
      )}

      {/* File Upload */}
      <div
        onClick={() => fileRef.current?.click()}
        className="mb-6 flex flex-col items-center justify-center p-8 rounded-xl border-2 border-dashed cursor-pointer transition-all"
        style={{ borderColor: file ? 'var(--accent)' : 'var(--border)', background: file ? 'rgba(99,102,241,0.05)' : 'var(--surface)' }}
      >
        <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFileChange} />
        <span className="text-3xl mb-3">{file ? '✅' : '📂'}</span>
        <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
          {file ? file.name : 'Click to upload CSV'}
        </span>
        <span className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
          {file ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : 'Max 50MB'}
        </span>
      </div>

      {step === 'configure' && (
        <>
          {/* Target Column */}
          <div className="mb-4">
            <label className="label">Target Column (what you want to predict)</label>
            <select
              className="input"
              value={targetColumn}
              onChange={e => setTargetColumn(e.target.value)}
            >
              {columns.map(col => (
                <option key={col} value={col}>{col}</option>
              ))}
            </select>
          </div>

          {/* Model Type */}
          <div className="mb-6">
            <label className="label">Model</label>
            <div className="grid grid-cols-1 gap-2">
              {MODEL_OPTIONS.map(opt => (
                <label key={opt.value}
                  className="flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all"
                  style={{
                    border: `1px solid ${modelType === opt.value ? 'var(--accent)' : 'var(--border)'}`,
                    background: modelType === opt.value ? 'rgba(99,102,241,0.1)' : 'var(--surface)',
                  }}
                >
                  <input
                    type="radio"
                    name="model"
                    value={opt.value}
                    checked={modelType === opt.value}
                    onChange={() => setModelType(opt.value)}
                    className="accent-indigo-500"
                  />
                  <span>
                    <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{opt.label}</span>
                    <span className="text-xs ml-2" style={{ color: 'var(--text-muted)' }}>{opt.type}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <button
            onClick={handleSubmit}
            disabled={loading}
            className="btn-primary w-full"
            style={{ padding: '12px 20px' }}
          >
            {loading ? (
              <>
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin inline-block"></span>
                Submitting Job...
              </>
            ) : '🚀 Train Model'}
          </button>
        </>
      )}
    </div>
  )
}
