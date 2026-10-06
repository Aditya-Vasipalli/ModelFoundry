import { BackendOfflineError, backendFetch } from '@/lib/backend'

// Public, stable prediction endpoint: https://<your-site>/api/v1/models/<id>/predict
// Forwards to whatever URL the backend's tunnel currently has.

export const maxDuration = 60

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS })
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ detail: 'Request body must be JSON: {"features": {...}}' }, { status: 400, headers: CORS })
  }

  try {
    const res = await backendFetch(`/api/v1/models/${encodeURIComponent(id)}/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return new Response(await res.text(), {
      status: res.status,
      headers: { 'Content-Type': res.headers.get('Content-Type') ?? 'application/json', ...CORS },
    })
  } catch (e) {
    if (e instanceof BackendOfflineError) {
      return Response.json({ detail: e.message }, { status: 503, headers: CORS })
    }
    throw e
  }
}
