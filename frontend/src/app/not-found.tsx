import Link from 'next/link'
import { Logo } from '@/components/ui'

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 text-center">
      <Logo />
      <p className="mt-12 font-mono text-sm text-zinc-500">404</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-50">Nothing here</h1>
      <p className="mt-2 max-w-sm text-sm text-zinc-400">
        This page doesn&apos;t exist, or the model is private or was deleted by its owner.
      </p>
      <Link href="/" className="btn btn-secondary mt-8">Back home</Link>
    </div>
  )
}
