'use server'

import { createHash, randomBytes } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'

type Result<T = object> = ({ error?: undefined } & T) | { error: string }

const MAX_API_KEYS = 10

async function signedIn() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return { supabase, user }
}

/** Database errors raised by our guard trigger are already user-friendly; others aren't. */
function friendly(error: { message: string; code?: string }) {
  return error.code === 'P0001' ? error.message : `Something went wrong: ${error.message}`
}

async function updateOwnModel(id: string, fields: Record<string, unknown>): Promise<Result> {
  const { supabase, user } = await signedIn()
  if (!user) return { error: 'Your session expired — sign in again.' }
  const { data, error } = await supabase
    .from('training_jobs')
    .update(fields)
    .eq('id', id)
    .eq('user_id', user.id)
    .select('id')
  if (error) return { error: friendly(error) }
  if (!data?.length) return { error: 'Model not found.' }
  revalidatePath('/dashboard')
  revalidatePath(`/dashboard/model/${id}`)
  return {}
}

export async function deleteModel(id: string): Promise<Result> {
  const { supabase, user } = await signedIn()
  if (!user) return { error: 'Your session expired — sign in again.' }

  const { data, error } = await supabase
    .from('training_jobs')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)
    .select('id')

  if (error) return { error: friendly(error) }
  if (!data?.length) return { error: 'Model not found, or you do not have permission to delete it.' }

  // The model file and any leftover dataset are removed from storage by the
  // backend worker's cleanup pass, which has the permissions to do so.
  revalidatePath('/dashboard')
  return {}
}

export async function renameModel(id: string, name: string): Promise<Result> {
  const trimmed = name.trim()
  if (!trimmed) return { error: 'The name can’t be empty.' }
  if (trimmed.length > 120) return { error: 'Keep the name under 120 characters.' }
  return updateOwnModel(id, { dataset_name: trimmed })
}

export async function setModelVisibility(id: string, isPublic: boolean): Promise<Result> {
  return updateOwnModel(id, { is_public: isPublic })
}

export async function cancelTraining(id: string): Promise<Result> {
  return updateOwnModel(id, { status: 'cancelled' })
}

export async function modelDownloadUrl(id: string): Promise<Result<{ url: string }>> {
  const { supabase, user } = await signedIn()
  if (!user) return { error: 'Your session expired — sign in again.' }
  const { data: job } = await supabase
    .from('training_jobs')
    .select('model_path, dataset_name')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!job?.model_path) return { error: 'This model has no file to download yet.' }

  const filename = `${job.dataset_name.replace(/\.csv$/i, '').replace(/[^\w.-]+/g, '_') || 'model'}.joblib`
  const { data, error } = await supabase.storage
    .from('models')
    .createSignedUrl(job.model_path, 60, { download: filename })
  if (error || !data) return { error: 'Couldn’t create a download link. Try again in a moment.' }
  return { url: data.signedUrl }
}

export async function createApiKey(name: string): Promise<Result<{ key: string }>> {
  const label = name.trim() || 'Untitled key'
  if (label.length > 60) return { error: 'Keep the name under 60 characters.' }
  const { supabase, user } = await signedIn()
  if (!user) return { error: 'Your session expired — sign in again.' }

  const { count } = await supabase.from('api_keys').select('id', { count: 'exact', head: true })
  if ((count ?? 0) >= MAX_API_KEYS) return { error: `You can have at most ${MAX_API_KEYS} API keys. Revoke one first.` }

  // Only a hash is stored; the plain key is shown to the user exactly once
  const key = `mf_${randomBytes(24).toString('base64url')}`
  const { error } = await supabase.from('api_keys').insert({
    user_id: user.id,
    name: label,
    prefix: key.slice(0, 10),
    key_hash: createHash('sha256').update(key).digest('hex'),
  })
  if (error) return { error: friendly(error) }
  revalidatePath('/dashboard/settings')
  return { key }
}

export async function revokeApiKey(id: string): Promise<Result> {
  const { supabase, user } = await signedIn()
  if (!user) return { error: 'Your session expired — sign in again.' }
  const { error } = await supabase.from('api_keys').delete().eq('id', id).eq('user_id', user.id)
  if (error) return { error: friendly(error) }
  revalidatePath('/dashboard/settings')
  return {}
}
