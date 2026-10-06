'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

/** Re-renders the current server page periodically (e.g. while models are training). */
export default function AutoRefresh({ intervalMs }: { intervalMs: number }) {
  const router = useRouter()

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh()
    }, intervalMs)
    return () => clearInterval(id)
  }, [router, intervalMs])

  return null
}
