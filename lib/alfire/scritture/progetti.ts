import 'server-only'

import { z } from 'zod'

import { aggiungiNota, eliminaNota, modificaNota } from '@/app/(app)/progetti/[id]/note/actions'
import {
  aggiungiMembro,
  aggiungiTask,
  completaTask,
  eliminaLista,
  eliminaProgetto,
  eliminaTask,
  modificaProgetto,
  modificaTask,
  salvaLista,
  scegliCoach,
  togliMembro,
} from '@/app/(app)/progetti/[id]/actions'
import { creaProgetto } from '@/app/(app)/progetti/actions'
import { avviaTimer, eliminaTempo, fermaTimer, modificaTempo, registraTempo } from '@/app/(app)/tempo/actions'
import { raggruppaTempoTeam } from '@/components/pm/tempo-team/dati'
import { breve, cambi, giorno } from '@/lib/alfire/cambi'
import { CONSEGUENZE, conseguenzeLista, conseguenzeTask } from '@/lib/alfire/conseguenze'
import type { Anteprima } from '@/lib/alfire/riassunto'
import {
  errore,
  isErrore,
  isIo,
  isNessuno,
  isTaskInPiuProgetti,
  stessoTask,
  trova,
  type Errore,
  type TaskInPiuProgetti,
  type TaskTrovato,
  type VoceTempo,
} from '@/lib/alfire/risolvi'
import {
  anteprima,
  data,
  dataISO,
  datiDi,
  definizione,
  enumAzioni,
  erroreData,
  SOLO_DI_CHI_CHATTA,
  type Contesto,
  type Definizione,
} from '@/lib/alfire/scritture/comune'
import { aggiungiGiorni, formatOra, giornoEsteso, isDataISO, oggiRoma, primoDelMeseISO } from '@/lib/date'
import { formatData } from '@/lib/format'
import { hrefPeriodo } from '@/lib/periodo'
import { chiVedeLaCartella } from '@/lib/validation/cartella'
import {
  ETICHETTA_PRIORITA,
  ETICHETTA_STATO_PROGETTO,
  ETICHETTA_STATO_TASK,
  compitiDiRuoloInParole,
  elencoNomi,
  formatStima,
  linkTask,
  parseStima,
} from '@/lib/progetti'
import { PRIORITA, STATI_PROGETTO, STATI_TASK } from '@/lib/validation/progetti'
import { fasciaDellaVoce, modificaTempoSchema, tempoManualeSchema, timerSenzaFascia } from '@/lib/validation/tempo'

/**
 * Alfire's writes on projects: the project and its members, lists, tasks,
 * notes and one's own time. RLS (pm_puo_vedere / pm_puo_gestire) decides who
 * may do what, as for the pages; time is always the user's own (CLAUDE.md
 * sections 17 and 18: self-declared, never anybody else's). The one read of
 * other people's time is the admin's tempo_team, as Tempo › Team: declared
 * time only, never a running timer.
 */

type Progetto = Exclude<Awaited<ReturnType<Contesto['r']['trovaProgetto']>>, Errore>

async function progettoPerNome(ctx: Contesto, nome: string | undefined): Promise<Progetto | Errore> {
  if (!nome?.trim()) return errore('Dimmi il nome del progetto.')
  return ctx.r.trovaProgetto(nome)
}

/**
 * Project and (optional) task by name, as people say their time: the task
 * must belong to the project; the task alone is enough when it is one among
 * the projects I see (03/10/2026): a title every client has makes the question
 * name the projects. Nothing said: no project and no task. The same lookup for
 * where time goes (tempo) and for what time to count (mio_tempo, a `lettura`:
 * between two tasks with one title, even in one project, it asks which; one
 * title every client has, with no project said, is all of them, `insieme`,
 * and SQL sums them).
 */
async function progettoETask(
  ctx: Contesto,
  v: { progetto?: string; task?: string; task_id?: string },
  { lettura = false }: { lettura?: boolean } = {},
): Promise<{ progetto: Progetto | null; task: TaskTrovato | null; insieme?: TaskInPiuProgetti } | Errore> {
  const nomeTask = v.task?.trim() ?? ''
  if (!v.progetto?.trim()) {
    if (!nomeTask && !v.task_id) return { progetto: null, task: null }
    // a read counts the same title of every client together (trovaTaskDaContare): the sum is SQL's
    const t = lettura ? await ctx.r.trovaTaskDaContare(nomeTask, { task_id: v.task_id }) : await ctx.r.trovaTask(nomeTask, { task_id: v.task_id })
    if (isErrore(t)) return t
    if (isTaskInPiuProgetti(t)) return { progetto: null, task: null, insieme: t }
    const p = await ctx.r.progettoPerId(t.progetto_id)
    return isErrore(p) ? p : { progetto: p, task: t }
  }
  const p = await progettoPerNome(ctx, v.progetto)
  if (isErrore(p)) return p
  if (!nomeTask && !v.task_id) return { progetto: p, task: null }
  const t = await ctx.r.trovaTask(nomeTask, { task_id: v.task_id, progettoId: p.id, lettura })
  if (isErrore(t)) return t
  return { progetto: p, task: t }
}

/** Who manages the project (pm_puo_gestire): the projects' admin always, a manager where he is a member. */
async function gestisce(ctx: Contesto, progettoId: string): Promise<boolean> {
  if (ctx.livelloPm === 'admin') return true
  if (ctx.livelloPm !== 'manager') return false
  const { data } = await ctx.supabase.rpc('pm_puo_gestire', { p_progetto: progettoId })
  return data === true
}

/** Active people of the team by name, for a new project's members or a member to add. */
async function idDelTeam(ctx: Contesto, persone: readonly string[]): Promise<{ id: string; nome: string }[] | Errore> {
  const scelte: { id: string; nome: string }[] = []
  for (const nome of persone) {
    const p = await ctx.r.persona(nome)
    if (isErrore(p)) return p
    scelte.push(p)
  }
  return scelte
}

