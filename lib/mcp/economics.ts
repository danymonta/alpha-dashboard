import 'server-only'

import { ETICHETTA_LIVELLO_PM, ETICHETTA_RUOLO } from '@/lib/auth/roles'
import { aggiungiMesi, fineMese, isDataISO, oggiRoma, primoDelMeseISO } from '@/lib/date'
import * as operazioni from '@/lib/economics/operazioni'
import { VUOTO, formatPercentuale, formatRapporto } from '@/lib/format'
import { ETICHETTE } from '@/lib/i18n/testi/etichette'

import { VALUTA } from './clienti'
import type { EsitoStrumento } from './contenuti'
import type { ContestoMcp } from './contesto'
import type {
  CashMensileInput,
  CopiaRicorrentiInput,
  CostiInput,
  ImpostaObiettiviInput,
  MieProvvigioniInput,
  ModificaCostoInput,
  ModificaPagamentoInput,
  NumeriPerFonteInput,
  NumeriPeriodoInput,
  ObiettiviInput,
  PrevisioneCassaInput,
  ProvvigioniInput,
  ProvvigioniPerVenditaInput,
  RegistraCostoInput,
  RegistraPagamentoInput,
  RegolaProvvigioneInput,
  RegoleProvvigioniInput,
  TeamInput,
} from './schemi-economics'

/**
 * What the MCP tools on costs, commissions, the month's goals, the
 * Panoramica's economics and the team do (Claude a 360 gradi, phase 4,
 * 23/10/2026). Reads go through ctx.db, the person's own OAuth token (RLS
 * decides, never the service role): every number comes from the SQL functions
 * the pages call (metriche_periodo, kpi_periodo, funnel_periodo, cash_mensile,
 * da_incassare, previsione_cassa, avanzamento_obiettivi, metriche_per_fonte,
 * provvigioni_riepilogo, provvigioni_per_vendita, miei_numeri_periodo):
 * nothing is summed here, the ratios only formatted. The admin and the
 * business coach read everything; the setter only his own commissions, matured
 * and paid per month, through miei_numeri_periodo (never the rules, the
 * percentages or anybody else's). Writes go through the shared core of the app
 * (lib/economics/operazioni.ts), the same schemas, guards and sentences as the
 * server actions and Alfire. Nothing is deleted from here: no cost, payout,
 * rule or goal; the team is read only.
 */

const E = ETICHETTE.it

class LetturaNonRiuscita extends Error {
  constructor(readonly codice: string) {
    super('lettura non riuscita')
  }
}

type Risposta = { data: unknown; error: { code?: string; message?: string } | null }

/** A rule of ours worded for people (22023: a period that is not valid, for one) answers with its words. */
class RegolaSql extends Error {}

function controlla<R extends Risposta>(risposta: R): NonNullable<R['data']> {
  if (risposta.error) {
    if (risposta.error.code === '22023' && risposta.error.message) throw new RegolaSql(risposta.error.message)
    throw new LetturaNonRiuscita(risposta.error.code ?? 'errore')
  }
  return (risposta.data ?? []) as NonNullable<R['data']>
}

function una<R extends Risposta>(risposta: R): NonNullable<R['data']> | null {
  if (risposta.error) {
    if (risposta.error.code === '22023' && risposta.error.message) throw new RegolaSql(risposta.error.message)
    throw new LetturaNonRiuscita(risposta.error.code ?? 'errore')
  }
  return (risposta.data ?? null) as NonNullable<R['data']> | null
}

function ok(dati: Record<string, unknown>, esito?: string): EsitoStrumento {
  return { ok: true, dati, esito }
}

function no(messaggio: string, esito?: string): EsitoStrumento {
  return { ok: false, messaggio, esito }
}

/** A read whose SQL refuses the input with its own words (a period too long) says them. */
async function conRegole(f: () => Promise<EsitoStrumento>): Promise<EsitoStrumento> {
  try {
    return await f()
  } catch (e) {
    if (e instanceof RegolaSql) return no(e.message)
    throw e
  }
}

/** The core of the economics with the token's client and the person behind it. */
function nucleo(ctx: ContestoMcp): operazioni.Contesto {
  return { db: ctx.db, chi: async () => ({ id: ctx.persona, ruolo: ctx.ruolo, attivo: true }) }
}

