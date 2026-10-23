import 'server-only'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { messaggioErrore, negaPer } from '@/lib/auth/azioni'
import type { Contesto } from '@/lib/call/operazioni'
import { isDataISO } from '@/lib/date'
import {
  modificaIncassoSchema,
  modificaRataSchema,
  rimborsoSchema,
  segnaIncassataSchema,
  soloRataSchema,
} from '@/lib/validation/incasso'
import {
  PERSONALIZZATO,
  modificaVenditaSchema,
  nuovaRataSchema,
  nuovaVenditaSchema,
  type NuovaVenditaInput,
} from '@/lib/validation/vendita'

/**
 * The only way sales, instalments and cash-ins are written (Claude a 360
 * gradi, phase 3, 23/10/2026): from the app (the server actions of /sales,
 * /sales/new and /clients, with the cookie session of whoever taps, and Alfire,
 * which calls those actions) and from Claude (the MCP tools, with the OAuth
 * token of whoever connected it). Same Zod schemas, same SQL, same messages;
 * the client is always the caller's, never the service role, so RLS and the
 * functions in SQL decide what actually happens (the closer only on his own
 * sales, guard_payments_closer keeps the plan the admin's). Every write
 * revalidates the pages it touches, so a change from Claude shows in the app
 * too. Deleting a sale or an instalment stays in the actions: never from Claude.
 */

export type { Contesto } from '@/lib/call/operazioni'

const SESSIONE = 'Sessione scaduta. Rientra e riprova.'

export type EsitoRata = { ok: true; importo?: number; rata?: number } | { ok: false; errore: string }

type Ruolo = 'admin' | 'closer'

/** The guard of the sale page: an active admin, or a closer where the closer may act. */
export async function autorizza(ctx: Contesto, ruoli: Ruolo[]): Promise<string | null> {
  const profilo = await ctx.chi()
  if (!profilo || !profilo.attivo) return SESSIONE
  if (!ruoli.includes(profilo.ruolo as Ruolo)) {
    return ruoli.length === 1 ? 'Questa operazione è riservata all’admin.' : 'Operazione non consentita.'
  }
  return null
}

/**
 * Every page that shows cash or instalments, sale details included, and the
 * Projects area: a first cashed instalment opens the client's project, a
 * sale's dates move its period (02/10/2026).
 */
export function aggiornaPagine() {
  for (const percorso of ['/', '/sales', '/payments', '/my-sales', '/clients', '/commissions']) {
    revalidatePath(percorso)
  }
  revalidatePath('/sales/[id]', 'page')
  revalidatePath('/progetti', 'layout')
}

function messaggio(error: { code?: string; message: string }, fallback: string) {
  // 22023 / 42501 / 23514: our own rules and checks, already worded for people
  return error.code === '22023' || error.code === '42501' ? error.message : fallback
}

// ---------------------------------------------------------------------------
// Instalments and cash-ins
// ---------------------------------------------------------------------------
export async function segnaIncassata(ctx: Contesto, input: unknown): Promise<EsitoRata> {
  const parsed = segnaIncassataSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: parsed.error.issues[0]?.message ?? 'Dati non validi.' }
  const negato = await autorizza(ctx, ['admin', 'closer'])
  if (negato) return { ok: false, errore: negato }

  const v = parsed.data
  const { data, error } = await ctx.db
    .rpc('segna_rata_incassata', {
      p_payment_id: v.payment_id,
      p_incassato_il: v.incassato_il ?? undefined,
      p_importo: v.importo ?? undefined,
      p_metodo: v.metodo ?? undefined,
    })
    .single()

  if (error) return { ok: false, errore: messaggio(error, 'Incasso non registrato. Riprova.') }

  aggiornaPagine()
  return { ok: true, importo: data.importo_registrato, rata: data.rata }
}

export async function annullaIncasso(ctx: Contesto, input: unknown): Promise<EsitoRata> {
  const parsed = soloRataSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: 'Rata non valida.' }
  const negato = await autorizza(ctx, ['admin', 'closer'])
  if (negato) return { ok: false, errore: negato }

  const { data, error } = await ctx.db
    .from('payments')
    .update({ stato: 'prevista', incassato_il: null, importo_incassato: null, metodo: null })
    .eq('id', parsed.data.payment_id)
    .in('stato', ['incassata', 'fallita'])
    .select('sale_id')
    .maybeSingle()

  if (error) return { ok: false, errore: messaggio(error, 'Operazione non riuscita. Riprova.') }
  if (!data) return { ok: false, errore: 'Rata non trovata o già da incassare.' }

  aggiornaPagine()
  return { ok: true }
}

