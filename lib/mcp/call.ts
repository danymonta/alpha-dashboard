import 'server-only'

import { FOLLOW_UP, quandoFollowUp } from '@/lib/call/follow-up'
import * as operazioni from '@/lib/call/operazioni'
import { REGISTRAZIONE } from '@/lib/call/registrazione'
import { SPOSTA, tracciaSpostamento } from '@/lib/call/spostamento'
import { aggiungiGiorni, formatOra, oggiRoma } from '@/lib/date'
import type { Database } from '@/lib/supabase/database.types'
import { ETICHETTA_FONTE, ETICHETTA_PERFORMANCE, ETICHETTA_TIPO_CALL } from '@/lib/validation/call'
import { ETICHETTA_ESITO } from '@/lib/validation/esito'
import { ETICHETTA_STATO_LEAD, STATI_LEAD } from '@/lib/validation/lead'
import { REGISTRAZIONE_OBBLIGATORIA_DAL, chiedeRegistrazione } from '@/lib/validation/registrazione'

import type { EsitoStrumento } from './contenuti'
import type { ContestoMcp } from './contesto'
import type {
  DettagliCallInput,
  ElencoCallInput,
  ElencoLeadInput,
  FissaCallInput,
  FissaFollowUpInput,
  LeggiCallInput,
  ModificaCallInput,
  RegistraEsitoInput,
  SpostaCallInput,
  StatoLeadInput,
} from './schemi-call'

/**
 * What the MCP tools on calls, leads and outcomes do (Claude a 360 gradi,
 * phase 2, 23/10/2026). Reads go through ctx.db, the person's own OAuth token
 * (RLS decides, never the service role): the calls through call_per_claude,
 * which never gives the setter the Fathom link, the performance or an amount;
 * the leads and the products from their tables. Writes go through the shared
 * core of the app (lib/call/operazioni.ts), the same schemas, guards and
 * sentences as the server actions of /calls and /leads and Alfire. A change
 * tool reads the call first and fills in what Claude did not say, so the
 * app's full schemas apply. Nothing is deleted from here: no call, no lead,
 * no recording (CLAUDE.md sections 17 and 28). The analyses of Claude on the
 * calls, the valuations, Fathom's transcripts, the sales and the clients are
 * not here. A read that fails throws: the wrapper answers with its generic
 * sentence, never "nothing there".
 */

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

function ok(dati: Record<string, unknown>, esito?: string): EsitoStrumento {
  return { ok: true, dati, esito }
}

function no(messaggio: string, esito?: string): EsitoStrumento {
  return { ok: false, messaggio, esito }
}

/** The core of calls and leads with the token's client and the person behind it. */
function nucleo(ctx: ContestoMcp): operazioni.Contesto {
  return { db: ctx.db, chi: async () => ({ id: ctx.persona, ruolo: ctx.ruolo, attivo: true }) }
}

const CALL_NON_TROVATA = 'Questa call non c’è, o non è tra quelle che vedi.'
const LEAD_NON_TROVATO = 'Questo lead non c’è, o non è tra quelli che vedi.'

