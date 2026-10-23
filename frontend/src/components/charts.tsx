'use client'

import { useMemo, useRef, useState } from 'react'
import type { UsageDay } from '@/types'

// One hue for magnitude on the dark surface (validated: contrast >= 3:1 on #111113)
const SERIES = '#3987e5'
const SURFACE = '#0b0b0d'

// ---------------------------------------------------------------------------
// Tooltip shared by every chart: positioned at the pointer, clamped to the box
// ---------------------------------------------------------------------------
function useTooltip() {
  const box = useRef<HTMLDivElement>(null)
  const [tip, setTip] = useState<{ x: number; y: number; width: number; content: React.ReactNode } | null>(null)
  const show = (e: React.PointerEvent | React.FocusEvent, content: React.ReactNode) => {
    const rect = box.current?.getBoundingClientRect()
    if (!rect) return
    const target = (e.target as Element).getBoundingClientRect()
    const x = 'clientX' in e ? e.clientX : target.left + target.width / 2
    const y = 'clientY' in e ? e.clientY : target.top
    setTip({ x: x - rect.left, y: y - rect.top, width: rect.width, content })
  }
  const hide = () => setTip(null)
  const overlay = tip && (
    <div
      role="tooltip"
      className="pointer-events-none absolute z-20 max-w-64 -translate-x-1/2 -translate-y-[calc(100%+10px)] rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-xs leading-relaxed text-zinc-200 shadow-xl"
      style={{ left: Math.min(Math.max(tip.x, 70), tip.width - 70), top: tip.y }}
    >
      {tip.content}
    </div>
  )
  return { box, show, hide, overlay }
}

const pct = (v: number) => `${(v * 100).toFixed(1)}%`