const euro = (v: number | string | null | undefined): number | null => (v === null || v === undefined ? null : Number(v))
/** A ratio from SQL as the app prints it; null (denominator zero) is «–», never NaN. */
const quota = (v: number | string | null | undefined): string => (v === null || v === undefined ? VUOTO : formatPercentuale(v, { unDecimale: true }))
const rapportoTesto = (v: number | string | null | undefined): string => (v === null || v === undefined ? VUOTO : formatRapporto(v))
/** 'AAAA-MM' of a first-of-month date. */
const meseDi = (iso: string | null | undefined) => (iso ? iso.slice(0, 7) : null)

async function nomi(ctx: ContestoMcp, ids: Iterable<string | null | undefined>): Promise<Map<string, string>> {
  const unici = [...new Set([...ids].filter((x): x is string => Boolean(x)))]
  if (unici.length === 0) return new Map()
  const righe = controlla(await ctx.db.from('profiles').select('id, nome').in('id', unici))
  return new Map(righe.map((r) => [r.id, r.nome]))
}

const persona = (mappa: Map<string, string>, id: string | null) => (id ? (mappa.get(id) ?? 'Persona non più nel team') : null)

type Periodo = { da: string; a: string }

/** The period of the Panoramica: a month, a range, or the month in progress. */
export function periodoDi(input: { mese?: string | null; da?: string | null; a?: string | null }, oggi = oggiRoma()): Periodo | string {
  if (input.mese) {
    if (input.da || input.a) return 'O il mese, o da e a: non tutti e due.'
    const primo = `${input.mese}-01`
    return { da: primo, a: fineMese(primo) }
  }
  if (input.da || input.a) {
    if (!input.da || !input.a) return 'Servono da e a insieme (AAAA-MM-GG), o il mese (AAAA-MM).'
    if (!isDataISO(input.da) || !isDataISO(input.a)) return 'Data non valida: scrivila come AAAA-MM-GG.'
    if (input.da > input.a) return 'Il periodo va dal giorno più vecchio al più recente.'
    return { da: input.da, a: input.a }
  }
  const primo = primoDelMeseISO(oggi)
  return { da: primo, a: fineMese(primo) }
}

const MARGINE =
  'Margine operativo = cash incassato meno provvigioni maturate e costi del periodo, calcolato dal gestionale: non è l’utile, le tasse non ci sono.'

const VOCI_KPI: Record<string, string> = {
  cash_incassato: 'Cash incassato',
  revenue_firmata: 'Revenue firmata',
  nuovi_clienti: 'Nuovi clienti',
  rinnovi: 'Rinnovi',
  margine_operativo: 'Margine operativo',
}
const KPI_EURO = new Set(['cash_incassato', 'revenue_firmata', 'margine_operativo'])

