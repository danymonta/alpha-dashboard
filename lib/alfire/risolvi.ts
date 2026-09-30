import 'server-only'

import type { AppRole } from '@/lib/auth/roles'
import type { Profilo } from '@/lib/auth/session'
import { aggiungiMesi, formatOra, oggiRoma } from '@/lib/date'
import { formatData, formatEuro, formatMese } from '@/lib/format'
import type { createClient } from '@/lib/supabase/server'
import { normalizzaHandle } from '@/lib/validation/call'
import { ETICHETTA_STATO_LEAD } from '@/lib/validation/lead'

/**
 * From the names people say to the rows they mean, with the user's own
 * session (RLS decides what can be found). Tools and confirmation cards use
 * the same resolvers, so the card shows the row the tool will write. When
 * more rows fit, the answer is an error that names them: the model asks which
 * one, it never picks.
 */
export type Supabase = Awaited<ReturnType<typeof createClient>>
export type Errore = { errore: string }

/** Tool results stay small: the free tier counts every token. */
export function errore(messaggio: string): Errore {
  return { errore: messaggio }
}

export function isErrore(v: unknown): v is Errore {
  return typeof v === 'object' && v !== null && 'errore' in v && typeof (v as Errore).errore === 'string'
}

/** A query that failed is never "nothing found": the model must not take it as an answer. */
const NON_LETTO = 'Non riesco a leggere i dati in questo momento: riprova tra poco.'

