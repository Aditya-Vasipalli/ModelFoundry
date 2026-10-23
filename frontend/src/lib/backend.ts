/**
 * Finds the ML backend at runtime — server-side only.
 *
 * The backend runs behind a Cloudflare quick tunnel whose URL changes on every
 * restart. It publishes the current URL (and a heartbeat) as JSON files in the
 * public `runtime` Supabase Storage bucket; we read them here, so nothing has to
 * be copied into env vars or redeployed. Set ML_API_URL to bypass this (e.g.
 * http://localhost:8000 while developing).
 */
import { cache } from 'react'
import type { PublicModel } from '@/types'

interface RuntimeFile {
  url?: string | null
  online?: boolean
  busy?: boolean
  updated_at?: string
  /** How long ago the file was written */
  ageMs: number
}

export interface BackendStatus {
  apiUrl: string | null
  apiOnline: boolean
  workerOnline: boolean
}

export class BackendOfflineError extends Error {
  constructor() {
    super('The prediction server is offline right now. Try again in a minute.')
  }
}

const HEARTBEAT_TIMEOUT_MS = 3 * 60 * 1000
// A training run blocks the worker's heartbeat, so trust a "busy" worker for longer
const BUSY_TIMEOUT_MS = 30 * 60 * 1000
const STATUS_CACHE_MS = 10 * 1000

async function readRuntimeFile(name: 'api' | 'worker'): Promise<RuntimeFile | null> {
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/runtime/${name}.json?t=${Date.now()}`,
      { cache: 'no-store', signal: AbortSignal.timeout(5000) }
    )
    if (!res.ok) return null
    const body = await res.json()
    // Measure the age with Supabase's own clock (response Date vs Last-Modified), so a
    // wrong clock on the backend machine or on this server can't mark it offline.
    const served = Date.parse(res.headers.get('date') ?? '')
    const modified = Date.parse(res.headers.get('last-modified') ?? '')
    const ageMs = Number.isFinite(served) && Number.isFinite(modified)
      ? Math.max(0, served - modified)
      : Date.now() - Date.parse(body.updated_at ?? '')
    return { ...body, ageMs: Number.isFinite(ageMs) ? ageMs : Infinity }
  } catch {
    return null
  }
}

function isAlive(file: RuntimeFile | null, timeoutMs: number) {
  return !!file?.online && file.ageMs < timeoutMs
}

let cached: { at: number; status: BackendStatus } | null = null

export async function getBackendStatus(fresh = false): Promise<BackendStatus> {
  if (!fresh && cached && Date.now() - cached.at < STATUS_CACHE_MS) return cached.status

  const override = process.env.ML_API_URL?.replace(/\/+$/, '')
  const [api, worker] = await Promise.all([
    override ? null : readRuntimeFile('api'),
    readRuntimeFile('worker'),
  ])
  const apiOnline = override ? true : isAlive(api, HEARTBEAT_TIMEOUT_MS)
  const status: BackendStatus = {
    apiUrl: override ?? (apiOnline ? api?.url ?? null : null),
    apiOnline,
    workerOnline: isAlive(worker, worker?.busy ? BUSY_TIMEOUT_MS : HEARTBEAT_TIMEOUT_MS),
  }
  cached = { at: Date.now(), status }
  return status
}

/** fetch() against the backend. Throws BackendOfflineError if it can't be reached. */
export async function backendFetch(path: string, init: RequestInit = {}): Promise<Response> {
  for (const fresh of [false, true]) {
    const { apiUrl } = await getBackendStatus(fresh)
    if (!apiUrl) break
    try {
      return await fetch(`${apiUrl}${path}`, {
        ...init,
        cache: 'no-store',
        signal: AbortSignal.timeout(30_000),
      })
    } catch {
      // The tunnel may have restarted with a new URL — re-read it once and retry
      cached = null
    }
  }
  throw new BackendOfflineError()
}

/** Model details from the backend: null when it doesn't exist (or is private and not ours). */
export async function fetchModelInfo(id: string, headers: HeadersInit = {}): Promise<PublicModel | null> {
  const res = await backendFetch(`/api/v1/models/${encodeURIComponent(id)}`, { headers })
  if (res.status === 404 || res.status === 401) return null
  if (!res.ok) throw new Error(`Backend error ${res.status}`)
  return res.json()
}

/** Same, deduplicated per request; `token` lets owners see their private models. */
export const getPublicModel = cache((id: string, token?: string | null) =>
  fetchModelInfo(id, token ? { Authorization: `Bearer ${token}` } : {})
)
