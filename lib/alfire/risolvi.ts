import 'server-only'

import { ETICHETTA_RUOLO, livelloPmEffettivo, type AppRole } from '@/lib/auth/roles'
import type { Profilo } from '@/lib/auth/session'
import { aggiungiMesi, formatOra, giornoEsteso, oggiRoma } from '@/lib/date'
import { formatData, formatEuro, formatMese } from '@/lib/format'
import { ETICHETTA_STATO_PROGETTO, formatStima, type StatoProgetto } from '@/lib/progetti'
import type { createClient } from '@/lib/supabase/server'
import { normalizzaHandle } from '@/lib/validation/call'
import { ETICHETTA_STATO_LEAD } from '@/lib/validation/lead'
import { fasciaDellaVoce } from '@/lib/validation/tempo'

/**
 * From the names people say to the rows they mean, with the user's own
 * session (RLS decides what can be found). Tools and confirmation cards use
 * the same resolvers, so the card shows the row the tool will write. When
 * more rows fit, the answer is an error that names them: the model asks which
 * one, it never picks.
 */
export type Supabase = Awaited<ReturnType<typeof createClient>>
/**
 * errore: what the person reads when a card stops («Non l’ho fatto: …») or a
 * write fails, in plain Italian, never a tool or a field name. per_alfire:
 * what only the model reads (which tool or field to use, what to ask), with
 * the tool result and after the card's reason (motivoAlModello).
 */
export type Errore = { errore: string; per_alfire?: string }

