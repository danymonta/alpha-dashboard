'use server'

import { revalidatePath } from 'next/cache'

import { getProfilo } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

import {
  PERSONALIZZATO,
  anteprimaPianoSchema,
  nuovaVenditaSchema,
  rataSchema,
  type NuovaVenditaInput,
} from '@/lib/validation/vendita'

export type RataAnteprima = { numero_rata: number; scadenza: string; importo: number }

export type EsitoNuovaVendita =
  | { ok: true; idVendita: string }
  | {
      ok: false
      errore: string
      campi?: Partial<Record<keyof NuovaVenditaInput, string>>
      idEsistente?: string
    }

async function puoRegistrareVendite() {
  const profilo = await getProfilo()
  return !!profilo && profilo.attivo && (profilo.ruolo === 'admin' || profilo.ruolo === 'closer')
}

/** Preview of the plan, computed by public.piano_rate: the same code the trigger uses. */
export async function anteprimaPianoRate(input: unknown): Promise<RataAnteprima[] | null> {
  const parsed = anteprimaPianoSchema.safeParse(input)
  if (!parsed.success || !(await puoRegistrareVendite())) return null

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('piano_rate', {
    p_valore: parsed.data.valore,
    p_numero_rate: parsed.data.numero_rate,
    p_data_vendita: parsed.data.data_vendita,
  })
  return error ? null : data
}

export type TotalePiano = { numero_rate: number; totale: number; scarto: number }

const anteprimaPersonalizzataSchema = z.object({
  rate: z.array(rataSchema).max(60),
  valore: z.number().nonnegative(),
})

/** Sum of a hand-written plan against the contract, computed by public.anteprima_piano. */
export async function totalePianoPersonalizzato(input: unknown): Promise<TotalePiano | null> {
  const parsed = anteprimaPersonalizzataSchema.safeParse(input)
  if (!parsed.success || !(await puoRegistrareVendite())) return null

  const supabase = await createClient()
  const { data, error } = await supabase
    .rpc('anteprima_piano', { p_rate: parsed.data.rate, p_valore: parsed.data.valore })
    .single()
  return error ? null : data
}

export async function registraVendita(input: unknown): Promise<EsitoNuovaVendita> {
  const parsed = nuovaVenditaSchema.safeParse(input)
  if (!parsed.success) {
    const campi: Partial<Record<keyof NuovaVenditaInput, string>> = {}
    for (const issue of parsed.error.issues) {
      campi[issue.path[0] as keyof NuovaVenditaInput] ??= issue.message
    }
    return { ok: false, errore: 'Controlla i campi evidenziati.', campi }
  }

  if (!(await puoRegistrareVendite())) {
    return { ok: false, errore: 'Le vendite le registra chi le chiude.' }
  }

  const v = parsed.data
  const supabase = await createClient()
  const { data, error } = await supabase
    .rpc('registra_vendita', {
      // a custom path has no catalogue product
      p_product_id: v.product_id === PERSONALIZZATO ? (null as unknown as string) : v.product_id,
      p_tipo: v.tipo,
      p_data_vendita: v.data_vendita,
      p_data_inizio: v.data_inizio,
      p_valore_contratto: v.valore_contratto,
      p_numero_rate: v.numero_rate,
      p_call_id: v.call_id ?? undefined,
      p_client_id: v.client_id ?? undefined,
      p_nome: v.nome ?? undefined,
      p_cognome: v.cognome ?? undefined,
      p_email: v.email ?? undefined,
      p_telefono: v.telefono ?? undefined,
      p_instagram_handle: v.instagram_handle ?? undefined,
      p_note: v.note ?? undefined,
      p_prodotto_personalizzato: v.product_id === PERSONALIZZATO ? (v.prodotto_personalizzato ?? undefined) : undefined,
      p_data_fine: v.data_fine ?? undefined,
      p_rate: v.piano === 'personalizzato' ? v.rate.map((r) => ({ scadenza: r.scadenza, importo: r.importo })) : undefined,
    })
    .single()

  if (error) {
    if (error.code === '23505' && v.call_id) {
      const { data: esistente } = await supabase
        .from('sales')
        .select('id')
        .eq('call_id', v.call_id)
        .maybeSingle()
      return {
        ok: false,
        errore: 'Questa call ha già una vendita registrata.',
        idEsistente: esistente?.id,
      }
    }
    if (error.code === '22023' || error.code === '23514') {
      return { ok: false, errore: error.message }
    }
    return { ok: false, errore: 'Vendita non registrata. Riprova.' }
  }

  for (const percorso of ['/sales', '/', '/payments', '/clients', '/calls', '/my-sales']) {
    revalidatePath(percorso)
  }
  // the client's history: a sale opened from the client goes back there
  revalidatePath('/clients/[id]', 'page')

  return { ok: true, idVendita: data.id_vendita }
}
