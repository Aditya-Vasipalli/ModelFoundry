import { CORS_HEADERS, forwardToBackend } from '@/lib/proxy-request'

// Public, stable prediction endpoint: https://<your-site>/api/v1/models/<id>/predict
// Forwards to whatever URL the backend's tunnel currently has.

export const maxDuration = 60

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return forwardToBackend(request, (await params).id, 'predict')
}
