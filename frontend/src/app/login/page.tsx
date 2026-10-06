'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { Logo } from '@/components/ui'
import { ArrowLeftIcon, Spinner } from '@/components/icons'

const ERRORS: Record<string, string> = {
  auth_callback_failed: 'Sign-in didn’t complete. Please try again.',
}

function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  )
}

function LoginCard() {
  const params = useSearchParams()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(ERRORS[params.get('error') ?? ''] ?? null)

  const handleGoogleLogin = async () => {
    setLoading(true)
    setError(null)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
    if (error) {
      setError(error.message)
      setLoading(false)
    }
  }

  return (
    <div className="card w-full max-w-sm p-6 shadow-2xl shadow-black/50 sm:p-8">
      <h1 className="text-xl font-semibold tracking-tight text-zinc-50">Sign in</h1>
      <p className="mt-1.5 text-sm text-zinc-400">Train models and get prediction APIs in minutes.</p>

      {error && (
        <div className="mt-5 rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-sm text-red-300" role="alert">
          {error}
        </div>
      )}

      <button onClick={handleGoogleLogin} disabled={loading} className="btn btn-primary btn-lg mt-6 w-full">
        {loading ? <Spinner /> : <GoogleLogo />}
        {loading ? 'Redirecting…' : 'Continue with Google'}
      </button>

      <p className="mt-6 text-center text-xs leading-relaxed text-zinc-600">
        Datasets are deleted right after training. Only you can see your models unless you share their link.
      </p>
    </div>
  )
}

export default function LoginPage() {
  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden">
      <div className="bg-grid pointer-events-none absolute inset-0" />
      <div className="bg-spotlight pointer-events-none absolute inset-0" />

      <header className="relative z-10 mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
        <Logo />
        <Link href="/" className="btn btn-ghost btn-sm">
          <ArrowLeftIcon size={14} /> Home
        </Link>
      </header>

      <main className="relative z-10 flex flex-1 items-center justify-center px-4 pb-16">
        <Suspense>
          <LoginCard />
        </Suspense>
      </main>
    </div>
  )
}
