'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'

export async function deleteModel(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Your session expired — sign in again.' }

  const { data, error } = await supabase
    .from('training_jobs')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)
    .select('id')

  if (error) return { error: error.message }
  if (!data?.length) return { error: 'Model not found, or you do not have permission to delete it.' }

  // The model file and any leftover dataset are removed from storage by the
  // backend worker's cleanup pass, which has the permissions to do so.
  revalidatePath('/dashboard')
  return {}
}
