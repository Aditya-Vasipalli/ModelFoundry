'use client'

import { useState, useTransition } from 'react'
import type { JobStatus, TrainingProgress } from '@/types'
import { cancelTraining } from '@/app/dashboard/actions'
import { Spinner } from './icons'

const STAGES: { key: TrainingProgress['stage']; label: string }[] = [
  { key: 'loading', label: 'Read data' },
  { key: 'preprocessing', label: 'Prepare' },
  { key: 'training', label: 'Train' },
  { key: 'evaluating', label: 'Evaluate' },
  { key: 'saving', label: 'Save' },
]

export function ProgressBar({ progress, compact = false }: { progress: TrainingProgress | null; compact?: boolean }) {
  const percent = Math.min(Math.max(progress?.percent ?? 2, 2), 100)
  return (
    <div className={compact ? '' : 'w-full'}>
      <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-amber-400 transition-[width] duration-700" style={{ width: `${percent}%` }} />
      </div>
    </div>
  )
}

export function CancelButton({ id, className = 'btn btn-ghost btn-sm' }: { id: string; className?: string }) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  return (
    <>
      <button
        type="button"
        className={className}
        disabled={pending}
        onClick={() => start(async () => {
          const result = await cancelTraining(id)
          if (result.error) setError(result.error)
        })}
      >
        {pending && <Spinner size={12} />} Cancel
      </button>
      {error && <span className="text-xs text-red-300">{error}</span>}
    </>
  )
}

export default function TrainingStatus({ id, status, progress, workerOnline, attempts }: {
  id: string
  status: JobStatus
  progress: TrainingProgress | null
  workerOnline: boolean
  attempts: number
}) {
  const current = STAGES.findIndex((s) => s.key === progress?.stage)
  return (
    <div className="card px-6 py-10 sm:px-10">
      <div className="mx-auto max-w-lg text-center">
        <Spinner size={22} className="text-amber-300" />
        <h2 className="mt-5 text-lg font-semibold text-zinc-100">
          {status === 'processing' ? 'Training in progress' : 'Queued for training'}
        </h2>
        <p className="mt-2 text-sm text-zinc-400">
          {status === 'processing'
            ? progress?.message ?? 'Starting…'
            : workerOnline
              ? attempts > 0 ? 'Retrying shortly after an error.' : 'Starting shortly.'
              : 'The backend is offline. Training starts as soon as you run docker compose up -d.'}
        </p>
        {status === 'processing' && (
          <div className="mt-6">
            <ProgressBar progress={progress} />
            <ol className="mt-3 grid grid-cols-5 gap-1 text-[11px]">
              {STAGES.map((s, i) => (
                <li key={s.key} className={i < current ? 'text-zinc-400' : i === current ? 'font-medium text-amber-300' : 'text-zinc-600'}>
                  {s.label}
                </li>
              ))}
            </ol>
          </div>
        )}
        <div className="mt-6 flex justify-center">
          <CancelButton id={id} className="btn btn-secondary btn-sm" />
        </div>
      </div>
    </div>
  )
}
