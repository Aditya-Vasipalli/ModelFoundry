import { createClient } from '@/utils/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import PredictionForm from '@/components/PredictionForm'
import { TrainingJob, ClassificationMetrics, RegressionMetrics } from '@/types'

export default async function ModelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: job } = await supabase
    .from('training_jobs')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!job || job.status !== 'ready') notFound()

  const typedJob = job as TrainingJob
  const isClassification = typedJob.model_type.includes('classifier') || typedJob.model_type.includes('logistic')
  const m = typedJob.metrics

  return (
    <div className="min-h-screen grid-bg">
      <nav className="flex items-center justify-between px-8 py-4 border-b sticky top-0 z-50"
        style={{ borderColor: 'var(--border)', background: 'rgba(8,11,20,0.85)', backdropFilter: 'blur(20px)' }}>
        <Link href="/" className="text-lg font-bold gradient-text">⚗️ ModelFoundry</Link>
        <Link href="/dashboard" className="btn-ghost" style={{ padding: '8px 16px', fontSize: '13px' }}>
          ← My Models
        </Link>
      </nav>

      <div className="max-w-4xl mx-auto px-6 py-10">
        {/* Model Header */}
        <div className="glass p-6 mb-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
                {typedJob.dataset_name}
              </h1>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                {typedJob.model_type.replace(/_/g, ' ')} • Target: <strong>{typedJob.target_column}</strong>
              </p>
            </div>
            <span className="status-badge status-ready">
              <span className="pulse-dot" />Ready
            </span>
          </div>

          {/* Metrics */}
          {m && (
            <div className="flex gap-6 mt-4 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
              {isClassification ? (
                <>
                  <div>
                    <div className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Accuracy</div>
                    <div className="text-2xl font-bold" style={{ color: 'var(--success)' }}>
                      {((m as ClassificationMetrics).accuracy * 100).toFixed(1)}%
                    </div>
                  </div>
                  <div>
                    <div className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>F1 Score</div>
                    <div className="text-2xl font-bold" style={{ color: 'var(--success)' }}>
                      {((m as ClassificationMetrics).f1_score * 100).toFixed(1)}%
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <div className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>R² Score</div>
                    <div className="text-2xl font-bold" style={{ color: 'var(--success)' }}>
                      {(m as RegressionMetrics).r2_score.toFixed(3)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>RMSE</div>
                    <div className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
                      {(m as RegressionMetrics).rmse.toFixed(3)}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* API Hint */}
        <div className="glass p-4 mb-6 flex items-center gap-3">
          <span className="text-xl">🔗</span>
          <div>
            <div className="text-sm font-medium mb-0.5" style={{ color: 'var(--text-primary)' }}>REST API Endpoint</div>
            <code className="text-xs" style={{ color: 'var(--accent-hover)' }}>
              POST {process.env.NEXT_PUBLIC_ML_API_URL}/api/v1/models/{id}/predict
            </code>
          </div>
        </div>

        {/* Prediction Form */}
        <PredictionForm modelId={id} isClassification={isClassification} features={typedJob.features} />
      </div>
    </div>
  )
}
