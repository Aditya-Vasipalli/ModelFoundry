export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading">
      <div className="flex items-end justify-between">
        <div className="space-y-2">
          <div className="h-8 w-32 animate-pulse rounded-lg bg-zinc-900" />
          <div className="h-4 w-24 animate-pulse rounded bg-zinc-900" />
        </div>
        <div className="h-10 w-32 animate-pulse rounded-lg bg-zinc-900" />
      </div>
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="card flex items-center gap-3.5 p-5" style={{ opacity: 1 - i * 0.25 }}>
            <div className="size-10 shrink-0 animate-pulse rounded-lg bg-zinc-800/60" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-48 max-w-full animate-pulse rounded bg-zinc-800/60" />
              <div className="h-3 w-72 max-w-full animate-pulse rounded bg-zinc-800/40" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