/** A search typed by Claude: no PostgREST syntax gets through. */
function ricerca(testo: string): string {
  return testo.replace(/[%_*,()\\"]/g, ' ').trim()
}

function breve(testo: string | null | undefined, max: number): string | null {
  if (!testo?.trim()) return null
  const t = testo.trim()
  return [...t].length > max ? `${[...t].slice(0, max).join('')}…` : t
}

type RigaCall = Database['public']['Functions']['call_per_claude']['Returns'][number]

/** The state of a call in the app's words: «riprogrammata» is «In attesa di conferma». */
const ETICHETTA_STATO_CALL: Record<Database['public']['Enums']['call_status'], string> = {
  programmata: 'Da fare',
  svolta: 'Svolta',
  no_show: 'No show',
  cancellata: 'Cancellata',
  riprogrammata: SPOSTA.attesa.etichetta,
}

/** A call as Claude reads it: the app's labels, the day and time of Rome, what the role may read. */
function callPerClaude(r: RigaCall, ctx: ContestoMcp, completa: boolean) {
  const oggi = oggiRoma()
  const note = (t: string | null) => (completa ? (t?.trim() ? t.trim() : null) : breve(t, 300))
  const setter = ctx.ruolo === 'setter'
  const daRegistrare = r.stato === 'programmata' && new Date(r.programmata_il).getTime() < Date.now()
  const traccia = tracciaSpostamento({ spostata_dal: r.spostata_dal, volte_spostata: r.volte_spostata }, oggi)
  return {
    id: r.id,
    lead: {
      id: r.lead_id,
      nome: r.lead_nome,
      handle: r.lead_handle,
      stato: r.lead_stato ? ETICHETTA_STATO_LEAD[r.lead_stato] : null,
      fonte: r.lead_fonte ? ETICHETTA_FONTE[r.lead_fonte] : null,
    },
    quando: quandoFollowUp(r.programmata_il, oggi),
    giorno: oggiRoma(new Date(r.programmata_il)),
    ora: formatOra(r.programmata_il),
    tipo: ETICHETTA_TIPO_CALL[r.tipo],
    stato: ETICHETTA_STATO_CALL[r.stato],
    stato_codice: r.stato,
    ...(daRegistrare ? { esito_da_registrare: true } : {}),
    esito: r.esito ? ETICHETTA_ESITO[r.esito] : null,
    qualificata: r.qualificata,
    motivo_non_chiusura: note(r.motivo),
    note_del_setter: note(r.note_setter),
    note_aggiuntive_closer: note(r.note_closer),
    setter: r.setter_id ? { id: r.setter_id, nome: r.setter_nome ?? 'Persona non più nel team' } : null,
    closer: r.closer_id ? { id: r.closer_id, nome: r.closer_nome ?? 'Persona non più nel team' } : null,
    ...(traccia ? { spostata: traccia } : {}),
    ...(r.di_follow_up
      ? { follow_up_della_call: r.partenza_il ? FOLLOW_UP.della(quandoFollowUp(r.partenza_il, oggi)) : FOLLOW_UP.dellaSenzaData }
      : {}),
    ...(r.follow_up_id
      ? {
          call_di_follow_up: {
            id: r.follow_up_id,
            quando: r.follow_up_il ? quandoFollowUp(r.follow_up_il, oggi) : null,
            stato: r.follow_up_stato ? ETICHETTA_STATO_CALL[r.follow_up_stato] : null,
          },
        }
      : r.esito === 'follow_up'
        ? { call_di_follow_up: null }
        : {}),
    prodotto_proposto: r.prodotto ?? null,
    ...(completa ? { prenotata_il: oggiRoma(new Date(r.prenotata_il)) } : {}),
    // the setter never reads the recording, the performance or an amount (1.37.0): call_per_claude
    // already leaves them empty for him, and his result does not even have the keys
    ...(setter
      ? {}
      : {
          registrazione: r.link_registrazione
            ? { link: r.link_registrazione, stato: r.registrazione }
            : r.registrazione === 'non_registrata'
              ? 'Call non registrata'
              : null,
          ...(chiedeRegistrazione(r.esito) || r.stato === 'programmata'
            ? {
                registrazione_richiesta:
                  !r.link_registrazione && !r.registrazione && oggiRoma(new Date(r.programmata_il)) >= REGISTRAZIONE_OBBLIGATORIA_DAL,
              }
            : {}),
          performance: r.performance ? ETICHETTA_PERFORMANCE[r.performance] : null,
          importo_proposto: r.importo_proposto,
        }),
  }
}

async function leggiUna(ctx: ContestoMcp, id: string): Promise<RigaCall | null> {
  const righe = controlla(await ctx.db.rpc('call_per_claude', { p_id: id }))
  return righe[0] ?? null
}

/** Who sees which calls: said first in the result. */
function diChi(ctx: ContestoMcp): string {
  switch (ctx.ruolo) {
    case 'setter':
      return 'Le call col nome della persona con cui parli: quelle che ha fissato e le loro call di follow-up. Mai il link di Fathom, la performance o gli importi.'
    case 'closer':
      return 'Le call assegnate alla persona con cui parli, il closer.'
    default:
      return 'Tutte le call del team.'
  }
}

// ── elenco_call ──────────────────────────────────────────────────────────────
export async function elencoCall(input: ElencoCallInput, ctx: ContestoMcp): Promise<EsitoStrumento> {
  const oggi = oggiRoma()
  const senzaPeriodo = !input.da && !input.a && !input.lead_id && !input.da_registrare
  const da = input.da ?? (senzaPeriodo ? aggiungiGiorni(oggi, -7) : null)
  const a = input.a ?? (senzaPeriodo ? aggiungiGiorni(oggi, 30) : null)
  const limite = input.limite ?? 50
  const righe = controlla(
    await ctx.db.rpc('call_per_claude', {
      ...(da ? { p_da: da } : {}),
      ...(a ? { p_a: a } : {}),
      ...(input.stato ? { p_stati: [input.stato] } : {}),
      ...(input.closer_id ? { p_closer: input.closer_id } : {}),
      ...(input.setter_id ? { p_setter: input.setter_id } : {}),
      ...(input.lead_id ? { p_lead: input.lead_id } : {}),
      ...(input.cerca && ricerca(input.cerca) ? { p_cerca: ricerca(input.cerca) } : {}),
      ...(input.da_registrare ? { p_da_registrare: true } : {}),
      ...(input.recenti ? { p_recenti: true } : {}),
      p_limite: limite,
    }),
  )
  const totale = righe[0]?.totale ?? 0
  return ok({
    di_chi: diChi(ctx),
    ...(da || a ? { periodo: { da, a } } : {}),
    totale,
    call: righe.map((r) => callPerClaude(r, ctx, false)),
    ...(totale > righe.length ? { nota: `Qui ${righe.length} call su ${totale}: restringi con il periodo, lo stato, il lead o cerca.` } : {}),
  })
}

// ── leggi_call ───────────────────────────────────────────────────────────────
export async function leggiCall(input: LeggiCallInput, ctx: ContestoMcp): Promise<EsitoStrumento> {
  const r = await leggiUna(ctx, input.call_id)
  if (!r) return no(CALL_NON_TROVATA, 'non_trovato')
  return ok({ call: callPerClaude(r, ctx, true) })
}

// ── elenco_lead ──────────────────────────────────────────────────────────────
export async function elencoLead(input: ElencoLeadInput, ctx: ContestoMcp): Promise<EsitoStrumento> {
  const limite = input.limite ?? 50
  let q = ctx.db
    .from('leads')
    .select('id, nome, instagram_handle, fonte, stato, setter_id, note, created_at')
    .order('created_at', { ascending: false })
    .limit(limite + 1)
  if (input.stato) q = q.eq('stato', input.stato)
  if (input.fonte) q = q.eq('fonte', input.fonte)
  if (input.setter_id) q = q.eq('setter_id', input.setter_id)
  const cerca = input.cerca ? ricerca(input.cerca).replace(/^@+/, '') : ''
  if (cerca) q = q.or(`nome.ilike.*${cerca}*,instagram_handle.ilike.*${cerca}*`)
  const conteggio = (stato: (typeof STATI_LEAD)[number]) =>
    ctx.db.from('leads').select('id', { count: 'exact', head: true }).eq('stato', stato)
  const [lette, ...conteggi] = await Promise.all([q, ...STATI_LEAD.map(conteggio)])
  const righe = controlla(lette)
  const perStato = Object.fromEntries(
    STATI_LEAD.map((s, i) => {
      const c = conteggi[i]
      if (c.error) throw new LetturaNonRiuscita(c.error.code ?? 'errore')
      return [ETICHETTA_STATO_LEAD[s], c.count ?? 0]
    }),
  )
  const mostrati = righe.slice(0, limite)
  const setter = await nomi(ctx, mostrati.map((l) => l.setter_id))
  return ok({
    di_chi:
      ctx.ruolo === 'setter'
        ? 'I lead della persona con cui parli: quelli che ha portato lui.'
        : ctx.ruolo === 'closer'
          ? 'I lead delle call assegnate alla persona con cui parli.'
          : 'Tutti i lead.',
    pipeline: perStato,
    lead: mostrati.map((l) => ({
      id: l.id,
      nome: l.nome,
      handle: l.instagram_handle,
      stato: ETICHETTA_STATO_LEAD[l.stato],
      stato_codice: l.stato,
      fonte: ETICHETTA_FONTE[l.fonte],
      setter: l.setter_id ? (setter.get(l.setter_id) ?? 'Persona non più nel team') : null,
      ...(breve(l.note, 300) ? { note: breve(l.note, 300) } : {}),
      creato_il: oggiRoma(new Date(l.created_at)),
    })),
    ...(righe.length > limite ? { nota: `Qui i ${limite} lead più recenti: restringi con stato, fonte o cerca. Le call di un lead con elenco_call e lead_id.` } : {}),
  })
}

async function nomi(ctx: ContestoMcp, ids: Iterable<string | null | undefined>): Promise<Map<string, string>> {
  const unici = [...new Set([...ids].filter((x): x is string => Boolean(x)))]
  if (unici.length === 0) return new Map()
  const righe = controlla(await ctx.db.from('profiles').select('id, nome').in('id', unici))
  return new Map(righe.map((r) => [r.id, r.nome]))
}

// ── prodotti ─────────────────────────────────────────────────────────────────
export async function prodotti(ctx: ContestoMcp): Promise<EsitoStrumento> {
  const righe = controlla(await ctx.db.from('products').select('id, nome, durata_mesi, attivo').order('nome'))
  return ok({
    prodotti: righe.map((p) => ({ id: p.id, nome: p.nome, durata_mesi: p.durata_mesi, ...(p.attivo ? {} : { fuori_vendita: true }) })),
  })
}

// ── fissa_call ───────────────────────────────────────────────────────────────
/** The default closer of «Nuova call»: the admin runs his own calls; for the setter the first admin (Dany). */
async function closerPredefinito(ctx: ContestoMcp): Promise<string | null> {
  if (ctx.ruolo === 'admin') return ctx.persona
  const righe = controlla(
    await ctx.db.from('profiles').select('id, ruolo').eq('attivo', true).in('ruolo', ['admin', 'closer']).order('created_at'),
  )
  return (righe.find((p) => p.ruolo === 'admin') ?? righe[0])?.id ?? null
}

export async function fissaCall(input: FissaCallInput, ctx: ContestoMcp): Promise<EsitoStrumento> {
  if (ctx.ruolo !== 'admin' && input.setter_id && input.setter_id !== ctx.persona) {
    return no('Il setter fissa le call per sé: il setter di un’altra call lo sceglie solo l’admin.')
  }
  const closer = input.closer_id ?? (await closerPredefinito(ctx))
  if (!closer) return no('Per fissare una call serve almeno un closer o un admin attivo.')
  const esito = await operazioni.fissaCall(nucleo(ctx), {
    nome: input.nome,
    instagram_handle: input.instagram_handle ?? null,
    fonte: input.fonte,
    // discovery calls only, as in the app
    tipo: 'discovery',
    data: input.data,
    ora: input.ora,
    closer_id: closer,
    setter_id: ctx.ruolo === 'admin' ? (input.setter_id ?? null) : null,
  })
  if (!esito.ok) {
    const campi = esito.campi ? Object.values(esito.campi).filter(Boolean).join(' ') : ''
    return no(campi ? `${esito.errore} ${campi}` : esito.errore)
  }
  const call = esito.callId ? await leggiUna(ctx, esito.callId) : null
  return ok({
    esito: 'fissata',
    ...(esito.leadEsistente ? { nota: 'Il lead c’era già con questo handle: la call è sua.' } : {}),
    call: call ? callPerClaude(call, ctx, true) : { id: esito.callId ?? null },
  })
}

// ── registra_esito ───────────────────────────────────────────────────────────
const MANCA_REGISTRAZIONE =
  'Manca la registrazione della call: serve il link di Fathom, oppure sapere che la call non è stata registrata.'

export async function registraEsito(input: RegistraEsitoInput, ctx: ContestoMcp): Promise<EsitoStrumento> {
  const svolta = chiedeRegistrazione(input.esito)
  if (input.link_fathom && input.non_registrata) return no('O il link di Fathom, o «non registrata»: non tutti e due.')
  if (!svolta && (input.link_fathom || input.non_registrata)) {
    return no('La registrazione si indica solo con chiusa, follow_up o persa.')
  }
  if (input.esito !== 'riprogrammata' && (input.data || input.ora)) {
    return no('Un nuovo giorno si dà solo con riprogrammata (o con sposta_call); la call di follow-up con follow_up_data e follow_up_ora.')
  }
  if (input.esito !== 'follow_up' && input.esito !== 'persa' && (input.follow_up_data || input.follow_up_ora)) {
    return no('La call di follow-up si fissa solo con l’esito follow_up.')
  }
  const registrazione = input.link_fathom
    ? { registrazione: { tipo: 'link', url: input.link_fathom } }
    : input.non_registrata
      ? { registrazione: { tipo: 'non_registrata' } }
      : {}
  const esito = await operazioni.registraEsito(nucleo(ctx), {
    call_id: input.call_id,
    esito: input.esito,
    ...(svolta ? registrazione : {}),
    ...(input.esito === 'follow_up' || input.esito === 'persa'
      ? {
          qualificata: input.qualificata ?? undefined,
          motivo: input.motivo ?? undefined,
          ...(input.note_closer !== undefined && input.note_closer !== null ? { note_closer: input.note_closer } : {}),
          ...(input.follow_up_data ? { follow_up_data: input.follow_up_data } : {}),
          ...(input.follow_up_ora ? { follow_up_ora: input.follow_up_ora } : {}),
        }
      : {}),
    ...(input.esito === 'riprogrammata'
      ? {
          ...(input.data ? { data: input.data } : {}),
          ...(input.ora ? { ora: input.ora } : {}),
          ...(input.note_closer !== undefined && input.note_closer !== null ? { note_closer: input.note_closer } : {}),
        }
      : {}),
  })
  if (!esito.ok) return no(esito.errore === REGISTRAZIONE.manca ? MANCA_REGISTRAZIONE : esito.errore)

  const call = await leggiUna(ctx, input.call_id)
  return ok({
    esito: 'salvato',
    call: call ? callPerClaude(call, ctx, true) : { id: input.call_id },
    ...(input.esito === 'chiusa'
      ? { vendita: 'Ora va registrata la vendita della call: registra_vendita con il call_id di questa call (o dall’app, Vendite › Nuova vendita dalla call).' }
      : {}),
    ...(esito.followUp ? { call_di_follow_up_id: esito.followUp } : {}),
    ...(esito.avviso ? { avviso: esito.avviso } : {}),
    ...(esito.avvisoRegistrazione ? { avviso_registrazione: esito.avvisoRegistrazione } : {}),
  })
}

// ── sposta_call, fissa_follow_up ─────────────────────────────────────────────
export async function spostaCall(input: SpostaCallInput, ctx: ContestoMcp): Promise<EsitoStrumento> {
  const esito = await operazioni.spostaCall(nucleo(ctx), input)
  if (!esito.ok) return no(esito.errore)
  const call = await leggiUna(ctx, input.call_id)
  return ok({ esito: 'spostata', call: call ? callPerClaude(call, ctx, true) : { id: input.call_id } })
}

export async function fissaFollowUp(input: FissaFollowUpInput, ctx: ContestoMcp): Promise<EsitoStrumento> {
  const esito = await operazioni.fissaFollowUp(nucleo(ctx), input)
  if (!esito.ok) return no(esito.errore)
  const call = await leggiUna(ctx, esito.id)
  return ok({ esito: 'fissata', call_di_follow_up: call ? callPerClaude(call, ctx, true) : { id: esito.id } })
}

// ── modifica_call, dettagli_call: the pencil ─────────────────────────────────
export async function modificaCall(input: ModificaCallInput, ctx: ContestoMcp): Promise<EsitoStrumento> {
  const c = await leggiUna(ctx, input.call_id)
  if (!c) return no(CALL_NON_TROVATA, 'non_trovato')
  if (ctx.ruolo === 'setter' && input.tipo && input.tipo !== c.tipo) {
    return no('Il tipo della call lo cambiano il closer e l’admin.')
  }
  if (ctx.ruolo === 'closer' && input.note !== undefined && input.note !== null) {
    return no('Le note del setter le scrive il setter (o l’admin): le tue sono le note aggiuntive, con dettagli_call.')
  }
  const esito = await operazioni.modificaCall(nucleo(ctx), {
    call_id: c.id,
    tipo: input.tipo ?? c.tipo,
    data: input.data ?? oggiRoma(new Date(c.programmata_il)),
    ora: input.ora ?? formatOra(c.programmata_il),
    closer_id: input.closer_id ?? c.closer_id,
    note: input.note === undefined || input.note === null ? c.note_setter : input.note,
  })
  if (!esito.ok) return no(esito.errore)
  const dopo = await leggiUna(ctx, c.id)
  return ok({ esito: 'salvata', call: dopo ? callPerClaude(dopo, ctx, true) : { id: c.id } })
}

export async function dettagliCall(input: DettagliCallInput, ctx: ContestoMcp): Promise<EsitoStrumento> {
  const c = await leggiUna(ctx, input.call_id)
  if (!c) return no(CALL_NON_TROVATA, 'non_trovato')
  // dettagli_call writes all five fields: what Claude did not say stays as it is, "" clears
  const valore = <T>(detto: T | '' | null | undefined, salvato: T | null): T | null =>
    detto === undefined || detto === null ? salvato : detto === '' ? null : detto
  const esito = await operazioni.modificaCall(nucleo(ctx), {
    call_id: c.id,
    tipo: c.tipo,
    data: oggiRoma(new Date(c.programmata_il)),
    ora: formatOra(c.programmata_il),
    closer_id: c.closer_id,
    // the setter's note stays as it is (the closer never sends it; the admin keeps it)
    note: c.note_setter,
    dettagli: {
      link_registrazione: valore(input.link_registrazione, c.link_registrazione),
      performance: valore(input.performance, c.performance),
      prodotto_proposto_id: valore(input.prodotto_proposto_id, c.prodotto_proposto_id),
      importo_proposto: valore(input.importo_proposto, c.importo_proposto),
      note_closer: valore(input.note_closer, c.note_closer),
    },
  })
  if (!esito.ok) return no(esito.errore)
  const dopo = await leggiUna(ctx, c.id)
  return ok({ esito: 'salvata', call: dopo ? callPerClaude(dopo, ctx, true) : { id: c.id } })
}

// ── stato_lead ───────────────────────────────────────────────────────────────
export async function statoLead(input: StatoLeadInput, ctx: ContestoMcp): Promise<EsitoStrumento> {
  const esito = await operazioni.aggiornaStatoLead(nucleo(ctx), { lead_id: input.lead_id, stato: input.stato })
  if (!esito.ok) return no(esito.errore === 'Lead non trovato o non tuo' ? LEAD_NON_TROVATO : esito.errore)
  return ok({ esito: 'salvato', lead_id: input.lead_id, stato: ETICHETTA_STATO_LEAD[input.stato] })
}
