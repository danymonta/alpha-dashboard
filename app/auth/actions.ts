'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'

export async function esci(): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/login')
}

/** «Esci» of the client's area (1.78.0): this browser only, then the client's door. */
export async function esciCliente(): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut({ scope: 'local' })
  revalidatePath('/', 'layout')
  redirect('/entra')
}
