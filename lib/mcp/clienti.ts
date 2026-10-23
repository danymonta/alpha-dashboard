import 'server-only'

import * as operazioni from '@/lib/clienti/operazioni'
import { STATI_VISTA, etichettaPercorsoVendita, nomeCompleto, testoMeseSettimana, type RigaElenco } from '@/lib/clienti/elenco'
import { aggiungiGiorni, oggiRoma } from '@/lib/date'
import { ETICHETTE } from '@/lib/i18n/testi/etichette'
import type { Database } from '@/lib/supabase/database.types'

import type { EsitoStrumento } from './contenuti'
import type { ContestoMcp } from './contesto'
import type {
  CreaClienteInput,
  ElencoClientiInput,
  LeggiClienteInput,
  ModificaClienteInput,
  RinnoviInput,
  StatoClienteInput,
} from './schemi-vendite'

/**
 * What the MCP tools on clients do (Claude a 360 gradi, phase 3, 23/10/2026):
 * the admin reads and writes them, the business coach reads (the tools without
 * a write reach him through strumentiPer), nobody else. Reads go through
 * ctx.db, the person's own OAuth token (RLS decides, never the service role):
 * the client list through clienti_elenco (LTV, month of the path, instalments,
 * all in SQL), a client from its tables and views. Writes go through the
 * shared core of the app (lib/clienti/operazioni.ts), the same schemas, guards
 * and sentences as the server actions of /clients and Alfire. Nothing is
 * deleted from here: no client (CLAUDE.md sections 17, 19 and 28). The Drive
 * folder and the contract are links to read, never written. Amounts are
 * numbers in euros, summed by SQL: never added up here.
 */

const E = ETICHETTE.it

class LetturaNonRiuscita extends Error {
  constructor(readonly codice: string) {
    super('lettura non riuscita')
  }
}

type Risposta = { data: unknown; error: { code?: string } | null }

function controlla<R extends Risposta>(risposta: R): NonNullable<R['data']> {
  if (risposta.error) throw new LetturaNonRiuscita(risposta.error.code ?? 'errore')
  return (risposta.data ?? []) as NonNullable<R['data']>
}

/** One row (maybeSingle): null when there is none, a failed read throws. */
function una<R extends Risposta>(risposta: R): NonNullable<R['data']> | null {
  if (risposta.error) throw new LetturaNonRiuscita(risposta.error.code ?? 'errore')
  return (risposta.data ?? null) as NonNullable<R['data']> | null
}

function ok(dati: Record<string, unknown>, esito?: string): EsitoStrumento {
  return { ok: true, dati, esito }
}

function no(messaggio: string, esito?: string): EsitoStrumento {
  return { ok: false, messaggio, esito }
}

/** The core of clients with the token's client and the person behind it. */
function nucleo(ctx: ContestoMcp): operazioni.Contesto {
  return { db: ctx.db, chi: async () => ({ id: ctx.persona, ruolo: ctx.ruolo, attivo: true }) }
}

export const CLIENTE_NON_TROVATO = 'Questo cliente non c’è, o non è tra quelli che vedi.'

/** Amounts are euros, as numbers: said once at the top of every money result. */
export const VALUTA = 'EUR'

const euro = (v: number | string | null | undefined): number | null => (v === null || v === undefined ? null : Number(v))

type StatoRata = Database['public']['Enums']['payment_status']

/** The state of an instalment in the app's words: «In ritardo» is a planned one past its due date. */
export function statoRata(stato: StatoRata, scadenza: string, oggi: string): string {
  if (stato === 'prevista' && scadenza < oggi) return E.statoRata.inRitardo
  return E.statoRata[stato]
}

