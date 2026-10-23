import 'server-only'

import { createHash } from 'node:crypto'

import { aggiungiGiorni, oggiRoma } from '@/lib/date'
import { formatData, formatEuro } from '@/lib/format'
import { ETICHETTE } from '@/lib/i18n/testi/etichette'
import type { Database } from '@/lib/supabase/database.types'
import * as operazioni from '@/lib/vendite/operazioni'
import { GIORNI_INIZIO_PRIMA, PERSONALIZZATO, inizioMassimo, inizioPredefinito } from '@/lib/validation/vendita'

import { VALUTA, statoRata } from './clienti'
import type { EsitoStrumento } from './contenuti'
import type { ContestoMcp } from './contesto'
import type {
  AggiungiRataInput,
  AnteprimaInterruzioneInput,
  AnteprimaRimborsoInput,
  ElencoVenditeInput,
  IncassiInput,
  InterrompiPercorsoInput,
  LeggiVenditaInput,
  MieiClientiInput,
  ModificaVenditaInput,
  RataInput,
  RegistraRimborsoInput,
  RegistraVenditaInput,
} from './schemi-vendite'

/**
 * What the MCP tools on sales, instalments and cash-ins do (Claude a 360
 * gradi, phase 3, 23/10/2026). Reads go through ctx.db, the person's own OAuth
 * token (RLS decides, never the service role): the closer reads only the sales
 * he closed (and the clients only embedded, name and surname: never contacts,
 * method of payment or notes, as Alfire's mie_vendite), the setter only his
 * two functions (mie_vendite_setter, incassi_clienti_setter: never the
 * percentage of his rule), the admin and the business coach everything.
 * Writes go through the shared core of the app (lib/vendite/operazioni.ts),
 * the same schemas, guards and sentences as the server actions of /sales and
 * Alfire. Totals come from SQL (v_vendite, da_incassare, da_incassare_closer,
 * incassi_clienti_setter): nothing is summed here. Nothing is deleted from
 * here: no sale, no instalment. A refund and the interruption of a path need
 * the preview first: its code binds the write to the consequences shown.
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

/** The core of sales with the token's client and the person behind it. */
function nucleo(ctx: ContestoMcp): operazioni.Contesto {
  return { db: ctx.db, chi: async () => ({ id: ctx.persona, ruolo: ctx.ruolo, attivo: true }) }
}

const VENDITA_NON_TROVATA = 'Questa vendita non c’è, o non è tra quelle che vedi.'
const RATA_NON_TROVATA = 'Questa rata non c’è, o non è tra quelle che vedi.'
const ANTEPRIMA_CAMBIATA =
  'Nel frattempo qualcosa è cambiato, o i valori non sono quelli dell’anteprima: chiedi di nuovo l’anteprima, mostrala alla persona e riprova.'

const euro = (v: number | string | null | undefined): number | null => (v === null || v === undefined ? null : Number(v))

/** Who sees which sales: said first in the result. */
function diChi(ctx: ContestoMcp): string {
  return ctx.ruolo === 'closer'
    ? 'Le vendite chiuse dalla persona con cui parli, il closer: mai quelle degli altri.'
    : 'Tutte le vendite.'
}

/** The admin (and the business coach) read method of payment, notes and the contract; the closer never. */
const vedeTutto = (ctx: ContestoMcp) => ctx.ruolo !== 'closer'

async function nomi(ctx: ContestoMcp, ids: Iterable<string | null | undefined>): Promise<Map<string, string>> {
  const unici = [...new Set([...ids].filter((x): x is string => Boolean(x)))]
  if (unici.length === 0) return new Map()
  const righe = controlla(await ctx.db.from('profiles').select('id, nome').in('id', unici))
  return new Map(righe.map((r) => [r.id, r.nome]))
}

const persona = (mappa: Map<string, string>, id: string | null) => (id ? (mappa.get(id) ?? 'Persona non più nel team') : null)

const nomeCliente = (c: { nome: string | null; cognome: string | null } | null) =>
  [c?.nome, c?.cognome].filter(Boolean).join(' ') || 'Cliente'

/** A short opaque code that binds a write to the preview Claude showed (16 hex, as versioneOpaca). */
export function codiceAnteprima(...parti: unknown[]): string {
  return createHash('sha256').update(JSON.stringify(parti), 'utf8').digest('hex').slice(0, 16)
}