/** Tool results stay small: the free tier counts every token. */
export function errore(messaggio: string, perAlfire?: string): Errore {
  return perAlfire ? { errore: messaggio, per_alfire: perAlfire } : { errore: messaggio }
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

/** Little words a title said aloud gains or loses: "le call di check", "revisione dei video". */
const PAROLE_VUOTE = new Set(
  'a ad al alla alle allo ai agli all con d da dal dalla dei degli del della delle dell dello di e ed gli i il in l la le lo nel nella nei per su sul sulla un una uno'.split(' '),
)

/** The words that tell a title apart: no accents, no apostrophes, no little words. */
function paroleChiave(testo: string | null | undefined): string[] {
  return (testo ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((p) => p && !PAROLE_VUOTE.has(p))
}

/**
 * A title said differently (Dany's team dictates them, 03/10/2026): every key
 * word said is a word of the title, or the start of one ("allenam"). "altre
 * attivita", "call check", "programmazione dell'allenamento" find their task.
 */
function titoloDetto(titolo: string, detto: string): boolean {
  const cercate = paroleChiave(detto)
  const parole = paroleChiave(titolo)
  return cercate.length > 0 && cercate.every((c) => parole.some((p) => p === c || (c.length >= 4 && p.startsWith(c))))
}

/** A task's title as said for it: the same title, or the same key words (titoloDetto). */
export function stessoTask(titolo: string | null | undefined, detto: string | null | undefined): boolean {
  if (!titolo || !detto?.trim()) return false
  return minuscolo(titolo) === minuscolo(detto) || titoloDetto(titolo, detto)
}

/** One letter added, dropped or changed: "Moreti" for Moretti, "Belini" for Bellini. */
function unaLetteraDiDifferenza(a: string, b: string): boolean {
  const [corta, lunga] = a.length <= b.length ? [a, b] : [b, a]
  if (lunga.length - corta.length > 1) return false
  let i = 0
  while (i < corta.length && corta[i] === lunga[i]) i++
  return corta.length === lunga.length ? corta.slice(i + 1) === lunga.slice(i + 1) : corta.slice(i) === lunga.slice(i + 1)
}

/** A word said that stands for a word of a name: the same, its start, or a typo of it (4 letters and up). */
function parolaVicina(parola: string, detta: string): boolean {
  if (parola === detta) return true
  if (parola.length < 4 || detta.length < 4) return false
  return parola.startsWith(detta) || detta.startsWith(parola) || unaLetteraDiDifferenza(parola, detta)
}

/** Names offered when a project is not found: at most this many. */
const PROGETTI_PROPOSTI = 15

/**
 * A project not found ("Stefano Moreti", "Belini", 03/10/2026): the visible
 * ones closest to what was said (the most words in common, without accents,
 * a typo counts), and the model asks which one. A name close to none: who
 * sees every project (the projects admin) reads their names; anyone else
 * reads that he is not in a project with that name and that whoever manages
 * it can add him, as with no project at all: never whether such a client exists.
 */
function progettoNonTrovato(
  elenco: readonly { id: string; nome: string | null }[],
  nome: string,
  distinti: Map<string, string>,
  vedeTutti: boolean,
): Errore {
  const nonTrovato = `Progetto "${nome.trim()}" non trovato tra quelli che vedi.`
  if (elenco.length === 0) return errore(`${nonTrovato} Non sei in nessun progetto: chiedi a chi lo gestisce di aggiungerti.`)
  const dette = paroleChiave(nome)
  const punteggi = elenco.map((p) => {
    const parole = paroleChiave(p.nome)
    return { nome: distinti.get(p.id) ?? p.nome ?? '', punti: dette.filter((d) => parole.some((x) => parolaVicina(x, d))).length }
  })
  const migliore = Math.max(...punteggi.map((p) => p.punti))
  const vicini = migliore > 0 ? punteggi.filter((p) => p.punti === migliore).map((p) => p.nome) : []
  if (vicini.length === 1) return errore(`${nonTrovato} Forse: ${vicini[0]}.`, 'Chiedi se è questo; se sì, usa il suo nome come scritto qui.')
  if (vicini.length === 0 && !vedeTutti) {
    return errore(
      `Non sei in un progetto "${nome.trim()}": vedi solo quelli di cui fai parte. Se è il progetto di un cliente, chi lo gestisce può aggiungerti.`,
      'Non somiglia a nessuno dei suoi progetti: diglielo così, senza proporne altri al suo posto.',
    )
  }
  const nomi = vicini.length > 0 ? vicini : elenco.map((p) => p.nome ?? '')
  const altri = nomi.length > PROGETTI_PROPOSTI ? ` e altri ${nomi.length - PROGETTI_PROPOSTI}` : ''
  // a name that says what tells two homonyms apart has commas in it: then the names go apart with ";"
  const separa = nomi.some((n) => n.includes(',')) ? '; ' : ', '
  return errore(`${nonTrovato} ${vicini.length > 0 ? 'Forse' : 'Progetti'}: ${nomi.slice(0, PROGETTI_PROPOSTI).join(separa)}${altri}.`, 'Chiedi quale.')
}

type ProgettoConNome = { id: string; nome: string | null; data_inizio: string | null; stato: string | null }

/** "marco bianchi dal 01/09/2026": a name said back with or without its brackets and commas. */
function senzaSegni(testo: string | null | undefined): string {
  return minuscolo(testo).replace(/[(),;]/g, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * Projects with one same name: two clients called Marco Bianchi each have
 * their project (03/10/2026). In a question their names say what tells them
 * apart: «Marco Bianchi (dal 01/09/2026)», then the state too, then a number;
 * said back, that name finds its project. A name nobody else has stays as it is.
 */
export function nomiDistinti<T extends ProgettoConNome>(elenco: readonly T[]): Map<string, string> {
  const gruppi = new Map<string, T[]>()
  for (const p of elenco) gruppi.set(minuscolo(p.nome), [...(gruppi.get(minuscolo(p.nome)) ?? []), p])
  const nomi = new Map<string, string>()
  for (const gruppo of gruppi.values()) {
    if (gruppo.length === 1) {
      nomi.set(gruppo[0].id, gruppo[0].nome ?? '')
      continue
    }
    const ordinati = [...gruppo].sort((a, b) => (a.data_inizio ?? '').localeCompare(b.data_inizio ?? '') || a.id.localeCompare(b.id))
    const quando = (p: T) => (p.data_inizio ? `dal ${formatData(p.data_inizio)}` : 'senza date')
    const conStato = (p: T) => `${quando(p)}, ${(ETICHETTA_STATO_PROGETTO[p.stato as StatoProgetto] ?? p.stato ?? '').toLowerCase()}`
    const quanti = (chiave: (p: T) => string) => {
      const n = new Map<string, number>()
      for (const p of ordinati) n.set(chiave(p), (n.get(chiave(p)) ?? 0) + 1)
      return n
    }
    const perData = quanti(quando)
    const perStato = quanti(conStato)
    ordinati.forEach((p, i) => {
      const cosa = perData.get(quando(p)) === 1 ? quando(p) : perStato.get(conStato(p)) === 1 ? conStato(p) : `${conStato(p)}, n. ${i + 1}`
      nomi.set(p.id, `${p.nome ?? ''} (${cosa})`)
    })
  }
  return nomi
}

/** The candidates a task question lists: a title every client has repeats in 13 projects (03/10/2026). */
const CANDIDATI_TASK = 15

/** A title as two people say the same one: no accents, no case, one space. */
function titoloNormale(titolo: string | null | undefined): string {
  return minuscolo((titolo ?? '').normalize('NFD').replace(/[̀-ͯ]/g, ''))
}

/**
 * The same task title said for every client (03/10/2026: «quanto ho dedicato
 * alla revisione video questo mese?»): all the visible tasks with that title,
 * in more than one project. The time on them is summed by SQL
 * (pm_mio_tempo_per_task with p_tasks), never by the model.
 */
export type TaskInPiuProgetti = { titolo: string; task: { id: string; progetto_id: string }[]; progetti: number }

export function isTaskInPiuProgetti(v: unknown): v is TaskInPiuProgetti {
  return typeof v === 'object' && v !== null && Array.isArray((v as TaskInPiuProgetti).task) && typeof (v as TaskInPiuProgetti).progetti === 'number'
}

/** The tasks of one title a sum reads at most: more is "say the client". */
const TASK_IN_PIU_PROGETTI_MAX = 500

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
export function candidati<T extends { nome: string | null }>(righe: T[], nome: string): T[] {
  const cerca = minuscolo(nome)
  const parole = cerca.split(' ')
  return righe.filter(
    (r) => minuscolo(r.nome).includes(cerca) || parole.every((p) => minuscolo(r.nome).split(' ').includes(p)),
  )
}

type PersonaDelTeam = { id: string; nome: string; ruolo: AppRole; attivo: boolean; email?: string | null }

/**
 * "Loris Setter (Setter)", "Loris Setter (Setter, non più attivo)": two people
 * with the same name are told apart by role and state; when even those are
 * the same (the Excel import's placeholder, an old account), by the email.
 */
export function etichettePersone<T extends PersonaDelTeam>(persone: readonly T[]): (T & { etichetta: string })[] {
  const base = (p: T) => `${p.nome} (${ETICHETTA_RUOLO[p.ruolo]}${p.attivo ? '' : ', non più attivo'}`
  const quante = new Map<string, number>()
  for (const p of persone) quante.set(minuscolo(base(p)), (quante.get(minuscolo(base(p))) ?? 0) + 1)
  return persone.map((p) => ({
    ...p,
    etichetta: `${base(p)}${(quante.get(minuscolo(base(p))) ?? 0) > 1 && p.email ? `, ${p.email}` : ''})`,
  }))
}

/**
 * Exactly one row, or an error that lists the candidates (at most six); what
 * would tell them apart (`come`) is for the model only.
 */
export function unico<T>(
  righe: readonly T[],
  etichetta: (r: T) => string,
  { nessuno, piu, come }: { nessuno: string; piu: string; come: string },
): T | Errore {
  if (righe.length === 1) return righe[0]
  if (righe.length === 0) return errore(nessuno)
  const elenco = righe.slice(0, 6).map(etichetta).join('; ')
  return errore(`${piu}: ${elenco}${righe.length > 6 ? '; …' : ''}.`, come)
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
  'id, titolo, progetto_id, tasklist_id, parent_id, descrizione, stato, priorita, data_inizio, scadenza, stima_minuti, assegnatari, sotto_task_totali, created_by'

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
  created_by: string | null
  /** Other tasks of its project with the same title, when it was chosen among them. */
  omonimi?: number
}

/** Where a task is looked for (trovaTask). */
type DoveTask = { task_id?: string; progettoId?: string; progetto?: string; completato?: boolean; lettura?: boolean }

/** A time entry of mine as the resolver reads it, with its project and task. */
export type VoceTempo = {
  id: string
  progetto_id: string
  task_id: string | null
  data: string
  minuti: number | null
  nota: string | null
  inizio: string | null
  fine: string | null
  progetto: { nome: string } | null
  task: { titolo: string; stato?: string } | null
}

const CAMPI_VOCE = 'id, progetto_id, task_id, data, minuti, nota, inizio, fine, progetto:pm_progetti(nome), task:pm_task(titolo, stato)'

/** "lunedì 28/09/2026, 45 min su «Sergio Bellini» · Revisione video, 09:00–09:45": the task and range tell entries apart. */
function etichettaVoce(v: VoceTempo): string {
  const f = fasciaDellaVoce(v)
  return `${giornoEsteso(v.data)}, ${formatStima(v.minuti) || '0 min'} su «${v.progetto?.nome ?? '?'}»${v.task?.titolo ? ` · ${v.task.titolo}` : ''}${
    f ? `, ${f.dalle}–${f.alle}` : ''
  }`
}

const CAMPI_PROGETTO = 'id, nome, reparto_id, client_id, coach_id, stato, descrizione, data_inizio, data_fine, responsabile_id, task_totali'

export type ProgettoTrovato = {
  id: string
  nome: string
  reparto_id: string
  client_id: string | null
  coach_id: string | null
  stato: string
  descrizione: string | null
  data_inizio: string | null
  data_fine: string | null
  responsabile_id: string | null
  task_totali: number | null
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
          .join(', ')}.`,
        'Chiedi quale, con nome e cognome.',
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
   * Anyone of the team by name for a read on their work (tempo_team), people
   * no longer active included: the time they declared stays. More than one
   * fits: the error names only those, each with a label that tells them apart
   * (role, "non più attivo", the email when two are still the same), and the
   * model asks which one; the label as written finds that person.
   */
  async function personaDelTeam(nome: string): Promise<{ id: string; nome: string } | Errore> {
    if (isIo(nome)) return { id: profilo.id, nome: profilo.nome }
    const { data, error } = await supabase.from('profiles').select('id, nome, ruolo, attivo, email')
    if (error) return errore(NON_LETTO)
    const righe = etichettePersone(data ?? []).sort((x, y) => x.etichetta.localeCompare(y.etichetta, 'it'))
    // the answer to the question below: the label as the error wrote it
    const perEtichetta = righe.filter((p) => minuscolo(p.etichetta) === minuscolo(nome))
    if (perEtichetta.length === 1) return { id: perEtichetta[0].id, nome: perEtichetta[0].nome }
    const trovato = trova(righe, nome)
    if (trovato === 'ambiguo') {
      const possibili = candidati(righe, nome)
      return errore(
        `Più persone possibili per "${nome}": ${possibili
          .slice(0, 6)
          .map((p) => p.etichetta)
          .join('; ')}${possibili.length > 6 ? '; …' : ''}.`,
        'Chiedi quale, e cercala scritta come qui.',
      )
    }
    if (!trovato) return errore(`Nessuna persona "${nome}" nel team. Persone: ${[...new Set(righe.map((p) => p.nome))].join(', ')}`)
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
    const { data, error } = await supabase.from('v_pm_progetti').select(CAMPI_PROGETTO).order('nome').limit(200)
    if (error) return errore(NON_LETTO)
    const elenco = (data ?? []) as ProgettoTrovato[]
    const distinti = nomiDistinti(elenco)
    // the name a question gave back for one of two homonyms: «Marco Bianchi (dal 01/09/2026)»
    const ridetto = elenco.filter((x) => distinti.get(x.id) !== x.nome && senzaSegni(distinti.get(x.id)) === senzaSegni(nome))
    if (ridetto.length === 1) return ridetto[0]
    const p = trova(elenco, nome)
    if (p === 'ambiguo') {
      // homonyms side by side, the earliest start first
      const scelti = [...candidati(elenco, nome)]
        .sort((x, y) => minuscolo(x.nome).localeCompare(minuscolo(y.nome)) || (x.data_inizio ?? '').localeCompare(y.data_inizio ?? '') || x.id.localeCompare(y.id))
        .slice(0, 5)
      const nomi = scelti.map((x) => distinti.get(x.id) ?? x.nome)
      const omonimi = scelti.some((x) => distinti.get(x.id) !== x.nome)
      return errore(
        `Più progetti possibili: ${nomi.join('; ')}.`,
        `Chiedi quale${omonimi ? '; poi passa il nome come scritto qui, con quello che c’è tra parentesi' : ''}.`,
      )
    }
    return p ?? progettoNonTrovato(elenco, nome, distinti, livelloPmEffettivo(profilo.ruolo, profilo.livello_pm) === 'admin')
  }

  /**
   * The names of these projects as a question says them: told apart from the
   * visible projects with the same name (nomiDistinti), so «Revisione video in
   * Marco Bianchi (dal 01/09/2026)» can be answered with its project.
   */
  async function nomiDeiProgetti(ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map()
    const { data } = await supabase.from('v_pm_progetti').select('id, nome').in('id', ids)
    const nomi = [...new Set((data ?? []).map((p) => p.nome).filter((n): n is string => Boolean(n)))]
    if (nomi.length === 0) return new Map()
    const { data: conLoStessoNome } = await supabase.from('v_pm_progetti').select('id, nome, data_inizio, stato').in('nome', nomi)
    return nomiDistinti((conLoStessoNome ?? []) as ProgettoConNome[])
  }

  /** The project of a task found on its own (the time said with the task only). */
  async function progettoPerId(id: string): Promise<ProgettoTrovato | Errore> {
    const { data, error } = await supabase.from('v_pm_progetti').select(CAMPI_PROGETTO).eq('id', id).maybeSingle()
    if (error) return errore(NON_LETTO)
    return (data as ProgettoTrovato | null) ?? errore('Progetto non trovato tra quelli che vedi.')
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
   * wins; between tasks with the same title, the open one (the completed one
   * when reopening), then the one assigned to me. A title said differently
   * (no accents, other little words, 03/10/2026) is found by its key words.
   * Otherwise the question names project and due date of each candidate, and
   * a title not found lists the open tasks there. A read (`lettura`, the time
   * of mio_tempo) never picks among tasks with one title: it would count one
   * and leave out the other (03/10/2026); the question gives their task_id.
   */
  async function trovaTask(titolo: string, dove: DoveTask = {}): Promise<TaskTrovato | Errore> {
    const t = await cercaTask(titolo, dove)
    // only a sum (trovaTaskDaContare) gives the tasks of several projects
    return isTaskInPiuProgetti(t) ? errore(NON_LETTO) : t
  }

  /**
   * The task whose time to count (mio_tempo, 03/10/2026), with no project
   * said: one task as trovaTask finds it in a read, or, when the title said
   * fits tasks of several projects that all have the same title (accents,
   * case and spaces aside), all of them, to sum their time in SQL. Different
   * titles, or one project only: the question, as in any read.
   */
  async function trovaTaskDaContare(titolo: string, dove: { task_id?: string } = {}): Promise<TaskTrovato | TaskInPiuProgetti | Errore> {
    return cercaTask(titolo, { ...dove, lettura: true, somma: true })
  }

  /**
   * Every visible task titled as the ones found, for a sum: the candidates
   * stop at 50 and the admin sees every client's project, so the title is
   * read again in full. The pattern lets vowels (accented or not) and spaces
   * vary, then the normalized title decides; the ones found are always in.
   * Too many to read in full: an answer that asks for the client, never a
   * partial sum.
   */
  async function taskConLoStessoTitolo(trovati: readonly Pick<TaskTrovato, 'id' | 'titolo' | 'progetto_id'>[]): Promise<TaskInPiuProgetti | Errore> {
    const titolo = trovati[0].titolo
    const schema = titolo
      .trim()
      .split(/\s+/)
      .map((p) => perIlike(p).replace(/[aeiou]|[^\x20-\x7e]/gi, '_'))
      .join('%')
    const { data, error } = await supabase.from('v_pm_task').select('id, titolo, progetto_id').ilike('titolo', schema).limit(TASK_IN_PIU_PROGETTI_MAX + 1)
    if (error) return errore(NON_LETTO)
    if ((data ?? []).length > TASK_IN_PIU_PROGETTI_MAX) {
      return errore(`«${titolo}» c’è in troppi progetti per sommarli tutti: dimmi di quale cliente.`, 'Chiedi il progetto.')
    }
    const voluto = titoloNormale(titolo)
    const task = new Map(trovati.map((t) => [t.id, t.progetto_id]))
    for (const t of data ?? []) if (t.id && t.progetto_id && titoloNormale(t.titolo) === voluto) task.set(t.id, t.progetto_id)
    return {
      titolo,
      task: [...task].map(([id, progetto_id]) => ({ id, progetto_id })),
      progetti: new Set(task.values()).size,
    }
  }

  async function cercaTask(titolo: string, dove: DoveTask & { somma?: boolean }): Promise<TaskTrovato | TaskInPiuProgetti | Errore> {
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
      if (progetti.length === 0) {
        // the words in another order, or a typo: the project lookup finds it, or names the closest ones
        const p = await trovaProgetto(dove.progetto)
        if (isErrore(p)) return p
        progetti = [p.id]
      }
    }
    // the project filter goes into the query, before the limit: a template title repeats in every client's project
    async function cerca(schema: string): Promise<TaskTrovato[] | Errore> {
      let q = supabase.from('v_pm_task').select(CAMPI_TASK).ilike('titolo', schema)
      if (progetti) q = q.in('progetto_id', progetti)
      const { data, error } = await q.order('scadenza', { nullsFirst: false }).order('id').limit(50)
      return error ? errore(NON_LETTO) : ((data ?? []) as TaskTrovato[])
    }

    /**
     * Tasks with one same title: the open one (or the completed one, to reopen
     * it), then mine. The one chosen says how many others in its project have
     * that title, so the card says whether it is the open or the completed one.
     */
    function traUguali(uguali: TaskTrovato[]): TaskTrovato | null {
      if (uguali.length === 1) return uguali[0]
      if (dove.lettura) return null
      if (new Set(uguali.map((t) => minuscolo(t.titolo))).size > 1) return null
      const voluti = uguali.filter((t) => (t.stato === 'completato') === Boolean(dove.completato))
      const miei = (voluti.length > 0 ? voluti : uguali).filter((t) => (t.assegnatari ?? []).includes(profilo.id))
      const scelto = voluti.length === 1 ? voluti[0] : miei.length === 1 ? miei[0] : null
      if (!scelto) return null
      const omonimi = uguali.filter((t) => t.id !== scelto.id && t.progetto_id === scelto.progetto_id).length
      return omonimi > 0 ? { ...scelto, omonimi } : scelto
    }

    const trovati = await cerca(perIlike(titolo))
    if (isErrore(trovati)) return trovati
    const esatti = trovati.filter((t) => minuscolo(t.titolo) === cercato)
    let dubbi = esatti
    if (esatti.length > 0) {
      const scelto = traUguali(esatti)
      if (scelto) return scelto
    } else {
      const simili = await cerca(`%${perIlike(titolo)}%`)
      if (isErrore(simili)) return simili
      dubbi = simili.filter((t) => minuscolo(t.titolo).includes(cercato))
      if (dubbi.length === 1) return dubbi[0]
    }
    if (dubbi.length === 0) {
      // said differently: the key words, among the tasks there (a light read, then the whole row of the one found)
      let q = supabase.from('v_pm_task').select('id, titolo, progetto_id, stato, assegnatari')
      if (progetti) q = q.in('progetto_id', progetti)
      const { data, error } = await q.order('scadenza', { nullsFirst: false }).order('id').limit(500)
      if (error) return errore(NON_LETTO)
      const tutti = (data ?? []) as Pick<TaskTrovato, 'id' | 'titolo' | 'progetto_id' | 'stato' | 'assegnatari'>[]
      const perParole = tutti.filter((t) => titoloDetto(t.titolo, titolo))
      const scelto = perParole.length > 0 ? traUguali(perParole as TaskTrovato[]) : null
      if (scelto) {
        const t = await trovaTask(scelto.titolo, { task_id: scelto.id })
        return isErrore(t) || !scelto.omonimi ? t : { ...t, omonimi: scelto.omonimi }
      }
      if (perParole.length === 0) {
        const aperti = [...new Set(tutti.filter((t) => t.stato !== 'completato').map((t) => t.titolo))]
        const elenco = aperti.length > 0 ? ` Task ${progetti?.length === 1 ? 'del progetto' : 'che vedi'}: ${aperti.slice(0, 15).join(', ')}${aperti.length > 15 ? ', …' : ''}.` : ''
        return errore(`Task "${titolo}" non trovato${progetti ? ' nel progetto' : ''}.${elenco}`)
      }
      dubbi = perParole as TaskTrovato[]
    }

    // the time to count of one title every client has, no project said: all of them, summed in SQL
    // (03/10/2026); different titles, or two tasks in one project, still ask which
    if (
      dove.somma &&
      !progetti &&
      new Set(dubbi.map((t) => titoloNormale(t.titolo))).size === 1 &&
      new Set(dubbi.map((t) => t.progetto_id)).size > 1
    ) {
      return taskConLoStessoTitolo(dubbi)
    }

    const progetto = await nomiDeiProgetti([...new Set(dubbi.map((t) => t.progetto_id))])
    // a title every client has: up to 15 in the text, so the right client is there (the buttons hold 4, the user can type)
    const elenco = dubbi
      .slice(0, CANDIDATI_TASK)
      .map((t) => {
        const dove_ = progetto.get(t.progetto_id)
        return `«${t.titolo}»${dove_ ? ` in ${dove_}` : ''}${t.scadenza ? `, scadenza ${formatData(t.scadenza)}` : ''}${
          t.stato === 'completato' ? ', completato' : ''
        }${dove.lettura ? ` (task_id ${t.id})` : ''}`
      })
      .join('; ')
    // more than the 4 buttons of proponi_risposte: the text names them all, the user can type the one he means
    const tutti = dubbi.length > 4 ? ' Nel testo elencali tutti: i bottoni ne mostrano 4, l’utente può scrivere il nome.' : ''
    return errore(
      `Più task possibili: ${elenco}${dubbi.length > CANDIDATI_TASK ? `; e altri ${dubbi.length - CANDIDATI_TASK}` : ''}.`,
      dove.lettura
        ? `Chiedi quale (il progetto, e se due hanno lo stesso progetto quello aperto o completato), poi passa il suo task_id; mai sommare i loro tempi.${tutti}`
        : `Chiedi quale (il progetto, o passa il task_id da progetto_dettaglio o miei_task).${tutti}`,
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
    if (valide.length === 0 && regole.length > 0) {
      return errore(`Nessuna regola valida il ${formatData(giorno)}. Regole: ${regole.map(etichettaRegola).join('; ')}.`, 'Indica alla_data.')
    }
    return unico(valide, etichettaRegola, {
      nessuno: 'Nessuna regola provvigionale per questa persona.',
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

  /**
   * One of MY time entries: never anybody else's, whatever RLS would allow a
   * manager. Only stopped ones: the running timer is not an entry yet (stop
   * it first). In ORDINE_VOCI (the most recent day first, and inside a day the
   * last registered first, then the id: the same order as mio_tempo,
   * 03/10/2026); the candidates name their task and range, so it is never a
   * guess. The entry just registered is found by the voce_id registra gives.
   * A project or task said that day with no entry of mine on it, while I have
   * entries elsewhere that day (03/10/2026: «quella di martedì va su Tiziano
   * Mele», the destination said as the entry's own): the error names them
   * and, for a correction, offers to move one there.
   */
  async function trovaVoce({
    voce_id,
    progettoId,
    progetto,
    taskId,
    task,
    data,
    perSpostare = false,
  }: {
    voce_id?: string
    progettoId?: string
    /** The name of progettoId, for the words of the error. */
    progetto?: string
    taskId?: string | null
    /** The task's title as said: matched on the entries' own tasks, so a title every client has needs no project. */
    task?: string
    data?: string
    /** A correction: an entry on another project or task that day can be moved where it was said. */
    perSpostare?: boolean
  }): Promise<VoceTempo | Errore> {
    let q = supabase
      .from('pm_tempo')
      .select(CAMPI_VOCE)
      .eq('profile_id', profilo.id)
      .not('minuti', 'is', null)
    if (voce_id) q = q.eq('id', voce_id)
    if (progettoId) q = q.eq('progetto_id', progettoId)
    if (taskId) q = q.eq('task_id', taskId)
    if (data) q = q.eq('data', data)
    const { data: righe, error } = await q
      .order('data', { ascending: false })
      .order('created_at', { ascending: false })
      // the same tie-break as mio_tempo: entries registered together (an import, a seed) keep one order in both
      .order('id', { ascending: false })
      .limit(task?.trim() ? 200 : 20)
    if (error) return errore(NON_LETTO)
    const detto = minuscolo(task)
    const voci = ((righe ?? []) as unknown as VoceTempo[]).filter(
      (v) => !detto || (v.task?.titolo && (minuscolo(v.task.titolo) === detto || titoloDetto(v.task.titolo, detto))),
    )
    if (voci.length === 0) {
      const acceso = await timerAcceso()
      const stessoTask = !detto || (acceso?.task?.titolo && (minuscolo(acceso.task.titolo) === detto || titoloDetto(acceso.task.titolo, detto)))
      // the voce_id avvia gave back is the running timer until it stops
      const questo = voce_id
        ? acceso?.id === voce_id
        : stessoTask && (!progettoId || acceso?.progetto_id === progettoId) && (!data || acceso?.data === data)
      if (acceso && questo) {
        return errore(
          `Non c’è una voce chiusa: il tempo che corre è il timer acceso su «${acceso.progetto?.nome ?? '?'}». Fermalo, poi correggi la voce.`,
          'Per fermarlo: tempo, azione ferma.',
        )
      }
      if (!voce_id && data && (progettoId || taskId || detto)) {
        const altrove = await vociAltrove({ progetto, taskId, task, data, perSpostare })
        if (altrove) return altrove
      }
    }
    return unico(voci, etichettaVoce, {
      nessuno: `Voce di tempo non trovata tra le tue${detto ? ` sul task «${task?.trim()}»` : ''}${data ? ` del ${formatData(data)}` : ''}.`,
      piu: 'Più voci possibili, dalla più recente',
      come: 'Chiedi quale (o passa il voce_id da mio_tempo).',
    })
  }

  /**
   * My stopped entries of a day, when none is on the project or task said:
   * named with their task and range; a correction can move one there (the
   * model gets the ids, the person the words). Null when that day has none.
   */
  async function vociAltrove({
    progetto,
    taskId,
    task,
    data,
    perSpostare,
  }: {
    progetto?: string
    taskId?: string | null
    task?: string
    data: string
    perSpostare: boolean
  }): Promise<Errore | null> {
    const { data: righe, error } = await supabase
      .from('pm_tempo')
      .select(CAMPI_VOCE)
      .eq('profile_id', profilo.id)
      .not('minuti', 'is', null)
      .eq('data', data)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(6)
    if (error) return errore(NON_LETTO)
    const voci = (righe ?? []) as unknown as VoceTempo[]
    if (voci.length === 0) return null
    const titolo = task?.trim()
    const dove = [progetto ? `«${progetto}»` : null, titolo ? `«${titolo}»` : null].filter(Boolean).join(' · ') || 'quel task'
    const una = voci.length === 1
    const elenco = voci.map(etichettaVoce).join('; ')
    const ids = voci.map((v) => `${etichettaVoce(v)} = ${v.id}`).join('; ')
    if (!perSpostare) {
      return errore(
        `Nessuna tua voce di tempo su ${dove} del ${formatData(data)}. Quel giorno hai: ${elenco}.`,
        `Chiedi se intendeva ${una ? 'questa' : 'una di queste'}; poi usa il suo voce_id (${ids}).`,
      )
    }
    const sposta = [
      progetto ? `nuovo_progetto «${progetto}»` : null,
      titolo ? `nuovo_task «${titolo}»` : taskId ? 'nuovo_task col titolo di quel task' : null,
    ]
      .filter(Boolean)
      .join(' e ')
    return errore(
      `Nessuna tua voce di tempo su ${dove} del ${formatData(data)}. Quel giorno hai: ${elenco}. ${una ? 'Se è questa' : 'Se è una di queste'}, posso spostarla su ${dove}.`,
      `${una ? 'Chiedi se è questa' : 'Chiedi quale'}; per spostarla: modifica con il suo voce_id (${ids}) e ${sposta}.`,
    )
  }

  /** My running timer, if any. */
  async function timerAcceso() {
    const { data } = await supabase
      .from('pm_tempo')
      .select('id, progetto_id, data, inizio, nota, progetto:pm_progetti(nome), task:pm_task(titolo)')
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
    personaDelTeam,
    trovaVendita,
    trovaRata,
    trovaCosto,
    trovaLead,
    trovaCall,
    trovaProdotto,
    trovaProgetto,
    progettoPerId,
    trovaLista,
    membri,
    idMembri,
    trovaTask,
    trovaTaskDaContare,
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
