'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { messaggioErrore } from '@/lib/auth/azioni'
import { getProfilo } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { scollegaAppSchema } from '@/lib/validation/mcp'

export type Esito = { ok: true } | { ok: false; errore: string }

const profiloSchema = z.object({
  nome: z.string().trim().min(2, 'Scrivi il tuo nome').max(80, 'Al massimo 80 caratteri'),
  foto_url: z.string().url().max(500).nullable(),
})

/** Name and photo of whoever is signed in: public.aggiorna_mio_profilo touches nothing else. */
export async function salvaProfilo(input: unknown): Promise<Esito> {
  const parsed = profiloSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: parsed.error.issues[0]?.message ?? 'Dati non validi.' }
  const profilo = await getProfilo()
  if (!profilo || !profilo.attivo) return { ok: false, errore: 'Sessione scaduta. Rientra e riprova.' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('aggiorna_mio_profilo', {
    p_nome: parsed.data.nome,
    p_foto_url: parsed.data.foto_url as string,
  })
  if (error) return { ok: false, errore: messaggioErrore(error, 'Profilo non salvato. Riprova.') }

  // the photo and the name are in the shell of every page
  revalidatePath('/', 'layout')
  return { ok: true }
}

/** The Google account photo as it is today, for "Usa la foto di Google". */
export async function fotoGoogle(): Promise<string | null> {
  const supabase = await createClient()
  const { data } = await supabase.rpc('mia_foto_google')
  return data ?? null
}

/**
 * «Scollega» in App collegate (Claude connected, 09/10/2026): Supabase Auth
 * revokes the person's own consent to that app and deletes its sessions, so
 * the app's next call is refused and it must be connected again. Only the
 * caller's grants: the cookie session decides, every role (who was demoted
 * after connecting must still be able to revoke).
 */
export async function scollegaApp(input: unknown): Promise<Esito> {
  const parsed = scollegaAppSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: parsed.error.issues[0]?.message ?? 'Dati non validi.' }
  const profilo = await getProfilo()
  if (!profilo || !profilo.attivo) return { ok: false, errore: 'Sessione scaduta. Rientra e riprova.' }

  const supabase = await createClient()
  const { error } = await supabase.auth.oauth.revokeGrant({ clientId: parsed.data.clientId })
  // 404 oauth_consent_not_found: no active grant left (already revoked from another tab or
  // device), the same result. feature_disabled is a 404 too, and it is not a revocation.
  const giaScollegata = error?.status === 404 && error.code !== 'feature_disabled'
  if (error && !giaScollegata) return { ok: false, errore: 'App non scollegata. Riprova.' }

  revalidatePath('/account')
  return { ok: true }
}
