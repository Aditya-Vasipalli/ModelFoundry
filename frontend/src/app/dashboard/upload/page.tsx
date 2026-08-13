import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import UploadForm from '@/components/UploadForm'

export default async function UploadPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div className="min-h-screen grid-bg">
      <nav className="flex items-center justify-between px-8 py-4 border-b sticky top-0 z-50"
        style={{ borderColor: 'var(--border)', background: 'rgba(8,11,20,0.85)', backdropFilter: 'blur(20px)' }}>
        <Link href="/" className="text-lg font-bold gradient-text">⚗️ ModelFoundry</Link>
        <Link href="/dashboard" className="btn-ghost" style={{ padding: '8px 16px', fontSize: '13px' }}>
          ← Back to Dashboard
        </Link>
      </nav>
      <div className="flex items-center justify-center min-h-[calc(100vh-64px)] px-6 py-10">
        <UploadForm />
      </div>
    </div>
  )
}
