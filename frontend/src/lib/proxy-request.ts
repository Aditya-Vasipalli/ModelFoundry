/**
 * Helpers for the public /api/v1 routes, which forward requests to the ML backend.
 */
import { BackendOfflineError, backendFetch } from '@/lib/backend'
import { createClient } from '@/utils/supabase/server'

const WINDOW_MS = 60_000
const LIMIT_PER_WINDOW = 120
const hits = new Map<string, { count: number; reset: number }>()

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
  'Access-Control-Max-Age': '86400',
}

export function clientIp(request: Request) {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  )
}

/**
 * First line of defence against floods, per server instance. The backend
 * enforces the real per-caller limits.
 */
export function rateLimited(request: Request): Response | null {
  const key = clientIp(request)
  const now = Date.now()
  const entry = hits.get(key)
  if (!entry || entry.reset < now) {
    hits.set(key, { count: 1, reset: now + WINDOW_MS })
    if (hits.size > 10_000) {
      for (const [k, v] of hits) if (v.reset < now) hits.delete(k)
    }
    return null
  }
  entry.count += 1
  if (entry.count <= LIMIT_PER_WINDOW) return null
  const retryAfter = Math.ceil((entry.reset - now) / 1000)
  return Response.json(
    { detail: `Too many requests. Retry in ${retryAfter}s.` },
    { status: 429, headers: { ...CORS_HEADERS, 'Retry-After': String(retryAfter) } }
  )
}

/**
 * Headers to send to the backend: the caller's own credentials if they sent any
 * (API key), otherwise the signed-in user's session so owners can use their
 * private models from the web app.
 */
export async function forwardedHeaders(request: Request): Promise<Record<string, string>> {
  const headers: Record<string, string> = { 'X-Client-IP': clientIp(request) }
  const source = request.headers.get('x-modelfoundry-source')
  if (source === 'web' || source === 'share') headers['X-ModelFoundry-Source'] = source

  const apiKey = request.headers.get('x-api-key')
  const authorization = request.headers.get('authorization')
  if (apiKey) headers['X-API-Key'] = apiKey
  if (authorization) headers['Authorization'] = authorization
  if (apiKey || authorization) return headers

  const token = await sessionToken()
  if (token) headers['Authorization'] = `Bearer ${token}`
  return headers
}

/** The signed-in user's access token, if any (verified by the backend). */
export async function sessionToken(): Promise<string | null> {
  try {
    const supabase = await createClient()
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token ?? null
  } catch {
    return null
  }
}

/** Forwards a model request to the backend with rate limiting and credentials. */
export async function forwardToBackend(request: Request, id: string, endpoint: 'info' | 'predict' | 'predict/batch') {
  const limited = rateLimited(request)
  if (limited) return limited

  const init: RequestInit & { headers: Record<string, string> } = { method: 'GET', headers: await forwardedHeaders(request) }
  if (endpoint !== 'info') {
    const body = await request.text()
    if (body.length > 2 * 1024 * 1024) {
      return Response.json({ detail: 'Request body too large (max 2 MB)' }, { status: 413, headers: CORS_HEADERS })
    }
    try {
      JSON.parse(body)
    } catch {
      const shape = endpoint === 'predict' ? '{"features": {...}}' : '{"rows": [{...}, ...]}'
      return Response.json({ detail: `Request body must be JSON: ${shape}` }, { status: 400, headers: CORS_HEADERS })
    }
    init.method = 'POST'
    init.headers['Content-Type'] = 'application/json'
    init.body = body
  }

  try {
    const path = `/api/v1/models/${encodeURIComponent(id)}${endpoint === 'info' ? '' : `/${endpoint}`}`
    const res = await backendFetch(path, init)
    const headers: Record<string, string> = {
      'Content-Type': res.headers.get('Content-Type') ?? 'application/json',
      ...CORS_HEADERS,
    }
    const retryAfter = res.headers.get('Retry-After')
    if (retryAfter) headers['Retry-After'] = retryAfter
    return new Response(await res.text(), { status: res.status, headers })
  } catch (e) {
    if (e instanceof BackendOfflineError) {
      return Response.json({ detail: e.message }, { status: 503, headers: CORS_HEADERS })
    }
    throw e
  }
}