// ---------------------------------------------------------------------------
// The project and its members
// ---------------------------------------------------------------------------
function progetto(ctx: Contesto): Definizione {
  const { supabase, profilo, r } = ctx
  const adminApp = profilo.ruolo === 'admin'
  const schema = z.object({
    azione: enumAzioni(ctx, 'progetto'),
    progetto: z.string().optional().describe('Nome attuale (tutto tranne crea)'),
    nome: z.string().min(2).max(120).optional(),
    reparto: z.string().optional(),
    modello: z.string().optional().describe('crea: modello da cui partire (liste e task già datati)'),
    ...(adminApp ? { cliente: z.string().optional().describe('Cliente, nei reparti con cliente (Fitness Coaching); "nessuno" lo toglie') } : {}),
    descrizione: z.string().max(2000).optional(),
    stato: z.enum(STATI_PROGETTO).optional(),
    data_inizio: data.optional(),
    data_fine: data.optional(),
    responsabile: z.string().optional().describe('Un membro; "nessuno" lo toglie'),
    persone: z.array(z.string().min(1)).max(20).optional().describe('crea: membri; aggiungi_membro, togli_membro: chi'),
    coach: z.string().optional().describe('scegli_coach: la persona del team'),
  })
  type Input = z.infer<typeof schema> & { cliente?: string }

  /** «Scegli il coach» (02/10/2026): only a client's project, an active person, a change. */
  async function coachDaScegliere(v: Input) {
    const p = await progettoPerNome(ctx, v.progetto)
    if (isErrore(p)) return p
    if (!p.client_id) return errore(`Il coach si sceglie solo nei progetti dei clienti: «${p.nome}» non ne ha uno.`)
    if (!v.coach?.trim()) return errore('Dimmi chi è il coach.')
    const coach = await r.persona(v.coach)
    if (isErrore(coach)) return coach
    if (p.coach_id === coach.id) return errore(`${coach.nome} è già il coach di «${p.nome}».`)
    return { progetto: p, coach }
  }

  /** What the page's sheet says before the tap: who joins, who keeps what, where the role tasks go. */
  async function coseDelCoach(p: Progetto) {
    const [attivi, compiti, membri] = await Promise.all([
      supabase.from('profiles').select('id, nome, ruolo').eq('attivo', true).order('nome'),
      supabase
        .from('pm_task')
        .select('titolo, per_ruolo, assegnatari:pm_task_assegnatari(profile_id)')
        .eq('progetto_id', p.id)
        .is('parent_id', null)
        .not('per_ruolo', 'is', null)
        .order('ordine'),
      r.membri(p.id),
    ])
    // a list that could not be read is never "nobody has the role"
    if (attivi.error || compiti.error) return errore('Non riesco a leggere il team in questo momento: riprova tra poco.')
    const vecchio = p.coach_id ? (attivi.data ?? []).find((x) => x.id === p.coach_id)?.nome ?? null : null
    return {
      vecchio,
      daRuolo: compitiDiRuoloInParole(
        (compiti.data ?? []).map((t) => ({ titolo: t.titolo, per_ruolo: t.per_ruolo, assegnatari: (t.assegnatari ?? []).map((a) => a.profile_id) })),
        attivi.data ?? [],
        new Set(membri.map((m) => m.id)),
        p.coach_id,
      ),
    }
  }

  async function reparto(nome: string) {
    const { data: reparti } = await supabase.from('pm_reparti').select('id, nome').eq('attivo', true)
    const x = trova(reparti ?? [], nome)
    return !x || x === 'ambiguo' ? errore(`Reparto non trovato. Reparti: ${(reparti ?? []).map((y) => y.nome).join(', ')}`) : x
  }

  async function cliente(nome: string | undefined, attuale: string | null): Promise<{ id: string | null; nome: string | null } | Errore | undefined> {
    if (!adminApp || nome === undefined) return undefined
    if (isNessuno(nome)) return { id: null, nome: null }
    const c = await r.trovaCliente(nome)
    if (!c) return errore('Cliente non trovato.')
    if (isErrore(c)) return c
    return attuale === c.id ? undefined : c
  }

  async function nuovo(v: Input) {
    if (!v.reparto) return errore('Dimmi il reparto.')
    const rep = await reparto(v.reparto)
    if (isErrore(rep)) return rep
    let modello: { id: string; nome: string } | null = null
    if (v.modello) {
      const { data: modelli } = await supabase.from('pm_modelli').select('id, nome').eq('attivo', true)
      const m = trova(modelli ?? [], v.modello)
      if (!m || m === 'ambiguo') return errore(`Modello non trovato. Modelli: ${(modelli ?? []).map((x) => x.nome).join(', ')}`)
      modello = m
    }
    const c = await cliente(v.cliente, null)
    if (isErrore(c)) return c
    const membri = await idDelTeam(ctx, v.persone ?? [])
    if (isErrore(membri)) return membri
    // in the client departments the project is the client: its name comes from the client
    const nome = v.nome ?? c?.nome ?? null
    if (!nome) return errore('Dimmi il nome del progetto.')
    return { nome, reparto: rep, modello, cliente: c ?? null, membri }
  }

  async function unisci(v: Input) {
    const p = await progettoPerNome(ctx, v.progetto)
    if (isErrore(p)) return p
    const rep = v.reparto ? await reparto(v.reparto) : null
    if (isErrore(rep)) return rep
    let responsabile = p.responsabile_id
    if (v.responsabile !== undefined) {
      if (isNessuno(v.responsabile)) responsabile = null
      else {
        const ids = await r.idMembri(p.id, [v.responsabile])
        if (isErrore(ids)) return ids
        responsabile = ids[0]
      }
    }
    const c = await cliente(v.cliente, p.client_id)
    if (isErrore(c)) return c
    const dopo = {
      id: p.id,
      nome: v.nome ?? p.nome,
      reparto_id: rep?.id ?? p.reparto_id,
      descrizione: v.descrizione ?? p.descrizione,
      stato: v.stato ?? p.stato,
      data_inizio: v.data_inizio ?? p.data_inizio,
      data_fine: v.data_fine ?? p.data_fine,
      responsabile_id: responsabile,
      // undefined: the client stays as it is (only the app admin names one)
      ...(c ? { client_id: c.id } : {}),
    }
    return { attuale: p, dopo, reparto: rep, cliente: c }
  }

  async function membriDaToccare(v: Input) {
    const p = await progettoPerNome(ctx, v.progetto)
    if (isErrore(p)) return p
    if (!v.persone?.length) return errore('Dimmi chi.')
    if (v.azione === 'togli_membro') {
      const elenco = await r.membri(p.id)
      const scelte: { id: string; nome: string }[] = []
      for (const nome of v.persone) {
        const x = isIo(nome) ? elenco.find((m) => m.id === profilo.id) : trova(elenco, nome)
        if (!x || x === 'ambiguo') return errore(`"${nome}" non è tra i membri. Membri: ${elenco.map((m) => m.nome).join(', ')}`)
        scelte.push(x)
      }
      return { progetto: p, persone: scelte }
    }
    const persone = await idDelTeam(ctx, v.persone)
    return isErrore(persone) ? persone : { progetto: p, persone }
  }

  return definizione({
    description:
      'Un progetto. crea: nome, reparto, modello, date, persone come membri. modifica: solo i campi da cambiare. ' +
      'aggiungi_membro, togli_membro: persone. ' +
      'scegli_coach (solo i progetti dei clienti): il coach entra nel progetto e prende i task del cliente; per il coach mai aggiungi_membro.' +
      (ctx.livelloPm === 'admin' ? ' elimina: con liste, task, tempo e note.' : ''),
    inputSchema: schema,
    anteprima: async (input): Promise<Anteprima> => {
      const v = input as Input
      if (v.azione === 'crea') {
        const n = await nuovo(v)
        if (isErrore(n)) return n
        return anteprima(`Creo il progetto «${n.nome}»`, [
          `Reparto: ${n.reparto.nome}`,
          n.modello ? `Dal modello ${n.modello.nome}: liste e task datati dall’inizio` : null,
          n.cliente?.nome ? `Cliente: ${n.cliente.nome}` : null,
          v.data_inizio ? `Inizio ${formatData(v.data_inizio)}` : null,
          v.data_fine ? `Fine ${formatData(v.data_fine)}` : null,
          n.membri.length > 0 ? `Membri: ${elencoNomi(n.membri.map((m) => m.nome))} (e tu)` : null,
          v.descrizione ? `Descrizione: ${v.descrizione}` : null,
        ])
      }
      if (v.azione === 'aggiungi_membro' || v.azione === 'togli_membro') {
        const m = await membriDaToccare(v)
        if (isErrore(m)) return m
        const chi = elencoNomi(m.persone.map((p) => p.nome))
        return v.azione === 'aggiungi_membro'
          ? anteprima(`Aggiungo ${chi} al progetto «${m.progetto.nome}»`, ['Vedrà il progetto e potrà lavorarne i task.'])
          : anteprima(`Tolgo ${chi} dal progetto «${m.progetto.nome}»`, [...CONSEGUENZE.membro])
      }
      if (v.azione === 'scegli_coach') {
        const c = await coachDaScegliere(v)
        if (isErrore(c)) return c
        const cose = await coseDelCoach(c.progetto)
        if (isErrore(cose)) return cose
        return anteprima(`${c.coach.nome} diventa il coach di «${c.progetto.nome}»`, [
          cose.vecchio ? `Coach: ${cose.vecchio} → ${c.coach.nome}` : null,
          'Entra nel progetto e prende i task del cliente ancora senza nessuno: ci registra il tempo.',
          ...cose.daRuolo,
          'I task a cui lavorano già altre persone restano a loro.',
          cose.vecchio ? `${cose.vecchio} lascia i suoi task e resta nel team del progetto.` : null,
        ])
      }
      if (v.azione === 'elimina') {
        const p = await progettoPerNome(ctx, v.progetto)
        if (isErrore(p)) return p
        const { data: liste, error } = await supabase.from('v_pm_tasklist').select('id').eq('progetto_id', p.id)
        // a count that failed is not "0 lists": the red button waits
        if (error) {
          return { titolo: `Elimino il progetto «${p.nome}»`, righe: ['Non riesco a contare cosa si porta dietro: annulla e riprova tra poco.'], incompleta: true }
        }
        return anteprima(`Elimino il progetto «${p.nome}»`, [
          `Ha ${liste?.length ?? 0} ${liste?.length === 1 ? 'lista' : 'liste'} e ${p.task_totali ?? 0} task.`,
          ...CONSEGUENZE.progetto,
        ])
      }
      const u = await unisci(v)
      if (isErrore(u)) return u
      const nomi = await r.nomi([u.attuale.responsabile_id, u.dopo.responsabile_id])
      const { data: reparti } = await supabase.from('pm_reparti').select('id, nome').in('id', [u.attuale.reparto_id, u.dopo.reparto_id])
      const nomeReparto = (id: string) => (reparti ?? []).find((x) => x.id === id)?.nome ?? '?'
      return anteprima(`Correggo il progetto «${u.attuale.nome}»`, [
        ...cambi([
          ['Nome', u.attuale.nome, u.dopo.nome],
          ['Reparto', nomeReparto(u.attuale.reparto_id), nomeReparto(u.dopo.reparto_id)],
          ['Stato', ETICHETTA_STATO_PROGETTO[u.attuale.stato as keyof typeof ETICHETTA_STATO_PROGETTO], ETICHETTA_STATO_PROGETTO[u.dopo.stato as keyof typeof ETICHETTA_STATO_PROGETTO]],
          ['Descrizione', u.attuale.descrizione, u.dopo.descrizione, 'lungo'],
          ['Inizio', u.attuale.data_inizio, u.dopo.data_inizio, 'data'],
          ['Fine', u.attuale.data_fine, u.dopo.data_fine, 'data'],
          [
            'Responsabile',
            u.attuale.responsabile_id ? nomi.get(u.attuale.responsabile_id) : null,
            u.dopo.responsabile_id ? nomi.get(u.dopo.responsabile_id) : null,
          ],
        ]).filter((riga) => riga !== 'Nessun dato cambia.' || !u.cliente),
        u.cliente ? `Cliente: ${u.cliente.nome ?? 'nessuno'}` : null,
      ])
    },
    execute: async (input) => {
      const v = input as Input
      if (v.azione === 'crea') {
        const n = await nuovo(v)
        if (isErrore(n)) return n
        const esito = await creaProgetto({
          nome: n.nome,
          reparto_id: n.reparto.id,
          modello_id: n.modello?.id ?? null,
          client_id: n.cliente?.id ?? null,
          descrizione: v.descrizione,
          data_inizio: v.data_inizio,
          data_fine: v.data_fine,
          membri: n.membri.map((m) => m.id),
        })
        return esito.ok ? { fatto: true, link: `/progetti/${esito.id}` } : errore(esito.errore)
      }
      if (v.azione === 'aggiungi_membro' || v.azione === 'togli_membro') {
        const m = await membriDaToccare(v)
        if (isErrore(m)) return m
        const errori: string[] = []
        for (const p of m.persone) {
          const input_ = { progetto_id: m.progetto.id, profile_id: p.id }
          const esito = v.azione === 'aggiungi_membro' ? await aggiungiMembro(input_) : await togliMembro(input_)
          if (!esito.ok) errori.push(`${p.nome}: ${esito.errore}`)
        }
        if (errori.length === m.persone.length) return errore(errori.join(' '))
        return { fatto: true, ...(errori.length ? { avvisi: errori } : {}), link: `/progetti/${m.progetto.id}/membri` }
      }
      if (v.azione === 'scegli_coach') {
        const c = await coachDaScegliere(v)
        if (isErrore(c)) return c
        const esito = await scegliCoach({ progetto_id: c.progetto.id, profile_id: c.coach.id })
        return esito.ok ? { fatto: true, coach: c.coach.nome, link: `/progetti/${c.progetto.id}` } : errore(esito.errore)
      }
      if (v.azione === 'elimina') {
        const p = await progettoPerNome(ctx, v.progetto)
        if (isErrore(p)) return p
        const esito = await eliminaProgetto({ id: p.id })
        return esito.ok ? { fatto: true, link: '/progetti' } : errore(esito.errore)
      }
      const u = await unisci(v)
      if (isErrore(u)) return u
      const esito = await modificaProgetto(u.dopo)
      return esito.ok ? { fatto: true, link: `/progetti/${u.dopo.id}` } : errore(esito.errore)
    },
  })
}