// ── numeri_periodo ───────────────────────────────────────────────────────────
export async function numeriPeriodo(input: NumeriPeriodoInput, ctx: ContestoMcp): Promise<EsitoStrumento> {
  const p = periodoDi(input)
  if (typeof p === 'string') return no(p)
  return conRegole(async () => {
    const args = { p_da: p.da, p_a: p.a }
    const [metriche, kpi, funnel] = await Promise.all([
      ctx.db.rpc('metriche_periodo', args).maybeSingle(),
      ctx.db.rpc('kpi_periodo', args),
      ctx.db.rpc('funnel_periodo', args),
    ])
    const m = una(metriche)
    if (!m) return no('Nessun numero per questo periodo.')
    return ok({
      di_chi: 'I numeri di tutta l’azienda, come la Panoramica.',
      valuta: VALUTA,
      periodo: p,
      cash: {
        incassato: euro(m.cash_incassato),
        di_cui: {
          nuovi_clienti_del_periodo: euro(m.cash_nuovi_clienti),
          rate_di_clienti_gia_entrati: euro(m.cash_rate_precedenti),
          rinnovi: euro(m.cash_rinnovo),
          upsell: euro(m.cash_upsell),
        },
      },
      revenue: { firmata: euro(m.revenue_firmata), nuovi_clienti: euro(m.revenue_nuovi) },
      vendite: { totali: m.numero_vendite, nuovi_clienti: m.nuovi_clienti, rinnovi: m.rinnovi },
      provvigioni_maturate: euro(m.provvigioni_maturate),
      costi: euro(m.costi),
      margine_operativo: euro(m.margine_operativo),
      indicatori_nuovi_clienti: {
        cash_per_dm: euro(m.cash_per_dm),
        revenue_per_dm: euro(m.revenue_per_dm),
        cash_per_call_svolta: euro(m.cash_per_call_svolta),
        valore_medio_nuovo_cliente: euro(m.valore_medio_nuovo),
      },
      setting: {
        dm_totali: m.dm_totali,
        conversazioni: m.conversazioni,
        call_proposte: m.call_proposte,
        call_prenotate: m.call_prenotate,
        tasso_di_conversazione: quota(m.tasso_conversazione),
        tasso_di_prenotazione: quota(m.tasso_prenotazione),
        dm_per_call_prenotata: rapportoTesto(m.dm_per_call),
      },
      call: {
        svolte: m.call_svolte,
        no_show: m.no_show,
        qualificate: m.qualificate,
        chiuse: m.chiuse,
        show_rate: quota(m.show_rate),
        tasso_di_qualificazione: quota(m.tasso_qualificazione),
        close_rate: quota(m.close_rate),
        close_rate_su_qualificate: quota(m.close_rate_qualificate),
      },
      rinnovi: { in_scadenza: m.in_scadenza, rinnovati: m.rinnovati, tasso_di_rinnovo: quota(m.tasso_rinnovo) },
      funnel: controlla(funnel).map((f) => ({ fase: f.fase, valore: f.valore, passaggio: quota(f.passaggio) })),
      confronto_col_periodo_prima: controlla(kpi).map((k) => ({
        voce: VOCI_KPI[k.chiave] ?? k.chiave,
        valore: KPI_EURO.has(k.chiave) ? euro(k.valore) : k.valore,
        prima: KPI_EURO.has(k.chiave) ? euro(k.precedente) : k.precedente,
        variazione: k.delta === null ? VUOTO : formatPercentuale(k.delta, { unDecimale: true }),
      })),
      nota: `Tutto calcolato dal gestionale, come la Panoramica: usa questi numeri, non sommarli né ricalcolarli. Il cash in quattro parti somma sempre al cash incassato. Gli indicatori contano solo i clienti nuovi del periodo. Il periodo prima ha la stessa durata (con mesi interi, gli stessi mesi prima). ${MARGINE} «–» vuol dire che il denominatore è zero.`,
    })
  })
}

// ── cash_mensile ─────────────────────────────────────────────────────────────
export async function cashMensile(input: CashMensileInput, ctx: ContestoMcp): Promise<EsitoStrumento> {
  const oggi = oggiRoma()
  const fino = input.fino ? fineMese(`${input.fino}-01`) : oggi
  const righe = controlla(await ctx.db.rpc('cash_mensile', { p_mesi: input.mesi ?? 12, p_fino: fino < oggi ? fino : oggi }))
  return ok({
    valuta: VALUTA,
    mesi: righe.map((r) => ({
      mese: meseDi(r.mese),
      totale: euro(r.totale),
      nuovi_clienti: euro(r.nuovi_clienti),
      rate_di_clienti_gia_entrati: euro(r.rate_precedenti),
      rinnovi: euro(r.rinnovo),
      upsell: euro(r.upsell),
    })),
    nota: 'Il cash incassato mese per mese, al netto dei rimborsi, nelle stesse quattro parti della Panoramica: totale è già la somma, dal SQL.',
  })
}

// ── previsione_cassa ─────────────────────────────────────────────────────────
export async function previsioneCassa(input: PrevisioneCassaInput, ctx: ContestoMcp): Promise<EsitoStrumento> {
  const righe = controlla(await ctx.db.rpc('previsione_cassa', { p_mesi: input.mesi ?? 3 }))
  return ok({
    valuta: VALUTA,
    mesi: righe.map((r, i) => ({
      mese: meseDi(r.mese),
      ...(i === 0 ? { gia_incassato: euro(r.incassato) } : {}),
      previsto: euro(r.previsto),
      rate_previste: r.rate_previste,
      ...(i === 0 ? { in_ritardo: euro(r.in_ritardo), rate_in_ritardo: r.rate_in_ritardo } : {}),
    })),
    nota: 'Previsto = le rate da incassare con la scadenza da oggi in poi, mese per mese; le rate in ritardo stanno a parte, sul mese in corso. Tutto dal SQL.',
  })
}