// ── elenco_vendite ───────────────────────────────────────────────────────────
export async function elencoVendite(input: ElencoVenditeInput, ctx: ContestoMcp): Promise<EsitoStrumento> {
  const limite = input.limite ?? 30
  let q = ctx.db
    .from('v_vendite')
    .select(
      'sale_id, client_id, tipo, setter_id, closer_id, data_vendita, data_inizio, data_fine, valore_contratto, numero_rate, incassato, da_incassare, in_ritardo, rate_incassate, rate_totali, rate_in_ritardo, prossima_scadenza',
      { count: 'exact' },
    )
    .order('data_vendita', { ascending: false })
    .order('sale_id')
    .limit(limite)
  if (input.da) q = q.gte('data_vendita', input.da)
  if (input.a) q = q.lte('data_vendita', input.a)
  if (input.tipo) q = q.eq('tipo', input.tipo)
  if (input.client_id) q = q.eq('client_id', input.client_id)
  if (input.setter_id && ctx.ruolo !== 'closer') q = q.eq('setter_id', input.setter_id)
  if (input.closer_id && ctx.ruolo !== 'closer') q = q.eq('closer_id', input.closer_id)
  if (input.da_incassare) q = q.gt('da_incassare', 0)
  const lette = await q
  const righe = controlla(lette)
  const totale = lette.count ?? righe.length
  const ids = righe.map((r) => r.sale_id).filter((x): x is string => Boolean(x))
  // the client's name and the product through the sale: the closer never reads the clients table
  const [dettagli, persone] = await Promise.all([
    ids.length
      ? ctx.db.from('sales').select('id, prodotto_personalizzato, cliente:clients(nome, cognome), prodotto:products(nome)').in('id', ids)
      : Promise.resolve({ data: [], error: null }),
    nomi(ctx, righe.flatMap((r) => [r.setter_id, r.closer_id])),
  ])
  const perId = new Map(controlla(dettagli).map((d) => [d.id, d]))
  return ok({
    di_chi: diChi(ctx),
    valuta: VALUTA,
    ...(input.da || input.a ? { periodo: { da: input.da ?? null, a: input.a ?? null } } : {}),
    totale,
    vendite: righe.map((r) => {
      const d = r.sale_id ? perId.get(r.sale_id) : undefined
      return {
        sale_id: r.sale_id,
        client_id: r.client_id,
        cliente: nomeCliente(d?.cliente ?? null),
        tipo: r.tipo ? E.tipoVendita[r.tipo] : null,
        prodotto: d?.prodotto?.nome ?? d?.prodotto_personalizzato ?? null,
        venduta_il: r.data_vendita,
        percorso: { inizio: r.data_inizio, fine: r.data_fine },
        setter: persona(persone, r.setter_id),
        closer: persona(persone, r.closer_id),
        contratto: euro(r.valore_contratto),
        incassato: euro(r.incassato),
        da_incassare: euro(r.da_incassare),
        ...(Number(r.in_ritardo ?? 0) > 0 ? { in_ritardo: euro(r.in_ritardo), rate_in_ritardo: r.rate_in_ritardo } : {}),
        rate_pagate: `${r.rate_incassate ?? 0} di ${r.rate_totali ?? r.numero_rate}`,
        ...(r.prossima_scadenza ? { prossima_scadenza: r.prossima_scadenza } : {}),
      }
    }),
    nota:
      'Importi in euro per vendita, dal SQL: non sommarli tra vendite; quanto resta da incassare in tutto lo dà da_incassare.' +
      (totale > righe.length ? ` Qui ${righe.length} vendite su ${totale}: restringi con il periodo, il tipo o il cliente.` : ''),
  })
}

// ── leggi_vendita ────────────────────────────────────────────────────────────
type RigaVendita = {
  id: string
  client_id: string
  tipo: Database['public']['Enums']['sale_type']
  product_id: string | null
  prodotto_personalizzato: string | null
  data_vendita: string
  data_inizio: string
  data_fine: string
  valore_contratto: number
  numero_rate: number
  call_id: string | null
  setter_id: string | null
  closer_id: string | null
  note: string | null
  updated_at: string
  cliente: { nome: string | null; cognome: string | null } | null
  prodotto: { nome: string } | null
}

async function leggiRigaVendita(ctx: ContestoMcp, id: string): Promise<RigaVendita | null> {
  return una(
    await ctx.db
      .from('sales')
      .select(
        'id, client_id, tipo, product_id, prodotto_personalizzato, data_vendita, data_inizio, data_fine, valore_contratto, numero_rate, call_id, setter_id, closer_id, note, updated_at, cliente:clients(nome, cognome), prodotto:products(nome)',
      )
      .eq('id', id)
      .maybeSingle(),
  ) as RigaVendita | null
}