// ---------------------------------------------------------------------------
// Lists (milestones)
// ---------------------------------------------------------------------------
function lista(ctx: Contesto): Definizione {
  const { r } = ctx
  const schema = z.object({
    azione: enumAzioni(ctx, 'lista'),
    progetto: z.string(),
    lista: z.string().optional().describe('Nome attuale (modifica, elimina)'),
    nome: z.string().min(1).max(120).optional(),
    descrizione: z.string().max(1000).optional(),
    data_inizio: data.optional(),
    data_fine: data.optional(),
  })
  type Input = z.infer<typeof schema>

  async function risolvi(v: Input) {
    const p = await progettoPerNome(ctx, v.progetto)
    if (isErrore(p)) return p
    if (v.azione === 'crea') return { progetto: p, lista: null }
    const l = await r.trovaLista(p.id, v.lista ?? '')
    return isErrore(l) ? l : { progetto: p, lista: l }
  }

  return definizione({
    description: 'Le liste (tappe con date) di un progetto. crea, modifica (solo i campi da cambiare), elimina (con i suoi task).',
    inputSchema: schema,
    anteprima: async (v): Promise<Anteprima> => {
      const x = await risolvi(v)
      if (isErrore(x)) return x
      if (!x.lista) {
        if (!v.nome) return errore('Dimmi il nome della lista.')
        return anteprima(`Creo la lista «${v.nome}» in «${x.progetto.nome}»`, [
          v.data_inizio ? `Inizio ${formatData(v.data_inizio)}` : null,
          v.data_fine ? `Fine ${formatData(v.data_fine)}` : null,
          v.descrizione ? `Descrizione: ${v.descrizione}` : null,
        ])
      }
      if (v.azione === 'elimina') {
        return anteprima(`Elimino la lista «${x.lista.nome}» di «${x.progetto.nome}»`, conseguenzeLista(x.lista.task_totali))
      }
      return anteprima(
        `Correggo la lista «${x.lista.nome}» di «${x.progetto.nome}»`,
        cambi([
          ['Nome', x.lista.nome, v.nome ?? x.lista.nome],
          ['Descrizione', x.lista.descrizione, v.descrizione ?? x.lista.descrizione, 'lungo'],
          ['Inizio', x.lista.data_inizio, v.data_inizio ?? x.lista.data_inizio, 'data'],
          ['Fine', x.lista.data_fine, v.data_fine ?? x.lista.data_fine, 'data'],
        ]),
      )
    },
    execute: async (v) => {
      const x = await risolvi(v)
      if (isErrore(x)) return x
      if (v.azione === 'elimina' && x.lista) {
        const esito = await eliminaLista({ id: x.lista.id })
        return esito.ok ? { fatto: true, link: `/progetti/${x.progetto.id}/attivita` } : errore(esito.errore)
      }
      if (!x.lista && !v.nome) return errore('Dimmi il nome della lista.')
      const esito = await salvaLista({
        id: x.lista?.id ?? null,
        progetto_id: x.progetto.id,
        nome: v.nome ?? x.lista?.nome,
        descrizione: v.descrizione ?? x.lista?.descrizione ?? null,
        data_inizio: v.data_inizio ?? x.lista?.data_inizio ?? null,
        data_fine: v.data_fine ?? x.lista?.data_fine ?? null,
      })
      return esito.ok ? { fatto: true, link: `/progetti/${x.progetto.id}/attivita` } : errore(esito.errore)
    },
  })
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------
function task(ctx: Contesto): Definizione {
  const { supabase, profilo, r } = ctx
  const schema = z.object({
    azione: enumAzioni(ctx, 'task'),
    titolo: z.string().min(1).max(200).describe('Titolo attuale, o del nuovo task'),
    progetto: z.string().optional().describe('Obbligatorio per aggiungi'),
    task_id: z.string().uuid().optional().describe('Da progetto_dettaglio o miei_task, se più task hanno quel titolo'),
    nuovo_titolo: z.string().min(1).max(200).optional().describe('modifica: il titolo nuovo'),
    lista: z.string().optional(),
    sotto_task_di: z.string().optional().describe('Titolo del task padre'),
    assegnatari: z
      .array(z.string().min(1))
      .max(10)
      .optional()
      .describe('Membri del progetto, "io" per chi chatta; in modifica l’elenco completo'),
    descrizione: z.string().max(5000).optional(),
    stato: z.enum(STATI_TASK).optional(),
    priorita: z.enum(PRIORITA).optional(),
    data_inizio: data.optional(),
    scadenza: data.optional(),
    stima: z.string().optional().describe('Es. 45 min, 2 h'),
  })
  type Input = z.infer<typeof schema>

  const dettagliChiesti = (v: Input) =>
    [v.descrizione, v.stato, v.priorita, v.data_inizio, v.scadenza, v.stima].some((x) => x !== undefined)

  /** List and parent by name, inside the project. */
  async function posto(progettoId: string, v: Input, attuale?: { tasklist_id: string | null; parent_id: string | null }) {
    let tasklist = attuale?.tasklist_id ?? null
    let parent = attuale?.parent_id ?? null
    if (v.lista !== undefined) {
      if (isNessuno(v.lista)) tasklist = null
      else {
        const l = await r.trovaLista(progettoId, v.lista)
        if (isErrore(l)) return l
        tasklist = l.id
      }
    }
    if (v.sotto_task_di !== undefined) {
      if (isNessuno(v.sotto_task_di)) parent = null
      else {
        const padre = await r.trovaTask(v.sotto_task_di, { progettoId })
        if (isErrore(padre)) return padre
        if (padre.progetto_id !== progettoId) return errore('Il task padre è in un altro progetto.')
        parent = padre.id
        tasklist = padre.tasklist_id
      }
    }
    return { tasklist, parent }
  }

  /** The task as it is, and the whole row modificaTask wants. */
  async function unisci(v: Input, t: Awaited<ReturnType<typeof r.trovaTask>>) {
    if (isErrore(t)) return t
    const luogo = await posto(t.progetto_id, v, t)
    if (isErrore(luogo)) return luogo
    const assegnatari = v.assegnatari ? await r.idMembri(t.progetto_id, v.assegnatari) : (t.assegnatari ?? [])
    if (isErrore(assegnatari)) return assegnatari
    const stima = v.stima === undefined ? t.stima_minuti : parseStima(v.stima)
    if (stima === undefined) return errore('Scrivi la stima come 45 min, 2 h o 1 h 30 min.')
    return {
      attuale: t,
      dopo: {
        id: t.id,
        titolo: v.nuovo_titolo ?? t.titolo,
        descrizione: v.descrizione ?? t.descrizione,
        stato: v.stato ?? t.stato,
        priorita: v.priorita ?? t.priorita,
        assegnatari,
        data_inizio: v.data_inizio ?? t.data_inizio,
        scadenza: v.scadenza ?? t.scadenza,
        stima_minuti: stima,
        tasklist_id: luogo.tasklist,
        parent_id: luogo.parent,
      },
    }
  }

  async function nomiDi(ids: readonly string[]) {
    const nomi = await r.nomi([...ids])
    return ids.map((id) => (id === profilo.id ? 'te' : (nomi.get(id) ?? '?')))
  }

  /**
   * The task said, and the project it is in: 13 clients have a «Revisione
   * video», the card says whose. A task already done is not done again, nor
   * an open one reopened: the card says so instead of «Segno come fatto».
   */
  async function trovato(v: Input) {
    const t = await r.trovaTask(v.titolo, { task_id: v.task_id, progetto: v.progetto, completato: v.azione === 'riapri' })
    if (isErrore(t)) return t
    const p = await r.progettoPerId(t.progetto_id)
    if (isErrore(p)) return p
    const fatto = t.stato === 'completato'
    if (v.azione === 'completa' && fatto) return errore(`Il task «${t.titolo}» di «${p.nome}» è già completato: non c’è niente da segnare.`)
    if (v.azione === 'riapri' && !fatto) return errore(`Il task «${t.titolo}» di «${p.nome}» è già aperto: non c’è niente da riaprire.`)
    const negato = await permesso(v, t)
    return negato ?? { task: t, progetto: p }
  }

  /** Two tasks with this title in the project: the card says which one, the open or the completed. */
  function quale(t: TaskTrovato): string | null {
    if (!t.omonimi) return null
    const altri = t.omonimi === 1 ? 'c’è un altro task' : `ci sono altri ${t.omonimi} task`
    return `È quello ${t.stato === 'completato' ? 'completato' : 'aperto'}: nel progetto ${altri} con questo titolo.`
  }

  /**
   * The rule the page shows its buttons by (puoModificare, puoEliminare) and
   * RLS enforces: who manages the project does anything; the others work the
   * tasks assigned to them or created by them, and delete only their own. The
   * card stops before the tap instead of an error after it.
   */
  async function permesso(v: Input, t: TaskTrovato): Promise<Errore | null> {
    if (await gestisce(ctx, t.progetto_id)) return null
    const mio = t.created_by === profilo.id
    if (v.azione === 'elimina') return mio ? null : errore('Puoi eliminare solo i task creati da te: chiedi a chi gestisce il progetto.')
    return mio || (t.assegnatari ?? []).includes(profilo.id)
      ? null
      : errore('Puoi lavorare solo i task assegnati a te o creati da te: chiedi a chi gestisce il progetto.')
  }

  return definizione({
    description:
      'Un task di un progetto. aggiungi (progetto obbligatorio; lista, sotto_task_di, assegnatari, scadenza…). ' +
      'modifica: solo i campi da cambiare. completa, riapri, elimina (con i sotto-task). ' +
      'Lo lavora chi gestisce il progetto, chi l’ha creato o chi ci è assegnato. ' +
      'I task del percorso nei progetti dei clienti (Revisione video, Call di check…) raccolgono il tempo e restano aperti: completali solo se l’utente lo chiede esplicitamente.',
    inputSchema: schema,
    anteprima: async (v): Promise<Anteprima> => {
      if (v.azione === 'aggiungi') {
        const p = await progettoPerNome(ctx, v.progetto)
        if (isErrore(p)) return p
        const luogo = await posto(p.id, v)
        if (isErrore(luogo)) return luogo
        const ids = await r.idMembri(p.id, v.assegnatari ?? [])
        if (isErrore(ids)) return ids
        const { data: lista } = luogo.tasklist
          ? await supabase.from('pm_tasklist').select('nome').eq('id', luogo.tasklist).maybeSingle()
          : { data: null }
        const stima = v.stima === undefined ? null : parseStima(v.stima)
        if (stima === undefined) return errore('Scrivi la stima come 45 min, 2 h o 1 h 30 min.')
        // every field the task is created with, as the edit right after the quick add will save it
        return anteprima(`Aggiungo il task «${v.titolo}» in «${p.nome}»`, [
          lista ? `Lista: ${lista.nome}` : 'Senza lista',
          v.sotto_task_di ? `Sotto-task di «${v.sotto_task_di}»` : null,
          ids.length > 0 ? `Assegnato a: ${elencoNomi(await nomiDi(ids))}` : 'Senza assegnatario',
          v.stato ? `Stato: ${ETICHETTA_STATO_TASK[v.stato]}` : null,
          v.priorita ? `Priorità: ${ETICHETTA_PRIORITA[v.priorita]}` : null,
          v.data_inizio ? `Inizio ${giorno(v.data_inizio)}` : null,
          v.scadenza ? `Scadenza ${giorno(v.scadenza)}` : null,
          stima ? `Stima: ${formatStima(stima)}` : null,
          v.descrizione ? `Descrizione: ${v.descrizione}` : null,
        ])
      }
      const x = await trovato(v)
      if (isErrore(x)) return x
      const t = x.task
      const dove_ = `Progetto: ${x.progetto.nome}`
      if (v.azione === 'completa') return anteprima(`Segno come fatto il task «${t.titolo}»`, [dove_, quale(t)])
      if (v.azione === 'riapri') return anteprima(`Riapro il task «${t.titolo}»`, [dove_, quale(t)])
      if (v.azione === 'elimina') {
        return anteprima(`Elimino il task «${t.titolo}»`, [dove_, quale(t), ...conseguenzeTask(t.sotto_task_totali ?? 0)])
      }
      const u = await unisci(v, t)
      if (isErrore(u)) return u
      const prima = await nomiDi(u.attuale.assegnatari ?? [])
      const dopo = await nomiDi(u.dopo.assegnatari)
      const idListe = [u.attuale.tasklist_id, u.dopo.tasklist_id].filter((x): x is string => Boolean(x))
      const { data: liste } = idListe.length
        ? await supabase.from('pm_tasklist').select('id, nome').in('id', idListe)
        : { data: [] as { id: string; nome: string }[] }
      const nomeLista = (id: string | null) => (id ? ((liste ?? []).find((l) => l.id === id)?.nome ?? '?') : null)
      return anteprima(`Correggo il task «${t.titolo}»`, [
        dove_,
        quale(t),
        ...cambi([
          ['Titolo', u.attuale.titolo, u.dopo.titolo],
          ['Stato', ETICHETTA_STATO_TASK[u.attuale.stato as keyof typeof ETICHETTA_STATO_TASK], ETICHETTA_STATO_TASK[u.dopo.stato as keyof typeof ETICHETTA_STATO_TASK]],
          ['Priorità', ETICHETTA_PRIORITA[u.attuale.priorita as keyof typeof ETICHETTA_PRIORITA], ETICHETTA_PRIORITA[u.dopo.priorita as keyof typeof ETICHETTA_PRIORITA]],
          ['Assegnato a', prima.length ? elencoNomi(prima) : null, dopo.length ? elencoNomi(dopo) : null],
          ['Inizio', u.attuale.data_inizio, u.dopo.data_inizio, 'giorno'],
          ['Scadenza', u.attuale.scadenza, u.dopo.scadenza, 'giorno'],
          ['Stima', u.attuale.stima_minuti, u.dopo.stima_minuti, 'minuti'],
          ['Descrizione', u.attuale.descrizione, u.dopo.descrizione, 'lungo'],
          ['Lista', nomeLista(u.attuale.tasklist_id), nomeLista(u.dopo.tasklist_id)],
        ]),
      ])
    },
    execute: async (v) => {
      if (v.azione === 'aggiungi') {
        const p = await progettoPerNome(ctx, v.progetto)
        if (isErrore(p)) return p
        const luogo = await posto(p.id, v)
        if (isErrore(luogo)) return luogo
        const assegnatari = await r.idMembri(p.id, v.assegnatari ?? [])
        if (isErrore(assegnatari)) return assegnatari
        const esito = await aggiungiTask({
          progetto_id: p.id,
          titolo: v.titolo,
          tasklist_id: luogo.tasklist,
          parent_id: luogo.parent,
          assegnatari,
        })
        if (!esito.ok) return errore(esito.errore)
        let link = `/progetti/${p.id}/attivita`
        if (!dettagliChiesti(v)) return { fatto: true, link }
        // the quick add takes the title only: the details go on with the task's own edit
        const { data: creati } = await supabase
          .from('v_pm_task')
          .select(
            'id, titolo, progetto_id, tasklist_id, parent_id, descrizione, stato, priorita, data_inizio, scadenza, stima_minuti, assegnatari, sotto_task_totali',
          )
          .eq('progetto_id', p.id)
          .eq('titolo', v.titolo.trim())
          .eq('created_by', profilo.id)
          .order('created_at', { ascending: false })
          .limit(1)
        const nuovo = creati?.[0]
        if (!nuovo) return { fatto: true, avvisi: ['Task creato, ma scadenza e dettagli vanno messi dalla pagina.'], link }
        // found: the link opens it (05/10/2026)
        link = linkTask(p.id, nuovo.id as string)
        // the title stays the one on the card: nuovo_titolo is for edits only
        const u = await unisci(
          { ...v, azione: 'modifica', nuovo_titolo: undefined, lista: undefined, sotto_task_di: undefined, assegnatari: undefined },
          nuovo as never,
        )
        if (isErrore(u)) return { fatto: true, avvisi: [`Task creato, dettagli non salvati: ${u.errore}`], link }
        const dettagli = await modificaTask(u.dopo)
        return dettagli.ok ? { fatto: true, link } : { fatto: true, avvisi: [`Task creato, dettagli non salvati: ${dettagli.errore}`], link }
      }
      const x = await trovato(v)
      if (isErrore(x)) return x
      const t = x.task
      // the task where it lives, its sheet open (05/10/2026); a deleted one: its project
      const link = linkTask(t.progetto_id, t.id)
      if (v.azione === 'completa' || v.azione === 'riapri') {
        const esito = await completaTask({ id: t.id, completato: v.azione === 'completa' })
        return esito.ok ? { fatto: true, task: t.titolo, link } : errore(esito.errore)
      }
      if (v.azione === 'elimina') {
        const esito = await eliminaTask({ id: t.id })
        return esito.ok ? { fatto: true, link: `/progetti/${t.progetto_id}/attivita` } : errore(esito.errore)
      }
      const u = await unisci(v, t)
      if (isErrore(u)) return u
      const esito = await modificaTask(u.dopo)
      if (!esito.ok) return errore(esito.errore)
      return { fatto: true, ...('avviso' in esito && esito.avviso ? { avvisi: [esito.avviso] } : {}), link }
    },
  })
}

// ---------------------------------------------------------------------------
// Notes of a project
// ---------------------------------------------------------------------------
function notaProgetto(ctx: Contesto): Definizione {
  const { r } = ctx
  const schema = z.object({
    azione: enumAzioni(ctx, 'nota_progetto'),
    progetto: z.string(),
    nota_id: z.string().uuid().optional().describe('Da progetto_dettaglio'),
    data: dataISO('Giorno della nota; default oggi').optional(),
    testo: z.string().max(5000).optional(),
  })
  type Input = z.infer<typeof schema>

  async function risolvi(v: Input) {
    const p = await progettoPerNome(ctx, v.progetto)
    if (isErrore(p)) return p
    if (v.azione === 'aggiungi') return { progetto: p, nota: null }
    const n = await r.trovaNota(p.id, { nota_id: v.nota_id, data: v.nota_id ? undefined : v.data })
    if (isErrore(n)) return n
    // RLS: the author, or the projects' admin; the card stops before the tap
    if (n.autore_id !== ctx.profilo.id && ctx.livelloPm !== 'admin') {
      return errore('Puoi correggere o eliminare solo le tue note: questa l’ha scritta un’altra persona.')
    }
    return { progetto: p, nota: n }
  }

  return definizione({
    description: 'Le note datate di un progetto. aggiungi (data default oggi), modifica o elimina (le proprie; nota_id da progetto_dettaglio).',
    inputSchema: schema,
    anteprima: async (v): Promise<Anteprima> => {
      const x = await risolvi(v)
      if (isErrore(x)) return x
      if (!x.nota) {
        if (!v.testo?.trim()) return errore('Dimmi il testo della nota.')
        return anteprima(`Aggiungo una nota a «${x.progetto.nome}»`, [`${formatData(v.data ?? oggiRoma())}: «${v.testo.trim()}»`])
      }
      if (v.azione === 'elimina') {
        return anteprima(`Elimino la nota del ${formatData(x.nota.data)} di «${x.progetto.nome}»`, [`«${breve(x.nota.testo)}»`])
      }
      return anteprima(
        `Correggo la nota del ${formatData(x.nota.data)} di «${x.progetto.nome}»`,
        cambi([
          ['Giorno', x.nota.data, v.data ?? x.nota.data, 'data'],
          ['Testo', x.nota.testo, v.testo ?? x.nota.testo, 'lungo'],
        ]),
      )
    },
    execute: async (v) => {
      const x = await risolvi(v)
      if (isErrore(x)) return x
      const link = `/progetti/${x.progetto.id}/note`
      if (!x.nota) {
        const esito = await aggiungiNota({ progetto_id: x.progetto.id, data: v.data ?? oggiRoma(), testo: v.testo })
        return esito.ok ? { fatto: true, link } : errore(esito.errore)
      }
      const esito =
        v.azione === 'elimina'
          ? await eliminaNota({ id: x.nota.id })
          : await modificaNota({ id: x.nota.id, data: v.data ?? x.nota.data, testo: v.testo ?? x.nota.testo })
      return esito.ok ? { fatto: true, link } : errore(esito.errore)
    },
  })
}

// ---------------------------------------------------------------------------
// One's own time (never anybody else's: CLAUDE.md sections 17 and 18)
// ---------------------------------------------------------------------------
function durataLeggibile(minuti: number | null | undefined): string {
  return formatStima(minuti ?? 0) || '0 min'
}

/** "09:00–10:30", or null without a range. */
function fascia(dalle: string | null | undefined, alle: string | null | undefined): string | null {
  return dalle && alle ? `${dalle}–${alle}` : null
}

/** "(task completato)": the time form hides completed tasks, Alfire says when it writes on one. */
function titoloTask(t: Pick<TaskTrovato, 'titolo' | 'stato'> | null | undefined): string {
  return t ? ` · ${t.titolo}${t.stato === 'completato' ? ' (task completato)' : ''}` : ''
}

/** A task in a «prima → dopo» row: its title, marked when completed. */
function comeTask(t: { titolo: string; stato?: string } | null | undefined): string | null {
  return t ? `${t.titolo}${t.stato === 'completato' ? ' (completato)' : ''}` : null
}

/** The task as a line of the card: «Revisione video», marked when completed. */
function rigaTask(t: Pick<TaskTrovato, 'titolo' | 'stato'> | null | undefined): string | null {
  return t ? `Task: ${t.titolo}${t.stato === 'completato' ? ' (completato)' : ''}` : null
}

/** A running timer's minutes so far, as the card says them. */
function finora(inizio: string | null | undefined): string {
  if (!inizio) return '?'
  const minuti = Math.floor((Date.now() - new Date(inizio).getTime()) / 60_000)
  return minuti < 1 ? 'meno di un minuto' : `circa ${durataLeggibile(minuti)}`
}

/** "dalle 09:12", and the day when the timer started on another one: "dalle 22:10 di ieri, venerdì 02/10/2026". */
function daQuando(acceso: { inizio: string | null; data: string }): string {
  const ora = acceso.inizio ? formatOra(acceso.inizio) : '?'
  return `dalle ${ora}${acceso.data !== oggiRoma() ? ` di ${giornoEsteso(acceso.data)}` : ''}`
}

/**
 * The order Alfire gives a person's entries (mio_tempo, and the candidates of
 * a correction, 03/10/2026): by day, the most recent first, and inside a day
 * the last registered first (a timer counts from its start; then the id, so
 * both reads agree). Only inside one day is the first the last registered: an
 * entry registered today for yesterday comes after today's, and the one just
 * registered is found by the voce_id registra gives. Il mio tempo orders a
 * day otherwise: first the entries with a start time (a range or a timer),
 * the latest start first, then those without, the last registered first.
 */
const ORDINE_VOCI = 'per giorno dal più recente, e nello stesso giorno dall’ultima registrata (un timer: dal suo avvio)'

function tempo(ctx: Contesto): Definizione {
  const { supabase, r } = ctx
  const schema = z.object({
    azione: enumAzioni(ctx, 'tempo'),
    progetto: z
      .string()
      .optional()
      .describe(
        'Il progetto: quello di un cliente porta il suo nome. avvia, registra: serve se il task da solo non basta a trovarlo. modifica, elimina: il progetto della voce (per spostarla: nuovo_progetto)',
      ),
    task: z
      .string()
      .optional()
      .describe('Titolo del task, facoltativo. modifica, elimina: il task della voce da trovare (per spostarla: nuovo_task)'),
    task_id: z.string().uuid().optional().describe('Da progetto_dettaglio o miei_task, se più task hanno quel titolo'),
    nuovo_progetto: z
      .string()
      .optional()
      .describe('modifica: sposta la voce su questo progetto; senza nuovo_task va sul task con lo stesso titolo, se c’è'),
    nuovo_task: z.string().optional().describe('modifica: sposta la voce su questo task (del nuovo progetto, se cambia); "nessuno" lo toglie'),
    data: dataISO('Default oggi, mai nel futuro. modifica, elimina senza voce_id: il giorno della voce; con voce_id: il giorno nuovo').optional(),
    durata: z.string().optional().describe('Es. 1h30, 45 min, 1:30. Con dalle e alle non serve'),
    dalle: z.string().optional().describe('Fascia facoltativa con alle, es. 09:00; "nessuna" la toglie'),
    alle: z.string().optional().describe('Es. 10:30'),
    nota: z.string().max(2000).optional(),
    voce_id: z.string().uuid().optional().describe('Da mio_tempo, o da registra e avvia: la voce da correggere o eliminare'),
  })
  type Input = z.infer<typeof schema>

  /** registra: what the form's server action receives, checked with the same schema. */
  function daRegistrare(v: Input, progettoId: string, taskId: string | null) {
    return {
      progetto_id: progettoId,
      task_id: taskId,
      data: v.data ?? oggiRoma(),
      durata: v.durata ?? '',
      dalle: v.dalle ?? null,
      alle: v.alle ?? null,
      nota: v.nota,
    }
  }

  /**
   * modifica: what is not said stays, the range too. A new duration without
   * a range takes the range away (it would not match); "nessuna" takes it away.
   */
  function daCorreggere(v: Input, x: VoceTempo, d: Destinazione) {
    const attuale = fasciaDellaVoce(x)
    const togli = isNessuno(v.dalle) || isNessuno(v.alle) || (v.durata !== undefined && v.dalle === undefined && v.alle === undefined)
    return {
      id: x.id,
      progetto_id: d.progetto?.id ?? x.progetto_id,
      task_id: d.taskId,
      data: v.data ?? x.data,
      durata: v.durata ?? x.minuti ?? 0,
      dalle: togli ? null : (v.dalle ?? attuale?.dalle ?? null),
      alle: togli ? null : (v.alle ?? attuale?.alle ?? null),
      nota: v.nota ?? x.nota,
    }
  }

  /** Where the time goes: a project, and the task if said (progettoETask). */
  async function dove(v: Input): Promise<{ progetto: Progetto; task: TaskTrovato | null } | Errore> {
    const x = await progettoETask(ctx, v)
    if (isErrore(x)) return x
    return x.progetto
      ? { progetto: x.progetto, task: x.task }
      : errore('Dimmi il progetto (quello di un cliente porta il suo nome) e, se vuoi, il task.')
  }

  /**
   * The entry to correct or delete: by voce_id, or by project, task and day
   * (mine only, stopped only). A project or a task said next to a voce_id
   * that is not the entry's own is never ignored: a move is nuovo_progetto
   * or nuovo_task.
   */
  async function voce(v: Input) {
    if (v.voce_id) {
      const x = await r.trovaVoce({ voce_id: v.voce_id })
      if (isErrore(x)) return x
      // a deletion only says where the entry is; a correction offers the move
      const sposta = v.azione === 'modifica'
      if (v.progetto?.trim()) {
        const p = await progettoPerNome(ctx, v.progetto)
        if (isErrore(p)) return p
        if (p.id !== x.progetto_id) {
          return sposta
            ? errore(
                `Questa voce è su «${x.progetto?.nome ?? '?'}», non su «${p.nome}»: se vuoi, la sposto su «${p.nome}».`,
                `Per spostarla: voce_id e nuovo_progetto «${p.nome}», senza progetto (o col progetto della voce).`,
              )
            : errore(`Questa voce è su «${x.progetto?.nome ?? '?'}», non su «${p.nome}».`, 'Chiedi quale voce intendeva.')
        }
      }
      const detto = v.task?.trim()
      const altroTask = v.task_id
        ? v.task_id !== x.task_id
        : detto
          ? isNessuno(detto)
            ? x.task_id !== null
            : !stessoTask(x.task?.titolo, detto)
          : false
      if (altroTask) {
        const qui = x.task?.titolo ? `sul task «${x.task.titolo}»` : 'senza task'
        const li = detto && !isNessuno(detto) ? `su «${detto}»` : v.task_id ? 'su quel task' : 'senza task'
        return sposta
          ? errore(
              `Questa voce è ${qui}, non ${li}: ${li === 'senza task' ? 'se vuoi, le tolgo il task' : `se vuoi, la sposto ${li}`}.`,
              'Per spostarla: voce_id e nuovo_task col titolo del task ("nessuno" lo toglie), senza task né task_id.',
            )
          : errore(`Questa voce è ${qui}, non ${li}.`, 'Chiedi quale voce intendeva.')
      }
      return x
    }
    const p = v.progetto?.trim() ? await progettoPerNome(ctx, v.progetto) : null
    if (isErrore(p)) return p
    return r.trovaVoce({
      progettoId: p?.id,
      progetto: p?.nome,
      taskId: v.task_id,
      task: v.task,
      data: v.data,
      perSpostare: v.azione === 'modifica',
    })
  }

  type Destinazione = { progetto: Progetto | null; taskId: string | null; task: { titolo: string; stato?: string } | null }

  /**
   * modifica: where the entry ends up, as the form lets it (pm_modifica_tempo
   * with its project): nuovo_progetto moves it to another project, nuovo_task
   * onto a task of the project it ends up in. Moved without a task said, it
   * keeps its task's title when that project has one (the path's tasks repeat
   * in every client's project), or stays without one, as the form leaves it.
   */
  async function destinazione(v: Input, x: VoceTempo): Promise<Destinazione | Errore> {
    let progetto: Progetto | null = null
    // an entry always has a project: «nessuno» is never a move (it was once ignored with «Nessun dato cambia»)
    if (isNessuno(v.nuovo_progetto)) {
      return errore('Una voce di tempo sta sempre su un progetto: posso spostarla su un altro, non toglierglielo.', 'Chiedi su quale progetto spostarla.')
    }
    if (v.nuovo_progetto?.trim()) {
      const p = await progettoPerNome(ctx, v.nuovo_progetto)
      if (isErrore(p)) return p
      if (p.id !== x.progetto_id) progetto = p
    }
    if (v.nuovo_task !== undefined) {
      if (isNessuno(v.nuovo_task)) return { progetto, taskId: null, task: null }
      const t = await r.trovaTask(v.nuovo_task, { progettoId: progetto?.id ?? x.progetto_id })
      return isErrore(t) ? t : { progetto, taskId: t.id, task: t }
    }
    if (!progetto) return { progetto, taskId: x.task_id, task: x.task }
    if (!x.task_id || !x.task) return { progetto, taskId: null, task: null }
    const { data, error } = await supabase
      .from('v_pm_task')
      .select('id, titolo, stato')
      .eq('progetto_id', progetto.id)
      .eq('titolo', x.task.titolo)
    // a read that failed is never "no such task there"
    if (error) return errore('Non riesco a leggere i task del progetto in questo momento: riprova tra poco.')
    const uguali = (data ?? []) as { id: string; titolo: string; stato: string }[]
    const aperti = uguali.filter((t) => t.stato !== 'completato')
    const t = aperti.length === 1 ? aperti[0] : uguali.length === 1 ? uguali[0] : null
    return { progetto, taskId: t?.id ?? null, task: t }
  }

  /** "Voce: ieri, venerdì 02/10/2026, 09:00–10:30": which entry, before what changes. */
  function rigaVoce(x: VoceTempo): string {
    const f = fasciaDellaVoce(x) ?? timerSenzaFascia(x)
    return `Voce: ${giornoEsteso(x.data)}${f ? `, ${typeof f === 'string' ? f : fascia(f.dalle, f.alle)}` : ''}`
  }

  return definizione({
    description:
      'Il tuo tempo, mai quello di altri: per un’altra persona non si registra, dillo. ' +
      'avvia o ferma il timer (nota facoltativa: fermando, una nota nuova sostituisce quella dell’avvio); ' +
      'avvia o registra senza progetto né task detti: non chiamarlo, chiedi prima su cosa, con i suoi task da miei_task in proponi_risposte; ' +
      'registra a posteriori una durata o una fascia dalle-alle (data default oggi, mai nel futuro); ' +
      'registra, avvia e ferma danno il voce_id della voce: per correggere quella appena registrata usa quello. ' +
      'modifica o elimina una tua voce: con voce_id, o con progetto, task e data; le voci candidate sono ' +
      ORDINE_VOCI +
      '. modifica sposta la voce con nuovo_progetto e nuovo_task. ' +
      'Ogni cliente ha un progetto col suo nome con i task del percorso: Call di onboarding, Analisi e strategia iniziale, Programmazione allenamento, Programmazione alimentare, Revisione video, Call di check, Assistenza chat, Altre attività.',
    inputSchema: schema,
    anteprima: async (v): Promise<Anteprima> => {
      if (v.azione === 'avvia') {
        const x = await dove(v)
        if (isErrore(x)) return x
        const acceso = await r.timerAcceso()
        return anteprima(`Avvio il timer su «${x.progetto.nome}»${titoloTask(x.task)}`, [
          acceso ? `Fermo quello acceso su «${acceso.progetto?.nome ?? '?'}» ${daQuando(acceso)}.` : null,
          v.nota ? `Nota: ${v.nota}` : null,
        ])
      }
      if (v.azione === 'ferma') {
        const acceso = await r.timerAcceso()
        if (!acceso) return errore('Non hai un timer acceso.')
        const notaNuova = v.nota?.trim()
        return anteprima(
          `Fermo il timer su «${acceso.progetto?.nome ?? '?'}»${acceso.task?.titolo ? ` · ${acceso.task.titolo}` : ''}`,
          [
            `Acceso ${daQuando(acceso)}, finora ${finora(acceso.inizio)}`,
            notaNuova
              ? `Nota: ${notaNuova}${acceso.nota?.trim() ? ` (al posto di «${breve(acceso.nota)}»)` : ''}`
              : acceso.nota?.trim()
                ? `Nota: ${acceso.nota.trim()}`
                : null,
          ],
        )
      }
      if (v.azione === 'registra') {
        if (!v.durata && !v.dalle && !v.alle) return errore('Dimmi la durata, ad esempio 1h30 o 45 min, o la fascia (dalle, alle).')
        const x = await dove(v)
        if (isErrore(x)) return x
        const dati = tempoManualeSchema.safeParse(daRegistrare(v, x.progetto.id, x.task?.id ?? null))
        if (!dati.success) return errore(dati.error.issues[0].message)
        const f = fascia(dati.data.dalle, dati.data.alle)
        // "del tuo tempo": the time of whoever confirms, never someone else's (no tool writes it)
        return anteprima(`Registro ${durataLeggibile(dati.data.durata)} del tuo tempo su «${x.progetto.nome}», ${giornoEsteso(dati.data.data)}`, [
          f ? `Fascia: ${f}` : null,
          rigaTask(x.task),
          v.nota ? `Nota: ${v.nota}` : null,
        ])
      }
      const x = await voce(v)
      if (isErrore(x)) return x
      const suCosa = `«${x.progetto?.nome ?? '?'}»${x.task?.titolo ? ` · ${x.task.titolo}` : ''}`
      if (v.azione === 'elimina') {
        return anteprima(`Elimino ${durataLeggibile(x.minuti)} del tuo tempo su ${suCosa}`, [
          rigaVoce(x),
          x.nota ? `Nota: ${breve(x.nota)}` : null,
        ])
      }
      const d = await destinazione(v, x)
      if (isErrore(d)) return d
      const dati = modificaTempoSchema.safeParse(daCorreggere(v, x, d))
      if (!dati.success) return errore(dati.error.issues[0].message)
      const prima = fasciaDellaVoce(x)
      // the same range on the same day keeps a timer's seconds, and so its minutes
      const stessaFascia = prima !== null && dati.data.data === x.data && dati.data.dalle === prima.dalle && dati.data.alle === prima.alle
      // a timer with no range of one day keeps start and end while day and minutes stay (pm_modifica_tempo)
      const senzaFascia = timerSenzaFascia(x)
      const restaIlTimer = senzaFascia !== null && dati.data.data === x.data && dati.data.durata === x.minuti
      const fasciaPrima = fascia(prima?.dalle, prima?.alle) ?? senzaFascia
      const fasciaDopo = fascia(dati.data.dalle, dati.data.alle) ?? (restaIlTimer ? senzaFascia : fasciaPrima ? 'tolta' : null)
      return anteprima(`Correggo ${durataLeggibile(x.minuti)} del tuo tempo su ${suCosa}`, [
        rigaVoce(x),
        ...cambi([
          ['Progetto', x.progetto?.nome ?? null, d.progetto?.nome ?? x.progetto?.nome ?? null],
          ['Giorno', x.data, dati.data.data, 'giorno'],
          ['Fascia', fasciaPrima, fasciaDopo],
          ['Durata', x.minuti, stessaFascia ? x.minuti : dati.data.durata, 'minuti'],
          // a completed task says so: the form does not offer one, a move onto one keeping its title shows it (03/10/2026)
          ['Task', comeTask(x.task), comeTask(d.task)],
          ['Nota', x.nota, v.nota ?? x.nota, 'lungo'],
        ]),
      ])
    },
    execute: async (v) => {
      if (v.azione === 'avvia') {
        const x = await dove(v)
        if (isErrore(x)) return x
        const esito = await avviaTimer({ progetto_id: x.progetto.id, task_id: x.task?.id ?? null, nota: v.nota })
        // the entry the timer becomes when it stops: "correggi quella appena registrata" needs no search
        return esito.ok ? { fatto: true, voce_id: esito.id, link: '/tempo' } : errore(esito.errore)
      }
      if (v.azione === 'ferma') {
        const esito = await fermaTimer({ nota: v.nota })
        return esito.ok ? { fatto: true, minuti: esito.minuti, voce_id: esito.id, link: '/tempo' } : errore(esito.errore)
      }
      if (v.azione === 'registra') {
        const x = await dove(v)
        if (isErrore(x)) return x
        const esito = await registraTempo(daRegistrare(v, x.progetto.id, x.task?.id ?? null))
        return esito.ok ? { fatto: true, voce_id: esito.id, link: '/tempo' } : errore(esito.errore)
      }
      const x = await voce(v)
      if (isErrore(x)) return x
      if (v.azione === 'elimina') {
        const esito = await eliminaTempo({ id: x.id })
        return esito.ok ? { fatto: true, link: '/tempo' } : errore(esito.errore)
      }
      const d = await destinazione(v, x)
      if (isErrore(d)) return d
      const esito = await modificaTempo(daCorreggere(v, x, d))
      return esito.ok ? { fatto: true, link: '/tempo' } : errore(esito.errore)
    },
  })
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------
/** The folder's link could not be read: never "no folder". */
export const CARTELLA_NON_LETTA = 'Link della cartella Drive non letto: riprova fra un momento.'

function progettoDettaglio(ctx: Contesto): Definizione {
  const { supabase, profilo, r } = ctx
  return definizione({
    description:
      'Un progetto nel dettaglio: liste, task aperti (con task_id) con assegnatari e scadenze, membri, ultime note (con nota_id)' +
      // the client's Drive folder (05/10/2026): only the admin and the coach of a client's project read it
      (profilo.ruolo === 'admin'
        ? '; nel progetto di un cliente anche il link della sua cartella Drive.'
        : '; nel progetto di un cliente di cui sei il coach anche il link della sua cartella Drive.'),
    inputSchema: z.object({ progetto: z.string().describe('Nome del progetto') }),
    execute: async ({ progetto: nome }) => {
      const p = await r.trovaProgetto(nome)
      if (isErrore(p)) return p
      // read-only, never written from the chat: the card on the project page links it
      const conCartella = chiVedeLaCartella(profilo, p) !== null && p.client_id !== null
      const [liste, task, membri, note, cartella] = await Promise.all([
        supabase.from('v_pm_tasklist').select('id, nome, data_inizio, data_fine, task_totali, task_completati').eq('progetto_id', p.id).order('ordine'),
        supabase
          .from('v_pm_task')
          .select('id, titolo, tasklist_id, parent_id, scadenza, in_ritardo, stato, assegnatari')
          .eq('progetto_id', p.id)
          .neq('stato', 'completato')
          .order('scadenza', { nullsFirst: false })
          .limit(40),
        r.membri(p.id),
        supabase.from('pm_note').select('id, data, testo, autore_id').eq('progetto_id', p.id).order('data', { ascending: false }).limit(10),
        conCartella && p.client_id
          ? supabase.from('clienti_cartelle').select('url').eq('client_id', p.client_id).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ])
      // the folder's link alone failing keeps the rest of the answer: it says so, never "no folder"
      if (liste.error || task.error || note.error) return errore('Progetto non disponibile.')
      const nomeLista = new Map((liste.data ?? []).map((l) => [l.id, l.nome]))
      const nomi = await r.nomi([...(task.data ?? []).flatMap((t) => t.assegnatari ?? []), ...(note.data ?? []).map((n) => n.autore_id)])
      const chi = (id: string) => (id === profilo.id ? 'io' : (nomi.get(id) ?? '?'))
      return {
        progetto: { nome: p.nome, stato: p.stato, inizio: p.data_inizio, fine: p.data_fine },
        liste: (liste.data ?? []).map((l) => ({
          nome: l.nome,
          inizio: l.data_inizio,
          fine: l.data_fine,
          task: l.task_totali,
          completati: l.task_completati,
        })),
        task_aperti: (task.data ?? []).map((t) => ({
          task_id: t.id,
          titolo: t.titolo,
          lista: t.tasklist_id ? nomeLista.get(t.tasklist_id) : null,
          sotto_task: Boolean(t.parent_id),
          stato: t.stato,
          scadenza: t.scadenza,
          in_ritardo: t.in_ritardo,
          assegnatari: (t.assegnatari ?? []).map(chi),
        })),
        membri: membri.map((m) => (m.id === profilo.id ? 'io' : m.nome)),
        note: (note.data ?? []).map((n) => ({ nota_id: n.id, data: n.data, testo: breve(n.testo), autore: chi(n.autore_id) })),
        ...(conCartella
          ? {
              cartella_drive: cartella.error
                ? CARTELLA_NON_LETTA
                : cartella.data?.url
                  ? { link: cartella.data.url }
                  : 'Nessuna cartella collegata: si collega dalla pagina del progetto, «Cartella Drive».',
            }
          : {}),
      }
    },
  })
}

/** "ultimi 7 giorni" in days, today included; otherwise da–a, by default the month so far. */
const periodoTempo = z.object({
  ultimi_giorni: z
    .number()
    .int()
    .min(1)
    .max(366)
    .optional()
    .describe('Gli ultimi N giorni, oggi compreso: «ultimi 7 giorni» = 7. Al posto di da e a'),
  da: dataISO('Default: primo del mese').optional(),
  a: dataISO('Default: oggi').optional(),
})

function leggiPeriodoTempo({ ultimi_giorni, da, a }: z.infer<typeof periodoTempo>): { da: string; a: string } | Errore {
  const oggi = oggiRoma()
  // the same count as the period presets: "ultimi 90 giorni" = today and the 89 before
  if (ultimi_giorni) return { da: aggiungiGiorni(oggi, 1 - ultimi_giorni), a: oggi }
  // "28/09/2026" or "lunedì" is an error, never the month so far: the answer would be about another period (03/10/2026)
  if ((da?.trim() && !isDataISO(da)) || (a?.trim() && !isDataISO(a))) return erroreData()
  const inizio = da?.trim() ? da : primoDelMeseISO(oggi)
  const fine = a?.trim() ? a : oggi
  return inizio <= fine ? { da: inizio, a: fine } : { da: fine, a: inizio }
}

/** Entries of mio_tempo: the most recent ones; the totals always count them all. */
const VOCI_MIO_TEMPO = 40
/** Project › task totals of mio_tempo: the ones with the most time (a coach has 8 tasks per client). */
const TASK_MIO_TEMPO = 30

const PROGETTO_NON_DISPONIBILE = 'Progetto non più disponibile'
const TASK_NON_DISPONIBILE = 'Task non più disponibile'
/** Time on a project without a task, as Tempo › Team and mio_tempo say it. */
const SENZA_TASK = 'senza task'

/**
 * One's own time (03/10/2026: «Quanto ho dedicato alla revisione video di
 * Rossi questo mese?»): the totals per day and per project of Il mio tempo
 * (pm_riepilogo_tempo) and per project › task (pm_mio_tempo_per_task), all
 * from SQL, only of whoever chats. A project or a task said narrows totals
 * and entries to it, found by name as the time tool finds them.
 */
function mioTempo(ctx: Contesto): Definizione {
  const { supabase, profilo, r } = ctx
  return definizione({
    description:
      `Il tempo registrato da chi chatta nel periodo: totale, per giorno, per progetto e per task (progetto › task), da SQL: non sommare voci né totali. Le voci ${ORDINE_VOCI} (voce_id per modificarle) e il suo timer acceso, se c’è. ` +
      'Con progetto e/o task solo il tempo lì: «quanto ho dedicato alla revisione video di Rossi?» = progetto Rossi, task revisione video. ' +
      'Un task detto senza progetto che ha lo stesso titolo in più progetti (la revisione video di tutti i clienti): il risultato è già la somma, con il dettaglio per progetto. ' +
      'Titoli diversi, o due task con lo stesso titolo in un progetto: il risultato chiede quale; mai sommare tu i loro tempi. ' +
      SOLO_DI_CHI_CHATTA +
      (profilo.ruolo === 'admin' ? ' Per il tempo degli altri: tempo_team.' : ''),
    inputSchema: periodoTempo.extend({
      progetto: z.string().optional().describe('Facoltativo: solo il tempo su questo progetto (quello di un cliente porta il suo nome)'),
      task: z.string().optional().describe('Facoltativo: solo il tempo su questo task, anche detto a parole tue'),
      task_id: z.string().uuid().optional().describe('Se più task hanno quel titolo: quello scelto, dalla domanda «quale?», da per_task, progetto_dettaglio o miei_task'),
    }),
    execute: async (input) => {
      const periodo = leggiPeriodoTempo(input)
      if (isErrore(periodo)) return periodo
      const { da: inizio, a: fine } = periodo
      // the same lookup as the time tool: a task said alone, among more projects, asks which; and a
      // read never picks one of two tasks with one title (it would leave the other's time out)
      const filtro = await progettoETask(ctx, input, { lettura: true })
      if (isErrore(filtro)) return filtro
      if (filtro.insieme) return tempoSuUnTaskDiPiuProgetti(ctx, filtro.insieme, periodo)
      const progettoId = filtro.progetto?.id
      const taskId = filtro.task?.id
      const filtrato = Boolean(progettoId || taskId)

      let voci = mieVoci(ctx, periodo)
      if (progettoId) voci = voci.eq('progetto_id', progettoId)
      if (taskId) voci = voci.eq('task_id', taskId)
      const [letteVoci, perTask, acceso, riepilogo] = await Promise.all([
        piuRecenti(voci),
        // per project › task, from SQL and only mine (never another person's, even for the admin)
        supabase.rpc('pm_mio_tempo_per_task', {
          p_da: inizio,
          p_a: fine,
          ...(progettoId ? { p_progetto: progettoId } : {}),
          ...(taskId ? { p_task: taskId } : {}),
        }),
        r.timerAcceso(),
        // the totals of Il mio tempo, from SQL: the model never adds up the entries (it once said "2 ore" from a partial
        // list). Narrowed to a project or a task, the totals are pm_mio_tempo_per_task's, and per day there is none
        filtrato ? null : supabase.rpc('pm_riepilogo_tempo', { p_da: inizio, p_a: fine }),
      ])
      if (letteVoci.error || perTask.error || riepilogo?.error) return errore('Tempo non disponibile.')
      const totale = riepilogo ? riepilogo.data.find((x) => x.livello === 'totale') : perTask.data.find((x) => x.livello === 'totale')
      const elenco = letteVoci.data ?? []
      const righeTask = perTask.data.filter((x) => x.livello === 'task')
      const etichettaTask = (x: (typeof righeTask)[number]) =>
        `${x.progetto_id ?? ''}›${x.task_id ? (x.task ?? TASK_NON_DISPONIBILE).toLowerCase() : SENZA_TASK}`
      const doppi = new Map<string, number>()
      for (const x of righeTask) doppi.set(etichettaTask(x), (doppi.get(etichettaTask(x)) ?? 0) + 1)
      return {
        // whose time this is, first: never someone else's (30/09/2026)
        ...datiDi(profilo),
        periodo: { da: inizio, a: fine },
        // what the totals and the entries are about, when narrowed
        ...(filtrato
          ? { solo: { progetto: filtro.progetto?.nome ?? PROGETTO_NON_DISPONIBILE, ...(filtro.task ? { task: filtro.task.titolo } : {}) } }
          : {}),
        totale: { minuti: totale?.minuti ?? 0, durata: durataLeggibile(totale?.minuti), voci: totale?.voci ?? 0 },
        ...(riepilogo
          ? {
              // the days with time, from SQL: "quanto ho fatto ogni giorno?" without adding up the entries
              per_giorno: riepilogo.data
                .filter((x) => x.livello === 'giorno')
                .map((x) => ({ data: x.data, minuti: x.minuti, durata: durataLeggibile(x.minuti) })),
              per_progetto: riepilogo.data
                .filter((x) => x.livello === 'progetto')
                .map((x) => ({ progetto: x.progetto ?? PROGETTO_NON_DISPONIBILE, minuti: x.minuti, durata: durataLeggibile(x.minuti), voci: x.voci })),
            }
          : {}),
        // project › task, the most time first (as SQL ordered them); two tasks with one title in a
        // project (an old completed one and the open one) carry their task_id, to ask about one
        per_task: righeTask.slice(0, TASK_MIO_TEMPO).map((x) => ({
          progetto: x.progetto ?? PROGETTO_NON_DISPONIBILE,
          task: x.task_id ? (x.task ?? TASK_NON_DISPONIBILE) : SENZA_TASK,
          ...(x.task_id && (doppi.get(etichettaTask(x)) ?? 0) > 1 ? { task_id: x.task_id } : {}),
          minuti: x.minuti,
          durata: durataLeggibile(x.minuti),
          voci: x.voci,
        })),
        ...(righeTask.length > TASK_MIO_TEMPO
          ? { nota_task: `Qui i ${TASK_MIO_TEMPO} task con più tempo su ${righeTask.length}: per gli altri, chiedi con il progetto.` }
          : {}),
        timer_acceso: timerInBreve(acceso),
        voci: elenco.map(voceInBreve),
        ...notaVoci(elenco.length, totale?.voci),
      }
    },
  })
}

type Periodo = { da: string; a: string }

/** My entries of the period, never the running timer (it is timer_acceso and never takes a place in the list). */
function mieVoci({ supabase, profilo }: Contesto, { da, a }: Periodo) {
  return (
    supabase
      .from('pm_tempo')
      .select('id, data, minuti, nota, inizio, fine, progetto:pm_progetti(nome), task:pm_task(titolo)')
      // mine only, even when RLS lets a manager or the admin see more
      .eq('profile_id', profilo.id)
      .not('minuti', 'is', null)
      .gte('data', da)
      .lte('data', a)
  )
}

/** ORDINE_VOCI, the same as the candidates of a correction (trovaVoce), with the same tie-break. */
function piuRecenti(voci: ReturnType<typeof mieVoci>) {
  return voci
    .order('data', { ascending: false })
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(VOCI_MIO_TEMPO)
}

type VoceLetta = NonNullable<Awaited<ReturnType<typeof piuRecenti>>['data']>[number]

function voceInBreve(v: VoceLetta) {
  const f = fasciaDellaVoce(v)
  return {
    voce_id: v.id,
    data: v.data,
    progetto: v.progetto?.nome ?? null,
    task: v.task?.titolo ?? null,
    minuti: v.minuti,
    fascia: fascia(f?.dalle, f?.alle),
    nota: v.nota,
  }
}

function timerInBreve(acceso: Awaited<ReturnType<Contesto['r']['timerAcceso']>>) {
  return acceso
    ? { progetto: acceso.progetto?.nome ?? null, task: acceso.task?.titolo ?? null, data: acceso.data, dalle: acceso.inizio ? formatOra(acceso.inizio) : null }
    : null
}

function notaVoci(lette: number, tutte: number | null | undefined) {
  return lette < (tutte ?? 0)
    ? { nota: `Qui le ${lette} voci più recenti su ${tutte}: il totale le conta tutte; l’elenco intero in [Il mio tempo](/tempo).` }
    : {}
}

/**
 * One task title across the projects of every client, no project said
 * (03/10/2026: «quanto ho dedicato alla revisione video questo mese?»): the
 * total and the projects from SQL (pm_mio_tempo_per_task with p_tasks, only
 * the caller's entries), and the entries of the tasks with time in the period.
 * The model never sums: the answer says it is the sum, and whose.
 */
async function tempoSuUnTaskDiPiuProgetti(ctx: Contesto, insieme: TaskInPiuProgetti, periodo: Periodo) {
  const { supabase, profilo, r } = ctx
  const [perTask, acceso] = await Promise.all([
    supabase.rpc('pm_mio_tempo_per_task', { p_da: periodo.da, p_a: periodo.a, p_tasks: insieme.task.map((t) => t.id) }),
    r.timerAcceso(),
  ])
  if (perTask.error) return errore('Tempo non disponibile.')
  const totale = perTask.data.find((x) => x.livello === 'totale')
  const progetti = perTask.data.filter((x) => x.livello === 'progetto')
  // the entries of the tasks with time (SQL said which): never every client's task in the request
  const conTempo = [...new Set(perTask.data.flatMap((x) => (x.livello === 'task' && x.task_id ? [x.task_id] : [])))]
  const letteVoci = conTempo.length > 0 ? await piuRecenti(mieVoci(ctx, periodo).in('task_id', conTempo)) : null
  if (letteVoci?.error) return errore('Tempo non disponibile.')
  const elenco = letteVoci?.data ?? []
  return {
    // whose time this is, first: never someone else's (30/09/2026)
    ...datiDi(profilo),
    periodo,
    solo: { task: insieme.titolo, progetti: `tutti quelli dove c’è (${insieme.progetti})` },
    somma: `Tempo di ${profilo.nome} sul task «${insieme.titolo}» in tutti i progetti dove c’è (uno per cliente), sommato dall’app: dillo così, con il totale e, se serve, per_progetto. Non sommare altro.`,
    totale: { minuti: totale?.minuti ?? 0, durata: durataLeggibile(totale?.minuti), voci: totale?.voci ?? 0 },
    // the most time first, as SQL ordered them
    per_progetto: progetti.slice(0, TASK_MIO_TEMPO).map((x) => ({
      progetto: x.progetto ?? PROGETTO_NON_DISPONIBILE,
      minuti: x.minuti,
      durata: durataLeggibile(x.minuti),
      voci: x.voci,
    })),
    ...(progetti.length > TASK_MIO_TEMPO
      ? { nota_progetti: `Qui i ${TASK_MIO_TEMPO} progetti con più tempo su ${progetti.length}: il totale li conta tutti.` }
      : {}),
    timer_acceso: timerInBreve(acceso),
    voci: elenco.map(voceInBreve),
    ...notaVoci(elenco.length, totale?.voci),
  }
}

/**
 * What tempo_team shows per person: the latest entries, and the projects and
 * tasks with the most time (the RPC orders them so), enough to say what the
 * time went on. The whole team gets less of each: a month of a coach on the
 * client projects must still fit a free-plan answer. The rest is on the page.
 */
export const LIMITI_TEMPO_TEAM = {
  persona: { voci: 20, progetti: 15, task: 10 },
  team: { voci: 5, progetti: 5, task: 3 },
} as const


/**
 * The team's declared time, as Tempo › Team (Dany, 30/09/2026: "quanto tempo
 * ha tracciato Loris negli ultimi 7 giorni?"). The app admin only; the RPC
 * refuses anybody else anyway. Same limits as the page (CLAUDE.md sections 17
 * and 18): only time already declared, never a running timer, only the people
 * with time in the period, alphabetical. Every total comes from SQL.
 */
function tempoTeam(ctx: Contesto): Definizione {
  const { supabase, r } = ctx
  return definizione({
    description:
      'Il tempo già dichiarato dal team nel periodo, come Tempo › Team: per persona (in ordine alfabetico) totale, progetti, task e ultime voci. ' +
      'È lo strumento per il tempo di un’altra persona: mio_tempo è solo di chi chatta. ' +
      'Mai i timer accesi; compare solo chi ha registrato qualcosa: non dire chi manca, niente classifiche né confronti tra persone. ' +
      'altri_progetti, altri_task: quanti non sono nell’elenco, tutti nel link.',
    inputSchema: periodoTempo.extend({
      persona: z.string().optional().describe('Nome; vuoto: tutto il team'),
      progetto: z.string().optional().describe('Nome; vuoto: tutti i progetti'),
    }),
    execute: async (input) => {
      const periodo = leggiPeriodoTempo(input)
      if (isErrore(periodo)) return periodo
      let chi: { id: string; nome: string } | undefined
      if (input.persona?.trim()) {
        const trovata = await r.personaDelTeam(input.persona)
        if (isErrore(trovata)) return trovata
        chi = trovata
      }
      let progetto: Progetto | undefined
      if (input.progetto?.trim()) {
        const trovato = await r.trovaProgetto(input.progetto)
        if (isErrore(trovato)) return trovato
        progetto = trovato
      }
      const limiti = chi ? LIMITI_TEMPO_TEAM.persona : LIMITI_TEMPO_TEAM.team
      const { data: righe, error } = await supabase.rpc('pm_tempo_per_persona', {
        p_da: periodo.da,
        p_a: periodo.a,
        ...(chi ? { p_profilo: chi.id } : {}),
        ...(progetto ? { p_progetto: progetto.id } : {}),
        p_limite: limiti.voci,
      })
      // a read that fails is never "nobody logged anything"
      if (error) return errore('Tempo del team non disponibile.')
      // grouped as on the page; minutes and entries as SQL counted them
      const team = raggruppaTempoTeam(righe ?? [])
      return {
        periodo,
        ...(chi ? { persona: chi.nome } : {}),
        ...(progetto ? { progetto: progetto.nome } : {}),
        totale: { minuti: team.minuti, durata: durataLeggibile(team.minuti), voci: team.voci },
        persone: team.persone.map((p) => ({
          persona: p.nome,
          minuti: p.minuti,
          durata: durataLeggibile(p.minuti),
          voci: p.voci,
          // the projects and tasks with the most time first (as SQL ordered them); how many more, never their minutes added up here
          progetti: p.progetti.slice(0, limiti.progetti).map((g) => ({
            progetto: g.nome,
            minuti: g.minuti,
            durata: durataLeggibile(g.minuti),
            task: g.task
              .slice(0, limiti.task)
              .map((t) => ({ task: t.titolo ?? SENZA_TASK, minuti: t.minuti, durata: durataLeggibile(t.minuti) })),
            ...(g.task.length > limiti.task ? { altri_task: g.task.length - limiti.task } : {}),
          })),
          ...(p.progetti.length > limiti.progetti ? { altri_progetti: p.progetti.length - limiti.progetti } : {}),
          ultime_voci: p.ultime.map((v) => {
            const f = fasciaDellaVoce(v)
            return {
              data: v.data,
              progetto: v.progetto,
              task: v.task ?? SENZA_TASK,
              minuti: v.minuti,
              ...(f ? { fascia: fascia(f.dalle, f.alle) } : {}),
              ...(v.nota?.trim() ? { nota: breve(v.nota) } : {}),
            }
          }),
          ...(p.ultime.length < p.voci ? { nota: `Qui le ${p.ultime.length} voci più recenti su ${p.voci}: tutte in Tempo › Team.` } : {}),
        })),
        // asked about one person: the answer to that question, never a list of who did not log
        ...(team.persone.length === 0
          ? { nota: chi ? `${chi.nome} non ha tempo registrato nel periodo.` : 'Nessun tempo registrato nel periodo.' }
          : {}),
        link: hrefPeriodo('/tempo/team', periodo, { persona: chi?.id, progetto: progetto?.id }),
      }
    },
  })
}

export function strumentiProgetti(ctx: Contesto) {
  return {
    progetto_dettaglio: progettoDettaglio(ctx),
    mio_tempo: mioTempo(ctx),
    tempo_team: tempoTeam(ctx),
    progetto: progetto(ctx),
    lista: lista(ctx),
    task: task(ctx),
    nota_progetto: notaProgetto(ctx),
    tempo: tempo(ctx),
  }
}