// ── obiettivi ────────────────────────────────────────────────────────────────
export async function obiettivi(input: ObiettiviInput, ctx: ContestoMcp): Promise<EsitoStrumento> {
  const mese = input.mese ? `${input.mese}-01` : primoDelMeseISO(oggiRoma())
  const o = una(await ctx.db.rpc('avanzamento_obiettivi', { p_mese: mese }).maybeSingle())
  if (!o || (o.obiettivo_cash === null && o.obiettivo_nuovi === null)) {
    return ok({ mese: meseDi(mese), valuta: VALUTA, obiettivi: null, nota: 'Nessun obiettivo per questo mese.' })
  }
  return ok({
    mese: meseDi(mese),
    valuta: VALUTA,
    cash: { obiettivo: euro(o.obiettivo_cash), incassato: euro(o.cash), raggiunto: quota(o.quota_cash) },
    nuovi_clienti: { obiettivo: o.obiettivo_nuovi, nuovi: o.nuovi, raggiunto: quota(o.quota_nuovi) },
    nota: 'Avanzamento dal SQL: cash incassato del mese sull’obiettivo, vendite nuove del mese sull’obiettivo.',
  })
}

// ── numeri_per_fonte ─────────────────────────────────────────────────────────
export async function numeriPerFonte(input: NumeriPerFonteInput, ctx: ContestoMcp): Promise<EsitoStrumento> {
  const p = periodoDi(input)
  if (typeof p === 'string') return no(p)
  return conRegole(async () => {
    const righe = controlla(await ctx.db.rpc('metriche_per_fonte', { p_da: p.da, p_a: p.a }))
    return ok({
      valuta: VALUTA,
      periodo: p,
      fonti: righe.map((r) => ({
        fonte: E.fonte[r.fonte],
        cash_nuovi_clienti: euro(r.cash),
        quota_del_cash: quota(r.quota_cash),
        nuovi_clienti: r.nuovi_clienti,
        lead: r.lead,
        call_svolte: r.call_svolte,
        chiuse: r.chiuse,
        close_rate: quota(r.close_rate),
      })),
      nota: 'Da dove arrivano i nuovi clienti, come la Panoramica: il cash conta solo i clienti nuovi del periodo (rate di clienti entrati prima, rinnovi e upsell no), un cliente senza fonte sta in Altro.',
    })
  })
}

// ── costi ────────────────────────────────────────────────────────────────────
export async function costi(input: CostiInput, ctx: ContestoMcp): Promise<EsitoStrumento> {
  const p = periodoDi(input)
  if (typeof p === 'string') return no(p)
  return conRegole(async () => {
    const limite = input.limite ?? 50
    let q = ctx.db
      .from('expenses')
      .select('id, data, categoria, descrizione, importo, ricorrente', { count: 'exact' })
      .gte('data', p.da)
      .lte('data', p.a)
      .order('data', { ascending: false })
      .order('id')
      .limit(limite)
    if (input.categoria) q = q.eq('categoria', input.categoria)
    if (input.ricorrenti) q = q.eq('ricorrente', true)
    const [lette, metriche] = await Promise.all([q, ctx.db.rpc('metriche_periodo', { p_da: p.da, p_a: p.a }).maybeSingle()])
    const righe = controlla(lette)
    const m = una(metriche)
    const totale = lette.count ?? righe.length
    return ok({
      valuta: VALUTA,
      periodo: p,
      totale_costi_del_periodo: euro(m?.costi),
      trovati: totale,
      costi: righe.map((r) => ({
        id: r.id,
        data: r.data,
        categoria: E.categoriaCosto[r.categoria],
        descrizione: r.descrizione,
        importo: euro(r.importo),
        ...(r.ricorrente ? { ricorrente: true } : {}),
      })),
      nota:
        'totale_costi_del_periodo è la somma del SQL di tutti i costi del periodo, di ogni categoria: usa quello, non sommare le righe.' +
        (totale > righe.length ? ` Qui ${righe.length} costi su ${totale}: restringi con il periodo o la categoria.` : ''),
    })
  })
}

