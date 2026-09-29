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
  togliMembro,
} from '@/app/(app)/progetti/[id]/actions'
import { creaProgetto } from '@/app/(app)/progetti/actions'
import { avviaTimer, eliminaTempo, fermaTimer, modificaTempo, registraTempo } from '@/app/(app)/tempo/actions'
import { breve, cambi } from '@/lib/alfire/cambi'
import { CONSEGUENZE, conseguenzeLista, conseguenzeTask } from '@/lib/alfire/conseguenze'
import type { Anteprima } from '@/lib/alfire/riassunto'
import { errore, isErrore, isIo, isNessuno, trova, type Errore } from '@/lib/alfire/risolvi'
import { anteprima, data, definizione, enumAzioni, type Contesto, type Definizione } from '@/lib/alfire/scritture/comune'
import { formatOra, isDataISO, oggiRoma, primoDelMeseISO } from '@/lib/date'
import { formatData } from '@/lib/format'
import {
  ETICHETTA_PRIORITA,
  ETICHETTA_STATO_PROGETTO,
  ETICHETTA_STATO_TASK,
  elencoNomi,
  formatStima,
  parseStima,
} from '@/lib/progetti'
import { PRIORITA, STATI_PROGETTO, STATI_TASK } from '@/lib/validation/progetti'
import { parseDurata } from '@/lib/validation/tempo'

/**
 * Alfire's writes on projects: the project and its members, lists, tasks,
 * notes and one's own time. RLS (pm_puo_vedere / pm_puo_gestire) decides who
 * may do what, as for the pages; time is always the user's own (CLAUDE.md
 * sections 17 and 18: self-declared, never anybody else's).
 */

type Progetto = Exclude<Awaited<ReturnType<Contesto['r']['trovaProgetto']>>, Errore>

