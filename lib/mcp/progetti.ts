import 'server-only'

import { raggruppaTempoTeam } from '@/components/pm/tempo-team/dati'
import { aggiungiGiorni, isDataISO, oggiRoma, primoDelMeseISO } from '@/lib/date'
import { formatStima } from '@/lib/progetti'
import * as operazioni from '@/lib/progetti/operazioni'
import { fasciaDellaVoce } from '@/lib/validation/tempo'

import type { EsitoStrumento } from './contenuti'
import type { ContestoMcp } from './contesto'
import type {
  AggiungiNotaInput,
  AvviaTimerInput,
  CompletaTaskInput,
  CreaListaInput,
  CreaProgettoInput,
  CreaTaskInput,
  ElencoProgettiInput,
  FermaTimerInput,
  LeggiProgettoInput,
  MembroProgettoInput,
  MieiTaskInput,
  MioTempoInput,
  ModificaListaInput,
  ModificaProgettoInput,
  ModificaTaskInput,
  ModificaTempoInput,
  RegistraTempoInput,
  TempoTeamInput,
} from './schemi-progetti'

/**
 * What the MCP tools on projects, lists, tasks, notes and time do (Claude a
 * 360 gradi, phase 1, 22/10/2026). Reads go through ctx.db, the person's own
 * OAuth token (RLS decides, never the service role); writes go through the
 * shared core of the app (lib/progetti/operazioni.ts), the same schemas, guards
 * and messages as the server actions of /progetti and /tempo and Alfire. A
 * change tool reads the row first and fills in what Claude did not say, so the
 * app's full schemas apply. Time is always the person's own (the admin reads
 * the team's declared time with tempo_team); nothing is deleted from here
 * (CLAUDE.md sections 17 and 28). A read that fails throws: the wrapper
 * answers with its generic sentence, never "nothing there".
 */

class LetturaNonRiuscita extends Error {
  constructor(readonly codice: string) {
    super('lettura non riuscita')
  }
}

type Risposta = { data: unknown; error: { code?: string } | null }

/** A list or an RPC: its rows, or the read throws. */
function controlla<R extends Risposta>(risposta: R): NonNullable<R['data']> {
  if (risposta.error) throw new LetturaNonRiuscita(risposta.error.code ?? 'errore')
  return (risposta.data ?? []) as NonNullable<R['data']>
}

/** One row (maybeSingle): the row or null, or the read throws. */
function riga<R extends Risposta>(risposta: R): R['data'] {
  if (risposta.error) throw new LetturaNonRiuscita(risposta.error.code ?? 'errore')
  return risposta.data
}

function ok(dati: Record<string, unknown>, esito?: string): EsitoStrumento {
  return { ok: true, dati, esito }
}

function no(messaggio: string, esito?: string): EsitoStrumento {
  return { ok: false, messaggio, esito }
}

/** The core of projects and time with the token's client and the person behind it. */
function nucleo(ctx: ContestoMcp): operazioni.Contesto {
  return {
    db: ctx.db,
    chi: async () => ({ id: ctx.persona, ruolo: ctx.ruolo, livello_pm: ctx.livello, attivo: true }),
  }
}

const PROGETTO_NON_TROVATO = 'Questo progetto non c’è, o non ne fai parte.'
const TASK_NON_TROVATO = 'Questo task non c’è, o non è in un progetto di cui fai parte.'
const LISTA_NON_TROVATA = 'Questa lista non c’è, o non è in un progetto di cui fai parte.'
const VOCE_NON_TROVATA = 'Questa voce di tempo non c’è, o non è tua: da qui si corregge solo il proprio tempo.'

/** "Di chi sono questi dati": the reads of "my" tasks and time say it first. */
const SOLO_TUOI = 'Sono i dati di chi ha collegato Claude, cioè la persona con cui stai parlando: mai quelli di un altro.'

function durata(minuti: number | null | undefined) {
  return { minuti: minuti ?? 0, durata: formatStima(minuti) || '0 min' }
}

/** id → nome of the people (the team's directory, readable by everyone). */
async function nomi(ctx: ContestoMcp, ids: Iterable<string | null | undefined>): Promise<Map<string, string>> {
  const unici = [...new Set([...ids].filter((x): x is string => Boolean(x)))]
  if (unici.length === 0) return new Map()
  const righe = controlla(await ctx.db.from('profiles').select('id, nome').in('id', unici))
  return new Map(righe.map((r) => [r.id, r.nome]))
}

/** The app's rule (pm_puo_gestire): the projects' admin, or a manager who is a member. */
function gestisce(ctx: ContestoMcp, membro: boolean): boolean {
  return ctx.livello === 'admin' || (ctx.livello === 'manager' && membro)
}

