import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const supabase = await createClient()
  await supabase.auth.signOut()
  // 303 so the browser follows up with a GET instead of re-POSTing
  return NextResponse.redirect(new URL('/', request.url), { status: 303 })
}