// ── provvigioni ──────────────────────────────────────────────────────────────
export async function provvigioni(input: ProvvigioniInput, ctx: ContestoMcp): Promise<EsitoStrumento> {
  let pagamenti = ctx.db
    .from('commission_payouts')
    .select('id, profile_id, periodo, importo, pagato_il, metodo, note')
    .order('pagato_il', { ascending: false })
    .order('id')
    .limit(20)
  if (input.profile_id) pagamenti = pagamenti.eq('profile_id', input.profile_id)
  const [riepilogo, pagati] = await Promise.all([ctx.db.rpc('provvigioni_riepilogo', { p_mesi: input.mesi ?? 6 }), pagamenti])
  const righe = controlla(riepilogo).filter((r) => !input.profile_id || r.profile_id === input.profile_id)
  const perPersona = new Map<string, { nome: string; mesi: typeof righe }>()
  for (const r of righe) {
    const voce = perPersona.get(r.profile_id) ?? { nome: r.nome, mesi: [] }
    voce.mesi.push(r)
    perPersona.set(r.profile_id, voce)
  }
  const pag = controlla(pagati)
  const chi = await nomi(ctx, pag.map((x) => x.profile_id))
  return ok({
    valuta: VALUTA,
    persone: [...perPersona.entries()].map(([id, { nome, mesi }]) => ({
      profile_id: id,
      nome,
      // the running balance of the last month is the SQL's, carried from before the window
      saldo_da_pagare: euro(mesi[mesi.length - 1]?.saldo_progressivo),
      mesi: mesi.map((x) => ({
        mese: meseDi(x.mese),
        maturato: euro(x.maturato),
        pagato: euro(x.pagato),
        saldo_del_mese: euro(x.saldo_mese),
        saldo_progressivo: euro(x.saldo_progressivo),
      })),
    })),
    pagamenti_recenti: pag.map((x) => ({
      id: x.id,
      profile_id: x.profile_id,
      nome: persona(chi, x.profile_id),
      mese: meseDi(x.periodo),
      importo: euro(x.importo),
      pagato_il: x.pagato_il,
      ...(x.metodo ? { metodo: E.metodo[x.metodo] } : {}),
      ...(x.note?.trim() ? { note: x.note.trim() } : {}),
    })),
    nota: 'Maturato sull’incasso, per mese; pagato per il mese a cui si riferisce; saldo_progressivo porta anche i mesi prima della finestra. Tutto dal SQL: non sommare tu.',
  })
}

// ── provvigioni_per_vendita ──────────────────────────────────────────────────
export async function provvigioniPerVendita(input: ProvvigioniPerVenditaInput, ctx: ContestoMcp): Promise<EsitoStrumento> {
  const righe = controlla(await ctx.db.rpc('provvigioni_per_vendita', input.sale_id ? { p_sale_id: input.sale_id } : {})).filter(
    (r) => !input.profile_id || r.profile_id === input.profile_id,
  )
  return ok({
    valuta: VALUTA,
    trovate: righe.length,
    vendite: righe.slice(0, 100).map((r) => ({
      sale_id: r.sale_id,
      cliente: r.cliente,
      tipo: E.tipoVendita[r.tipo],
      setter: r.setter,
      profile_id: r.profile_id,
      incassato: euro(r.incassato),
      percentuale: r.percentuale === null ? VUOTO : formatPercentuale(r.percentuale, { unDecimale: true }),
      provvigione: euro(r.provvigione),
      ultimo_incasso: r.ultimo_incasso,
    })),
    nota:
      'Cliente per cliente, come Provvigioni › Per cliente: la provvigione la calcola il SQL sugli incassi di ogni vendita.' +
      (righe.length > 100 ? ` Qui 100 vendite su ${righe.length}: restringi con il setter o la vendita.` : ''),
  })
}

// ── regole_provvigioni ───────────────────────────────────────────────────────
export async function regoleProvvigioni(input: RegoleProvvigioniInput, ctx: ContestoMcp): Promise<EsitoStrumento> {
  let q = ctx.db
    .from('commission_rules')
    .select('id, profile_id, percentuale, applica_a, valida_dal, valida_al')
    .order('valida_dal', { ascending: false })
    .order('id')
  if (input.profile_id) q = q.eq('profile_id', input.profile_id)
  const righe = controlla(await q)
  const chi = await nomi(ctx, righe.map((r) => r.profile_id))
  const oggi = oggiRoma()
  return ok({
    regole: righe.map((r) => ({
      id: r.id,
      profile_id: r.profile_id,
      nome: persona(chi, r.profile_id),
      percentuale: formatPercentuale(r.percentuale, { unDecimale: true }),
      su: (r.applica_a ?? []).map((t) => E.tipoVendita[t]),
      valida_dal: r.valida_dal,
      valida_al: r.valida_al,
      ...(r.valida_dal <= oggi && (!r.valida_al || r.valida_al >= oggi) ? { in_vigore: true } : {}),
    })),
    nota: 'Una persona ha al massimo una regola valida per giorno. La provvigione matura sull’incasso, con la regola valida il giorno dell’incasso.',
  })
}