export async function segnaFallita(ctx: Contesto, input: unknown): Promise<EsitoRata> {
  const parsed = soloRataSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: 'Rata non valida.' }
  const negato = await autorizza(ctx, ['admin', 'closer'])
  if (negato) return { ok: false, errore: negato }

  const { data, error } = await ctx.db
    .from('payments')
    .update({ stato: 'fallita' })
    .eq('id', parsed.data.payment_id)
    .eq('stato', 'prevista')
    .select('sale_id')
    .maybeSingle()

  if (error) return { ok: false, errore: messaggio(error, 'Operazione non riuscita. Riprova.') }
  if (!data) return { ok: false, errore: 'Solo una rata da incassare può fallire.' }

  aggiornaPagine()
  return { ok: true }
}

export async function modificaRata(ctx: Contesto, input: unknown): Promise<EsitoRata> {
  const parsed = modificaRataSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: parsed.error.issues[0]?.message ?? 'Dati non validi.' }
  const negato = await autorizza(ctx, ['admin'])
  if (negato) return { ok: false, errore: negato }

  const { data, error } = await ctx.db
    .from('payments')
    .update({ scadenza: parsed.data.scadenza, importo_previsto: parsed.data.importo_previsto })
    .eq('id', parsed.data.payment_id)
    .eq('stato', 'prevista')
    .select('sale_id')
    .maybeSingle()

  if (error) return { ok: false, errore: messaggio(error, 'Rata non modificata. Riprova.') }
  if (!data) return { ok: false, errore: 'Si modifica solo una rata ancora da incassare.' }

  aggiornaPagine()
  return { ok: true }
}

export async function registraRimborso(ctx: Contesto, input: unknown): Promise<EsitoRata> {
  const parsed = rimborsoSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: parsed.error.issues[0]?.message ?? 'Dati non validi.' }
  const negato = await autorizza(ctx, ['admin'])
  if (negato) return { ok: false, errore: negato }

  const v = parsed.data
  const { error } = await ctx.db.rpc('registra_rimborso', {
    p_payment_id: v.payment_id,
    p_data: v.data,
    p_importo: v.importo,
    p_note: v.note ?? undefined,
  })

  if (error) return { ok: false, errore: messaggio(error, 'Rimborso non registrato. Riprova.') }

  aggiornaPagine()
  return { ok: true, importo: v.importo }
}

/**
 * Correct a recorded payment: date, amount, method. The admin on every sale,
 * the closer on their own (RLS and the payments guard decide).
 */
export async function modificaIncasso(ctx: Contesto, input: unknown): Promise<EsitoRata> {
  const parsed = modificaIncassoSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: parsed.error.issues[0]?.message ?? 'Dati non validi.' }
  const negato = await autorizza(ctx, ['admin', 'closer'])
  if (negato) return { ok: false, errore: negato }

  const v = parsed.data
  const { data, error } = await ctx.db
    .from('payments')
    .update({ incassato_il: v.incassato_il, importo_incassato: v.importo, metodo: v.metodo ?? null })
    .eq('id', v.payment_id)
    .eq('stato', 'incassata')
    .select('id')
    .maybeSingle()

  if (error) return { ok: false, errore: messaggio(error, 'Incasso non modificato. Riprova.') }
  if (!data) return { ok: false, errore: 'Si corregge solo una rata già incassata.' }

  aggiornaPagine()
  return { ok: true, importo: v.importo }
}

/** An extra instalment on a recorded sale; numbers follow the due dates. */
export async function aggiungiRata(ctx: Contesto, input: unknown): Promise<EsitoRata & { id?: string }> {
  const parsed = nuovaRataSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: parsed.error.issues[0]?.message ?? 'Dati non validi.' }
  const negato = await autorizza(ctx, ['admin'])
  if (negato) return { ok: false, errore: negato }

  const { data, error } = await ctx.db.rpc('aggiungi_rata', {
    p_sale_id: parsed.data.sale_id,
    p_scadenza: parsed.data.scadenza,
    p_importo: parsed.data.importo,
  })
  if (error) return { ok: false, errore: messaggio(error, 'Rata non aggiunta. Riprova.') }

  aggiornaPagine()
  return { ok: true, importo: parsed.data.importo, ...(data ? { id: data } : {}) }
}

// ---------------------------------------------------------------------------
// The sale
// ---------------------------------------------------------------------------
/** The admin corrects a recorded sale. The instalments stay as they are. */
export async function modificaVendita(ctx: Contesto, input: unknown): Promise<EsitoRata> {
  const parsed = modificaVenditaSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: parsed.error.issues[0]?.message ?? 'Dati non validi.' }
  const negato = await autorizza(ctx, ['admin'])
  if (negato) return { ok: false, errore: negato }

  const { id, product_id, prodotto_personalizzato, ...campi } = parsed.data
  const { data, error } = await ctx.db
    .from('sales')
    .update({
      ...campi,
      // a catalogue product, or a path named by hand
      product_id: product_id === PERSONALIZZATO ? null : product_id,
      prodotto_personalizzato: product_id === PERSONALIZZATO ? prodotto_personalizzato : null,
    })
    .eq('id', id)
    .select('id')
    .maybeSingle()

  // 23514: the renewal check of the database, already worded for people
  if (error) {
    return {
      ok: false,
      errore: error.code === '23514' ? error.message : messaggio(error, 'Vendita non aggiornata. Riprova.'),
    }
  }
  if (!data) return { ok: false, errore: 'Vendita non trovata.' }

  aggiornaPagine()
  revalidatePath('/clients/[id]', 'page')
  return { ok: true }
}

