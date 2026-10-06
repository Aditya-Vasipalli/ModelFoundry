import type { Metadata } from 'next'
import Link from 'next/link'
import UploadForm from '@/components/UploadForm'
import { ArrowLeftIcon } from '@/components/icons'

export const metadata: Metadata = { title: 'New model' }

export default function UploadPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/dashboard" className="mb-6 inline-flex items-center gap-1.5 text-sm text-zinc-500 transition-colors hover:text-zinc-200">
        <ArrowLeftIcon size={14} /> All models
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-50 sm:text-3xl">Train a new model</h1>
      <p className="mt-2 mb-8 text-sm text-zinc-400">
        Cleaning, encoding, scaling and feature selection happen automatically — you just pick what to predict.
      </p>
      <UploadForm />
    </div>
  )
}
