import Link from 'next/link'
import type { JobStatus, Metrics, ModelType } from '@/types'
import { CubeIcon } from './icons'
import { metricItems } from '@/lib/models'

export function Logo({ href = '/', compact = false }: { href?: string; compact?: boolean }) {
  return (
    <Link href={href} className="group flex items-center gap-2.5 rounded-md" aria-label="ModelFoundry home">
      <span className="flex size-7 items-center justify-center rounded-lg bg-gradient-to-b from-zinc-100 to-zinc-400 text-zinc-950 shadow-[0_0_20px_-4px_rgba(255,255,255,0.35)]">
        <CubeIcon size={16} strokeWidth={2} />
      </span>
      <span className={`text-[15px] font-semibold tracking-tight text-zinc-100 ${compact ? 'hidden sm:inline' : ''}`}>
        ModelFoundry
      </span>
    </Link>
  )
}

const STATUS_STYLES: Record<JobStatus, { label: string; className: string; dot: string }> = {
  pending: { label: 'Queued', className: 'border-zinc-700 bg-zinc-800/50 text-zinc-300', dot: 'bg-zinc-400' },
  processing: { label: 'Training', className: 'border-amber-500/25 bg-amber-500/10 text-amber-300', dot: 'bg-amber-400 animate-pulse' },
  ready: { label: 'Ready', className: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300', dot: 'bg-emerald-400' },
  failed: { label: 'Failed', className: 'border-red-500/25 bg-red-500/10 text-red-300', dot: 'bg-red-400' },
}

export function StatusBadge({ status, label }: { status: JobStatus; label?: string }) {
  const s = STATUS_STYLES[status]
  return (
    <span className={`inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium ${s.className}`}>
      <span className={`size-1.5 rounded-full ${s.dot}`} />
      {label ?? s.label}
    </span>
  )
}

export function BackendPill({ online, label }: { online: boolean; label?: string }) {
  return (
    <span
      className={`inline-flex h-7 items-center gap-2 rounded-full border px-3 text-xs font-medium ${
        online ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-300' : 'border-zinc-800 bg-zinc-900 text-zinc-400'
      }`}
      title={online ? 'The training worker and prediction API are running' : 'Start the backend with: docker compose up -d'}
    >
      <span className="relative flex size-2">
        {online && <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />}
        <span className={`relative inline-flex size-2 rounded-full ${online ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
      </span>
      {label ?? (online ? 'Backend online' : 'Backend offline')}
    </span>
  )
}

export function MetricGrid({ type, metrics }: { type: ModelType; metrics: Metrics | null }) {
  const items = metricItems(type, metrics)
  if (!items.length) return null
  const columns = ['', '', '', 'sm:grid-cols-3', 'sm:grid-cols-4'][items.length] ?? ''
  return (
    // On phones an odd last tile spans both columns so no empty cell shows
    <dl className={`grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-zinc-800/80 bg-zinc-800/80 ${columns} [&>*:last-child:nth-child(odd)]:col-span-2 sm:[&>*:last-child:nth-child(odd)]:col-span-1`}>
      {items.map((item) => (
        <div key={item.key} className="bg-zinc-950 p-4 sm:p-5" title={item.hint}>
          <dt className="text-xs font-medium text-zinc-500">{item.label}</dt>
          <dd className={`mt-1.5 font-mono text-2xl font-semibold tracking-tight tabular-nums ${item.tone === 'good' ? 'text-emerald-300' : 'text-zinc-100'}`}>
            {item.value}
          </dd>
          <p className="mt-1 hidden text-xs leading-snug text-zinc-600 sm:block">{item.hint}</p>
        </div>
      ))}
    </dl>
  )
}

export function Notice({
  tone = 'neutral',
  title,
  children,
  icon,
}: {
  tone?: 'neutral' | 'warning' | 'error'
  title?: string
  children: React.ReactNode
  icon?: React.ReactNode
}) {
  const tones = {
    neutral: 'border-zinc-800 bg-zinc-900/50 text-zinc-300',
    warning: 'border-amber-500/20 bg-amber-500/5 text-amber-200',
    error: 'border-red-500/20 bg-red-500/5 text-red-300',
  }
  return (
    <div className={`flex gap-3 rounded-xl border p-4 text-sm ${tones[tone]}`} role={tone === 'error' ? 'alert' : undefined}>
      {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
      <div className="min-w-0 leading-relaxed">
        {title && <p className="font-medium">{title}</p>}
        <div className={title ? 'mt-0.5 opacity-80' : ''}>{children}</div>
      </div>
    </div>
  )
}