/** Text for an ilike pattern: the characters PostgREST or LIKE would read differently match any one character. */
function perIlike(testo: string): string {
  return testo.trim().replace(/[%_*,()"\\]/g, '_')
}

function minuscolo(testo: string | null | undefined): string {
  return (testo ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

/** Finds one row by name among a few: exact first, then "contains", then all the words in any order. */
export function trova<T extends { nome: string | null }>(righe: T[], nome: string): T | null | 'ambiguo' {
  const cerca = minuscolo(nome)
  if (!cerca) return null
  const esatti = righe.filter((r) => minuscolo(r.nome) === cerca)
  if (esatti.length === 1) return esatti[0]
  if (esatti.length > 1) return 'ambiguo'
  const simili = righe.filter((r) => minuscolo(r.nome).includes(cerca))
  if (simili.length === 1) return simili[0]
  if (simili.length > 1) return 'ambiguo'
  const parole = cerca.split(' ')
  const conTutte = righe.filter((r) => parole.every((p) => minuscolo(r.nome).split(' ').includes(p)))
  if (conTutte.length === 1) return conTutte[0]
  return conTutte.length > 1 ? 'ambiguo' : null
}

/** The rows `trova` hesitated between, for the error that lists them. */
function candidati<T extends { nome: string | null }>(righe: T[], nome: string): T[] {
  const cerca = minuscolo(nome)
  const parole = cerca.split(' ')
  return righe.filter(
    (r) => minuscolo(r.nome).includes(cerca) || parole.every((p) => minuscolo(r.nome).split(' ').includes(p)),
  )
}

/**
 * Exactly one row, or an error that lists the candidates (at most six) and
 * says what would tell them apart.
 */
export function unico<T>(
  righe: readonly T[],
  etichetta: (r: T) => string,
  { nessuno, piu, come }: { nessuno: string; piu: string; come: string },
): T | Errore {
  if (righe.length === 1) return righe[0]
  if (righe.length === 0) return errore(nessuno)
  const elenco = righe.slice(0, 6).map(etichetta).join('; ')
  return errore(`${piu}: ${elenco}${righe.length > 6 ? '; …' : ''}. ${come}`)
}

const IO = ['io', 'me', 'a me', 'me stesso', 'me stessa']
const NESSUNO = ['nessuno', 'nessuna', '-']

export function isIo(nome: string | null | undefined): boolean {
  return IO.includes(minuscolo(nome))
}

export function isNessuno(nome: string | null | undefined): boolean {
  return NESSUNO.includes(minuscolo(nome))
}

/** "2026-03", "2026-03-10", "2026-03-01" -> "2026-03"; null otherwise. */
export function meseDi(valore: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})/.exec(valore?.trim() ?? '')
  return m && Number(m[2]) >= 1 && Number(m[2]) <= 12 ? `${m[1]}-${m[2]}` : null
}

export function nomeCompleto(c: { nome: string | null; cognome?: string | null }): string {
  return [c.nome, c.cognome].filter(Boolean).join(' ')
}

const STATO_RATA: Record<string, string> = {
  prevista: 'da incassare',
  incassata: 'incassata',
  fallita: 'fallita',
  rimborsata: 'rimborso',
}

const ETICHETTA_TIPO: Record<string, string> = { nuovo: 'Primo percorso', rinnovo: 'Rinnovo', upsell: 'Upsell' }

export type Rata = {
  payment_id: string
  sale_id: string
  cliente: string
  tipo: string
  numero_rata: number
  scadenza: string
  importo_previsto: number
  stato: string
  incassato_il: string | null
  importo_incassato: number | null
  metodo: string | null
  /** From v_vendite: how many instalments the sale has, and when it was signed. */
  rate_totali: number | null
  data_vendita: string | null
}

/** "rata 2 di 4" */
export function numeroRata(r: Pick<Rata, 'numero_rata' | 'rate_totali'>): string {
  return r.rate_totali ? `rata ${r.numero_rata} di ${r.rate_totali}` : `rata ${r.numero_rata}`
}

/** "Rata 2 di 4 (scadenza 10/03/2026, 500,00 €, da incassare)" */
export function etichettaRata(r: Rata, conVendita = false): string {
  const quando =
    r.stato === 'incassata' && r.incassato_il
      ? `incassata il ${formatData(r.incassato_il)}, ${formatEuro(r.importo_incassato)}`
      : `scadenza ${formatData(r.scadenza)}, ${formatEuro(r.importo_previsto)}, ${STATO_RATA[r.stato] ?? r.stato}`
  const vendita = conVendita && r.data_vendita ? ` · ${ETICHETTA_TIPO[r.tipo] ?? r.tipo} del ${formatData(r.data_vendita)}` : ''
  const n = numeroRata(r)
  return `${n[0].toUpperCase()}${n.slice(1)} (${quando})${vendita}`
}

const CAMPI_VENDITA =
  'id, tipo, product_id, prodotto_personalizzato, valore_contratto, numero_rate, data_vendita, data_inizio, data_fine, setter_id, closer_id, note, prodotto:products(nome)'

export type Vendita = {
  id: string
  tipo: 'nuovo' | 'rinnovo' | 'upsell'
  product_id: string | null
  prodotto_personalizzato: string | null
  valore_contratto: number
  numero_rate: number
  data_vendita: string
  data_inizio: string
  data_fine: string
  setter_id: string | null
  closer_id: string | null
  note: string | null
  prodotto: { nome: string } | null
}

/** "del 10/01/2026 (Rinnovo, 1.500,00 €)" */
export function etichettaVendita(v: Pick<Vendita, 'data_vendita' | 'tipo' | 'valore_contratto'>): string {
  return `del ${formatData(v.data_vendita)} (${ETICHETTA_TIPO[v.tipo] ?? v.tipo}, ${formatEuro(v.valore_contratto)})`
}

export type Call = {
  id: string
  tipo: 'discovery' | 'strategy'
  programmata_il: string
  stato: string
  esito: string | null
  qualificata: boolean | null
  closer_id: string
  setter_id: string | null
  /** "Note del setter" */
  note: string | null
  /** "Note aggiuntive" of the closer */
  note_closer: string | null
  /** "Motivo di non chiusura": the outcome card shows it before → after, or that it goes */
  obiezione_principale: string | null
  link_registrazione: string | null
  performance: string | null
  prodotto_proposto_id: string | null
  lead_id: string
  lead: { nome: string; stato: string; fonte: string } | null
}

const CAMPI_CALL =
  'id, tipo, programmata_il, stato, esito, qualificata, closer_id, setter_id, note, note_closer, obiezione_principale, link_registrazione, performance, prodotto_proposto_id, lead_id, lead:leads(nome, stato, fonte)'

/** "12/09/2026 alle 15:00" in Europe/Rome */
export function quandoCall(c: Pick<Call, 'programmata_il'>): string {
  return `${formatData(oggiRoma(new Date(c.programmata_il)))} alle ${formatOra(c.programmata_il)}`
}

export type Lead = {
  id: string
  nome: string
  instagram_handle: string | null
  fonte: string
  stato: string
  note: string | null
  setter_id: string | null
  created_at: string
}

export type Costo = { id: string; data: string; categoria: string; descrizione: string; importo: number; ricorrente: boolean }

const CAMPI_TASK =
  'id, titolo, progetto_id, tasklist_id, parent_id, descrizione, stato, priorita, data_inizio, scadenza, stima_minuti, assegnatari, sotto_task_totali'

export type TaskTrovato = {
  id: string
  titolo: string
  progetto_id: string
  tasklist_id: string | null
  parent_id: string | null
  descrizione: string | null
  stato: string
  priorita: string
  data_inizio: string | null
  scadenza: string | null
  stima_minuti: number | null
  assegnatari: string[] | null
  sotto_task_totali: number | null
}

export type Risolutori = ReturnType<typeof risolutori>

export function risolutori(supabase: Supabase, profilo: Profilo) {
  /** Names of people by id, from the team directory (readable by everyone). */
  async function nomi(ids: readonly (string | null | undefined)[]): Promise<Map<string, string>> {
    const unici = [...new Set(ids.filter((id): id is string => Boolean(id)))]
    if (unici.length === 0) return new Map()
    const { data } = await supabase.from('profiles').select('id, nome').in('id', unici)
    return new Map((data ?? []).map((p) => [p.id, p.nome]))
  }

  /** A client by name, among the clients the user can see; a new name is fine only for a first sale. */
  async function trovaCliente(
    nome: string,
    { anchePerNuovo = false }: { anchePerNuovo?: boolean } = {},
  ): Promise<{ id: string; nome: string } | null | Errore> {
    const parole = nome.trim().split(/\s+/).filter(Boolean)
    if (parole.length === 0) return errore('Scrivi il nome del cliente.')
    const primo = parole[0].replace(/[%,()"]/g, '')
    const { data, error } = await supabase
      .from('clients')
      .select('id, nome, cognome')
      .or(`nome.ilike.%${primo}%,cognome.ilike.%${primo}%`)
      .limit(50)
    // never "a new client" because the read failed: a sale would create a double
    if (error) return errore(NON_LETTO)
    const righe = (data ?? []).map((c) => ({ id: c.id, nome: nomeCompleto(c) }))
    const trovato = trova(righe, nome)
    if (trovato === 'ambiguo') {
      return errore(
        `Più clienti possibili: ${candidati(righe, nome)
          .slice(0, 5)
          .map((r) => r.nome)
          .join(', ')}. Chiedi quale, con nome e cognome.`,
      )
    }
    if (trovato) return trovato
    return anchePerNuovo ? null : errore(`Nessun cliente "${nome}". Controlla il nome o crealo prima.`)
  }

  /**
   * A person's id from a name: "io" is whoever chats, "nessuno" empties the
   * field, nothing keeps the current value.
   */
  async function idPersona(
    nome: string | undefined,
    attuale: string | null,
    ruoli: readonly AppRole[],
  ): Promise<string | null | Errore> {
    if (!nome?.trim()) return attuale
    if (isIo(nome)) return profilo.id
    if (isNessuno(nome)) return null
    const p = await persona(nome, ruoli)
    return isErrore(p) ? p : p.id
  }

  /** One active person of the team by name ("io" = whoever chats). */
  async function persona(nome: string, ruoli?: readonly AppRole[]): Promise<{ id: string; nome: string } | Errore> {
    if (isIo(nome)) return { id: profilo.id, nome: profilo.nome }
    let q = supabase.from('profiles').select('id, nome, ruolo').eq('attivo', true)
    if (ruoli) q = q.in('ruolo', ruoli as AppRole[])
    const { data, error } = await q
    if (error) return errore(NON_LETTO)
    const trovato = trova(data ?? [], nome)
    if (!trovato || trovato === 'ambiguo') {
      return errore(`Persona "${nome}" non trovata o non univoca. Possibili: ${(data ?? []).map((p) => p.nome).join(', ')}`)
    }
    return { id: trovato.id, nome: trovato.nome }
  }

  /**
   * A client's sale. `recente`: the latest (or the one signed on data_vendita);
   * `in_corso`: the one running today; `unica`: never chosen for the user.
   */
  async function trovaVendita(
    cliente: string,
    { data_vendita, scelta }: { data_vendita?: string; scelta: 'recente' | 'in_corso' | 'unica' },
  ): Promise<{ cliente: { id: string; nome: string }; vendita: Vendita } | Errore> {
    const c = await trovaCliente(cliente)
    if (!c) return errore('Cliente non trovato.')
    if (isErrore(c)) return c
    let q = supabase.from('sales').select(CAMPI_VENDITA).eq('client_id', c.id).order('data_vendita', { ascending: false })
    if (data_vendita) q = q.eq('data_vendita', data_vendita)
    const { data, error } = await q.limit(20)
    if (error) return errore(NON_LETTO)
    const vendite = (data ?? []) as unknown as Vendita[]
    if (vendite.length === 0) {
      return errore(`${c.nome} non ha vendite${data_vendita ? ` firmate il ${formatData(data_vendita)}` : ''}.`)
    }
    if (vendite.length === 1 || scelta === 'recente') return { cliente: c, vendita: vendite[0] }
    if (scelta === 'in_corso') {
      const oggi = oggiRoma()
      const inCorso = vendite.filter((v) => v.data_inizio <= oggi && v.data_fine >= oggi)
      if (inCorso.length === 1) return { cliente: c, vendita: inCorso[0] }
    }
    const scelta_ = unico(vendite, etichettaVendita, {
      nessuno: `${c.nome} non ha vendite.`,
      piu: `${c.nome} ha più vendite`,
      come: 'Chiedi quale, con la data di vendita.',
    })
    return isErrore(scelta_) ? scelta_ : { cliente: c, vendita: scelta_ }
  }

  /**
   * An instalment by client and number or month of the due date (or by id),
   * among the ones the action can touch. Refund rows are never a target.
   */
  async function trovaRata(
    cliente: string,
    scelta: { payment_id?: string; numero?: number; mese?: string; data_vendita?: string },
    stati: readonly string[],
  ): Promise<Rata | Errore> {
    const campi =
      'payment_id, sale_id, cliente, tipo, numero_rata, scadenza, importo_previsto, stato, incassato_il, importo_incassato, metodo'
    let righe: Omit<Rata, 'rate_totali' | 'data_vendita'>[]
    let nome = cliente
    if (scelta.payment_id) {
      const { data, error } = await supabase.from('v_rate').select(campi).eq('payment_id', scelta.payment_id).limit(1)
      if (error) return errore(NON_LETTO)
      righe = (data ?? []) as typeof righe
      if (righe.length === 0) return errore('Rata non trovata.')
      nome = righe[0].cliente
    } else {
      const c = await trovaCliente(cliente)
      if (!c) return errore('Cliente non trovato.')
      if (isErrore(c)) return c
      nome = c.nome
      const { data, error } = await supabase.from('v_rate').select(campi).eq('client_id', c.id).order('scadenza').limit(100)
      if (error) return errore(NON_LETTO)
      righe = (data ?? []) as typeof righe
    }

    const vendite = new Map<string, { data_vendita: string; rate_totali: number }>()
    const idVendite = [...new Set(righe.map((r) => r.sale_id))]
    if (idVendite.length > 0) {
      const { data, error } = await supabase.from('v_vendite').select('sale_id, data_vendita, rate_totali').in('sale_id', idVendite)
      if (error) return errore(NON_LETTO)
      for (const v of data ?? []) {
        if (v.sale_id) vendite.set(v.sale_id, { data_vendita: v.data_vendita ?? '', rate_totali: Number(v.rate_totali ?? 0) })
      }
    }
    const tutte: Rata[] = righe
      .filter((r) => r.stato !== 'rimborsata')
      .map((r) => ({
        ...r,
        importo_previsto: Number(r.importo_previsto),
        importo_incassato: r.importo_incassato === null ? null : Number(r.importo_incassato),
        rate_totali: vendite.get(r.sale_id)?.rate_totali ?? null,
        data_vendita: vendite.get(r.sale_id)?.data_vendita ?? null,
      }))
    const piuVendite = vendite.size > 1

    const mese = meseDi(scelta.mese)
    const filtrate = tutte.filter(
      (r) =>
        (!scelta.numero || r.numero_rata === scelta.numero) &&
        (!mese || r.scadenza.startsWith(mese)) &&
        (!scelta.data_vendita || r.data_vendita === scelta.data_vendita),
    )
    const criteri = [
      scelta.numero ? `numero ${scelta.numero}` : null,
      mese ? `in scadenza a ${formatMese(`${mese}-01`)}` : null,
      scelta.data_vendita ? `della vendita del ${formatData(scelta.data_vendita)}` : null,
    ].filter(Boolean)
    if (filtrate.length === 0) {
      return errore(
        tutte.length === 0
          ? `${nome} non ha rate.`
          : `Nessuna rata di ${nome}${criteri.length ? ` ${criteri.join(', ')}` : ''}. Rate: ${tutte
              .slice(0, 6)
              .map((r) => etichettaRata(r, piuVendite))
              .join('; ')}.`,
      )
    }
    const adatte = filtrate.filter((r) => stati.includes(r.stato))
    if (adatte.length === 0) {
      return errore(
        `Nessuna rata adatta tra quelle indicate (servono rate ${stati.map((s) => STATO_RATA[s] ?? s).join(' o ')}): ${filtrate
          .slice(0, 6)
          .map((r) => etichettaRata(r, piuVendite))
          .join('; ')}.`,
      )
    }
    return unico(adatte, (r) => etichettaRata(r, piuVendite), {
      nessuno: 'Rata non trovata.',
      piu: `Più rate possibili di ${nome}`,
      come: 'Chiedi quale, con il numero della rata o il mese.',
    })
  }

  /** A cost by id, or by its description (exact first), in a month when given. */
  async function trovaCosto({ id, costo, mese }: { id?: string; costo?: string; mese?: string }): Promise<Costo | Errore> {
    const campi = 'id, data, categoria, descrizione, importo, ricorrente'
    if (id) {
      const { data, error } = await supabase.from('expenses').select(campi).eq('id', id).maybeSingle()
      if (error) return errore(NON_LETTO)
      return data ? { ...data, importo: Number(data.importo) } : errore('Costo non trovato.')
    }
    const testo = costo?.trim().replace(/[%,()"]/g, ' ') ?? ''
    if (!testo) return errore('Dimmi quale costo: la descrizione o il mese.')
    let q = supabase.from('expenses').select(campi).ilike('descrizione', `%${testo}%`)
    const m = meseDi(mese)
    // up to the first of the next month: "-31" does not exist in 30-day months and February
    if (m) q = q.gte('data', `${m}-01`).lt('data', aggiungiMesi(`${m}-01`, 1))
    const { data, error } = await q.order('data', { ascending: false }).limit(30)
    if (error) return errore(NON_LETTO)
    const righe = (data ?? []).map((c) => ({ ...c, importo: Number(c.importo) }))
    const esatti = righe.filter((c) => minuscolo(c.descrizione) === minuscolo(testo))
    return unico(
      esatti.length > 0 ? esatti : righe,
      (c) => `«${c.descrizione}» del ${formatData(c.data)} (${formatEuro(c.importo)})`,
      {
        nessuno: `Nessun costo "${costo}"${m ? ` a ${formatMese(`${m}-01`)}` : ''}.`,
        piu: 'Più costi possibili',
        come: 'Chiedi quale, con il mese.',
      },
    )
  }

  /** A lead by name, or by Instagram handle when the text starts with @. */
  async function trovaLead(testo: string): Promise<Lead | Errore> {
    const t = testo.trim()
    if (!t) return errore('Dimmi il nome del lead.')
    const campi = 'id, nome, instagram_handle, fonte, stato, note, setter_id, created_at'
    if (t.startsWith('@')) {
      const { data, error } = await supabase.from('leads').select(campi).eq('instagram_handle', normalizzaHandle(t) ?? '').limit(10)
      if (error) return errore(NON_LETTO)
      return unico((data ?? []) as Lead[], etichettaLead, {
        nessuno: `Nessun lead ${t}.`,
        piu: `Più lead ${t}`,
        come: 'Chiedi quale.',
      })
    }
    const primo = t.split(/\s+/)[0].replace(/[%,()"]/g, '')
    const { data, error } = await supabase.from('leads').select(campi).ilike('nome', `%${primo}%`).limit(50)
    if (error) return errore(NON_LETTO)
    const righe = (data ?? []) as Lead[]
    const esatti = righe.filter((l) => minuscolo(l.nome) === minuscolo(t))
    const trovati = esatti.length > 0 ? esatti : candidati(righe, t)
    return unico(trovati, etichettaLead, {
      nessuno: `Nessun lead "${t}" tra quelli che vedi.`,
      piu: 'Più lead possibili',
      come: 'Chiedi quale (nome completo o @handle).',
    })
  }

  function etichettaLead(l: Lead): string {
    return `${l.nome}${l.instagram_handle ? ` (${l.instagram_handle})` : ''}, ${ETICHETTA_STATO_LEAD[l.stato as keyof typeof ETICHETTA_STATO_LEAD] ?? l.stato}`
  }

  /**
   * A call by id, or by its lead's name. Among several calls of a lead, the one
   * still to be done when there is exactly one.
   */
  async function trovaCall({ call_id, lead }: { call_id?: string; lead?: string }): Promise<Call | Errore> {
    if (call_id) {
      const { data, error } = await supabase.from('calls').select(CAMPI_CALL).eq('id', call_id).maybeSingle()
      if (error) return errore(NON_LETTO)
      return data ? (data as unknown as Call) : errore('Call non trovata o non tua.')
    }
    const l = await trovaLead(lead ?? '')
    if (isErrore(l)) return l
    const { data, error } = await supabase
      .from('calls')
      .select(CAMPI_CALL)
      .eq('lead_id', l.id)
      .order('programmata_il', { ascending: false })
      .limit(10)
    if (error) return errore(NON_LETTO)
    const call = (data ?? []) as unknown as Call[]
    if (call.length > 1) {
      const aperte = call.filter((c) => c.stato === 'programmata' || c.stato === 'riprogrammata')
      if (aperte.length === 1) return aperte[0]
    }
    return unico(call, (c) => `${quandoCall(c)} (${c.esito ?? c.stato})`, {
      nessuno: `${l.nome} non ha call che vedi.`,
      piu: `Più call con ${l.nome}`,
      come: 'Chiedi quale, con data e ora (o passa il call_id).',
    })
  }

  async function trovaProdotto(nome: string) {
    const { data, error } = await supabase
      .from('products')
      .select('id, nome, durata_mesi, prezzo_listino, attivo, piano_predefinito')
      .order('nome')
    if (error) return errore(NON_LETTO)
    const elenco = data ?? []
    const p = trova(elenco, nome)
    if (!p || p === 'ambiguo') return errore(`Prodotto "${nome}" non trovato o non univoco. Prodotti: ${elenco.map((x) => x.nome).join(', ')}`)
    return { ...p, prezzo_listino: Number(p.prezzo_listino) }
  }

  async function trovaProgetto(nome: string) {
    const { data, error } = await supabase
      .from('v_pm_progetti')
      .select('id, nome, reparto_id, client_id, stato, descrizione, data_inizio, data_fine, responsabile_id, task_totali')
      .order('nome')
      .limit(200)
    if (error) return errore(NON_LETTO)
    const elenco = (data ?? []) as {
      id: string
      nome: string
      reparto_id: string
      client_id: string | null
      stato: string
      descrizione: string | null
      data_inizio: string | null
      data_fine: string | null
      responsabile_id: string | null
      task_totali: number | null
    }[]
    const p = trova(elenco, nome)
    if (p === 'ambiguo') {
      return errore(`Più progetti possibili: ${candidati(elenco, nome).slice(0, 5).map((x) => x.nome).join(', ')}. Chiedi quale.`)
    }
    return p ?? errore(`Progetto "${nome}" non trovato tra quelli che vedi.`)
  }

  async function trovaLista(progettoId: string, nome: string) {
    const { data, error } = await supabase
      .from('v_pm_tasklist')
      .select('id, nome, descrizione, data_inizio, data_fine, task_totali')
      .eq('progetto_id', progettoId)
      .order('ordine')
    if (error) return errore(NON_LETTO)
    const elenco = (data ?? []) as {
      id: string
      nome: string
      descrizione: string | null
      data_inizio: string | null
      data_fine: string | null
      task_totali: number
    }[]
    const l = trova(elenco, nome)
    if (!l || l === 'ambiguo') {
      return errore(`Lista "${nome}" non trovata o non univoca. Liste: ${elenco.map((x) => x.nome).join(', ') || 'nessuna'}`)
    }
    return l
  }

  /** People of a project, from its members (the database checks membership again). */
  async function membri(progettoId: string): Promise<{ id: string; nome: string }[]> {
    const { data } = await supabase
      .from('pm_membri')
      .select('profilo:profiles!pm_membri_profile_id_fkey(id, nome)')
      .eq('progetto_id', progettoId)
    return (data ?? []).flatMap((m) => (m.profilo ? [m.profilo] : []))
  }

  async function idMembri(progettoId: string, persone: readonly string[]): Promise<string[] | Errore> {
    if (persone.length === 0) return []
    const elenco = await membri(progettoId)
    const ids: string[] = []
    for (const nome of persone) {
      if (isIo(nome)) {
        ids.push(profilo.id)
        continue
      }
      const scelto = trova(elenco, nome)
      if (!scelto || scelto === 'ambiguo') {
        return errore(`"${nome}" non è tra i membri del progetto. Membri: ${elenco.map((x) => x.nome).join(', ')}`)
      }
      ids.push(scelto.id)
    }
    return [...new Set(ids)]
  }

  /**
   * A task by id, or by title among the visible ones, inside the project when
   * it is known (by id, or the projects whose name fits): the exact title
   * wins; between tasks with the same exact title, the one assigned to me.
   * Otherwise the question names project and due date of each candidate.
   */
  async function trovaTask(
    titolo: string,
    dove: { task_id?: string; progettoId?: string; progetto?: string } = {},
  ): Promise<TaskTrovato | Errore> {
    if (dove.task_id) {
      const { data, error } = await supabase.from('v_pm_task').select(CAMPI_TASK).eq('id', dove.task_id).maybeSingle()
      if (error) return errore(NON_LETTO)
      const t = data as TaskTrovato | null
      return t && (!dove.progettoId || t.progetto_id === dove.progettoId) ? t : errore('Task non trovato tra quelli che vedi.')
    }
    const cercato = minuscolo(titolo)
    if (!cercato) return errore('Dimmi il titolo del task.')

    let progetti: string[] | null = dove.progettoId ? [dove.progettoId] : null
    if (!progetti && dove.progetto?.trim()) {
      const { data, error } = await supabase.from('v_pm_progetti').select('id').ilike('nome', `%${perIlike(dove.progetto)}%`).limit(50)
      if (error) return errore(NON_LETTO)
      progetti = (data ?? []).map((p) => p.id).filter((id): id is string => Boolean(id))
      if (progetti.length === 0) return errore(`Progetto "${dove.progetto}" non trovato tra quelli che vedi.`)
    }
    // the project filter goes into the query, before the limit: a template title repeats in every client's project
    async function cerca(schema: string): Promise<TaskTrovato[] | Errore> {
      let q = supabase.from('v_pm_task').select(CAMPI_TASK).ilike('titolo', schema)
      if (progetti) q = q.in('progetto_id', progetti)
      const { data, error } = await q.order('scadenza', { nullsFirst: false }).order('id').limit(50)
      return error ? errore(NON_LETTO) : ((data ?? []) as TaskTrovato[])
    }

    const trovati = await cerca(perIlike(titolo))
    if (isErrore(trovati)) return trovati
    const esatti = trovati.filter((t) => minuscolo(t.titolo) === cercato)
    if (esatti.length === 1) return esatti[0]
    let dubbi = esatti
    if (esatti.length > 1) {
      const miei = esatti.filter((t) => (t.assegnatari ?? []).includes(profilo.id))
      if (miei.length === 1) return miei[0]
    } else {
      const simili = await cerca(`%${perIlike(titolo)}%`)
      if (isErrore(simili)) return simili
      dubbi = simili.filter((t) => minuscolo(t.titolo).includes(cercato))
      if (dubbi.length === 1) return dubbi[0]
    }
    if (dubbi.length === 0) return errore(`Task "${titolo}" non trovato${progetti ? ' nel progetto' : ''}.`)

    const { data: nomiProgetti } = await supabase
      .from('v_pm_progetti')
      .select('id, nome')
      .in('id', [...new Set(dubbi.map((t) => t.progetto_id))])
    const progetto = new Map((nomiProgetti ?? []).map((p) => [p.id, p.nome]))
    const elenco = dubbi
      .slice(0, 6)
      .map((t) => {
        const dove_ = progetto.get(t.progetto_id)
        return `«${t.titolo}»${dove_ ? ` in ${dove_}` : ''}${t.scadenza ? `, scadenza ${formatData(t.scadenza)}` : ''}`
      })
      .join('; ')
    return errore(
      `Più task possibili: ${elenco}${dubbi.length > 6 ? '; …' : ''}. Chiedi quale (il progetto, o passa il task_id da progetto_dettaglio o miei_task).`,
    )
  }

  /** The commission rule of a person in force on a day (default today). */
  async function trovaRegola(personaId: string, allaData?: string) {
    const { data, error } = await supabase
      .from('commission_rules')
      .select('id, percentuale, applica_a, valida_dal, valida_al')
      .eq('profile_id', personaId)
      .order('valida_dal', { ascending: false })
    if (error) return errore(NON_LETTO)
    const regole = (data ?? []).map((r) => ({ ...r, percentuale: Number(r.percentuale) }))
    const giorno = allaData ?? oggiRoma()
    const valide = regole.filter((r) => r.valida_dal <= giorno && (!r.valida_al || r.valida_al >= giorno))
    return unico(valide, etichettaRegola, {
      nessuno:
        regole.length === 0
          ? 'Nessuna regola provvigionale per questa persona.'
          : `Nessuna regola valida il ${formatData(giorno)}. Regole: ${regole.map(etichettaRegola).join('; ')}. Indica alla_data.`,
      piu: 'Più regole valide',
      come: 'Indica alla_data.',
    })
  }

  /** A payout of this person: by id (still his, whatever id the chat passes) or by the month it refers to. */
  async function trovaPagamento(personaId: string, periodo: string, id?: string) {
    const campi = 'id, periodo, importo, pagato_il, metodo, note'
    let q = supabase.from('commission_payouts').select(campi).eq('profile_id', personaId)
    q = id ? q.eq('id', id) : q.eq('periodo', periodo)
    const { data, error } = await q.order('pagato_il')
    if (error) return errore(NON_LETTO)
    const righe = (data ?? []).map((p) => ({ ...p, importo: Number(p.importo) }))
    return unico(righe, (p) => `${formatEuro(p.importo)} pagati il ${formatData(p.pagato_il)}`, {
      nessuno: id ? 'Pagamento non trovato tra quelli di questa persona.' : `Nessun pagamento per ${formatMese(periodo)}.`,
      piu: `Più pagamenti per ${formatMese(periodo)}`,
      come: 'Chiedi quale (o passa l’id da provvigioni).',
    })
  }

  async function trovaNota(progettoId: string, { nota_id, data }: { nota_id?: string; data?: string }) {
    let q = supabase.from('pm_note').select('id, data, testo, autore_id').eq('progetto_id', progettoId)
    if (nota_id) q = q.eq('id', nota_id)
    else if (data) q = q.eq('data', data)
    const { data: righe, error } = await q.order('data', { ascending: false }).limit(20)
    if (error) return errore(NON_LETTO)
    return unico(righe ?? [], (n) => `${formatData(n.data)}: «${n.testo.replace(/\s+/g, ' ').slice(0, 60)}»`, {
      nessuno: 'Nota non trovata.',
      piu: 'Più note possibili',
      come: 'Chiedi quale (data o nota_id da progetto_dettaglio).',
    })
  }

  /** One of MY time entries: never anybody else's, whatever RLS would allow a manager. */
  async function trovaVoce({ voce_id, progettoId, data }: { voce_id?: string; progettoId?: string; data?: string }) {
    let q = supabase
      .from('pm_tempo')
      .select('id, progetto_id, task_id, data, minuti, nota, inizio, fine, progetto:pm_progetti(nome)')
      .eq('profile_id', profilo.id)
    if (voce_id) q = q.eq('id', voce_id)
    if (progettoId) q = q.eq('progetto_id', progettoId)
    if (data) q = q.eq('data', data)
    const { data: righe, error } = await q.order('data', { ascending: false }).limit(20)
    if (error) return errore(NON_LETTO)
    return unico(
      righe ?? [],
      (v) => `${formatData(v.data)}, ${v.minuti ?? 0} min su «${v.progetto?.nome ?? '?'}»`,
      { nessuno: 'Voce di tempo non trovata tra le tue.', piu: 'Più voci possibili', come: 'Chiedi quale (voce_id da mio_tempo).' },
    )
  }

  /** My running timer, if any. */
  async function timerAcceso() {
    const { data } = await supabase
      .from('pm_tempo')
      .select('id, inizio, progetto:pm_progetti(nome), task:pm_task(titolo)')
      .eq('profile_id', profilo.id)
      .not('inizio', 'is', null)
      .is('fine', null)
      .limit(1)
    return data?.[0] ?? null
  }

  return {
    nomi,
    trovaCliente,
    idPersona,
    persona,
    trovaVendita,
    trovaRata,
    trovaCosto,
    trovaLead,
    trovaCall,
    trovaProdotto,
    trovaProgetto,
    trovaLista,
    membri,
    idMembri,
    trovaTask,
    trovaRegola,
    trovaPagamento,
    trovaNota,
    trovaVoce,
    timerAcceso,
  }
}

/** "5% su nuovo dal 01/01/2026" (percentuale is a fraction in the database). */
export function etichettaRegola(r: { percentuale: number; applica_a: string[]; valida_dal: string; valida_al: string | null }): string {
  const punti = Math.round(Number(r.percentuale) * 10000) / 100
  return `${String(punti).replace('.', ',')}% su ${r.applica_a.join(', ')} dal ${formatData(r.valida_dal)}${
    r.valida_al ? ` al ${formatData(r.valida_al)}` : ''
  }`
}