/** A search typed by Claude in a PostgREST ilike filter: only letters, digits and spaces matter. */
function ricerca(testo: string): string {
  return testo.replace(/[%_*,()\\]/g, ' ').trim()
}

/** "ultimi 7 giorni" = today and the 6 before; otherwise da–a; by default the month so far. */
function periodo(input: { ultimi_giorni?: number | null; da?: string | null; a?: string | null }): { da: string; a: string } {
  const oggi = oggiRoma()
  if (input.ultimi_giorni) return { da: aggiungiGiorni(oggi, 1 - input.ultimi_giorni), a: oggi }
  const da = input.da && isDataISO(input.da) ? input.da : primoDelMeseISO(oggi)
  const a = input.a && isDataISO(input.a) ? input.a : oggi
  return da <= a ? { da, a } : { da: a, a: da }
}

// ── elenco_progetti ──────────────────────────────────────────────────────────
export async function elencoProgetti(input: ElencoProgettiInput, ctx: ContestoMcp): Promise<EsitoStrumento> {
  const limite = input.limite ?? 50
  let q = ctx.db
    .from('v_pm_progetti')
    .select('id, nome, stato, reparto_id, client_id, data_inizio, data_fine, task_totali, task_completati, task_in_ritardo, avanzamento, scaduto, sono_membro, coach_id')
    .order('nome')
    .limit(limite + 1)
  const cerca = input.cerca ? ricerca(input.cerca) : ''
  if (cerca) q = q.ilike('nome', `%${cerca}%`)
  if (input.stato) q = q.eq('stato', input.stato)
  const righe = controlla(await q)
  const mostrati = righe.slice(0, limite)
  const reparti = controlla(await ctx.db.from('pm_reparti').select('id, nome'))
  const nomeReparto = new Map(reparti.map((r) => [r.id, r.nome]))
  const coach = await nomi(ctx, mostrati.map((p) => p.coach_id))
  return ok({
    // below the projects' admin, RLS gives only the projects one is a member of
    ...(ctx.livello === 'admin' ? {} : { di_chi: 'Solo i progetti di cui la persona con cui parli fa parte.' }),
    progetti: mostrati.map((p) => ({
      id: p.id,
      nome: p.nome,
      stato: p.stato,
      reparto: (p.reparto_id && nomeReparto.get(p.reparto_id)) ?? null,
      di_un_cliente: Boolean(p.client_id),
      ...(p.client_id ? { coach: (p.coach_id && coach.get(p.coach_id)) ?? 'Senza coach' } : {}),
      inizio: p.data_inizio,
      fine: p.data_fine,
      ...(p.scaduto ? { fine_passata: true } : {}),
      task: { totali: p.task_totali, completati: p.task_completati, in_ritardo: p.task_in_ritardo },
      gestisci: gestisce(ctx, Boolean(p.sono_membro)),
    })),
    ...(righe.length > limite ? { nota: `Elenco parziale: qui i primi ${limite} per nome. Restringi con cerca o stato.` } : {}),
  })
}

// ── leggi_progetto ───────────────────────────────────────────────────────────
const TASK_APERTI = 150
const TASK_COMPLETATI = 50
const NOTE = 30

function breve(testo: string | null | undefined, max: number): string | null {
  if (!testo?.trim()) return null
  const t = testo.trim()
  return [...t].length > max ? `${[...t].slice(0, max).join('')}…` : t
}