// ── team ─────────────────────────────────────────────────────────────────────
export async function team(input: TeamInput, ctx: ContestoMcp): Promise<EsitoStrumento> {
  let q = ctx.db.from('profiles').select('id, nome, email, ruolo, attivo, livello_pm').order('nome').order('id')
  if (!input.anche_non_attivi) q = q.eq('attivo', true)
  const [persone, inviti] = await Promise.all([
    q,
    ctx.db
      .from('invites')
      .select('email, ruolo, invitato_da, created_at')
      .is('usato_at', null)
      .eq('revocato', false)
      .order('created_at', { ascending: false }),
  ])
  const p = controlla(persone)
  const i = controlla(inviti)
  const chi = await nomi(ctx, i.map((x) => x.invitato_da))
  return ok({
    persone: p.map((x) => ({
      id: x.id,
      nome: x.nome,
      email: x.email,
      ruolo: ETICHETTA_RUOLO[x.ruolo],
      ...(x.attivo ? {} : { disattivato: true }),
      livello_progetti: ETICHETTA_LIVELLO_PM[x.livello_pm],
    })),
    inviti_in_attesa: i.map((x) => ({
      email: x.email,
      ruolo: ETICHETTA_RUOLO[x.ruolo],
      invitato_da: persona(chi, x.invitato_da),
      invitato_il: x.created_at.slice(0, 10),
    })),
    nota: 'In sola lettura, come Impostazioni › Team: inviti, ruoli, livelli, disattivazioni ed eliminazioni si fanno dall’app.',
  })
}

// ── mie_provvigioni (the setter) ─────────────────────────────────────────────
export async function mieProvvigioni(input: MieProvvigioniInput, ctx: ContestoMcp): Promise<EsitoStrumento> {
  const corrente = primoDelMeseISO(oggiRoma())
  const mesi = Array.from({ length: input.mesi ?? 6 }, (_, i) => aggiungiMesi(corrente, -i))
  const lette = await Promise.all(
    mesi.map((m) => ctx.db.rpc('miei_numeri_periodo', { p_da: m, p_a: fineMese(m) }).maybeSingle()),
  )
  return ok({
    di_chi:
      'Le provvigioni della persona con cui parli, il setter, come I miei numeri: mai quelle degli altri, mai la sua regola o la percentuale.',
    valuta: VALUTA,
    mesi: lette.map((r, i) => {
      const n = una(r)
      return { mese: meseDi(mesi[i]), maturate: euro(n?.provvigioni_maturate), pagate: euro(n?.provvigioni_pagate) }
    }),
    nota: 'Mese per mese, dal più recente: maturate sugli incassi dei suoi clienti in quel mese, pagate per quel mese. Calcolate dal gestionale: non sommarle tu; per i dettagli per cliente c’è miei_clienti.',
  })
}

// ── writes ───────────────────────────────────────────────────────────────────
const COSTO_NON_TROVATO = 'Questo costo non c’è: usa l’id letto con costi.'
const PAGAMENTO_NON_TROVATO = 'Questo pagamento non c’è: usa l’id letto con provvigioni.'
const REGOLA_NON_TROVATA = 'Questa regola non c’è: usa l’id letto con regole_provvigioni.'

async function leggiCosto(ctx: ContestoMcp, id: string) {
  return una(await ctx.db.from('expenses').select('id, data, categoria, descrizione, importo, ricorrente').eq('id', id).maybeSingle())
}

function costoLetto(r: NonNullable<Awaited<ReturnType<typeof leggiCosto>>>) {
  return {
    id: r.id,
    data: r.data,
    categoria: E.categoriaCosto[r.categoria],
    descrizione: r.descrizione,
    importo: euro(r.importo),
    ricorrente: r.ricorrente,
  }
}

export async function registraCosto(input: RegistraCostoInput, ctx: ContestoMcp): Promise<EsitoStrumento> {
  const esito = await operazioni.aggiungiCosto(nucleo(ctx), {
    data: input.data ?? oggiRoma(),
    categoria: input.categoria,
    descrizione: input.descrizione,
    importo: input.importo,
    ricorrente: input.ricorrente ?? false,
  })
  if (!esito.ok) return no(esito.errore)
  const dopo = esito.id ? await leggiCosto(ctx, esito.id) : null
  return ok({ esito: 'registrato', valuta: VALUTA, costo: dopo ? costoLetto(dopo) : { id: esito.id ?? null } })
}

