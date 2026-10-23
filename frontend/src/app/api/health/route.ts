import { createClient } from '@supabase/supabase-js'
import { getBackendStatus } from '@/lib/backend'

// GET /api/health — liveness of the site and its dependencies. A scheduled
// GitHub Action calls this daily, which also keeps the free Supabase project
// from being paused for inactivity.

export const dynamic = 'force-dynamic'

export async function GET() {
  const started = Date.now()
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
  const [db, backend] = await Promise.all([
    supabase.from('training_jobs').select('id', { head: true, count: 'exact' }).limit(1)
      .then(({ error }) => !error, () => false),
    getBackendStatus(true),
  ])
  const body = {
    status: db ? 'ok' : 'degraded',
    database: db ? 'up' : 'down',
    api: backend.apiOnline ? 'up' : 'down',
    worker: backend.workerOnline ? 'up' : 'down',
    latency_ms: Date.now() - started,
  }
  return Response.json(body, { status: db ? 200 : 503, headers: { 'Cache-Control': 'no-store' } })
}