export async function leggiProgetto(input: LeggiProgettoInput, ctx: ContestoMcp): Promise<EsitoStrumento> {
  const p = riga(
    await ctx.db
      .from('v_pm_progetti')
      .select('id, nome, descrizione, stato, reparto_id, client_id, data_inizio, data_fine, responsabile_id, coach_id, sono_membro, task_totali, task_completati, task_in_ritardo')
      .eq('id', input.progetto_id)
      .maybeSingle(),
  )
  if (!p) return no(PROGETTO_NON_TROVATO, 'non_trovato')

  const campiTask = 'id, titolo, descrizione, tasklist_id, parent_id, stato, priorita, data_inizio, scadenza, stima_minuti, in_ritardo, assegnatari, completato_il'
  const [liste, aperti, completati, membri, note, reparto] = await Promise.all([
    ctx.db.from('v_pm_tasklist').select('id, nome, data_inizio, data_fine, task_totali, task_completati').eq('progetto_id', p.id!).order('ordine'),
    ctx.db
      .from('v_pm_task')
      .select(campiTask)
      .eq('progetto_id', p.id!)
      .neq('stato', 'completato')
      .order('scadenza', { nullsFirst: false })
      .order('ordine')
      .limit(TASK_APERTI + 1),
    input.completati
      ? ctx.db
          .from('v_pm_task')
          .select(campiTask)
          .eq('progetto_id', p.id!)
          .eq('stato', 'completato')
          .order('completato_il', { ascending: false })
          .limit(TASK_COMPLETATI)
      : Promise.resolve({ data: [], error: null }),
    ctx.db.from('pm_membri').select('profile_id').eq('progetto_id', p.id!),
    ctx.db
      .from('pm_note')
      .select('id, data, testo, autore_id')
      .eq('progetto_id', p.id!)
      .order('data', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(NOTE),
    p.reparto_id ? ctx.db.from('pm_reparti').select('nome').eq('id', p.reparto_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ])
  const righeAperte = controlla(aperti)
  const tuttiITask = [...righeAperte.slice(0, TASK_APERTI), ...controlla(completati)]
  const righeMembri = controlla(membri)
  const righeNote = controlla(note)
  const persone = await nomi(ctx, [
    ...righeMembri.map((m) => m.profile_id),
    ...tuttiITask.flatMap((t) => t.assegnatari ?? []),
    ...righeNote.map((n) => n.autore_id),
    p.responsabile_id,
    p.coach_id,
  ])
  const chi = (id: string | null | undefined) => (id ? { id, nome: persone.get(id) ?? 'Persona non più nel team' } : null)
  const ruoli = controlla(
    righeMembri.length ? await ctx.db.from('profiles').select('id, ruolo').in('id', righeMembri.map((m) => m.profile_id)) : { data: [], error: null },
  )
  const ruoloDi = new Map(ruoli.map((r) => [r.id, r.ruolo]))

  return ok({
    progetto: {
      id: p.id,
      nome: p.nome,
      descrizione: p.descrizione,
      stato: p.stato,
      reparto: riga(reparto)?.nome ?? null,
      di_un_cliente: Boolean(p.client_id),
      inizio: p.data_inizio,
      fine: p.data_fine,
      responsabile: chi(p.responsabile_id),
      ...(p.client_id ? { coach: chi(p.coach_id) ?? 'Senza coach' } : {}),
      task: { totali: p.task_totali, completati: p.task_completati, in_ritardo: p.task_in_ritardo },
      gestisci: gestisce(ctx, Boolean(p.sono_membro)),
    },
    liste: controlla(liste).map((l) => ({
      id: l.id,
      nome: l.nome,
      inizio: l.data_inizio,
      fine: l.data_fine,
      task: l.task_totali,
      completati: l.task_completati,
    })),
    task: tuttiITask.map((t) => ({
      id: t.id,
      titolo: t.titolo,
      stato: t.stato,
      priorita: t.priorita,
      lista_id: t.tasklist_id,
      ...(t.parent_id ? { sotto_task_di: t.parent_id } : {}),
      inizio: t.data_inizio,
      scadenza: t.scadenza,
      ...(t.in_ritardo ? { in_ritardo: true } : {}),
      ...(t.stima_minuti ? { stima: formatStima(t.stima_minuti) } : {}),
      assegnatari: (t.assegnatari ?? []).map((id) => chi(id)),
      ...(breve(t.descrizione, 300) ? { descrizione: breve(t.descrizione, 300) } : {}),
    })),
    ...(righeAperte.length > TASK_APERTI ? { nota_task: `Qui i primi ${TASK_APERTI} task aperti per scadenza: gli altri nella pagina del progetto.` } : {}),
    membri: righeMembri.map((m) => ({ id: m.profile_id, nome: persone.get(m.profile_id) ?? 'Persona non più nel team', ruolo: ruoloDi.get(m.profile_id) ?? null })),
    note: righeNote.map((n) => ({ id: n.id, data: n.data, testo: breve(n.testo, 1000), autore: chi(n.autore_id)?.nome ?? null })),
    ...(righeNote.length === NOTE ? { nota_note: `Qui le ${NOTE} note più recenti.` } : {}),
  })
}

// ── persone_del_team, reparti_e_modelli ──────────────────────────────────────
export async function personeDelTeam(ctx: ContestoMcp): Promise<EsitoStrumento> {
  const righe = controlla(await ctx.db.from('profiles').select('id, nome, ruolo').eq('attivo', true).order('nome'))
  return ok({ persone: righe.map((r) => ({ id: r.id, nome: r.nome, ruolo: r.ruolo })) })
}

export async function repartiEModelli(ctx: ContestoMcp): Promise<EsitoStrumento> {
  const [reparti, modelli] = await Promise.all([
    ctx.db.from('pm_reparti').select('id, nome, progetti_con_cliente').eq('attivo', true).order('ordine'),
    ctx.db.from('pm_modelli').select('id, nome, descrizione, reparto_id').eq('attivo', true).order('nome'),
  ])
  return ok({
    reparti: controlla(reparti).map((r) => ({
      id: r.id,
      nome: r.nome,
      // a client's project is born by itself when the client pays: Claude never links a client
      ...(r.progetti_con_cliente ? { nota: 'Qui i progetti dei clienti nascono da soli quando il cliente paga.' } : {}),
    })),
    modelli: controlla(modelli).map((m) => ({ id: m.id, nome: m.nome, reparto_id: m.reparto_id, descrizione: breve(m.descrizione, 300) })),
  })
}

// ── miei_task ────────────────────────────────────────────────────────────────
const MIEI_TASK = 100
const MIEI_COMPLETATI = 30

export async function mieiTask(input: MieiTaskInput, ctx: ContestoMcp): Promise<EsitoStrumento> {
  const campi = 'id, titolo, stato, priorita, scadenza, in_ritardo, progetto_id, completato_il'
  const [aperti, fatti] = await Promise.all([
    ctx.db
      .from('v_pm_task')
      .select(campi)
      .contains('assegnatari', [ctx.persona])
      .neq('stato', 'completato')
      .order('scadenza', { nullsFirst: false })
      .limit(MIEI_TASK + 1),
    input.completati
      ? ctx.db
          .from('v_pm_task')
          .select(campi)
          .contains('assegnatari', [ctx.persona])
          .eq('stato', 'completato')
          .order('completato_il', { ascending: false })
          .limit(MIEI_COMPLETATI)
      : Promise.resolve({ data: [], error: null }),
  ])
  const righe = controlla(aperti)
  const tutti = [...righe.slice(0, MIEI_TASK), ...controlla(fatti)]
  const ids = [...new Set(tutti.map((t) => t.progetto_id).filter((x): x is string => Boolean(x)))]
  const progetti = ids.length ? controlla(await ctx.db.from('v_pm_progetti').select('id, nome').in('id', ids)) : []
  const nomeProgetto = new Map(progetti.map((x) => [x.id, x.nome]))
  return ok({
    di_chi: SOLO_TUOI,
    task: tutti.map((t) => ({
      id: t.id,
      titolo: t.titolo,
      stato: t.stato,
      priorita: t.priorita,
      scadenza: t.scadenza,
      ...(t.in_ritardo ? { in_ritardo: true } : {}),
      progetto_id: t.progetto_id,
      progetto: (t.progetto_id && nomeProgetto.get(t.progetto_id)) ?? null,
      ...(t.completato_il ? { completato_il: t.completato_il } : {}),
    })),
    ...(righe.length > MIEI_TASK ? { nota: `Qui i primi ${MIEI_TASK} task aperti per scadenza: tutti in I miei task.` } : {}),
  })
}

// ── mio_tempo ────────────────────────────────────────────────────────────────
const VOCI_MIO_TEMPO = 40
const TASK_MIO_TEMPO = 30

export async function mioTempo(input: MioTempoInput, ctx: ContestoMcp): Promise<EsitoStrumento> {
  const { da, a } = periodo(input)
  const filtrato = Boolean(input.progetto_id || input.task_id)
  let voci = ctx.db
    .from('pm_tempo')
    .select('id, data, minuti, nota, inizio, fine, progetto_id, task_id, created_at, progetto:pm_progetti(nome), task:pm_task(titolo)')
    // mine only, even when RLS lets the admin read more
    .eq('profile_id', ctx.persona)
    .not('minuti', 'is', null)
    .gte('data', da)
    .lte('data', a)
  if (input.progetto_id) voci = voci.eq('progetto_id', input.progetto_id)
  if (input.task_id) voci = voci.eq('task_id', input.task_id)
  const [letteVoci, perTask, timer, riepilogo] = await Promise.all([
    voci
      .order('data', { ascending: false })
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(VOCI_MIO_TEMPO),
    ctx.db.rpc('pm_mio_tempo_per_task', {
      p_da: da,
      p_a: a,
      ...(input.progetto_id ? { p_progetto: input.progetto_id } : {}),
      ...(input.task_id ? { p_task: input.task_id } : {}),
    }),
    ctx.db.rpc('pm_timer_attivo'),
    filtrato ? Promise.resolve({ data: null, error: null }) : ctx.db.rpc('pm_riepilogo_tempo', { p_da: da, p_a: a }),
  ])
  const elenco = controlla(letteVoci)
  const righeTask = controlla(perTask)
  const righeRiepilogo = riga(riepilogo)
  const acceso = controlla(timer)[0] ?? null
  const totale = (righeRiepilogo ?? righeTask).find((x) => x.livello === 'totale')
  const soloTask = righeTask.filter((x) => x.livello === 'task')
  return ok({
    di_chi: SOLO_TUOI,
    periodo: { da, a },
    totale: { ...durata(totale?.minuti), voci: totale?.voci ?? 0 },
    ...(righeRiepilogo
      ? {
          per_giorno: righeRiepilogo.filter((x) => x.livello === 'giorno').map((x) => ({ data: x.data, ...durata(x.minuti) })),
          per_progetto: righeRiepilogo
            .filter((x) => x.livello === 'progetto')
            .map((x) => ({ progetto_id: x.progetto_id, progetto: x.progetto, ...durata(x.minuti), voci: x.voci })),
        }
      : {}),
    per_task: soloTask.slice(0, TASK_MIO_TEMPO).map((x) => ({
      progetto_id: x.progetto_id,
      progetto: x.progetto,
      task_id: x.task_id,
      task: x.task_id ? x.task : 'senza task',
      ...durata(x.minuti),
      voci: x.voci,
    })),
    ...(soloTask.length > TASK_MIO_TEMPO ? { nota_task: `Qui i ${TASK_MIO_TEMPO} task con più tempo su ${soloTask.length}.` } : {}),
    timer_acceso: acceso
      ? { progetto: acceso.progetto, task: acceso.task, dalle: acceso.inizio, nota: acceso.nota, in_pausa_dal: acceso.pausa_dal ?? null }
      : null,
    voci: elenco.map((v) => {
      const f = fasciaDellaVoce(v)
      return {
        voce_id: v.id,
        data: v.data,
        progetto_id: v.progetto_id,
        progetto: v.progetto?.nome ?? null,
        task_id: v.task_id,
        task: v.task?.titolo ?? null,
        ...durata(v.minuti),
        ...(f ? { dalle: f.dalle, alle: f.alle } : {}),
        nota: v.nota,
      }
    }),
    ...(elenco.length < (totale?.voci ?? 0)
      ? { nota: `Qui le ${elenco.length} voci più recenti su ${totale?.voci}: i totali le contano tutte.` }
      : {}),
  })
}

// ── tempo_team (the app admin) ───────────────────────────────────────────────
const LIMITI_TEAM = { persona: { voci: 20, progetti: 15, task: 10 }, team: { voci: 5, progetti: 5, task: 3 } } as const

export async function tempoTeam(input: TempoTeamInput, ctx: ContestoMcp): Promise<EsitoStrumento> {
  const { da, a } = periodo(input)
  const limiti = input.persona_id ? LIMITI_TEAM.persona : LIMITI_TEAM.team
  const { data, error } = await ctx.db.rpc('pm_tempo_per_persona', {
    p_da: da,
    p_a: a,
    ...(input.persona_id ? { p_profilo: input.persona_id } : {}),
    ...(input.progetto_id ? { p_progetto: input.progetto_id } : {}),
    p_limite: limiti.voci,
  })
  if (error?.code === '42501') return no('Il tempo del team lo legge solo l’admin.', 'negato')
  const team = raggruppaTempoTeam(controlla({ data, error }) ?? [])
  return ok({
    periodo: { da, a },
    regola: 'Solo il tempo già dichiarato, in ordine alfabetico: mai i timer accesi, mai chi non ha registrato, nessuna classifica né confronto tra persone.',
    totale: { ...durata(team.minuti), voci: team.voci },
    persone: team.persone.map((p) => ({
      persona: p.nome,
      ...durata(p.minuti),
      voci: p.voci,
      progetti: p.progetti.slice(0, limiti.progetti).map((g) => ({
        progetto: g.nome,
        ...durata(g.minuti),
        task: g.task.slice(0, limiti.task).map((t) => ({ task: t.titolo ?? 'senza task', ...durata(t.minuti) })),
        ...(g.task.length > limiti.task ? { altri_task: g.task.length - limiti.task } : {}),
      })),
      ...(p.progetti.length > limiti.progetti ? { altri_progetti: p.progetti.length - limiti.progetti } : {}),
      ultime_voci: p.ultime.map((v) => {
        const f = fasciaDellaVoce(v)
        return {
          data: v.data,
          progetto: v.progetto,
          task: v.task ?? 'senza task',
          ...durata(v.minuti),
          ...(f ? { dalle: f.dalle, alle: f.alle } : {}),
          ...(v.nota?.trim() ? { nota: breve(v.nota, 300) } : {}),
        }
      }),
    })),
    ...(team.persone.length === 0 ? { nota: 'Nessun tempo registrato nel periodo.' } : {}),
  })
}

// ── projects, members, lists ─────────────────────────────────────────────────
export async function creaProgetto(input: CreaProgettoInput, ctx: ContestoMcp): Promise<EsitoStrumento> {
  // never a client from Claude: a client's project is born when the client pays
  const esito = await operazioni.creaProgetto(nucleo(ctx), {
    reparto_id: input.reparto_id,
    nome: input.nome,
    descrizione: input.descrizione ?? null,
    modello_id: input.modello_id ?? null,
    data_inizio: input.data_inizio ?? null,
    data_fine: input.data_fine ?? null,
    membri: input.membri ?? [],
  })
  if (!esito.ok) return no(esito.errore)
  return ok({ esito: 'creato', progetto_id: esito.id })
}

export async function modificaProgetto(input: ModificaProgettoInput, ctx: ContestoMcp): Promise<EsitoStrumento> {
  const p = riga(
    await ctx.db
      .from('pm_progetti')
      .select('id, nome, reparto_id, descrizione, stato, data_inizio, data_fine, responsabile_id')
      .eq('id', input.progetto_id)
      .maybeSingle(),
  )
  if (!p) return no(PROGETTO_NON_TROVATO, 'non_trovato')
  const valore = <T>(nuovo: T | null | undefined, vecchio: T): T => (nuovo === undefined || nuovo === null ? vecchio : nuovo)
  const esito = await operazioni.modificaProgetto(nucleo(ctx), {
    id: p.id,
    nome: valore(input.nome, p.nome),
    reparto_id: valore(input.reparto_id, p.reparto_id),
    descrizione: valore(input.descrizione, p.descrizione),
    stato: valore(input.stato, p.stato),
    data_inizio: valore(input.data_inizio, p.data_inizio),
    data_fine: valore(input.data_fine, p.data_fine),
    responsabile_id: valore(input.responsabile_id, p.responsabile_id),
    // client_id undefined: the client of a project is never changed from here
  })
  if (!esito.ok) return no(esito.errore)
  return ok({ esito: 'salvato', progetto_id: p.id })
}

export async function aggiungiMembro(input: MembroProgettoInput, ctx: ContestoMcp): Promise<EsitoStrumento> {
  const esito = await operazioni.aggiungiMembro(nucleo(ctx), { progetto_id: input.progetto_id, profile_id: input.persona_id })
  if (!esito.ok) return no(esito.errore)
  return ok({ esito: 'aggiunto', progetto_id: input.progetto_id, persona_id: input.persona_id })
}

export async function scegliCoach(input: MembroProgettoInput, ctx: ContestoMcp): Promise<EsitoStrumento> {
  const esito = await operazioni.scegliCoach(nucleo(ctx), { progetto_id: input.progetto_id, profile_id: input.persona_id })
  if (!esito.ok) return no(esito.errore)
  return ok({
    esito: 'salvato',
    progetto_id: input.progetto_id,
    coach_id: input.persona_id,
    nota: 'Il coach entra nel progetto e prende i task principali senza nessuno e quelli del coach di prima.',
  })
}

export async function creaLista(input: CreaListaInput, ctx: ContestoMcp): Promise<EsitoStrumento> {
  const esito = await operazioni.salvaLista(nucleo(ctx), {
    progetto_id: input.progetto_id,
    nome: input.nome,
    descrizione: input.descrizione ?? null,
    data_inizio: input.data_inizio ?? null,
    data_fine: input.data_fine ?? null,
  })
  if (!esito.ok) return no(esito.errore)
  return ok({ esito: 'creata', lista_id: esito.id })
}

export async function modificaLista(input: ModificaListaInput, ctx: ContestoMcp): Promise<EsitoStrumento> {
  const l = riga(
    await ctx.db
      .from('pm_tasklist')
      .select('id, progetto_id, nome, descrizione, data_inizio, data_fine')
      .eq('id', input.lista_id)
      .maybeSingle(),
  )
  if (!l) return no(LISTA_NON_TROVATA, 'non_trovato')
  const valore = <T>(nuovo: T | null | undefined, vecchio: T): T => (nuovo === undefined || nuovo === null ? vecchio : nuovo)
  const esito = await operazioni.salvaLista(nucleo(ctx), {
    id: l.id,
    progetto_id: l.progetto_id,
    nome: valore(input.nome, l.nome),
    descrizione: valore(input.descrizione, l.descrizione),
    data_inizio: valore(input.data_inizio, l.data_inizio),
    data_fine: valore(input.data_fine, l.data_fine),
  })
  if (!esito.ok) return no(esito.errore)
  return ok({ esito: 'salvata', lista_id: l.id })
}

// ── tasks ────────────────────────────────────────────────────────────────────
type RigaTask = {
  id: string
  titolo: string
  descrizione: string | null
  stato: string
  priorita: string
  data_inizio: string | null
  scadenza: string | null
  stima_minuti: number | null
  tasklist_id: string | null
  parent_id: string | null
  assegnatari: string[] | null
  progetto_id: string
}

async function leggiTask(ctx: ContestoMcp, id: string): Promise<RigaTask | null> {
  const letta = riga(
    await ctx.db
      .from('v_pm_task')
      .select('id, titolo, descrizione, stato, priorita, data_inizio, scadenza, stima_minuti, tasklist_id, parent_id, assegnatari, progetto_id')
      .eq('id', id)
      .maybeSingle(),
  )
  return (letta as RigaTask | null) ?? null
}

type CampiTask = Pick<ModificaTaskInput, 'titolo' | 'stato' | 'assegnatari' | 'lista_id' | 'sotto_task_di' | 'descrizione' | 'priorita' | 'data_inizio' | 'scadenza' | 'stima'>

/** What modificaTaskSchema of the app wants: the saved task, with what Claude said on top. */
function taskModificato(t: RigaTask, c: CampiTask) {
  const valore = <T>(nuovo: T | null | undefined, vecchio: T): T => (nuovo === undefined || nuovo === null ? vecchio : nuovo)
  return {
    id: t.id,
    titolo: valore(c.titolo, t.titolo),
    descrizione: valore(c.descrizione, t.descrizione),
    stato: valore(c.stato, t.stato),
    priorita: valore(c.priorita, t.priorita),
    assegnatari: valore(c.assegnatari, t.assegnatari ?? []),
    data_inizio: valore(c.data_inizio, t.data_inizio),
    scadenza: valore(c.scadenza, t.scadenza),
    stima_minuti: c.stima === undefined || c.stima === null ? t.stima_minuti : c.stima,
    tasklist_id: valore(c.lista_id, t.tasklist_id),
    parent_id: valore(c.sotto_task_di, t.parent_id),
  }
}

function taskPerClaude(t: RigaTask) {
  return {
    id: t.id,
    progetto_id: t.progetto_id,
    titolo: t.titolo,
    stato: t.stato,
    priorita: t.priorita,
    lista_id: t.tasklist_id,
    sotto_task_di: t.parent_id,
    inizio: t.data_inizio,
    scadenza: t.scadenza,
    ...(t.stima_minuti ? { stima: formatStima(t.stima_minuti) } : {}),
    assegnatari: t.assegnatari ?? [],
  }
}

export async function creaTask(input: CreaTaskInput, ctx: ContestoMcp): Promise<EsitoStrumento> {
  const esito = await operazioni.aggiungiTask(nucleo(ctx), {
    progetto_id: input.progetto_id,
    tasklist_id: input.lista_id ?? null,
    parent_id: input.sotto_task_di ?? null,
    titolo: input.titolo,
    assegnatari: input.assegnatari ?? [],
  })
  if (!esito.ok) return no(esito.errore)

  // the other fields of the sheet, with the same schema as «Modifica»
  const altri = [input.descrizione, input.priorita, input.data_inizio, input.scadenza, input.stima].some((x) => x !== undefined && x !== null)
  let avviso: string | undefined
  if (altri) {
    const t = await leggiTask(ctx, esito.id)
    if (t) {
      const dopo = await operazioni.modificaTask(nucleo(ctx), taskModificato(t, input))
      if (!dopo.ok) avviso = `Il task è creato, ma non i suoi dettagli: ${dopo.errore}`
    }
  }
  const finale = await leggiTask(ctx, esito.id)
  return ok({ esito: 'creato', task: finale ? taskPerClaude(finale) : { id: esito.id }, ...(avviso ? { avviso } : {}) })
}

export async function modificaTask(input: ModificaTaskInput, ctx: ContestoMcp): Promise<EsitoStrumento> {
  const t = await leggiTask(ctx, input.task_id)
  if (!t) return no(TASK_NON_TROVATO, 'non_trovato')
  const esito = await operazioni.modificaTask(nucleo(ctx), taskModificato(t, input))
  if (!esito.ok) return no(esito.errore)
  const dopo = await leggiTask(ctx, t.id)
  return ok({ esito: 'salvato', task: dopo ? taskPerClaude(dopo) : { id: t.id }, ...(esito.avviso ? { avviso: esito.avviso } : {}) })
}

export async function completaTask(input: CompletaTaskInput, ctx: ContestoMcp): Promise<EsitoStrumento> {
  const completato = input.completato ?? true
  const esito = await operazioni.completaTask(nucleo(ctx), { id: input.task_id, completato })
  if (!esito.ok) return no(esito.errore)
  return ok({ esito: completato ? 'completato' : 'riaperto', task_id: input.task_id })
}

// ── notes ────────────────────────────────────────────────────────────────────
export async function aggiungiNota(input: AggiungiNotaInput, ctx: ContestoMcp): Promise<EsitoStrumento> {
  const esito = await operazioni.aggiungiNota(nucleo(ctx), {
    progetto_id: input.progetto_id,
    data: input.data ?? oggiRoma(),
    testo: input.testo,
  })
  if (!esito.ok) return no(esito.errore)
  return ok({ esito: 'aggiunta', nota_id: esito.id })
}

// ── time: always one's own ───────────────────────────────────────────────────
export async function registraTempo(input: RegistraTempoInput, ctx: ContestoMcp): Promise<EsitoStrumento> {
  const esito = await operazioni.registraTempo(nucleo(ctx), {
    progetto_id: input.progetto_id,
    task_id: input.task_id ?? null,
    data: input.data ?? oggiRoma(),
    durata: input.durata ?? null,
    dalle: input.dalle ?? null,
    alle: input.alle ?? null,
    nota: input.nota ?? null,
  })
  if (!esito.ok) return no(esito.errore)
  return ok({ esito: 'registrato', voce_id: esito.id, di_chi: SOLO_TUOI })
}

export async function modificaTempo(input: ModificaTempoInput, ctx: ContestoMcp): Promise<EsitoStrumento> {
  const v = riga(
    await ctx.db
      .from('pm_tempo')
      .select('id, progetto_id, task_id, data, minuti, inizio, fine, nota')
      // one's own only, even when RLS lets the admin read more
      .eq('id', input.voce_id)
      .eq('profile_id', ctx.persona)
      .not('minuti', 'is', null)
      .maybeSingle(),
  )
  if (!v) return no(VOCE_NON_TROVATA, 'non_trovato')
  const progetto = input.progetto_id ?? v.progetto_id
  // moved to another project without a task said: no task (the old one is of the other project)
  const task = input.task_id === '' ? null : (input.task_id ?? (progetto === v.progetto_id ? v.task_id : null))
  const fascia = fasciaDellaVoce(v)
  const nuovaDurata = input.durata !== undefined && input.durata !== null
  const nuovaFascia = Boolean(input.dalle || input.alle)
  const esito = await operazioni.modificaTempo(nucleo(ctx), {
    id: v.id,
    progetto_id: progetto,
    task_id: task,
    data: input.data ?? v.data,
    // a duration said takes the range off; a range said gives the minutes; nothing said keeps what there is
    durata: nuovaDurata ? input.durata : v.minuti,
    dalle: nuovaFascia ? (input.dalle ?? null) : nuovaDurata ? null : (fascia?.dalle ?? null),
    alle: nuovaFascia ? (input.alle ?? null) : nuovaDurata ? null : (fascia?.alle ?? null),
    nota: input.nota === undefined || input.nota === null ? v.nota : input.nota,
  })
  if (!esito.ok) return no(esito.errore)
  return ok({ esito: 'salvata', voce_id: v.id, di_chi: SOLO_TUOI })
}

export async function avviaTimer(input: AvviaTimerInput, ctx: ContestoMcp): Promise<EsitoStrumento> {
  const esito = await operazioni.avviaTimer(nucleo(ctx), {
    progetto_id: input.progetto_id,
    task_id: input.task_id ?? null,
    nota: input.nota ?? null,
  })
  if (!esito.ok) return no(esito.errore)
  return ok({ esito: 'avviato', voce_id: esito.id, nota: 'Un timer acceso prima si è fermato da solo.' })
}

export async function fermaTimer(input: FermaTimerInput, ctx: ContestoMcp): Promise<EsitoStrumento> {
  const esito = await operazioni.fermaTimer(nucleo(ctx), { nota: input.nota ?? null })
  if (!esito.ok) return no(esito.errore)
  if (!esito.id) return ok({ esito: 'nessun_timer', nota: 'Non c’era un timer acceso.' })
  return ok({ esito: 'fermato', voce_id: esito.id, ...durata(esito.minuti) })
}
