'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { messaggioErrore } from '@/lib/auth/azioni'
import { getProfilo } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'

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