export async function modificaCosto(input: ModificaCostoInput, ctx: ContestoMcp): Promise<EsitoStrumento> {
  const r = await leggiCosto(ctx, input.id)
  if (!r) return no(COSTO_NON_TROVATO, 'non_trovato')
  const esito = await operazioni.modificaCosto(nucleo(ctx), {
    id: r.id,
    data: input.data ?? r.data,
    categoria: input.categoria ?? r.categoria,
    descrizione: input.descrizione ?? r.descrizione,
    importo: input.importo ?? Number(r.importo),
    ricorrente: input.ricorrente ?? r.ricorrente,
  })
  if (!esito.ok) return no(esito.errore)
  const dopo = await leggiCosto(ctx, r.id)
  return ok({ esito: 'salvato', valuta: VALUTA, costo: dopo ? costoLetto(dopo) : { id: r.id } })
}

export async function copiaCostiRicorrenti(input: CopiaRicorrentiInput, ctx: ContestoMcp): Promise<EsitoStrumento> {
  const esito = await operazioni.copiaRicorrenti(nucleo(ctx), { mese: `${input.mese}-01` })
  if (!esito.ok) return no(esito.errore)
  return ok({
    esito: 'copiati',
    mese: input.mese,
    copiati: esito.copiati,
    nota:
      esito.copiati === 0
        ? 'Nessun costo da copiare: i ricorrenti del mese prima ci sono già, o non ce ne sono.'
        : 'Copiati i costi ricorrenti del mese prima, nello stesso giorno del mese; quelli che c’erano già non si copiano due volte.',
  })
}

async function leggiPagamento(ctx: ContestoMcp, id: string) {
  return una(
    await ctx.db
      .from('commission_payouts')
      .select('id, profile_id, periodo, importo, pagato_il, metodo, note')
      .eq('id', id)
      .maybeSingle(),
  )
}

async function pagamentoLetto(ctx: ContestoMcp, r: NonNullable<Awaited<ReturnType<typeof leggiPagamento>>>) {
  const chi = await nomi(ctx, [r.profile_id])
  return {
    id: r.id,
    profile_id: r.profile_id,
    nome: persona(chi, r.profile_id),
    mese: meseDi(r.periodo),
    importo: euro(r.importo),
    pagato_il: r.pagato_il,
    ...(r.metodo ? { metodo: E.metodo[r.metodo] } : {}),
    ...(r.note?.trim() ? { note: r.note.trim() } : {}),
  }
}

export async function registraPagamento(input: RegistraPagamentoInput, ctx: ContestoMcp): Promise<EsitoStrumento> {
  const esito = await operazioni.registraPagamentoProvvigione(nucleo(ctx), {
    profile_id: input.profile_id,
    periodo: `${input.mese}-01`,
    importo: input.importo,
    pagato_il: input.pagato_il ?? oggiRoma(),
    metodo: input.metodo ?? null,
    note: input.note ?? null,
  })
  if (!esito.ok) return no(esito.errore)
  const dopo = esito.id ? await leggiPagamento(ctx, esito.id) : null
  return ok({
    esito: 'registrato',
    valuta: VALUTA,
    pagamento: dopo ? await pagamentoLetto(ctx, dopo) : { id: esito.id ?? null },
    nota: 'Il saldo da pagare aggiornato lo dà provvigioni.',
  })
}

export async function modificaPagamento(input: ModificaPagamentoInput, ctx: ContestoMcp): Promise<EsitoStrumento> {
  const r = await leggiPagamento(ctx, input.id)
  if (!r) return no(PAGAMENTO_NON_TROVATO, 'non_trovato')
  const esito = await operazioni.modificaPagamentoProvvigione(nucleo(ctx), {
    id: r.id,
    periodo: input.mese ? `${input.mese}-01` : r.periodo,
    importo: input.importo ?? Number(r.importo),
    pagato_il: input.pagato_il ?? r.pagato_il,
    metodo: input.metodo === '' ? null : (input.metodo ?? r.metodo),
    note: input.note === '' ? null : (input.note ?? r.note),
  })
  if (!esito.ok) return no(esito.errore)
  const dopo = await leggiPagamento(ctx, r.id)
  return ok({ esito: 'salvato', valuta: VALUTA, pagamento: dopo ? await pagamentoLetto(ctx, dopo) : { id: r.id } })
}

