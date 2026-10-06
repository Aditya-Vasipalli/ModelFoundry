import Image from 'next/image'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getUser } from '@/utils/supabase/server'
import { Logo } from '@/components/ui'
import { LogOutIcon } from '@/components/icons'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser()
  if (!user) redirect('/login')

  const avatar: string | undefined = user.user_metadata?.avatar_url
  const initial = (user.user_metadata?.full_name ?? user.email ?? '?').charAt(0).toUpperCase()

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-40 border-b border-zinc-900 bg-[#050506]/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-6">
            <Logo href="/dashboard" />
            <nav className="hidden items-center gap-1 text-sm sm:flex">
              <Link href="/dashboard" className="rounded-md px-2.5 py-1.5 text-zinc-400 transition-colors hover:text-zinc-100">
                Models
              </Link>
              <Link href="/dashboard/upload" className="rounded-md px-2.5 py-1.5 text-zinc-400 transition-colors hover:text-zinc-100">
                New model
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-3">
            <span className="hidden max-w-56 truncate text-sm text-zinc-500 md:inline">{user.email}</span>
            {avatar ? (
              <Image src={avatar} alt="" width={28} height={28} className="size-7 rounded-full border border-zinc-800" />
            ) : (
              <span className="flex size-7 items-center justify-center rounded-full border border-zinc-700 bg-zinc-800 text-xs font-medium text-zinc-200">
                {initial}
              </span>
            )}
            <form action="/auth/signout" method="post">
              <button type="submit" className="btn btn-ghost btn-sm" title="Sign out">
                <LogOutIcon size={15} />
                <span className="hidden sm:inline">Sign out</span>
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">{children}</main>
    </div>
  )
}