// ---------------------------------------------------------------------------
// Feature importance: ranked horizontal bars
// ---------------------------------------------------------------------------
export function FeatureImportanceChart({ items }: { items: { feature: string; importance: number }[] }) {
  const { box, show, hide, overlay } = useTooltip()
  const max = Math.max(...items.map((i) => i.importance), 0.0001)
  return (
    <div ref={box} className="relative">
      <ul className="space-y-1.5">
        {items.map((item) => (
          <li
            key={item.feature}
            tabIndex={0}
            className="grid grid-cols-[minmax(0,9rem)_1fr_3.5rem] items-center gap-3 rounded-md px-1 py-1 outline-none hover:bg-zinc-800/40 focus-visible:bg-zinc-800/60 sm:grid-cols-[minmax(0,12rem)_1fr_3.5rem]"
            onPointerMove={(e) => show(e, <><span className="font-medium text-zinc-100">{item.feature}</span>: {pct(item.importance)} of the model’s total importance</>)}
            onPointerLeave={hide}
            onFocus={(e) => show(e, <><span className="font-medium text-zinc-100">{item.feature}</span>: {pct(item.importance)}</>)}
            onBlur={hide}
          >
            <span className="truncate text-sm text-zinc-300" title={item.feature}>{item.feature}</span>
            <span className="h-2.5 rounded-r bg-zinc-800/60">
              <span
                className="block h-full rounded-r"
                style={{ width: `${Math.max((item.importance / max) * 100, 1.5)}%`, background: SERIES }}
              />
            </span>
            <span className="text-right font-mono text-xs text-zinc-400 tabular-nums">{pct(item.importance)}</span>
          </li>
        ))}
      </ul>
      {overlay}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Confusion matrix: rows = actual class, columns = predicted class
// ---------------------------------------------------------------------------
export function ConfusionMatrix({ labels, matrix }: { labels: (string | number)[]; matrix: number[][] }) {
  const { box, show, hide, overlay } = useTooltip()
  const n = labels.length
  return (
    <div ref={box} className="relative">
      <div className="overflow-x-auto pb-1">
        <div className="inline-block min-w-full">
          <p className="mb-2 pl-24 text-center text-xs font-medium text-zinc-500">Predicted →</p>
          <div className="grid gap-[2px]" style={{ gridTemplateColumns: `5.5rem repeat(${n}, minmax(2.75rem, 1fr))` }}>
            <span />
            {labels.map((l) => (
              <span key={`h-${l}`} className="truncate px-1 pb-1 text-center text-xs text-zinc-400" title={String(l)}>{String(l)}</span>
            ))}
            {matrix.map((row, i) => {
              const rowTotal = row.reduce((a, b) => a + b, 0) || 1
              return [
                <span key={`r-${i}`} className="flex items-center justify-end truncate pr-2 text-xs text-zinc-400" title={String(labels[i])}>
                  {String(labels[i])}
                </span>,
                ...row.map((value, j) => {
                  const share = value / rowTotal
                  const alpha = value === 0 ? 0.04 : 0.12 + 0.8 * share
                  return (
                    <span
                      key={`${i}-${j}`}
                      tabIndex={0}
                      className={`flex h-11 items-center justify-center rounded font-mono text-xs tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 ${alpha > 0.5 ? 'text-white' : 'text-zinc-300'} ${i === j ? 'font-semibold' : ''}`}
                      style={{ background: `rgba(57, 135, 229, ${alpha})` }}
                      onPointerMove={(e) => show(e, <>Actual <b className="text-zinc-100">{String(labels[i])}</b>, predicted <b className="text-zinc-100">{String(labels[j])}</b>: {value} rows ({pct(share)} of actual {String(labels[i])})</>)}
                      onPointerLeave={hide}
                      onFocus={(e) => show(e, <>Actual {String(labels[i])}, predicted {String(labels[j])}: {value}</>)}
                      onBlur={hide}
                    >
                      {value}
                    </span>
                  )
                }),
              ]
            })}
          </div>
          <p className="mt-2 text-xs text-zinc-500">↑ Actual · the diagonal shows correct predictions</p>
        </div>
      </div>
      {overlay}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Predicted vs actual (regression)
// ---------------------------------------------------------------------------
function niceBounds(values: number[]) {
  const min = Math.min(...values)
  const max = Math.max(...values)
  const pad = (max - min) * 0.05 || Math.abs(max) * 0.05 || 1
  return [min - pad, max + pad] as const
}

const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 })

export function PredictionScatter({ points, target }: { points: [number, number][]; target: string }) {
  const { box, show, hide, overlay } = useTooltip()
  const W = 560, H = 340, L = 56, R = 16, T = 16, B = 40
  const [lo, hi] = useMemo(() => niceBounds(points.flat()), [points])
  const sx = (v: number) => L + ((v - lo) / (hi - lo)) * (W - L - R)
  const sy = (v: number) => H - B - ((v - lo) / (hi - lo)) * (H - T - B)
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => lo + f * (hi - lo))

  return (
    <div ref={box} className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Predicted versus actual ${target} on ${points.length} test rows`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={sy(t)} y2={sy(t)} stroke="#27272a" strokeWidth={1} />
            <text x={L - 8} y={sy(t) + 4} textAnchor="end" className="fill-zinc-500 text-[11px]">{compact.format(t)}</text>
            <text x={sx(t)} y={H - B + 18} textAnchor="middle" className="fill-zinc-500 text-[11px]">{compact.format(t)}</text>
          </g>
        ))}
        <line x1={L} x2={W - R} y1={H - B} y2={H - B} stroke="#3f3f46" strokeWidth={1} />
        {/* Perfect predictions fall on this line */}
        <line x1={sx(lo)} y1={sy(lo)} x2={sx(hi)} y2={sy(hi)} stroke="#71717a" strokeWidth={1.5} strokeDasharray="5 5" />
        {points.map(([actual, predicted], i) => (
          <circle
            key={i}
            cx={sx(actual)}
            cy={sy(predicted)}
            r={4}
            fill={SERIES}
            fillOpacity={0.75}
            stroke={SURFACE}
            strokeWidth={1}
            onPointerMove={(e) => show(e, <>Actual <b className="text-zinc-100">{compact.format(actual)}</b> · predicted <b className="text-zinc-100">{compact.format(predicted)}</b></>)}
            onPointerLeave={hide}
          />
        ))}
        <text x={(L + W - R) / 2} y={H - 4} textAnchor="middle" className="fill-zinc-400 text-[12px]">Actual {target}</text>
        <text x={14} y={(T + H - B) / 2} textAnchor="middle" transform={`rotate(-90 14 ${(T + H - B) / 2})`} className="fill-zinc-400 text-[12px]">Predicted</text>
      </svg>
      <p className="mt-1 text-xs text-zinc-500">Each dot is a test row. Dots on the dashed line were predicted exactly.</p>
      {overlay}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Predictions per day
// ---------------------------------------------------------------------------
const dayFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

export function UsageBars({ days, range = 14 }: { days: UsageDay[]; range?: number }) {
  const { box, show, hide, overlay } = useTooltip()
  const series = useMemo(() => {
    const byDay = new Map(days.map((d) => [d.day.slice(0, 10), d]))
    const today = new Date()
    return Array.from({ length: range }, (_, i) => {
      const date = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - (range - 1 - i)))
      const key = date.toISOString().slice(0, 10)
      return { date, ...(byDay.get(key) ?? { day: key, predictions: 0, requests: 0, errors: 0, avg_latency_ms: null }) }
    })
  }, [days, range])
  const max = Math.max(...series.map((d) => d.predictions), 1)

  return (
    <div ref={box} className="relative">
      <div className="flex h-28 items-end gap-[2px] border-b border-zinc-700">
        {series.map((d) => (
          <div
            key={d.day}
            tabIndex={0}
            className="group flex h-full flex-1 items-end outline-none"
            onPointerMove={(e) => show(e, (
              <>
                <b className="text-zinc-100">{dayFormat.format(d.date)}</b>: {d.predictions.toLocaleString('en-US')} prediction{d.predictions === 1 ? '' : 's'}
                {d.errors > 0 && <>, {d.errors} failed request{d.errors === 1 ? '' : 's'}</>}
                {d.avg_latency_ms != null && <><br />avg {d.avg_latency_ms} ms per request</>}
              </>
            ))}
            onPointerLeave={hide}
            onFocus={(e) => show(e, <>{dayFormat.format(d.date)}: {d.predictions} predictions</>)}
            onBlur={hide}
          >
            <div
              className="w-full rounded-t transition-[height] group-hover:opacity-80 group-focus-visible:opacity-80"
              style={{ height: d.predictions ? `${Math.max((d.predictions / max) * 100, 3)}%` : 0, background: SERIES }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-zinc-500">
        <span>{dayFormat.format(series[0].date)}</span>
        <span>Today</span>
      </div>
      {overlay}
    </div>
  )
}