async function progettoPerNome(ctx: Contesto, nome: string | undefined): Promise<Progetto | Errore> {
  if (!nome?.trim()) return errore('Dimmi il nome del progetto.')
  return ctx.r.trovaProgetto(nome)
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
  })
  type Input = z.infer<typeof schema> & { cliente?: string }

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
      'aggiungi_membro, togli_membro: persone.' +
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

  return definizione({
    description:
      'Un task di un progetto. aggiungi (progetto obbligatorio; lista, sotto_task_di, assegnatari, scadenza…). ' +
      'modifica: solo i campi da cambiare. completa, riapri, elimina (con i sotto-task). ' +
      'Lo lavora chi gestisce il progetto, chi l’ha creato o chi ci è assegnato.',
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
          v.data_inizio ? `Inizio ${formatData(v.data_inizio)}` : null,
          v.scadenza ? `Scadenza ${formatData(v.scadenza)}` : null,
          stima ? `Stima: ${formatStima(stima)}` : null,
          v.descrizione ? `Descrizione: ${v.descrizione}` : null,
        ])
      }
      const t = await r.trovaTask(v.titolo, { task_id: v.task_id, progetto: v.progetto })
      if (isErrore(t)) return t
      if (v.azione === 'completa') return anteprima(`Segno come fatto il task «${t.titolo}»`, [])
      if (v.azione === 'riapri') return anteprima(`Riapro il task «${t.titolo}»`, [])
      if (v.azione === 'elimina') return anteprima(`Elimino il task «${t.titolo}»`, conseguenzeTask(t.sotto_task_totali ?? 0))
      const u = await unisci(v, t)
      if (isErrore(u)) return u
      const prima = await nomiDi(u.attuale.assegnatari ?? [])
      const dopo = await nomiDi(u.dopo.assegnatari)
      const idListe = [u.attuale.tasklist_id, u.dopo.tasklist_id].filter((x): x is string => Boolean(x))
      const { data: liste } = idListe.length
        ? await supabase.from('pm_tasklist').select('id, nome').in('id', idListe)
        : { data: [] as { id: string; nome: string }[] }
      const nomeLista = (id: string | null) => (id ? ((liste ?? []).find((l) => l.id === id)?.nome ?? '?') : null)
      return anteprima(
        `Correggo il task «${t.titolo}»`,
        cambi([
          ['Titolo', u.attuale.titolo, u.dopo.titolo],
          ['Stato', ETICHETTA_STATO_TASK[u.attuale.stato as keyof typeof ETICHETTA_STATO_TASK], ETICHETTA_STATO_TASK[u.dopo.stato as keyof typeof ETICHETTA_STATO_TASK]],
          ['Priorità', ETICHETTA_PRIORITA[u.attuale.priorita as keyof typeof ETICHETTA_PRIORITA], ETICHETTA_PRIORITA[u.dopo.priorita as keyof typeof ETICHETTA_PRIORITA]],
          ['Assegnato a', prima.length ? elencoNomi(prima) : null, dopo.length ? elencoNomi(dopo) : null],
          ['Inizio', u.attuale.data_inizio, u.dopo.data_inizio, 'data'],
          ['Scadenza', u.attuale.scadenza, u.dopo.scadenza, 'data'],
          ['Stima', u.attuale.stima_minuti, u.dopo.stima_minuti, 'minuti'],
          ['Descrizione', u.attuale.descrizione, u.dopo.descrizione, 'lungo'],
          ['Lista', nomeLista(u.attuale.tasklist_id), nomeLista(u.dopo.tasklist_id)],
        ]),
      )
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
        const link = `/progetti/${p.id}/attivita`
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
        // the title stays the one on the card: nuovo_titolo is for edits only
        const u = await unisci(
          { ...v, azione: 'modifica', nuovo_titolo: undefined, lista: undefined, sotto_task_di: undefined, assegnatari: undefined },
          nuovo as never,
        )
        if (isErrore(u)) return { fatto: true, avvisi: [`Task creato, dettagli non salvati: ${u.errore}`], link }
        const dettagli = await modificaTask(u.dopo)
        return dettagli.ok ? { fatto: true, link } : { fatto: true, avvisi: [`Task creato, dettagli non salvati: ${dettagli.errore}`], link }
      }
      const t = await r.trovaTask(v.titolo, { task_id: v.task_id, progetto: v.progetto })
      if (isErrore(t)) return t
      const link = `/progetti/${t.progetto_id}/attivita`
      if (v.azione === 'completa' || v.azione === 'riapri') {
        const esito = await completaTask({ id: t.id, completato: v.azione === 'completa' })
        return esito.ok ? { fatto: true, task: t.titolo, link } : errore(esito.errore)
      }
      if (v.azione === 'elimina') {
        const esito = await eliminaTask({ id: t.id })
        return esito.ok ? { fatto: true, link } : errore(esito.errore)
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
    data: data.optional().describe('Giorno della nota; default oggi'),
    testo: z.string().max(5000).optional(),
  })
  type Input = z.infer<typeof schema>

  async function risolvi(v: Input) {
    const p = await progettoPerNome(ctx, v.progetto)
    if (isErrore(p)) return p
    if (v.azione === 'aggiungi') return { progetto: p, nota: null }
    const n = await r.trovaNota(p.id, { nota_id: v.nota_id, data: v.nota_id ? undefined : v.data })
    return isErrore(n) ? n : { progetto: p, nota: n }
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

function tempo(ctx: Contesto): Definizione {
  const { r } = ctx
  const schema = z.object({
    azione: enumAzioni(ctx, 'tempo'),
    progetto: z.string().optional(),
    task: z.string().optional().describe('Titolo del task, facoltativo'),
    data: data.optional().describe('Default oggi, mai nel futuro'),
    durata: z.string().optional().describe('Es. 1h30, 45 min, 1:30'),
    nota: z.string().max(2000).optional(),
    voce_id: z.string().uuid().optional().describe('Da mio_tempo'),
  })
  type Input = z.infer<typeof schema>

  /** Project and (optional) task by name: the task must belong to the project. */
  async function dove(nomeProgetto: string | undefined, nomeTask: string | undefined) {
    const p = await progettoPerNome(ctx, nomeProgetto)
    if (isErrore(p)) return p
    if (!nomeTask?.trim()) return { progetto: p, task: null }
    const t = await r.trovaTask(nomeTask, { progettoId: p.id })
    if (isErrore(t)) return t
    return { progetto: p, task: t }
  }

  async function voce(v: Input) {
    const p = v.voce_id || !v.progetto ? null : await progettoPerNome(ctx, v.progetto)
    if (isErrore(p)) return p
    return r.trovaVoce({ voce_id: v.voce_id, progettoId: p?.id, data: v.voce_id ? undefined : v.data })
  }

  /** modifica: a task named moves the entry onto that task of the same project. */
  async function nuovoTask(v: Input, progettoId: string, attuale: string | null) {
    if (v.task === undefined) return { id: attuale, titolo: null as string | null }
    if (isNessuno(v.task)) return { id: null, titolo: 'nessuno' }
    const t = await r.trovaTask(v.task, { progettoId })
    if (isErrore(t)) return t
    return { id: t.id, titolo: t.titolo }
  }

  return definizione({
    description:
      'Il tuo tempo, mai quello di altri. avvia o ferma il timer (una nota facoltativa); registra minuti a posteriori (data default oggi, mai nel futuro); ' +
      'modifica (giorno, durata, nota, task) o elimina una tua voce (voce_id da mio_tempo).',
    inputSchema: schema,
    anteprima: async (v): Promise<Anteprima> => {
      if (v.azione === 'avvia') {
        const x = await dove(v.progetto, v.task)
        if (isErrore(x)) return x
        const acceso = await r.timerAcceso()
        return anteprima(`Avvio il timer su «${x.progetto.nome}»${x.task ? ` · ${x.task.titolo}` : ''}`, [
          acceso ? `Fermo quello acceso su «${acceso.progetto?.nome ?? '?'}» dalle ${acceso.inizio ? formatOra(acceso.inizio) : '?'}.` : null,
          v.nota ? `Nota: ${v.nota}` : null,
        ])
      }
      if (v.azione === 'ferma') {
        const acceso = await r.timerAcceso()
        if (!acceso) return errore('Non hai un timer acceso.')
        return anteprima(
          `Fermo il timer su «${acceso.progetto?.nome ?? '?'}»${acceso.task?.titolo ? ` · ${acceso.task.titolo}` : ''}`,
          [`Acceso dalle ${acceso.inizio ? formatOra(acceso.inizio) : '?'}`, v.nota ? `Nota: ${v.nota}` : null],
        )
      }
      if (v.azione === 'registra') {
        const minuti = parseDurata(v.durata)
        if (!minuti) return errore('Dimmi la durata, ad esempio 1h30 o 45 min.')
        const x = await dove(v.progetto, v.task)
        if (isErrore(x)) return x
        return anteprima(`Registro ${durataLeggibile(minuti)} su «${x.progetto.nome}» il ${formatData(v.data ?? oggiRoma())}`, [
          x.task ? `Task: ${x.task.titolo}` : null,
          v.nota ? `Nota: ${v.nota}` : null,
        ])
      }
      const x = await voce(v)
      if (isErrore(x)) return x
      if (v.azione === 'elimina') {
        return anteprima(`Elimino ${durataLeggibile(x.minuti)} su «${x.progetto?.nome ?? '?'}» del ${formatData(x.data)}`, [
          x.nota ? `Nota: ${breve(x.nota)}` : null,
        ])
      }
      const minuti = v.durata === undefined ? x.minuti : parseDurata(v.durata)
      if (!minuti) return errore('Dimmi la durata, ad esempio 1h30 o 45 min.')
      const t = await nuovoTask(v, x.progetto_id, x.task_id)
      if (isErrore(t)) return t
      return anteprima(`Correggo ${durataLeggibile(x.minuti)} su «${x.progetto?.nome ?? '?'}» del ${formatData(x.data)}`, [
        ...cambi([
          ['Giorno', x.data, v.data ?? x.data, 'data'],
          ['Durata', x.minuti, minuti, 'minuti'],
          ['Nota', x.nota, v.nota ?? x.nota, 'lungo'],
        ]).filter((riga) => riga !== 'Nessun dato cambia.' || !t.titolo),
        t.titolo ? `Task: ${t.titolo}` : null,
      ])
    },
    execute: async (v) => {
      if (v.azione === 'avvia') {
        const x = await dove(v.progetto, v.task)
        if (isErrore(x)) return x
        const esito = await avviaTimer({ progetto_id: x.progetto.id, task_id: x.task?.id ?? null, nota: v.nota })
        return esito.ok ? { fatto: true, link: '/tempo' } : errore(esito.errore)
      }
      if (v.azione === 'ferma') {
        const esito = await fermaTimer({ nota: v.nota })
        return esito.ok ? { fatto: true, minuti: esito.minuti, link: '/tempo' } : errore(esito.errore)
      }
      if (v.azione === 'registra') {
        const x = await dove(v.progetto, v.task)
        if (isErrore(x)) return x
        const esito = await registraTempo({
          progetto_id: x.progetto.id,
          task_id: x.task?.id ?? null,
          data: v.data ?? oggiRoma(),
          durata: v.durata ?? '',
          nota: v.nota,
        })
        return esito.ok ? { fatto: true, link: '/tempo' } : errore(esito.errore)
      }
      const x = await voce(v)
      if (isErrore(x)) return x
      if (v.azione === 'elimina') {
        const esito = await eliminaTempo({ id: x.id })
        return esito.ok ? { fatto: true, link: '/tempo' } : errore(esito.errore)
      }
      const t = await nuovoTask(v, x.progetto_id, x.task_id)
      if (isErrore(t)) return t
      const esito = await modificaTempo({
        id: x.id,
        progetto_id: x.progetto_id,
        task_id: t.id,
        data: v.data ?? x.data,
        durata: v.durata ?? x.minuti ?? 0,
        nota: v.nota ?? x.nota,
      })
      return esito.ok ? { fatto: true, link: '/tempo' } : errore(esito.errore)
    },
  })
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------
function progettoDettaglio(ctx: Contesto): Definizione {
  const { supabase, profilo, r } = ctx
  return definizione({
    description: 'Un progetto nel dettaglio: liste, task aperti (con task_id) con assegnatari e scadenze, membri, ultime note (con nota_id).',
    inputSchema: z.object({ progetto: z.string().describe('Nome del progetto') }),
    execute: async ({ progetto: nome }) => {
      const p = await r.trovaProgetto(nome)
      if (isErrore(p)) return p
      const [liste, task, membri, note] = await Promise.all([
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
      ])
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
      }
    },
  })
}

function mioTempo(ctx: Contesto): Definizione {
  const { supabase, profilo, r } = ctx
  return definizione({
    description: 'Il tuo tempo registrato nel periodo (voce_id per modificarlo) e il timer acceso, se c’è. Solo il tuo.',
    inputSchema: z.object({ da: data.optional().describe('Default: primo del mese'), a: data.optional().describe('Default: oggi') }),
    execute: async ({ da, a }) => {
      const oggi = oggiRoma()
      const inizio = da && isDataISO(da) ? da : primoDelMeseISO(oggi)
      const fine = a && isDataISO(a) ? a : oggi
      const [voci, acceso] = await Promise.all([
        supabase
          .from('pm_tempo')
          .select('id, data, minuti, nota, inizio, fine, progetto:pm_progetti(nome), task:pm_task(titolo)')
          // mine only, even when RLS lets a manager or the admin see more
          .eq('profile_id', profilo.id)
          .gte('data', inizio)
          .lte('data', fine)
          .order('data', { ascending: false })
          .limit(40),
        r.timerAcceso(),
      ])
      if (voci.error) return errore('Tempo non disponibile.')
      return {
        periodo: { da: inizio, a: fine },
        timer_acceso: acceso
          ? { progetto: acceso.progetto?.nome ?? null, task: acceso.task?.titolo ?? null, dalle: acceso.inizio ? formatOra(acceso.inizio) : null }
          : null,
        // the running timer is not an entry yet: it is timer_acceso
        voci: (voci.data ?? []).filter((v) => !(v.inizio && !v.fine)).map((v) => ({
          voce_id: v.id,
          data: v.data,
          progetto: v.progetto?.nome ?? null,
          task: v.task?.titolo ?? null,
          minuti: v.minuti,
          nota: v.nota,
        })),
      }
    },
  })
}

export function strumentiProgetti(ctx: Contesto) {
  return {
    progetto_dettaglio: progettoDettaglio(ctx),
    mio_tempo: mioTempo(ctx),
    progetto: progetto(ctx),
    lista: lista(ctx),
    task: task(ctx),
    nota_progetto: notaProgetto(ctx),
    tempo: tempo(ctx),
  }
}