export async function leggiVendita(input: LeggiVenditaInput, ctx: ContestoMcp): Promise<EsitoStrumento> {
  const v = await leggiRigaVendita(ctx, input.sale_id)
  if (!v) return no(VENDITA_NON_TROVATA, 'non_trovato')
  const tutto = vedeTutto(ctx)
  const [importi, rate, contratto, persone] = await Promise.all([
    ctx.db
      .from('v_vendite')
      .select('incassato, da_incassare, in_ritardo, rate_incassate, rate_totali, rate_in_ritardo, prossima_scadenza, totale_piano, scarto_piano')
      .eq('sale_id', v.id)
      .maybeSingle(),
    ctx.db
      .from('payments')
      .select('id, numero_rata, scadenza, importo_previsto, stato, incassato_il, importo_incassato, metodo, note, created_at')
      .eq('sale_id', v.id)
      .order('numero_rata')
      .order('created_at'),
    // the contract on Drive: the admin's (and the business coach's), never the closer's
    tutto
      ? ctx.db.from('vendite_contratti').select('url').eq('sale_id', v.id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    nomi(ctx, [v.setter_id, v.closer_id]),
  ])
  const i = una(importi)
  const c = una(contratto)
  const oggi = oggiRoma()
  return ok({
    di_chi: diChi(ctx),
    valuta: VALUTA,
    vendita: {
      sale_id: v.id,
      client_id: v.client_id,
      cliente: nomeCliente(v.cliente),
      tipo: E.tipoVendita[v.tipo],
      prodotto: v.prodotto?.nome ?? v.prodotto_personalizzato,
      ...(v.product_id ? { product_id: v.product_id } : { fuori_catalogo: true }),
      venduta_il: v.data_vendita,
      percorso: { inizio: v.data_inizio, fine: v.data_fine },
      setter: persona(persone, v.setter_id),
      closer: persona(persone, v.closer_id),
      ...(v.call_id ? { call_id: v.call_id } : {}),
      contratto: euro(v.valore_contratto),
      numero_rate: v.numero_rate,
      ...(i
        ? {
            incassato: euro(i.incassato),
            da_incassare: euro(i.da_incassare),
            in_ritardo: euro(i.in_ritardo),
            rate_pagate: `${i.rate_incassate ?? 0} di ${i.rate_totali ?? v.numero_rate}`,
            ...(Number(i.scarto_piano ?? 0) !== 0 ? { piano_diverso_dal_contratto_di: euro(i.scarto_piano) } : {}),
          }
        : {}),
      ...(tutto && v.note?.trim() ? { note: v.note.trim() } : {}),
      ...(c ? { contratto_drive: c.url } : {}),
    },
    rate: controlla(rate).map((r) => ({
      payment_id: r.id,
      rata: r.numero_rata,
      scadenza: r.scadenza,
      stato: statoRata(r.stato, r.scadenza, oggi),
      importo_previsto: euro(r.importo_previsto),
      ...(r.incassato_il ? { incassata_il: r.incassato_il, importo_incassato: euro(r.importo_incassato) } : {}),
      ...(tutto && r.metodo ? { metodo: E.metodo[r.metodo] } : {}),
      ...(tutto && r.note?.trim() ? { note: r.note.trim() } : {}),
    })),
    nota:
      ctx.ruolo === 'closer'
        ? 'Sulle rate delle tue vendite registri, correggi e annulli l’incasso e segni fallite le rate; il piano rate (scadenze, importi, rate nuove) lo cambia l’admin.'
        : 'Importi in euro, dal SQL. Un rimborso è una riga a parte, con l’importo negativo.',
  })
}

// ── da_incassare ─────────────────────────────────────────────────────────────
export async function daIncassare(ctx: ContestoMcp): Promise<EsitoStrumento> {
  if (ctx.ruolo === 'closer') {
    const t = una(await ctx.db.rpc('da_incassare_closer').maybeSingle())
    return ok({
      di_chi: diChi(ctx),
      valuta: VALUTA,
      totale_da_incassare: t
        ? {
            totale: euro(t.totale),
            rate: t.numero_rate,
            vendite: t.vendite,
            in_ritardo: { importo: euro(t.in_ritardo), rate: t.numero_in_ritardo },
            prossimi_30_giorni: { importo: euro(t.prossimi_30), rate: t.numero_prossimi_30 },
            oltre_30_giorni: { importo: euro(t.oltre), rate: t.numero_oltre },
          }
        : null,
      nota: 'Le rate ancora da incassare di tutte le sue vendite, già sommate dal SQL: usa questi totali, non sommare le vendite. Una rata fallita non conta.',
    })
  }
  const [fasce, ritardi] = await Promise.all([
    ctx.db.rpc('da_incassare'),
    ctx.db
      .from('v_rate')
      .select('payment_id, sale_id, client_id, cliente, numero_rata, scadenza, importo_previsto, giorni_ritardo', { count: 'exact' })
      .eq('in_ritardo', true)
      .order('scadenza')
      .limit(25),
  ])
  const righe = controlla(ritardi)
  const totaleRitardi = ritardi.count ?? righe.length
  const parola: Record<string, string> = { in_ritardo: 'in ritardo', prossimi_30: 'prossimi 30 giorni', oltre: 'oltre 30 giorni' }
  return ok({
    di_chi: 'Tutte le rate ancora da incassare.',
    valuta: VALUTA,
    per_fascia: controlla(fasce).map((f) => ({ fascia: parola[f.fascia] ?? f.fascia, importo: euro(f.totale), rate: f.numero })),
    rate_in_ritardo: righe.map((r) => ({
      payment_id: r.payment_id,
      sale_id: r.sale_id,
      client_id: r.client_id,
      cliente: r.cliente,
      rata: r.numero_rata,
      scadenza: r.scadenza,
      importo: euro(r.importo_previsto),
      giorni_di_ritardo: r.giorni_ritardo,
    })),
    nota:
      'per_fascia sono i totali del SQL: usa quelli, non sommare le rate.' +
      (totaleRitardi > righe.length ? ` Qui le ${righe.length} rate in ritardo più vecchie su ${totaleRitardi}: le altre con incassi.` : ''),
  })
}

// ── incassi ──────────────────────────────────────────────────────────────────
export async function incassi(input: IncassiInput, ctx: ContestoMcp): Promise<EsitoStrumento> {
  const limite = input.limite ?? 50
  const perIncasso = input.stato === 'incassata' || input.stato === 'rimborsata'
  const giorno = perIncasso ? 'incassato_il' : 'scadenza'
  let q = ctx.db
    .from('v_rate')
    .select(
      'payment_id, sale_id, client_id, cliente, tipo, numero_rata, scadenza, importo_previsto, stato, incassato_il, importo_incassato, metodo, in_ritardo, giorni_ritardo',
      { count: 'exact' },
    )
    .order(giorno, { ascending: !perIncasso })
    .order('payment_id')
    .limit(limite)
  if (input.stato) q = q.eq('stato', input.stato)
  if (input.in_ritardo) q = q.eq('in_ritardo', true)
  if (input.da) q = q.gte(giorno, input.da)
  if (input.a) q = q.lte(giorno, input.a)
  if (input.client_id) q = q.eq('client_id', input.client_id)
  const lette = await q
  const righe = controlla(lette)
  const totale = lette.count ?? righe.length
  const oggi = oggiRoma()
  return ok({
    valuta: VALUTA,
    totale,
    rate: righe.map((r) => ({
      payment_id: r.payment_id,
      sale_id: r.sale_id,
      client_id: r.client_id,
      cliente: r.cliente,
      vendita: r.tipo ? E.tipoVendita[r.tipo] : null,
      rata: r.numero_rata,
      scadenza: r.scadenza,
      stato: r.stato && r.scadenza ? statoRata(r.stato, r.scadenza, oggi) : r.stato,
      importo_previsto: euro(r.importo_previsto),
      ...(r.incassato_il ? { incassata_il: r.incassato_il, importo_incassato: euro(r.importo_incassato) } : {}),
      ...(r.metodo ? { metodo: E.metodo[r.metodo] } : {}),
      ...(r.in_ritardo ? { giorni_di_ritardo: r.giorni_ritardo } : {}),
    })),
    nota:
      'Una rata per riga, dal SQL: non sommare le righe; i totali da incassare li dà da_incassare.' +
      (totale > righe.length ? ` Qui ${righe.length} rate su ${totale}: restringi con lo stato, il periodo o il cliente.` : ''),
  })
}

// ── miei_clienti (the setter) ────────────────────────────────────────────────
type RigaSetter = Database['public']['Functions']['mie_vendite_setter']['Returns'][number]

const NON_PREVISTA: Record<RigaSetter['tipo'], string> = {
  nuovo: 'non prevista (nessuna regola)',
  rinnovo: 'non prevista (rinnovo)',
  upsell: 'non prevista (upsell)',
}

/** What the sale gave him, as I miei numeri says it: the commission matured, or why there is none. */
function aTeVendita(v: RigaSetter): number | string {
  const maturata = v.provvigione_vendita as number | null
  if (maturata !== null) return Number(maturata)
  return v.provvigione_prevista ? 'matura quando paga' : NON_PREVISTA[v.tipo]
}

function aTeRata(r: RigaSetter): number | string {
  const maturata = r.provvigione as number | null
  if (maturata !== null) return Number(maturata)
  return r.provvigione_prevista && (r.stato === 'prevista' || r.stato === 'fallita') ? 'matura quando paga' : 'non prevista'
}

function statoRataCliente(r: RigaSetter): string {
  if (r.stato === 'incassata') return 'pagata'
  if (r.stato === 'rimborsata') return 'rimborsata'
  if (r.stato === 'fallita') return 'pagamento non andato a buon fine'
  return r.in_ritardo ? 'in ritardo' : 'da pagare'
}

const normale = (t: string) =>
  t
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()

export async function mieiClienti(input: MieiClientiInput, ctx: ContestoMcp): Promise<EsitoStrumento> {
  const oggi = oggiRoma()
  const periodo = input.da || input.a ? { da: input.da ?? '2000-01-01', a: input.a ?? oggi } : null
  if (periodo && periodo.da > periodo.a) return no('Il periodo va dal giorno più vecchio al più recente.')
  const [righe, totale] = await Promise.all([
    ctx.db.rpc('mie_vendite_setter'),
    periodo && !input.cerca ? ctx.db.rpc('incassi_clienti_setter', { p_da: periodo.da, p_a: periodo.a }).maybeSingle() : null,
  ])
  const tutte = controlla(righe)
  const t = totale ? una(totale) : null

  // one sale, its instalments, in the SQL's order (the newest sale first)
  const perVendita = new Map<string, RigaSetter[]>()
  for (const r of tutte) perVendita.set(r.sale_id, [...(perVendita.get(r.sale_id) ?? []), r])
  let vendite = [...perVendita.values()]
  if (input.cerca) {
    const cerca = normale(input.cerca)
    vendite = vendite.filter((rate) => normale(rate[0].cliente).includes(cerca))
    if (vendite.length === 0) {
      return ok({ di_chi: DI_CHI_SETTER, valuta: VALUTA, vendite: [], nota: `Nessun cliente «${input.cerca.trim()}» tra quelli che hai portato.` })
    }
  }

  if (periodo) {
    const incassiDelPeriodo = vendite
      .flat()
      .filter((x) => (x.stato === 'incassata' || x.stato === 'rimborsata') && x.incassato_il && x.incassato_il >= periodo.da && x.incassato_il <= periodo.a)
      .sort((x, y) => (x.incassato_il === y.incassato_il ? 0 : (x.incassato_il ?? '') < (y.incassato_il ?? '') ? 1 : -1))
    return ok({
      di_chi: DI_CHI_SETTER,
      valuta: VALUTA,
      periodo,
      ...(t
        ? {
            totale_periodo: {
              pagato_netto: euro(t.incassato),
              incassi: t.numero_incassi,
              ...(t.numero_rimborsi > 0 ? { rimborsi: t.numero_rimborsi, rimborsato: euro(t.rimborsato) } : {}),
              clienti: t.clienti,
              provvigione_maturata: euro(t.provvigione),
            },
          }
        : {}),
      incassi: incassiDelPeriodo.slice(0, 60).map((x) => ({
        cliente: x.cliente,
        tipo: E.tipoVendita[x.tipo],
        rata: `${x.numero_rata} di ${x.numero_rate}`,
        stato: statoRataCliente(x),
        pagata_il: x.incassato_il,
        importo: euro(x.importo_incassato),
        a_te: aTeRata(x),
      })),
      nota: t
        ? 'Un incasso per riga; il totale del periodo è totale_periodo, dal SQL: usa quello, non sommare le righe.'
        : 'Un incasso per riga, dal SQL: non sommarli; il totale di tutti i tuoi clienti nel periodo lo dai chiedendo senza cerca.',
    })
  }

  return ok({
    di_chi: DI_CHI_SETTER,
    valuta: VALUTA,
    vendite: vendite.slice(0, 25).map((rate) => {
      const v = rate[0]
      return {
        cliente: v.cliente,
        prodotto: v.prodotto,
        tipo: E.tipoVendita[v.tipo],
        venduta_il: v.data_vendita,
        revenue: euro(v.valore_contratto),
        // since the sale began, never a period's
        pagato_in_tutto: euro(v.incassato_vendita),
        rate_pagate: `${v.rate_incassate} di ${v.numero_rate}`,
        ...(v.rate_in_ritardo > 0 ? { rate_in_ritardo: v.rate_in_ritardo } : {}),
        a_te: aTeVendita(v),
        ...(input.cerca
          ? {
              rate: rate.map((r) => ({
                rata: r.numero_rata,
                stato: statoRataCliente(r),
                scadenza: r.scadenza,
                ...(r.incassato_il ? { pagata_il: r.incassato_il } : {}),
                importo: euro(r.importo_incassato ?? r.importo_previsto),
                a_te: aTeRata(r),
              })),
            }
          : {}),
      }
    }),
    nota:
      vendite.length > 25
        ? 'Qui le 25 vendite più recenti: per un cliente, chiedi con cerca; quanto hanno pagato in un periodo, con da e a.'
        : 'Importi per vendita, dal SQL: non sommarli. Le rate e la provvigione di ogni incasso: chiedi con cerca. Quanto hanno pagato in un periodo: con da e a.',
  })
}

const DI_CHI_SETTER =
  'I clienti portati dalla persona con cui parli, il setter (le vendite col suo nome), come I miei numeri › I tuoi clienti: mai i clienti di altri, i loro contatti, il metodo di pagamento o le note.'

// ── registra_vendita ─────────────────────────────────────────────────────────
/** «Ha rinnovato»: the new path starts the day after the last one, or today when that is out of the window. */
async function inizioRinnovo(ctx: ContestoMcp, clientId: string, dataVendita: string): Promise<string> {
  const c = una(await ctx.db.from('v_clienti').select('data_fine_ultima').eq('client_id', clientId).maybeSingle())
  if (!c?.data_fine_ultima) return dataVendita
  const giornoDopo = aggiungiGiorni(c.data_fine_ultima, 1)
  if (giornoDopo < aggiungiGiorni(dataVendita, -GIORNI_INIZIO_PRIMA) || giornoDopo > inizioMassimo('rinnovo', dataVendita)) {
    return dataVendita
  }
  return giornoDopo
}

export async function registraVendita(input: RegistraVenditaInput, ctx: ContestoMcp): Promise<EsitoStrumento> {
  if (ctx.ruolo === 'closer' && input.client_id) {
    return no('Un cliente che c’è già lo sceglie l’admin: registra la vendita della tua call (call_id) o di un cliente nuovo.')
  }
  if (input.rate && input.numero_rate && input.numero_rate !== input.rate.length) {
    return no('O le rate scritte a mano, o il numero di rate uguali: non tutti e due diversi.')
  }
  if (input.product_id && input.prodotto_personalizzato) {
    return no('O un prodotto del catalogo, o un percorso fuori catalogo: non tutti e due.')
  }
  const oggi = oggiRoma()
  // a sale from a closed call, as the app's form prefills it: signed on the call's day (never in the
  // future), the new client named as the lead (the database keeps the lead's client when there is one)
  let dataVendita = input.data_vendita ?? oggi
  let prefill: { nome: string | null; cognome: string | null; instagram_handle: string | null } = {
    nome: null,
    cognome: null,
    instagram_handle: null,
  }
  if (input.call_id) {
    const call = una(await ctx.db.rpc('call_per_claude', { p_id: input.call_id }).maybeSingle())
    if (!call) return no('Questa call non c’è, o non è tra quelle che vedi.', 'non_trovato')
    if (!input.data_vendita && call.programmata_il) {
      const giorno = oggiRoma(new Date(call.programmata_il))
      dataVendita = giorno < oggi ? giorno : oggi
    }
    const [nome = '', ...resto] = (call.lead_nome ?? '').trim().split(/\s+/)
    prefill = { nome: nome || null, cognome: resto.join(' ') || null, instagram_handle: call.lead_handle ?? null }
  }
  const dataInizio =
    input.data_inizio ??
    (input.tipo === 'rinnovo' && input.client_id ? await inizioRinnovo(ctx, input.client_id, dataVendita) : inizioPredefinito(dataVendita))
  const esito = await operazioni.registraVendita(nucleo(ctx), {
    call_id: input.call_id ?? null,
    client_id: input.client_id ?? null,
    nome: input.nome ?? prefill.nome,
    cognome: input.nome ? (input.cognome ?? null) : (input.cognome ?? prefill.cognome),
    email: input.email ?? null,
    telefono: input.telefono ?? null,
    instagram_handle: input.instagram_handle ?? prefill.instagram_handle,
    tipo: input.tipo,
    product_id: input.product_id ?? (input.prodotto_personalizzato ? PERSONALIZZATO : null),
    prodotto_personalizzato: input.prodotto_personalizzato ?? null,
    data_fine: input.data_fine ?? null,
    piano: input.rate ? 'personalizzato' : 'uguale',
    rate: input.rate ?? [],
    valore_contratto: input.valore_contratto,
    numero_rate: input.rate ? input.rate.length : (input.numero_rate ?? 1),
    data_vendita: dataVendita,
    data_inizio: dataInizio,
    note: input.note ?? null,
  })
  if (!esito.ok) {
    const campi = esito.campi ? Object.values(esito.campi).filter(Boolean).join(' ') : ''
    return no(campi ? `${esito.errore} ${campi}` : esito.errore)
  }
  const dopo = await leggiVendita({ sale_id: esito.idVendita }, ctx)
  return ok({
    esito: 'registrata',
    ...(esito.clienteNuovo ? { cliente_nuovo: true } : {}),
    nota: 'Setter e closer li decide il database: quelli della call, o per una vendita nuova il setter del cliente. Controlla l’inizio del percorso.',
    ...(dopo.ok ? dopo.dati : { sale_id: esito.idVendita }),
  })
}

// ── modifica_vendita ─────────────────────────────────────────────────────────
export async function modificaVendita(input: ModificaVenditaInput, ctx: ContestoMcp): Promise<EsitoStrumento> {
  const v = await leggiRigaVendita(ctx, input.sale_id)
  if (!v) return no(VENDITA_NON_TROVATA, 'non_trovato')
  if (input.product_id && input.prodotto_personalizzato) {
    return no('O un prodotto del catalogo, o un percorso fuori catalogo: non tutti e due.')
  }
  const detto = <T>(valore: T | '' | null | undefined, salvato: T | null): T | null =>
    valore === undefined || valore === null ? salvato : valore === '' ? null : valore
  const personalizzato = input.prodotto_personalizzato ?? (input.product_id ? null : v.product_id ? null : v.prodotto_personalizzato)
  const esito = await operazioni.modificaVendita(nucleo(ctx), {
    id: v.id,
    tipo: input.tipo ?? v.tipo,
    product_id: input.product_id ?? (input.prodotto_personalizzato ? PERSONALIZZATO : (v.product_id ?? PERSONALIZZATO)),
    prodotto_personalizzato: personalizzato,
    valore_contratto: input.valore_contratto ?? Number(v.valore_contratto),
    data_vendita: input.data_vendita ?? v.data_vendita,
    data_inizio: input.data_inizio ?? v.data_inizio,
    data_fine: input.data_fine ?? v.data_fine,
    setter_id: detto(input.setter_id, v.setter_id),
    closer_id: detto(input.closer_id, v.closer_id),
    note: detto(input.note, v.note),
  })
  if (!esito.ok) return no(esito.errore)
  const dopo = await leggiVendita({ sale_id: v.id }, ctx)
  return ok({
    esito: 'salvata',
    nota: 'Le rate restano come sono: ognuna si corregge a parte (rata, azione modifica).',
    ...(dopo.ok ? dopo.dati : { sale_id: v.id }),
  })
}

// ── «Interrompi il percorso»: the preview, then the write bound to it ────────
async function previewInterruzione(input: AnteprimaInterruzioneInput, ctx: ContestoMcp) {
  const v = await leggiRigaVendita(ctx, input.sale_id)
  if (!v) return { ok: false as const, errore: VENDITA_NON_TROVATA }
  const esito = await operazioni.anteprimaInterruzione(nucleo(ctx), input)
  if (!esito.ok) return esito
  const a = esito.anteprima
  const codice = codiceAnteprima('interruzione', input.sale_id, input.ultimo_giorno, input.togli_rate, v.updated_at, a)
  return { ok: true as const, v, anteprima: a, codice }
}

function righeInterruzione(v: RigaVendita, input: AnteprimaInterruzioneInput, a: operazioni.AnteprimaInterruzione): string[] {
  return [
    `Il percorso di ${nomeCliente(v.cliente)} (${E.tipoVendita[v.tipo]}, dal ${formatData(v.data_inizio)} al ${formatData(v.data_fine)}) finisce il ${formatData(input.ultimo_giorno)}.`,
    input.togli_rate
      ? a.rate_tolte > 0
        ? `Se ne vanno ${a.rate_tolte === 1 ? 'la rata non pagata' : `le ${a.rate_tolte} rate non pagate`} dopo quel giorno (${formatEuro(a.importo_tolto)}): il contratto passa da ${formatEuro(a.valore_prima)} a ${formatEuro(a.valore_dopo)}.`
        : 'Nessuna rata non pagata dopo quel giorno: il contratto resta com’è.'
      : 'Le rate non pagate restano da incassare.',
    'Gli incassi già fatti non cambiano.',
    'Niente «Call dei 3 mesi» né «Call di rinnovo» per questo percorso.',
  ]
}

export async function anteprimaInterruzione(input: AnteprimaInterruzioneInput, ctx: ContestoMcp): Promise<EsitoStrumento> {
  const p = await previewInterruzione(input, ctx)
  if (!p.ok) return no(p.errore)
  return ok({
    valuta: VALUTA,
    anteprima: {
      rate_tolte: p.anteprima.rate_tolte,
      importo_tolto: euro(p.anteprima.importo_tolto),
      contratto_prima: euro(p.anteprima.valore_prima),
      contratto_dopo: euro(p.anteprima.valore_dopo),
    },
    cosa_cambia: righeInterruzione(p.v, input, p.anteprima),
    codice_anteprima: p.codice,
    nota: 'Niente è cambiato. Mostra queste righe alla persona; se dice sì, interrompi_percorso con gli stessi valori e questo codice.',
  })
}

export async function interrompiPercorso(input: InterrompiPercorsoInput, ctx: ContestoMcp): Promise<EsitoStrumento> {
  const { codice_anteprima, ...valori } = input
  const p = await previewInterruzione(valori, ctx)
  if (!p.ok) return no(p.errore)
  if (p.codice !== codice_anteprima) return no(ANTEPRIMA_CAMBIATA, 'cambiato')
  const esito = await operazioni.interrompiPercorso(nucleo(ctx), valori)
  if (!esito.ok) return no(esito.errore)
  return ok({ esito: 'interrotto', sale_id: input.sale_id, cosa_e_cambiato: righeInterruzione(p.v, valori, p.anteprima) })
}

// ── refund: the preview, then the write bound to it ──────────────────────────
type RigaRata = {
  id: string
  sale_id: string
  numero_rata: number
  scadenza: string
  importo_previsto: number
  stato: Database['public']['Enums']['payment_status']
  incassato_il: string | null
  importo_incassato: number | null
  updated_at: string
}

async function leggiRata(ctx: ContestoMcp, id: string): Promise<RigaRata | null> {
  return una(
    await ctx.db
      .from('payments')
      .select('id, sale_id, numero_rata, scadenza, importo_previsto, stato, incassato_il, importo_incassato, updated_at')
      .eq('id', id)
      .maybeSingle(),
  ) as RigaRata | null
}

async function previewRimborso(input: AnteprimaRimborsoInput, ctx: ContestoMcp) {
  const r = await leggiRata(ctx, input.payment_id)
  if (!r) return { ok: false as const, errore: RATA_NON_TROVATA }
  if (r.stato !== 'incassata') return { ok: false as const, errore: 'Si rimborsa solo una rata incassata.' }
  const v = await leggiRigaVendita(ctx, r.sale_id)
  if (!v) return { ok: false as const, errore: RATA_NON_TROVATA }
  const righe = [
    `Rimborso di ${formatEuro(input.importo)} a ${nomeCliente(v.cliente)}, rata ${r.numero_rata} di ${v.numero_rate} (${E.tipoVendita[v.tipo]}), incassata il ${r.incassato_il ? formatData(r.incassato_il) : '?'} per ${formatEuro(r.importo_incassato)}.`,
    `Rimborsato il ${formatData(input.data)}: è una riga a parte, con l’importo negativo, nel cash di quel mese.`,
    v.setter_id
      ? 'Se il setter della vendita ha una regola, la sua provvigione torna indietro nel mese del rimborso.'
      : 'La vendita non ha un setter: nessuna provvigione cambia.',
    'La rata incassata resta com’è.',
  ]
  const codice = codiceAnteprima('rimborso', input.payment_id, input.importo, input.data, input.note ?? null, r.updated_at, r.stato)
  return { ok: true as const, righe, codice }
}

export async function anteprimaRimborso(input: AnteprimaRimborsoInput, ctx: ContestoMcp): Promise<EsitoStrumento> {
  const p = await previewRimborso(input, ctx)
  if (!p.ok) return no(p.errore)
  return ok({
    valuta: VALUTA,
    cosa_cambia: p.righe,
    codice_anteprima: p.codice,
    nota: 'Niente è cambiato. Mostra queste righe alla persona; se dice sì, registra_rimborso con gli stessi valori e questo codice.',
  })
}

export async function registraRimborso(input: RegistraRimborsoInput, ctx: ContestoMcp): Promise<EsitoStrumento> {
  const { codice_anteprima, ...valori } = input
  const p = await previewRimborso(valori, ctx)
  if (!p.ok) return no(p.errore)
  if (p.codice !== codice_anteprima) return no(ANTEPRIMA_CAMBIATA, 'cambiato')
  const esito = await operazioni.registraRimborso(nucleo(ctx), {
    payment_id: valori.payment_id,
    data: valori.data,
    importo: valori.importo,
    note: valori.note ?? null,
  })
  if (!esito.ok) return no(esito.errore)
  return ok({ esito: 'registrato', valuta: VALUTA, importo: valori.importo, cosa_e_cambiato: p.righe })
}

// ── rata, aggiungi_rata ──────────────────────────────────────────────────────
export async function rata(input: RataInput, ctx: ContestoMcp): Promise<EsitoStrumento> {
  const n = nucleo(ctx)
  const fuori = (campi: (keyof RataInput)[], azioni: string) =>
    campi.some((c) => input[c] !== undefined && input[c] !== null) ? no(`Quei valori valgono solo con ${azioni}.`) : null
  let esito: operazioni.EsitoRata
  switch (input.azione) {
    case 'incassa': {
      const errore = fuori(['scadenza', 'importo_previsto'], 'modifica')
      if (errore) return errore
      esito = await operazioni.segnaIncassata(n, {
        payment_id: input.payment_id,
        incassato_il: input.incassato_il ?? null,
        importo: input.importo ?? null,
        metodo: input.metodo ?? null,
      })
      break
    }
    case 'correggi_incasso': {
      const errore = fuori(['scadenza', 'importo_previsto'], 'modifica')
      if (errore) return errore
      if (!input.incassato_il || !input.importo) return no('Per correggere l’incasso servono il giorno e l’importo incassato.')
      esito = await operazioni.modificaIncasso(n, {
        payment_id: input.payment_id,
        incassato_il: input.incassato_il,
        importo: input.importo,
        metodo: input.metodo ?? null,
      })
      break
    }
    case 'annulla_incasso':
    case 'fallita': {
      const errore = fuori(['incassato_il', 'importo', 'metodo', 'scadenza', 'importo_previsto'], 'incassa, correggi_incasso o modifica')
      if (errore) return errore
      esito =
        input.azione === 'annulla_incasso'
          ? await operazioni.annullaIncasso(n, { payment_id: input.payment_id })
          : await operazioni.segnaFallita(n, { payment_id: input.payment_id })
      break
    }
    case 'modifica': {
      if (ctx.ruolo !== 'admin') return no('Il piano rate lo modifica l’admin: tu registri gli incassi.')
      const errore = fuori(['incassato_il', 'importo', 'metodo'], 'incassa o correggi_incasso')
      if (errore) return errore
      const r = await leggiRata(ctx, input.payment_id)
      if (!r) return no(RATA_NON_TROVATA, 'non_trovato')
      esito = await operazioni.modificaRata(n, {
        payment_id: r.id,
        scadenza: input.scadenza ?? r.scadenza,
        importo_previsto: input.importo_previsto ?? Number(r.importo_previsto),
      })
      break
    }
  }
  if (!esito.ok) return no(esito.errore)
  const dopo = await leggiRata(ctx, input.payment_id)
  const oggi = oggiRoma()
  return ok({
    esito: 'salvata',
    valuta: VALUTA,
    rata: dopo
      ? {
          payment_id: dopo.id,
          sale_id: dopo.sale_id,
          rata: dopo.numero_rata,
          scadenza: dopo.scadenza,
          stato: statoRata(dopo.stato, dopo.scadenza, oggi),
          importo_previsto: euro(dopo.importo_previsto),
          ...(dopo.incassato_il ? { incassata_il: dopo.incassato_il, importo_incassato: euro(dopo.importo_incassato) } : {}),
        }
      : { payment_id: input.payment_id },
    ...(input.azione === 'incassa' ? { nota: 'Se è la prima rata incassata di un percorso, il progetto del cliente si apre (o si riapre) da solo, come nell’app.' } : {}),
  })
}

export async function aggiungiRata(input: AggiungiRataInput, ctx: ContestoMcp): Promise<EsitoStrumento> {
  const esito = await operazioni.aggiungiRata(nucleo(ctx), input)
  if (!esito.ok) return no(esito.errore === 'Vendita non trovata' ? VENDITA_NON_TROVATA : esito.errore)
  return ok({
    esito: 'aggiunta',
    valuta: VALUTA,
    sale_id: input.sale_id,
    ...(esito.id ? { payment_id: esito.id } : {}),
    nota: 'Le rate si rinumerano in ordine di scadenza; il contratto della vendita non cambia da solo: se va cambiato, modifica_vendita.',
  })
}