export async function regolaProvvigione(input: RegolaProvvigioneInput, ctx: ContestoMcp): Promise<EsitoStrumento> {
  const n = nucleo(ctx)
  switch (input.azione) {
    case 'nuova': {
      if (input.rule_id || input.valida_al) return no('Con nuova servono profile_id, percentuale, valida_dal e applica_a: non rule_id né valida_al.')
      if (!input.profile_id || input.percentuale == null || !input.valida_dal) {
        return no('Per una regola nuova servono la persona (profile_id), la percentuale in punti e il giorno da cui vale (valida_dal).')
      }
      const esito = await operazioni.nuovaRegola(n, {
        profile_id: input.profile_id,
        percentuale: input.percentuale,
        applica_a: input.applica_a ?? ['nuovo'],
        valida_dal: input.valida_dal,
      })
      if (!esito.ok) return no(esito.errore)
      return ok({
        esito: 'creata',
        ...(esito.id ? { rule_id: esito.id } : {}),
        nota: 'La regola di prima, se c’era, finisce il giorno prima di questa: la storia non cambia.',
      })
    }
    case 'chiudi': {
      if (!input.rule_id || !input.valida_al) return no('Per chiudere una regola servono rule_id e l’ultimo giorno in cui vale (valida_al).')
      if (input.profile_id || input.percentuale != null || input.applica_a || input.valida_dal) {
        return no('Con chiudi servono solo rule_id e valida_al.')
      }
      const esito = await operazioni.chiudiRegola(n, { rule_id: input.rule_id, valida_al: input.valida_al })
      if (!esito.ok) return no(esito.errore)
      return ok({ esito: 'chiusa', rule_id: input.rule_id, valida_al: input.valida_al })
    }
    case 'modifica': {
      if (!input.rule_id) return no('Per correggere una regola serve rule_id.')
      if (input.profile_id) return no('La persona di una regola non cambia: chiudila e creane una nuova per l’altra persona.')
      const r = una(
        await ctx.db
          .from('commission_rules')
          .select('id, percentuale, applica_a, valida_dal, valida_al')
          .eq('id', input.rule_id)
          .maybeSingle(),
      )
      if (!r) return no(REGOLA_NON_TROVATA, 'non_trovato')
      const esito = await operazioni.modificaRegola(n, {
        id: r.id,
        // the stored fraction back to points, as the form shows it (0.05 -> 5)
        percentuale: input.percentuale ?? Math.round(Number(r.percentuale) * 10000) / 100,
        applica_a: input.applica_a ?? r.applica_a,
        valida_dal: input.valida_dal ?? r.valida_dal,
        valida_al: input.valida_al === '' ? null : (input.valida_al ?? r.valida_al),
      })
      if (!esito.ok) return no(esito.errore)
      return ok({
        esito: 'salvata',
        rule_id: r.id,
        nota: 'Cambiare una regola cambia le provvigioni che ha prodotto, anche nei mesi passati.',
      })
    }
  }
}

export async function impostaObiettivi(input: ImpostaObiettiviInput, ctx: ContestoMcp): Promise<EsitoStrumento> {
  const mese = `${input.mese}-01`
  const attuale = una(await ctx.db.from('obiettivi_mese').select('cash, nuovi_clienti').eq('mese', mese).maybeSingle())
  const cash = input.cash === '' ? null : (input.cash ?? euro(attuale?.cash))
  const nuovi = input.nuovi_clienti === '' ? null : (input.nuovi_clienti ?? attuale?.nuovi_clienti ?? null)
  if (cash === null && nuovi === null) {
    return no('Da qui gli obiettivi si impostano, non si tolgono: almeno uno tra cash e nuovi clienti. Per toglierli tutti e due c’è l’app.')
  }
  const esito = await operazioni.salvaObiettivi(nucleo(ctx), { mese, cash, nuovi_clienti: nuovi })
  if (!esito.ok) return no(esito.errore)
  return obiettivi({ mese: input.mese }, ctx).then((letto) =>
    letto.ok ? ok({ esito: 'salvati', ...letto.dati }) : ok({ esito: 'salvati', mese: input.mese }),
  )
}
