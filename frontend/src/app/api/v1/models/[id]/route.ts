import { CORS_HEADERS, forwardToBackend } from '@/lib/proxy-request'

// GET https://<your-site>/api/v1/models/<id> — model details, metrics and the input schema

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return forwardToBackend(request, id, 'info')
}
