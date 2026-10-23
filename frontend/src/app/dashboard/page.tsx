import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient, getUser } from '@/utils/supabase/server'
import { getBackendStatus } from '@/lib/backend'
import type { TrainingJob } from '@/types'
import { BackendPill, Notice } from '@/components/ui'
import { PlusIcon, ServerIcon, UploadIcon } from '@/components/icons'
import AutoRefresh from '@/components/AutoRefresh'
import ModelList from '@/components/ModelList'

export const metadata: Metadata = { title: 'Models' }

const SAMPLE_DATASET = 'https://raw.githubusercontent.com/datasciencedojo/datasets/master/titanic.csv'
// Large JSON columns the list doesn't need
const LIST_COLUMNS =
  'id,user_id,dataset_name,dataset_path,target_column,model_type,status,metrics,progress,attempts,is_public,error_message,created_at,updated_at,started_at,finished_at,report->model_label'

export default async function DashboardPage() {
  const user = await getUser()
  const supabase = await createClient()
  const [{ data, error }, backend] = await Promise.all([
    supabase.from('training_jobs').select(LIST_COLUMNS).eq('user_id', user!.id).order('created_at', { ascending: false }),
    getBackendStatus(),
  ])

  const jobs = ((data ?? []) as unknown as (TrainingJob & { model_label?: string })[]).map((j) => ({
    ...j,
    report: j.model_label ? ({ model_label: j.model_label } as TrainingJob['report']) : null,
  }))
  const readyCount = jobs.filter((j) => j.status === 'ready').length
  const active = jobs.some((j) => j.status === 'pending' || j.status === 'processing')
  const online = backend.apiOnline && backend.workerOnline

  return (
    <div className="space-y-6">
      <AutoRefresh intervalMs={active ? 3000 : 30000} />

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

      {error && (
        <Notice tone="error" title="Couldn’t load your models">{error.message}</Notice>
      )}

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
        <ModelList jobs={jobs} workerOnline={backend.workerOnline} />
      )}
    </div>
  )
}
