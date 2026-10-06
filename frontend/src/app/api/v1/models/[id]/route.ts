import { BackendOfflineError, getPublicModel } from '@/lib/backend'

// GET https://<your-site>/api/v1/models/<id> — model details and the input schema

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const headers = { 'Access-Control-Allow-Origin': '*' }
  try {
    const model = await getPublicModel(id)
    if (!model) return Response.json({ detail: 'Model not found or not ready yet' }, { status: 404, headers })
    return Response.json(model, { headers })
  } catch (e) {
    if (e instanceof BackendOfflineError) return Response.json({ detail: e.message }, { status: 503, headers })
    throw e
  }
}
