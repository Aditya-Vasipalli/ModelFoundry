import { CORS_HEADERS, forwardToBackend } from '@/lib/proxy-request'

// POST https://<your-site>/api/v1/models/<id>/predict/batch  {"rows": [{...}, ...]}  (max 1,000 rows)

export const maxDuration = 60

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return forwardToBackend(request, (await params).id, 'predict/batch')
}
