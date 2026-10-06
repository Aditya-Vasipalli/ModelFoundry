'use client'

import { useState } from 'react'
import { CheckIcon, CopyIcon } from './icons'

export default function CopyButton({
  value,
  label = 'Copy',
  copiedLabel = 'Copied',
  className = 'btn btn-secondary btn-sm',
  absolute = false,
}: {
  value: string
  label?: string
  copiedLabel?: string
  className?: string
  /** Resolve `value` against the current origin (for root-relative paths) */
  absolute?: boolean
}) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    const text = absolute ? new URL(value, window.location.origin).toString() : value
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // Clipboard API unavailable (http, old browsers) — fall back to a hidden textarea
      const el = document.createElement('textarea')
      el.value = text
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      el.remove()
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  return (
    <button type="button" onClick={copy} className={className} aria-live="polite">
      {copied ? <CheckIcon className="text-emerald-400" /> : <CopyIcon />}
      {label && <span>{copied ? copiedLabel : label}</span>}
    </button>
  )
}
