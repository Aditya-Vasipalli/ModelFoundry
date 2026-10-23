import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient, getUser } from '@/utils/supabase/server'
import type { ApiKey } from '@/types'
import ApiKeys from '@/components/ApiKeys'
import { ArrowLeftIcon, BookIcon } from '@/components/icons'

export const metadata: Metadata = { title: 'Settings' }

export default async function SettingsPage() {
  const user = await getUser()
  const supabase = await createClient()
  const { data } = await supabase
    .from('api_keys')
    .select('id,name,prefix,created_at,last_used_at')
    .order('created_at', { ascending: false })

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-zinc-500 transition-colors hover:text-zinc-200">
        <ArrowLeftIcon size={14} /> All models
      </Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-50 sm:text-3xl">Settings</h1>
        <p className="mt-1 text-sm text-zinc-500">Signed in as {user?.email}</p>
      </div>

      <ApiKeys keys={(data ?? []) as ApiKey[]} />

      <section className="card flex items-center justify-between gap-4 p-5 sm:p-6">
        <div>
          <h2 className="text-sm font-semibold text-zinc-100">API documentation</h2>
          <p className="mt-1 text-sm text-zinc-400">Endpoints, authentication, limits and error codes.</p>
        </div>
        <Link href="/docs" className="btn btn-secondary btn-sm shrink-0"><BookIcon size={14} /> Open docs</Link>
      </section>

      <section className="card p-5 sm:p-6">
        <h2 className="text-sm font-semibold text-zinc-100">Limits</h2>
        <ul className="mt-3 grid gap-2 text-sm text-zinc-400 sm:grid-cols-2">
          <li>Up to 50 models per account</li>
          <li>Up to 3 models training at once</li>
          <li>Datasets up to 50 MB / 1M rows</li>
          <li>Training stops after 15 minutes</li>
          <li>60 requests/min without a key, 600 with one</li>
          <li>Batch requests: up to 1,000 rows</li>
        </ul>
      </section>
    </div>
  )
}
