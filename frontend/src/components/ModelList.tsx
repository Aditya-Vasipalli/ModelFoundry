'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import type { JobStatus, TrainingJob } from '@/types'
import { displayName, formatRelative, isClassification, jobModelLabel, metricItems } from '@/lib/models'
import { StatusBadge } from './ui'
import { ArrowRightIcon, ChartIcon, LockIcon, SearchIcon, Spinner, TagsIcon } from './icons'
import CopyButton from './CopyButton'
import DeleteModelButton from './DeleteModelButton'
import { CancelButton, ProgressBar } from './TrainingStatus'

type Filter = 'all' | 'ready' | 'training' | 'failed'
type Sort = 'newest' | 'oldest' | 'name' | 'score'

const FILTERS: { key: Filter; label: string; match: (s: JobStatus) => boolean }[] = [
  { key: 'all', label: 'All', match: () => true },
  { key: 'ready', label: 'Ready', match: (s) => s === 'ready' },
  { key: 'training', label: 'Training', match: (s) => s === 'pending' || s === 'processing' },
  { key: 'failed', label: 'Failed', match: (s) => s === 'failed' || s === 'cancelled' },
]

/** A 0-1 score comparable across tasks, for sorting */
function headlineScore(job: TrainingJob) {
  const m = job.metrics as Record<string, number> | null
  if (!m) return -Infinity
  return isClassification(job.model_type) ? m.f1_score ?? m.accuracy ?? -Infinity : m.r2_score ?? -Infinity
}

function JobCard({ job, workerOnline }: { job: TrainingJob; workerOnline: boolean }) {
  const classification = isClassification(job.model_type)
  const metrics = metricItems(job.model_type, job.metrics).slice(0, 2)
  const href = `/dashboard/model/${job.id}`
  const active = job.status === 'pending' || job.status === 'processing'

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
            {!job.is_public && (
              <span className="inline-flex items-center gap-1 text-xs text-zinc-500" title="Private model"><LockIcon size={12} /> Private</span>
            )}
          </div>
          <p className="mt-1 truncate text-xs text-zinc-500">
            {jobModelLabel(job)} · predicts <span className="text-zinc-300">{job.target_column}</span> · {formatRelative(job.created_at)}
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
          {(job.status === 'failed' || job.status === 'cancelled') && job.error_message && (
            <p className="mt-2.5 line-clamp-2 text-xs text-red-300/90">{job.error_message}</p>
          )}
          {job.status === 'processing' && (
            <div className="mt-3 max-w-sm space-y-1.5">
              <ProgressBar progress={job.progress} />
              <p className="flex items-center gap-2 text-xs text-zinc-500">
                <Spinner size={11} className="text-amber-300" /> {job.progress?.message ?? 'Training on your backend…'}
              </p>
            </div>
          )}
          {job.status === 'pending' && (
            <p className="mt-2.5 flex items-center gap-2 text-xs text-zinc-500">
              {workerOnline ? <><Spinner size={12} /> {job.attempts > 0 ? 'Retrying shortly…' : 'Starting shortly…'}</> : 'Waiting for the backend to come online'}
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
            {job.is_public && (
              <CopyButton
                value={`/share/model/${job.id}`}
                absolute
                label="Share link"
                copiedLabel="Link copied"
                className="btn btn-secondary btn-sm flex-1 md:flex-none"
              />
            )}
          </>
        )}
        {active && <CancelButton id={job.id} />}
        <DeleteModelButton id={job.id} className={job.status === 'ready' ? 'flex-1 md:flex-none' : 'ml-auto'} />
      </div>
    </li>
  )
}

export default function ModelList({ jobs, workerOnline }: { jobs: TrainingJob[]; workerOnline: boolean }) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [sort, setSort] = useState<Sort>('newest')

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    const match = FILTERS.find((f) => f.key === filter)!.match
    const list = jobs.filter((j) =>
      match(j.status) &&
      (!q || j.dataset_name.toLowerCase().includes(q) || j.target_column.toLowerCase().includes(q) ||
        jobModelLabel(j).toLowerCase().includes(q))
    )
    const sorters: Record<Sort, (a: TrainingJob, b: TrainingJob) => number> = {
      newest: (a, b) => b.created_at.localeCompare(a.created_at),
      oldest: (a, b) => a.created_at.localeCompare(b.created_at),
      name: (a, b) => a.dataset_name.localeCompare(b.dataset_name),
      score: (a, b) => headlineScore(b) - headlineScore(a),
    }
    return [...list].sort(sorters[sort])
  }, [jobs, query, filter, sort])

  const counts = Object.fromEntries(FILTERS.map((f) => [f.key, jobs.filter((j) => f.match(j.status)).length]))

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <SearchIcon size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-zinc-500" />
          <input
            type="search"
            className="input pl-9"
            placeholder="Search by name, target or algorithm"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search models"
          />
        </div>
        <div className="flex items-center gap-2">
          <div className="flex flex-1 rounded-lg border border-zinc-800 bg-zinc-950 p-0.5" role="tablist" aria-label="Filter by status">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                role="tab"
                aria-selected={filter === f.key}
                onClick={() => setFilter(f.key)}
                className={`h-8 flex-1 rounded-md px-2.5 text-xs font-medium whitespace-nowrap transition-colors sm:flex-none ${
                  filter === f.key ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {f.label}
                {counts[f.key] > 0 && <span className="ml-1 text-zinc-500">{counts[f.key]}</span>}
              </button>
            ))}
          </div>
          <label className="sr-only" htmlFor="sort">Sort</label>
          <select id="sort" className="input h-9 w-auto pr-9 text-xs sm:text-xs" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="name">Name</option>
            <option value="score">Best score</option>
          </select>
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="card px-6 py-10 text-center text-sm text-zinc-500">No models match.</p>
      ) : (
        <ul className="space-y-3">
          {visible.map((job) => <JobCard key={job.id} job={job} workerOnline={workerOnline} />)}
        </ul>
      )}
    </div>
  )
}
