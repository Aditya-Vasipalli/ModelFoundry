import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient, getUser } from '@/utils/supabase/server'
import { getBackendStatus } from '@/lib/backend'
import { siteOrigin } from '@/lib/site'
import { displayName, formatRelative, isClassification, modelLabel } from '@/lib/models'
import type { TrainingJob } from '@/types'
import { MetricGrid, Notice, StatusBadge } from '@/components/ui'
import { AlertIcon, ArrowLeftIcon, ExternalIcon, PlusIcon, Spinner } from '@/components/icons'
import PredictionForm from '@/components/PredictionForm'
import ApiPanel from '@/components/ApiPanel'
import AutoRefresh from '@/components/AutoRefresh'
import CopyButton from '@/components/CopyButton'
import DeleteModelButton from '@/components/DeleteModelButton'

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

  return (
    <div className="space-y-6">
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
          </div>
          <p className="mt-2 text-sm text-zinc-500">
            {modelLabel(job.model_type)} · predicts <span className="text-zinc-200">{job.target_column}</span> · trained {formatRelative(job.created_at)}
            {job.metrics?.train_rows ? ` on ${job.metrics.train_rows.toLocaleString('en-US')} rows` : ''}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          {ready && (
            <>
              <CopyButton value={sharePath} absolute label="Copy share link" copiedLabel="Link copied" className="btn btn-secondary btn-sm" />
              <Link href={sharePath} target="_blank" className="btn btn-secondary btn-sm">
                <ExternalIcon size={14} /> Public page
              </Link>
            </>
          )}
          <DeleteModelButton id={job.id} redirectTo="/dashboard" className={ready ? 'col-span-2 sm:col-span-1' : ''} />
        </div>
      </div>

      {ready ? (
        <>
          <MetricGrid type={job.model_type} metrics={job.metrics} />
          <PredictionForm
            modelId={job.id}
            isClassification={classification}
            features={job.features}
            targetColumn={job.target_column}
            backendOnline={backend.apiOnline}
          />
          {job.features && job.features.length > 0 && (
            <ApiPanel endpoint={`${origin}/api/v1/models/${job.id}/predict`} features={job.features} isClassification={classification} />
          )}
        </>
      ) : job.status === 'failed' ? (
        <Notice tone="error" icon={<AlertIcon />} title="Training failed">
          <p className="break-words">{job.error_message ?? 'Unknown error'}</p>
          <Link href="/dashboard/upload" className="btn btn-secondary btn-sm mt-4">
            <PlusIcon size={14} /> Train a new model
          </Link>
        </Notice>
      ) : (
        <div className="card flex flex-col items-center px-6 py-16 text-center">
          <AutoRefresh intervalMs={3000} />
          <Spinner size={22} className="text-zinc-400" />
          <h2 className="mt-5 text-lg font-semibold text-zinc-100">
            {job.status === 'processing' ? 'Training in progress' : 'Queued for training'}
          </h2>
          <p className="mt-2 max-w-sm text-sm text-zinc-400">
            {backend.workerOnline || job.status === 'processing'
              ? 'This usually takes a few seconds. The page updates by itself.'
              : 'The backend is offline. Training starts as soon as you run docker compose up -d.'}
          </p>
        </div>
      )}
    </div>
  )
}
