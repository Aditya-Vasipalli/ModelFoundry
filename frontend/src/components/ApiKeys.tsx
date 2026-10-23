'use client'

import { useState, useTransition } from 'react'
import type { ApiKey } from '@/types'
import { createApiKey, revokeApiKey } from '@/app/dashboard/actions'
import { formatRelative } from '@/lib/models'
import CopyButton from './CopyButton'
import { AlertIcon, KeyIcon, PlusIcon, Spinner } from './icons'

function RevokeButton({ id }: { id: string }) {
  const [confirming, setConfirming] = useState(false)
  const [pending, start] = useTransition()
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!confirming) {
          setConfirming(true)
          setTimeout(() => setConfirming(false), 4000)
          return
        }
        start(async () => { await revokeApiKey(id) })
      }}
      className={`btn btn-sm ${confirming ? 'btn-danger' : 'btn-ghost hover:text-red-400'}`}
    >
      {pending && <Spinner size={12} />}
      {confirming ? 'Confirm revoke' : 'Revoke'}
    </button>
  )
}

export default function ApiKeys({ keys }: { keys: ApiKey[] }) {
  const [name, setName] = useState('')
  const [created, setCreated] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const create = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    start(async () => {
      const result = await createApiKey(name)
      if (result.error !== undefined) setError(result.error)
      else {
        setCreated(result.key)
        setName('')
      }
    })
  }

  return (
    <section className="card">
      <div className="p-5 sm:p-6">
        <h2 className="flex items-center gap-2 text-base font-semibold text-zinc-100">
          <KeyIcon size={16} className="text-zinc-400" /> API keys
        </h2>
        <p className="mt-1 text-sm text-zinc-400">
          Keys let your apps call your <span className="text-zinc-200">private</span> models. Send one in the{' '}
          <code className="kbd">X-API-Key</code> header. Public models don’t need a key.
        </p>

        <form onSubmit={create} className="mt-5 flex flex-col gap-2 sm:flex-row">
          <label htmlFor="key-name" className="sr-only">Key name</label>
          <input id="key-name" className="input" placeholder="Name, e.g. “mobile app”" value={name} maxLength={60}
            onChange={(e) => setName(e.target.value)} />
          <button type="submit" disabled={pending} className="btn btn-primary">
            {pending ? <Spinner size={14} /> : <PlusIcon />} Create key
          </button>
        </form>
        {error && <p className="mt-3 flex items-center gap-2 text-sm text-red-300"><AlertIcon size={14} /> {error}</p>}

        {created && (
          <div className="mt-4 animate-fade-up rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-4">
            <p className="text-sm font-medium text-emerald-200">Copy your new key now — it won’t be shown again.</p>
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950 p-1.5 pl-3">
              <code className="min-w-0 flex-1 truncate font-mono text-xs text-zinc-200 sm:text-sm">{created}</code>
              <CopyButton value={created} className="btn btn-secondary btn-sm" />
            </div>
          </div>
        )}
      </div>

      {keys.length > 0 && (
        <ul className="divide-y divide-zinc-800 border-t border-zinc-800">
          {keys.map((key) => (
            <li key={key.id} className="flex items-center justify-between gap-4 px-5 py-3.5 sm:px-6">
              <div className="min-w-0">
                <p className="truncate text-sm text-zinc-200">{key.name}</p>
                <p className="mt-0.5 text-xs text-zinc-500">
                  <code className="font-mono">{key.prefix}…</code> · created {formatRelative(key.created_at)} ·{' '}
                  {key.last_used_at ? `last used ${formatRelative(key.last_used_at)}` : 'never used'}
                </p>
              </div>
              <RevokeButton id={key.id} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
