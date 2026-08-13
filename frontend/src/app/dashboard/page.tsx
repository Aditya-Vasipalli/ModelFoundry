import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { TrainingJob, ClassificationMetrics, RegressionMetrics } from '@/types'

function StatusBadge({ status }: { status: TrainingJob['status'] }) {
  return (
    <span className={`status-badge status-${status}`}>
      <span className="pulse-dot" />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  )
}

function MetricsDisplay({ metrics, modelType }: { metrics: TrainingJob['metrics'], modelType: string }) {
  if (!metrics) return <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>—</span>

  const isClassification = modelType.includes('classifier') || modelType.includes('logistic')
  if (isClassification) {
    const m = metrics as ClassificationMetrics
    return (
      <div className="flex gap-4 text-xs" style={{ color: 'var(--text-secondary)' }}>
        <span>Acc <strong style={{ color: 'var(--success)' }}>{(m.accuracy * 100).toFixed(1)}%</strong></span>
        <span>F1 <strong style={{ color: 'var(--success)' }}>{(m.f1_score * 100).toFixed(1)}%</strong></span>
      </div>
    )
  } else {
    const m = metrics as RegressionMetrics
    return (
      <div className="flex gap-4 text-xs" style={{ color: 'var(--text-secondary)' }}>
        <span>R² <strong style={{ color: 'var(--success)' }}>{m.r2_score.toFixed(3)}</strong></span>
        <span>RMSE <strong style={{ color: 'var(--text-primary)' }}>{m.rmse.toFixed(3)}</strong></span>
      </div>
    )
  }
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: jobs } = await supabase
    .from('training_jobs')
    .select('*')
    .order('created_at', { ascending: false })

  const typedJobs = (jobs ?? []) as TrainingJob[]

  return (
    <div className="min-h-screen grid-bg">
      {/* Navbar */}
      <nav className="flex items-center justify-between px-8 py-4 border-b sticky top-0 z-50"
        style={{ borderColor: 'var(--border)', background: 'rgba(8,11,20,0.85)', backdropFilter: 'blur(20px)' }}>
        <Link href="/" className="text-lg font-bold gradient-text">⚗️ ModelFoundry</Link>
        <div className="flex items-center gap-3">
          <span className="text-sm" style={{ color: 'var(--text-muted)' }}>{user.email}</span>
          <form action="/auth/signout" method="post">
            <button type="submit" className="btn-ghost" style={{ padding: '6px 14px', fontSize: '13px' }}>
              Sign Out
            </button>
          </form>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>My Models</h1>
            <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
              {typedJobs.length} model{typedJobs.length !== 1 ? 's' : ''} total
            </p>
          </div>
          <Link href="/dashboard/upload" className="btn-primary">
            + New Model
          </Link>
        </div>

        {/* Models Grid */}
        {typedJobs.length === 0 ? (
          <div className="glass flex flex-col items-center justify-center py-20 text-center">
            <span className="text-5xl mb-4">🧪</span>
            <h2 className="text-xl font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>No models yet</h2>
            <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>Upload a dataset to train your first model</p>
            <Link href="/dashboard/upload" className="btn-primary">
              Upload Dataset
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {typedJobs.map(job => (
              <div key={job.id} className="glass card-hover p-6 flex items-center justify-between">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-3">
                    <h3 className="font-semibold text-base" style={{ color: 'var(--text-primary)' }}>
                      {job.dataset_name}
                    </h3>
                    <StatusBadge status={job.status} />
                  </div>
                  <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                    <span>{job.model_type.replace(/_/g, ' ')}</span>
                    <span>•</span>
                    <span>Target: <strong style={{ color: 'var(--text-secondary)' }}>{job.target_column}</strong></span>
                    <span>•</span>
                    <span>{new Date(job.created_at).toLocaleDateString()}</span>
                  </div>
                  <MetricsDisplay metrics={job.metrics} modelType={job.model_type} />
                  {job.error_message && (
                    <span className="text-xs" style={{ color: 'var(--error)' }}>{job.error_message}</span>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  {job.status === 'ready' && (
                    <Link
                      href={`/dashboard/model/${job.id}`}
                      className="btn-primary"
                      style={{ padding: '8px 16px', fontSize: '13px' }}
                    >
                      Open Predictor →
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
