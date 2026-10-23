'use client'

import { useState, useTransition } from 'react'
import { modelDownloadUrl, renameModel, setModelVisibility } from '@/app/dashboard/actions'
import { displayName } from '@/lib/models'
import DeleteModelButton from './DeleteModelButton'
import { CheckIcon, Spinner } from './icons'

export default function ModelSettings({ id, name, isPublic, canDownload }: {
  id: string
  name: string
  isPublic: boolean
  canDownload: boolean
}) {
  const [value, setValue] = useState(displayName(name))
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [visibilityPending, startVisibility] = useTransition()
  const [downloading, startDownload] = useTransition()

  const save = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await renameModel(id, value)
      if (result.error !== undefined) setError(result.error)
      else {
        setSaved(true)
        setTimeout(() => setSaved(false), 1500)
      }
    })
  }

  const toggleVisibility = () => {
    setError(null)
    startVisibility(async () => {
      const result = await setModelVisibility(id, !isPublic)
      if (result.error) setError(result.error)
    })
  }

  const download = () => {
    setError(null)
    startDownload(async () => {
      const result = await modelDownloadUrl(id)
      if (result.error !== undefined) setError(result.error)
      else window.location.href = result.url
    })
  }

  return (
    <section className="card divide-y divide-zinc-800">
      <div className="p-5 sm:p-6">
        <h2 className="text-base font-semibold text-zinc-100">Settings</h2>
        <form onSubmit={save} className="mt-4 flex flex-col gap-2 sm:flex-row">
          <label htmlFor="model-name" className="sr-only">Model name</label>
          <input id="model-name" className="input" value={value} maxLength={120}
            onChange={(e) => setValue(e.target.value)} />
          <button type="submit" disabled={pending || !value.trim() || value.trim() === displayName(name)} className="btn btn-secondary">
            {pending ? <Spinner size={14} /> : saved ? <CheckIcon className="text-emerald-400" /> : null}
            {saved ? 'Saved' : 'Rename'}
          </button>
        </form>
      </div>

      <div className="flex items-center justify-between gap-4 p-5 sm:p-6">
        <div>
          <p className="text-sm font-medium text-zinc-200">{isPublic ? 'Public' : 'Private'}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">
            {isPublic
              ? 'Anyone with the link can use the predictor page and the API.'
              : 'Only you: the share link is off and API calls need one of your API keys.'}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={isPublic}
          aria-label="Public model"
          onClick={toggleVisibility}
          disabled={visibilityPending}
          className={`relative h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors disabled:opacity-50 ${isPublic ? 'bg-emerald-500' : 'bg-zinc-700'}`}
        >
          <span className={`absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform ${isPublic ? 'translate-x-5' : ''}`} />
        </button>
      </div>

      <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div>
          <p className="text-sm font-medium text-zinc-200">Export or delete</p>
          <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">
            The .joblib file loads with <code className="kbd">joblib.load</code> next to model.py and preprocessing.py from the repo.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          {canDownload && (
            <button type="button" onClick={download} disabled={downloading} className="btn btn-secondary btn-sm">
              {downloading && <Spinner size={14} />} Download
            </button>
          )}
          <DeleteModelButton id={id} redirectTo="/dashboard" />
        </div>
      </div>
      {error && <p className="px-5 pb-5 text-sm text-red-300 sm:px-6" role="alert">{error}</p>}
    </section>
  )
}