export type EsitoNuovaVendita =
  | { ok: true; idVendita: string; idCliente?: string; clienteNuovo?: boolean }
  | {
      ok: false
      errore: string
      campi?: Partial<Record<keyof NuovaVenditaInput, string>>
      idEsistente?: string
    }

/** Who may record a sale: whoever closes it (admin and closer, active). */
export async function puoRegistrareVendite(ctx: Contesto): Promise<boolean> {
  const profilo = await ctx.chi()
  return !!profilo && profilo.attivo && (profilo.ruolo === 'admin' || profilo.ruolo === 'closer')
}

export async function registraVendita(ctx: Contesto, input: unknown): Promise<EsitoNuovaVendita> {
  const parsed = nuovaVenditaSchema.safeParse(input)
  if (!parsed.success) {
    const campi: Partial<Record<keyof NuovaVenditaInput, string>> = {}
    for (const issue of parsed.error.issues) {
      campi[issue.path[0] as keyof NuovaVenditaInput] ??= issue.message
    }
    return { ok: false, errore: 'Controlla i campi evidenziati.', campi }
  }

  if (!(await puoRegistrareVendite(ctx))) {
    return { ok: false, errore: 'Le vendite le registra chi le chiude.' }
  }

  const v = parsed.data
  const supabase = ctx.db
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
      const { data: esistente } = await supabase.from('sales').select('id').eq('call_id', v.call_id).maybeSingle()
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
  // a renewal moves the end of the client's project (02/10/2026)
  revalidatePath('/progetti', 'layout')

  return { ok: true, idVendita: data.id_vendita, idCliente: data.id_cliente, clienteNuovo: data.cliente_nuovo }
}

// ---------------------------------------------------------------------------
// «Interrompi il percorso»
// ---------------------------------------------------------------------------
export const interruzioneSchema = z.object({
  sale_id: z.string().uuid('Vendita non valida'),
  ultimo_giorno: z.string().refine(isDataISO, 'Scegli l’ultimo giorno'),
  togli_rate: z.boolean(),
})

export type AnteprimaInterruzione = {
  rate_tolte: number
  importo_tolto: number
  valore_prima: number
  valore_dopo: number
}

/** The guard of the client page (negaSeNon(['admin'])): the business coach reads and never writes. */
async function soloAdmin(ctx: Contesto): Promise<string | null> {
  return negaPer(await ctx.chi(), ['admin'])
}

/** What "Interrompi il percorso" would do, before the confirmation: public.interrompi_percorso without running it. */
export async function anteprimaInterruzione(
  ctx: Contesto,
  input: unknown,
): Promise<{ ok: true; anteprima: AnteprimaInterruzione } | { ok: false; errore: string }> {
  const parsed = interruzioneSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: parsed.error.issues[0]?.message ?? 'Dati non validi.' }
  const negato = await soloAdmin(ctx)
  if (negato) return { ok: false, errore: negato }

  const { data, error } = await ctx.db
    .rpc('interrompi_percorso', {
      p_sale_id: parsed.data.sale_id,
      p_ultimo_giorno: parsed.data.ultimo_giorno,
      p_togli_rate: parsed.data.togli_rate,
      p_esegui: false,
    })
    .single()
  if (error) return { ok: false, errore: messaggioErrore(error, 'Anteprima non disponibile. Riprova.') }
  return { ok: true, anteprima: data }
}

/** A client who stops early: the sale ends on that day, the unpaid instalments after it go if asked. */
export async function interrompiPercorso(ctx: Contesto, input: unknown): Promise<{ ok: true } | { ok: false; errore: string }> {
  const parsed = interruzioneSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: parsed.error.issues[0]?.message ?? 'Dati non validi.' }
  const negato = await soloAdmin(ctx)
  if (negato) return { ok: false, errore: negato }

  const { error } = await ctx.db.rpc('interrompi_percorso', {
    p_sale_id: parsed.data.sale_id,
    p_ultimo_giorno: parsed.data.ultimo_giorno,
    p_togli_rate: parsed.data.togli_rate,
    p_esegui: true,
  })
  if (error) return { ok: false, errore: messaggioErrore(error, 'Percorso non interrotto. Riprova.') }

  revalidatePath('/clients', 'layout')
  revalidatePath('/sales', 'layout')
  revalidatePath('/payments')
  revalidatePath('/rinnovi')
  revalidatePath('/')
  // the client's project ends with the path (02/10/2026)
  revalidatePath('/progetti', 'layout')
  return { ok: true }
}
