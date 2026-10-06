import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient, getUser } from '@/utils/supabase/server'
import { getBackendStatus } from '@/lib/backend'
import { displayName, formatRelative, isClassification, metricItems, modelLabel } from '@/lib/models'
import type { TrainingJob } from '@/types'
import { BackendPill, Notice, StatusBadge } from '@/components/ui'
import { ArrowRightIcon, ChartIcon, PlusIcon, ServerIcon, Spinner, TagsIcon, UploadIcon } from '@/components/icons'
import AutoRefresh from '@/components/AutoRefresh'
import CopyButton from '@/components/CopyButton'
import DeleteModelButton from '@/components/DeleteModelButton'

export const metadata: Metadata = { title: 'Models' }

const SAMPLE_DATASET = 'https://raw.githubusercontent.com/datasciencedojo/datasets/master/titanic.csv'

function JobCard({ job, workerOnline }: { job: TrainingJob; workerOnline: boolean }) {
  const classification = isClassification(job.model_type)
  const metrics = metricItems(job.model_type, job.metrics).slice(0, 2)
  const href = `/dashboard/model/${job.id}`

  return (
    <li className="card card-interactive flex flex-col gap-4 p-4 sm:p-5 md:flex-row md:items-center md:gap-6">
      <div className="flex min-w-0 flex-1 items-start gap-3.5">
        <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-950 text-zinc-400">
          {classification ? <TagsIcon size={18} /> : <ChartIcon size={18} />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <Link href={href} className="truncate text-[15px] font-medium text-zinc-100 hover:underline hover:decoration-zinc-600 hover:underline-offset-4">
              {displayName(job.dataset_name)}
            </Link>
            <StatusBadge status={job.status} />
          </div>
          <p className="mt-1 truncate text-xs text-zinc-500">
            {modelLabel(job.model_type)} · predicts <span className="text-zinc-300">{job.target_column}</span> · {formatRelative(job.created_at)}
          </p>

          {job.status === 'ready' && metrics.length > 0 && (
            <p className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
              {metrics.map((m) => (
                <span key={m.key}>
                  {m.label} <span className={`font-mono font-medium ${m.tone === 'good' ? 'text-emerald-300' : 'text-zinc-200'}`}>{m.value}</span>
                </span>
              ))}
            </p>
          )}
          {job.status === 'failed' && job.error_message && (
            <p className="mt-2.5 line-clamp-2 text-xs text-red-300/90">{job.error_message}</p>
          )}
          {(job.status === 'pending' || job.status === 'processing') && (
            <p className="mt-2.5 flex items-center gap-2 text-xs text-zinc-500">
              {job.status === 'processing' ? (
                <><Spinner size={12} className="text-amber-300" /> Training on your backend…</>
              ) : workerOnline ? (
                <><Spinner size={12} /> Starting shortly…</>
              ) : (
                'Waiting for the backend to come online'
              )}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 border-t border-zinc-800/80 pt-4 md:border-0 md:pt-0">
        {job.status === 'ready' && (
          <>
            <Link href={href} className="btn btn-primary btn-sm flex-1 md:flex-none">
              Open <ArrowRightIcon size={14} />
            </Link>
            <CopyButton
              value={`/share/model/${job.id}`}
              absolute
              label="Share link"
              copiedLabel="Link copied"
              className="btn btn-secondary btn-sm flex-1 md:flex-none"
            />
          </>
        )}
        <DeleteModelButton id={job.id} className={job.status === 'ready' ? 'flex-1 md:flex-none' : 'ml-auto'} />
      </div>
    </li>
  )
}

export default async function DashboardPage() {
  const user = await getUser()
  const supabase = await createClient()
  const [{ data }, backend] = await Promise.all([
    supabase.from('training_jobs').select('*').eq('user_id', user!.id).order('created_at', { ascending: false }),
    getBackendStatus(),
  ])

  const jobs = (data ?? []) as TrainingJob[]
  const readyCount = jobs.filter((j) => j.status === 'ready').length
  const active = jobs.some((j) => j.status === 'pending' || j.status === 'processing')
  const online = backend.apiOnline && backend.workerOnline

  return (
    <div className="space-y-6">
      <AutoRefresh intervalMs={active ? 4000 : 30000} />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-50 sm:text-3xl">Models</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {jobs.length === 0 ? 'Nothing trained yet' : `${jobs.length} model${jobs.length === 1 ? '' : 's'} · ${readyCount} ready`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <BackendPill online={online} />
          <Link href="/dashboard/upload" className="btn btn-primary ml-auto sm:ml-0">
            <PlusIcon /> New model
          </Link>
        </div>
      </div>

      {!online && (
        <Notice tone="warning" icon={<ServerIcon />} title="Your backend is offline">
          Training and predictions run on your machine. Start them from the project folder with{' '}
          <code className="kbd">docker compose up -d</code> — the dashboard connects automatically.
        </Notice>
      )}

      {jobs.length === 0 ? (
        <div className="card flex flex-col items-center px-6 py-16 text-center sm:py-20">
          <span className="mb-5 flex size-12 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-950 text-zinc-300">
            <UploadIcon size={20} />
          </span>
          <h2 className="text-lg font-semibold text-zinc-100">Train your first model</h2>
          <p className="mt-2 max-w-sm text-sm text-zinc-400">
            Upload a CSV, pick the column to predict, and get a live predictor plus a REST endpoint.
          </p>
          <Link href="/dashboard/upload" className="btn btn-primary mt-6">
            <PlusIcon /> New model
          </Link>
          <a href={SAMPLE_DATASET} target="_blank" rel="noreferrer" className="mt-4 text-xs text-zinc-500 underline decoration-zinc-700 underline-offset-4 hover:text-zinc-300">
            No data handy? Download the Titanic dataset
          </a>
        </div>
      ) : (
        <ul className="space-y-3">
          {jobs.map((job) => (
            <JobCard key={job.id} job={job} workerOnline={backend.workerOnline} />
          ))}
        </ul>
      )}
    </div>
  )
}
