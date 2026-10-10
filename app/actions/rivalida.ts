'use server'

import { revalidatePath } from 'next/cache'

import { getProfilo } from '@/lib/auth/session'

/**
 * After a write made outside a server action (Alfire writes from its route): one
 * redraw of the current page and the browser's page cache emptied, so every page
 * shows the new data at once (spec 1.33.0 R3). router.refresh() would clear the
 * cache of the current page only, and the others would stay up to 30 s old
 * (next.config.ts, CACHE_NAVIGAZIONE_SECONDI). Writes nothing.
 */
export async function rivalidaTutto(): Promise<void> {
  const profilo = await getProfilo()
  if (!profilo?.attivo) return
  revalidatePath('/', 'layout')
}
