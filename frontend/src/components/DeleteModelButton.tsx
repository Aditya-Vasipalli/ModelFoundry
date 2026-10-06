'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { deleteModel } from '@/app/dashboard/actions'
import { Spinner, TrashIcon } from './icons'

export default function DeleteModelButton({
  id,
  redirectTo,
  className = '',
}: {
  id: string
  redirectTo?: string
  className?: string
}) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  // Drop back to the idle state if the user doesn't confirm
  useEffect(() => {
    if (!confirming) return
    const t = setTimeout(() => setConfirming(false), 4000)
    return () => clearTimeout(t)
  }, [confirming])

  const onClick = () => {
    if (!confirming) {
      setConfirming(true)
      setError(null)
      return
    }
    startTransition(async () => {
      const result = await deleteModel(id)
      if (result.error) {
        setError(result.error)
        setConfirming(false)
      } else if (redirectTo) {
        router.push(redirectTo)
      }
    })
  }

  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className={`btn btn-sm w-full ${confirming ? 'btn-danger' : 'btn-ghost hover:text-red-400'}`}
        aria-label={confirming ? 'Confirm delete' : 'Delete model'}
      >
        {pending ? <Spinner size={14} /> : <TrashIcon size={14} />}
        <span>{pending ? 'Deleting…' : confirming ? 'Confirm delete' : 'Delete'}</span>
      </button>
      {error && (
        <p className="absolute top-full right-0 z-10 mt-1 w-64 rounded-lg border border-red-500/20 bg-zinc-950 p-2 text-xs text-red-300 shadow-xl">
          {error}
        </p>
      )}
    </div>
  )
}
