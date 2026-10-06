'use client'

import Link from 'next/link'
import { AlertIcon } from '@/components/icons'

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-[70dvh] flex-col items-center justify-center px-4 text-center">
      <span className="flex size-12 items-center justify-center rounded-xl border border-red-500/20 bg-red-500/10 text-red-300">
        <AlertIcon size={20} />
      </span>
      <h1 className="mt-6 text-xl font-semibold tracking-tight text-zinc-50">Something went wrong</h1>
      <p className="mt-2 max-w-sm text-sm text-zinc-400">
        {error.digest ? `Error reference: ${error.digest}` : 'An unexpected error occurred while loading this page.'}
      </p>
      <div className="mt-8 flex gap-3">
        <button onClick={reset} className="btn btn-primary">Try again</button>
        <Link href="/" className="btn btn-secondary">Home</Link>
      </div>
    </div>
  )
}
