import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient, getUser } from '@/utils/supabase/server'
import { getBackendStatus } from '@/lib/backend'
import { siteOrigin } from '@/lib/site'
import { cvSummary, displayName, formatRelative, isClassification, jobModelLabel } from '@/lib/models'
import type { TrainingJob, UsageDay } from '@/types'
import { MetricGrid, Notice, StatusBadge } from '@/components/ui'
import { AlertIcon, ArrowLeftIcon, ExternalIcon, GlobeIcon, LockIcon, PlusIcon } from '@/components/icons'
import PredictionForm from '@/components/PredictionForm'
import ModelReport from '@/components/ModelReport'
import BatchPredict from '@/components/BatchPredict'
import ApiPanel from '@/components/ApiPanel'
import ModelSettings from '@/components/ModelSettings'
import TrainingStatus from '@/components/TrainingStatus'
import { UsageBars } from '@/components/charts'
import AutoRefresh from '@/components/AutoRefresh'
import CopyButton from '@/components/CopyButton'

type Props = { params: Promise<{ id: string }> }

async function getJob(id: string) {
  const user = await getUser()
  if (!user) return null
  const supabase = await createClient()
  const { data } = await supabase
    .from('training_jobs')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle()
  return data as TrainingJob | null
}

async function getUsage(id: string): Promise<UsageDay[]> {
  const supabase = await createClient()
  const { data } = await supabase.rpc('model_usage', { p_model_id: id, p_days: 14 })
  return (data ?? []) as UsageDay[]
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const job = await getJob((await params).id)
  return { title: job ? displayName(job.dataset_name) : 'Model' }
}

export default async function ModelPage({ params }: Props) {
  const { id } = await params
  const [job, backend, origin] = await Promise.all([getJob(id), getBackendStatus(), siteOrigin()])
  if (!job) notFound()

  const classification = isClassification(job.model_type)
  const sharePath = `/share/model/${job.id}`
  const ready = job.status === 'ready'
  const training = job.status === 'pending' || job.status === 'processing'
  const usage = ready ? await getUsage(job.id) : []
  const totalPredictions = usage.reduce((sum, d) => sum + d.predictions, 0)
  const latencies = usage.filter((d) => d.avg_latency_ms != null)
  const avgLatency = latencies.length
    ? Math.round(latencies.reduce((s, d) => s + d.avg_latency_ms! * d.requests, 0) / latencies.reduce((s, d) => s + d.requests, 0))
    : null
  const cv = cvSummary(job.metrics)

  return (
    <div className="space-y-6">
      {training && <AutoRefresh intervalMs={2000} />}
      <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-zinc-500 transition-colors hover:text-zinc-200">
        <ArrowLeftIcon size={14} /> All models
      </Link>

      {/* Header */}
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="truncate text-2xl font-semibold tracking-tight text-zinc-50 sm:text-3xl">
              {displayName(job.dataset_name)}
            </h1>
            <StatusBadge status={job.status} />
            <span className="inline-flex h-6 items-center gap-1.5 rounded-full border border-zinc-800 px-2.5 text-xs text-zinc-400">
              {job.is_public ? <><GlobeIcon size={12} /> Public</> : <><LockIcon size={12} /> Private</>}
            </span>
          </div>
          <p className="mt-2 text-sm text-zinc-500">
            {jobModelLabel(job)} · predicts <span className="text-zinc-200">{job.target_column}</span> · created {formatRelative(job.created_at)}
            {job.metrics?.train_rows ? ` · trained on ${job.metrics.train_rows.toLocaleString('en-US')} rows` : ''}
          </p>
        </div>
        {ready && job.is_public && (
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <CopyButton value={sharePath} absolute label="Copy share link" copiedLabel="Link copied" className="btn btn-secondary btn-sm" />
            <Link href={sharePath} target="_blank" className="btn btn-secondary btn-sm">
              <ExternalIcon size={14} /> Public page
            </Link>
          </div>
        )}
      </div>

      {training && (
        <TrainingStatus id={job.id} status={job.status} progress={job.progress} workerOnline={backend.workerOnline} attempts={job.attempts} />
      )}

      {(job.status === 'failed' || job.status === 'cancelled') && (
        <Notice tone={job.status === 'failed' ? 'error' : 'neutral'} icon={<AlertIcon />} title={job.status === 'failed' ? 'Training failed' : 'Training was cancelled'}>
          {job.error_message && <p className="break-words">{job.error_message}</p>}
          <Link href="/dashboard/upload" className="btn btn-secondary btn-sm mt-4">
            <PlusIcon size={14} /> Train a new model
          </Link>
        </Notice>
      )}

      {ready && (
        <>
          <div className="space-y-2">
            <MetricGrid type={job.model_type} metrics={job.metrics} />
            {cv && job.report?.cv && (
              <p className="text-xs text-zinc-500">
                Cross-validated {job.report.cv.metric}: <span className="font-mono text-zinc-300">{cv}</span> over {job.report.cv.folds} folds
              </p>
            )}
          </div>

          <PredictionForm
            modelId={job.id}
            isClassification={classification}
            features={job.features}
            targetColumn={job.target_column}
            backendOnline={backend.apiOnline}
          />

          {job.report && <ModelReport report={job.report} target={job.target_column} />}

          {job.features && job.features.length > 0 && (
            <BatchPredict modelId={job.id} features={job.features} targetColumn={job.target_column} />
          )}

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
            {job.features && job.features.length > 0 && (
              <ApiPanel
                endpoint={`${origin}/api/v1/models/${job.id}/predict`}
                features={job.features}
                isClassification={classification}
                isPublic={job.is_public}
              />
            )}
            <section className="card p-5 sm:p-6">
              <h2 className="text-base font-semibold text-zinc-100">Usage</h2>
              <p className="mt-1 text-sm text-zinc-400">Predictions over the last 14 days.</p>
              <div className="mt-4 grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-zinc-500">Predictions</p>
                  <p className="mt-1 font-mono text-2xl font-semibold text-zinc-100 tabular-nums">{totalPredictions.toLocaleString('en-US')}</p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500">Avg. latency</p>
                  <p className="mt-1 font-mono text-2xl font-semibold text-zinc-100 tabular-nums">{avgLatency != null ? `${avgLatency} ms` : '—'}</p>
                </div>
              </div>
              <div className="mt-5">
                {totalPredictions > 0 ? <UsageBars days={usage} /> : (
                  <p className="rounded-lg border border-dashed border-zinc-800 py-8 text-center text-xs text-zinc-500">
                    No predictions yet. Try the form above or call the API.
                  </p>
                )}
              </div>
            </section>
          </div>
        </>
      )}

      <ModelSettings id={job.id} name={job.dataset_name} isPublic={job.is_public} canDownload={ready} />
    </div>
  )
}