/** A search typed by Claude, for comparing names: no accents, no case. */
function normale(testo: string): string {
  return testo
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

async function nomi(ctx: ContestoMcp, ids: Iterable<string | null | undefined>): Promise<Map<string, string>> {
  const unici = [...new Set([...ids].filter((x): x is string => Boolean(x)))]
  if (unici.length === 0) return new Map()
  const righe = controlla(await ctx.db.from('profiles').select('id, nome').in('id', unici))
  return new Map(righe.map((r) => [r.id, r.nome]))
}

const persona = (mappa: Map<string, string>, id: string | null) => (id ? (mappa.get(id) ?? 'Persona non più nel team') : null)

// ── elenco_clienti ───────────────────────────────────────────────────────────
export async function elencoClienti(input: ElencoClientiInput, ctx: ContestoMcp): Promise<EsitoStrumento> {
  const vista = input.vista ?? 'attivi'
  const stati = input.stato ? [input.stato] : vista === 'tutti' ? null : STATI_VISTA[vista]
  const righe = controlla(await ctx.db.rpc('clienti_elenco', stati ? { p_stati: stati } : {})) as unknown as RigaElenco[]
  const cerca = input.cerca ? normale(input.cerca) : ''
  const trovati = cerca ? righe.filter((r) => normale(nomeCompleto(r)).includes(cerca)) : righe
  const limite = input.limite ?? 50
  const mostrati = trovati.slice(0, limite)
  return ok({
    valuta: VALUTA,
    ...(input.stato ? { stato: E.statoCliente[input.stato] } : { vista }),
    totale: trovati.length,
    clienti: mostrati.map((r) => ({
      client_id: r.client_id,
      nome: nomeCompleto(r),
      stato: E.statoCliente[r.stato],
      percorso: {
        sale_id: r.sale_id,
        quale: etichettaPercorsoVendita(r.tipo, r.numero_percorso),
        prodotto: r.prodotto,
        inizio: r.data_inizio,
        fine: r.data_fine,
        ...(testoMeseSettimana(r) ? { a_che_punto: testoMeseSettimana(r) } : {}),
      },
      contratto: euro(r.valore_contratto),
      pagato: euro(r.incassato),
      da_incassare: euro(r.da_incassare),
      ...(Number(r.in_ritardo) > 0 ? { in_ritardo: euro(r.in_ritardo) } : {}),
      rate_pagate: `${r.rate_incassate} di ${r.rate_totali}`,
      ...(r.prossima_scadenza ? { prossima_rata: { scadenza: r.prossima_scadenza, importo: euro(r.prossimo_importo) } } : {}),
      ...(r.metodi?.length ? { metodi: r.metodi.map((m) => E.metodo[m as keyof typeof E.metodo] ?? m) } : {}),
      ltv: euro(r.ltv),
      ...(r.contratto_url ? { contratto_drive: r.contratto_url } : {}),
      ...(r.cartella_url ? { cartella_drive: r.cartella_url } : {}),
      ...(r.sospeso_il ? { sospeso_il: r.sospeso_il } : {}),
      ...(r.chiuso_il ? { chiuso_il: r.chiuso_il } : {}),
    })),
    nota:
      'Importi in euro, dal SQL: pagato e da incassare sono del percorso che finisce per ultimo, ltv è l’incassato a vita del cliente. Non sommarli tra clienti.' +
      (trovati.length > mostrati.length ? ` Qui ${mostrati.length} clienti su ${trovati.length}: restringi con vista, stato o cerca.` : ''),
  })
}

// ── leggi_cliente ────────────────────────────────────────────────────────────
export async function leggiCliente(input: LeggiClienteInput, ctx: ContestoMcp): Promise<EsitoStrumento> {
  const id = input.client_id
  const [cliente, stato, chiusura, sospensione, cartella, vendite] = await Promise.all([
    ctx.db
      .from('clients')
      .select('id, nome, cognome, email, telefono, instagram_handle, fonte, setter_id, closer_id, note, lead_id, created_at')
      .eq('id', id)
      .maybeSingle(),
    ctx.db
      .from('v_clienti')
      .select('stato, numero_vendite, valore_firmato, incassato, da_incassare, in_ritardo, data_fine_ultima')
      .eq('client_id', id)
      .maybeSingle(),
    ctx.db.from('v_clienti_chiusi').select('chiuso_il, motivo, archiviato_il').eq('client_id', id).maybeSingle(),
    ctx.db.from('clienti_sospensioni').select('sospeso_il, motivo').eq('client_id', id).maybeSingle(),
    ctx.db.from('clienti_cartelle').select('url').eq('client_id', id).maybeSingle(),
    ctx.db
      .from('sales')
      .select(
        'id, tipo, product_id, prodotto_personalizzato, data_vendita, data_inizio, data_fine, valore_contratto, numero_rate, call_id, setter_id, closer_id, note, created_at, prodotto:products(nome)',
      )
      .eq('client_id', id)
      .order('data_inizio', { ascending: true })
      .order('created_at', { ascending: true }),
  ])
  const a = una(cliente)
  if (!a) return no(CLIENTE_NON_TROVATO, 'non_trovato')
  const s = una(stato)
  const ch = una(chiusura)
  const so = una(sospensione)
  const ca = una(cartella)
  const righeVendite = controlla(vendite)

  const ids = righeVendite.map((v) => v.id)
  const [importi, rate, contratti, persone] = await Promise.all([
    ids.length
      ? ctx.db
          .from('v_vendite')
          .select('sale_id, incassato, da_incassare, in_ritardo, rate_incassate, rate_totali, rate_in_ritardo, prossima_scadenza')
          .in('sale_id', ids)
      : Promise.resolve({ data: [], error: null }),
    ids.length
      ? ctx.db
          .from('payments')
          .select('id, sale_id, numero_rata, scadenza, importo_previsto, stato, incassato_il, importo_incassato, metodo, note, created_at')
          .in('sale_id', ids)
          .order('numero_rata')
          .order('created_at')
      : Promise.resolve({ data: [], error: null }),
    ids.length ? ctx.db.from('vendite_contratti').select('sale_id, url').in('sale_id', ids) : Promise.resolve({ data: [], error: null }),
    nomi(ctx, [a.setter_id, a.closer_id, ...righeVendite.flatMap((v) => [v.setter_id, v.closer_id])]),
  ])
  const perVendita = new Map(controlla(importi).map((i) => [i.sale_id, i]))
  const contrattoDi = new Map(controlla(contratti).map((x) => [x.sale_id, x.url]))
  const tutteLeRate = controlla(rate)
  const oggi = oggiRoma()

  // the paths in order, as the history of the client: «Primo percorso», «Rinnovo 1», «Upsell»
  let numero = 0
  const percorsi = righeVendite.map((v) => {
    if (v.tipo !== 'upsell') numero += 1
    const i = perVendita.get(v.id)
    return {
      sale_id: v.id,
      quale: etichettaPercorsoVendita(v.tipo, numero),
      tipo: E.tipoVendita[v.tipo],
      prodotto: v.prodotto?.nome ?? v.prodotto_personalizzato,
      venduta_il: v.data_vendita,
      inizio: v.data_inizio,
      fine: v.data_fine,
      contratto: euro(v.valore_contratto),
      numero_rate: v.numero_rate,
      setter: persona(persone, v.setter_id),
      closer: persona(persone, v.closer_id),
      ...(v.call_id ? { call_id: v.call_id } : {}),
      incassato: euro(i?.incassato),
      da_incassare: euro(i?.da_incassare),
      ...(Number(i?.in_ritardo ?? 0) > 0 ? { in_ritardo: euro(i?.in_ritardo) } : {}),
      ...(contrattoDi.get(v.id) ? { contratto_drive: contrattoDi.get(v.id) } : {}),
      ...(v.note?.trim() ? { note: v.note.trim() } : {}),
      rate: tutteLeRate
        .filter((r) => r.sale_id === v.id)
        .map((r) => ({
          payment_id: r.id,
          rata: r.numero_rata,
          scadenza: r.scadenza,
          stato: statoRata(r.stato, r.scadenza, oggi),
          importo_previsto: euro(r.importo_previsto),
          ...(r.incassato_il ? { incassata_il: r.incassato_il, importo_incassato: euro(r.importo_incassato) } : {}),
          ...(r.metodo ? { metodo: E.metodo[r.metodo] } : {}),
          ...(r.note?.trim() ? { note: r.note.trim() } : {}),
        })),
    }
  })

  return ok({
    valuta: VALUTA,
    cliente: {
      client_id: a.id,
      nome: nomeCompleto(a),
      stato: s?.stato ? E.statoCliente[s.stato] : null,
      email: a.email,
      telefono: a.telefono,
      instagram: a.instagram_handle,
      fonte: a.fonte ? E.fonte[a.fonte] : null,
      setter: persona(persone, a.setter_id),
      closer: persona(persone, a.closer_id),
      ...(a.note?.trim() ? { note: a.note.trim() } : {}),
      ...(ca ? { cartella_drive: ca.url } : {}),
      ...(ch
        ? {
            non_rinnova: {
              chiuso_il: ch.chiuso_il,
              motivo: ch.motivo,
              ...(ch.archiviato_il ? { archiviato_come_ex_cliente_il: ch.archiviato_il } : {}),
            },
          }
        : {}),
      ...(so ? { sospeso: { dal: so.sospeso_il, motivo: so.motivo } } : {}),
    },
    ...(s
      ? {
          totali: {
            valore_firmato: euro(s.valore_firmato),
            ltv: euro(s.incassato),
            da_incassare: euro(s.da_incassare),
            in_ritardo: euro(s.in_ritardo),
            fine_ultimo_percorso: s.data_fine_ultima,
          },
        }
      : {}),
    percorsi,
    nota: 'Importi in euro, dal SQL: totali.ltv è l’incassato a vita, già sommato. Non sommare le rate.',
  })
}

// ── rinnovi ──────────────────────────────────────────────────────────────────
const giorniTra = (da: string, a: string) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${da}T00:00:00Z`)) / 86_400_000)

export async function rinnovi(input: RinnoviInput, ctx: ContestoMcp): Promise<EsitoStrumento> {
  const entro = input.entro ?? 30
  const oggi = oggiRoma()
  const colonne = 'client_id, nome, cognome, data_fine_ultima, valore_firmato'
  const [inScadenza, scaduti, chiusi, chiusure] = await Promise.all([
    ctx.db
      .from('v_clienti')
      .select(colonne)
      .gte('data_fine_ultima', oggi)
      .lte('data_fine_ultima', aggiungiGiorni(oggi, entro))
      // a closed, archived or suspended client is never among the ones to chase (as Rinnovi)
      .not('stato', 'in', '(chiuso,ex_cliente,sospeso)')
      .order('data_fine_ultima'),
    ctx.db.from('v_clienti').select(colonne).eq('stato', 'scaduto').lt('data_fine_ultima', oggi).order('data_fine_ultima', { ascending: false }),
    ctx.db.from('v_clienti').select(colonne).eq('stato', 'chiuso'),
    ctx.db.from('v_clienti_chiusi').select('client_id, chiuso_il, motivo, archiviato_il'),
  ])
  const chiusura = new Map(controlla(chiusure).map((c) => [c.client_id, c]))
  const nome = (c: { nome: string | null; cognome: string | null }) => nomeCompleto({ nome: c.nome ?? '', cognome: c.cognome })
  return ok({
    valuta: VALUTA,
    in_scadenza: controlla(inScadenza).map((c) => ({
      client_id: c.client_id,
      nome: nome(c),
      fine_percorso: c.data_fine_ultima,
      giorni_alla_fine: c.data_fine_ultima ? giorniTra(oggi, c.data_fine_ultima) : null,
      valore_firmato: euro(c.valore_firmato),
    })),
    finito_senza_rinnovo: controlla(scaduti).map((c) => ({
      client_id: c.client_id,
      nome: nome(c),
      finito_il: c.data_fine_ultima,
      giorni_fa: c.data_fine_ultima ? giorniTra(c.data_fine_ultima, oggi) : null,
    })),
    non_rinnovano: controlla(chiusi)
      .map((c) => ({
        client_id: c.client_id,
        nome: nome(c),
        chiuso_il: chiusura.get(c.client_id ?? '')?.chiuso_il ?? null,
        motivo: chiusura.get(c.client_id ?? '')?.motivo ?? null,
      }))
      .sort((x, y) => (y.chiuso_il ?? '').localeCompare(x.chiuso_il ?? '')),
    archiviati_come_ex_clienti: [...chiusura.values()].filter((c) => c.archiviato_il).length,
    nota: `Come Rinnovi nell’app: in_scadenza chi finisce il percorso entro ${entro} giorni (mai i chiusi, gli archiviati o i sospesi), finito_senza_rinnovo chi l’ha finito da meno di 90 giorni. Un rinnovo si registra con registra_vendita (tipo rinnovo, client_id).`,
  })
}

// ── crea_cliente, modifica_cliente ───────────────────────────────────────────
/** "" from Claude clears a value; null or missing means "not said". */
const detto = <T>(valore: T | '' | null | undefined, salvato: T | null): T | null =>
  valore === undefined || valore === null ? salvato : valore === '' ? null : valore

export async function creaCliente(input: CreaClienteInput, ctx: ContestoMcp): Promise<EsitoStrumento> {
  const esito = await operazioni.creaCliente(nucleo(ctx), {
    nome: input.nome,
    cognome: input.cognome || null,
    email: input.email || null,
    telefono: input.telefono || null,
    instagram_handle: input.instagram_handle || null,
    fonte: input.fonte || null,
    setter_id: input.setter_id || null,
    closer_id: input.closer_id || null,
    note: input.note || null,
  })
  if (!esito.ok) return no(esito.errore)
  return ok({
    esito: 'creato',
    client_id: esito.id,
    nota: 'Il cliente nasce senza percorso (mai attivato): la vendita si registra con registra_vendita.',
  })
}

export async function modificaCliente(input: ModificaClienteInput, ctx: ContestoMcp): Promise<EsitoStrumento> {
  const { data, error } = await ctx.db
    .from('clients')
    .select('id, nome, cognome, email, telefono, instagram_handle, fonte, setter_id, closer_id, note')
    .eq('id', input.client_id)
    .maybeSingle()
  if (error) throw new LetturaNonRiuscita(error.code ?? 'errore')
  if (!data) return no(CLIENTE_NON_TROVATO, 'non_trovato')
  if (input.nome === '') return no('Il nome del cliente non si svuota.')
  const esito = await operazioni.aggiornaCliente(nucleo(ctx), {
    id: data.id,
    nome: input.nome ?? data.nome,
    cognome: detto(input.cognome, data.cognome),
    email: detto(input.email, data.email),
    telefono: detto(input.telefono, data.telefono),
    instagram_handle: detto(input.instagram_handle, data.instagram_handle),
    fonte: detto(input.fonte, data.fonte),
    setter_id: detto(input.setter_id, data.setter_id),
    closer_id: detto(input.closer_id, data.closer_id),
    note: detto(input.note, data.note),
  })
  if (!esito.ok) return no(esito.errore)
  return ok({ esito: 'salvato', client_id: data.id })
}

// ── stato_cliente ────────────────────────────────────────────────────────────
export async function statoCliente(input: StatoClienteInput, ctx: ContestoMcp): Promise<EsitoStrumento> {
  const n = nucleo(ctx)
  const client_id = input.client_id
  if ((input.giorno || input.motivo) && input.azione !== 'non_rinnova' && input.azione !== 'sospendi') {
    return no('Giorno e motivo valgono solo con non_rinnova o sospendi.')
  }
  switch (input.azione) {
    case 'non_rinnova': {
      const esito = await operazioni.chiudiCliente(n, { client_id, chiuso_il: input.giorno ?? oggiRoma(), motivo: input.motivo ?? null })
      return esito.ok ? ok({ esito: 'chiuso', client_id, stato: E.statoCliente.chiuso }) : no(esito.errore)
    }
    case 'riapri': {
      const esito = await operazioni.riapriCliente(n, { client_id })
      return esito.ok ? ok({ esito: 'riaperto', client_id, nota: 'Lo stato torna dalle date delle vendite.' }) : no(esito.errore)
    }
    case 'archivia': {
      const esito = await operazioni.archiviaCliente(n, { client_id })
      if (!esito.ok) return no(esito.errore)
      return ok({
        esito: esito.gia ? 'già_archiviato' : 'archiviato',
        client_id,
        stato: E.statoCliente.ex_cliente,
        archiviato_il: esito.archiviato_il,
      })
    }
    case 'togli_archivio': {
      const esito = await operazioni.togliDallArchivio(n, { client_id })
      return esito.ok ? ok({ esito: 'tolto_dall_archivio', client_id, stato: E.statoCliente.chiuso }) : no(esito.errore)
    }
    case 'sospendi': {
      const esito = await operazioni.sospendiCliente(n, { client_id, sospeso_il: input.giorno ?? oggiRoma(), motivo: input.motivo ?? null })
      return esito.ok
        ? ok({ esito: 'sospeso', client_id, stato: E.statoCliente.sospeso, nota: 'Percorso e rate non cambiano.' })
        : no(esito.errore)
    }
    case 'riattiva': {
      const esito = await operazioni.riattivaCliente(n, { client_id })
      return esito.ok ? ok({ esito: 'riattivato', client_id, nota: 'Lo stato torna dalle date delle vendite.' }) : no(esito.errore)
    }
  }
}
