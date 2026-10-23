import { BackendOfflineError, fetchModelInfo } from '@/lib/backend'
import { CORS_HEADERS, forwardedHeaders, rateLimited } from '@/lib/proxy-request'

// GET https://<your-site>/api/v1/models/<id> — model details, metrics and the input schema

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const limited = rateLimited(request)
  if (limited) return limited
  const { id } = await params
  try {
    const model = await fetchModelInfo(id, await forwardedHeaders(request))
    if (!model) return Response.json({ detail: 'Model not found or not ready yet' }, { status: 404, headers: CORS_HEADERS })
    return Response.json(model, { headers: CORS_HEADERS })
  } catch (e) {
    if (e instanceof BackendOfflineError) return Response.json({ detail: e.message }, { status: 503, headers: CORS_HEADERS })
    throw e
  }
}
