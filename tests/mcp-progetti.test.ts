import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import type { ContestoMcp, RuoloMcp } from '@/lib/mcp/contesto'
import * as progetti from '@/lib/mcp/progetti'
import { schemaMcp } from '@/lib/mcp/schema'
import { STRUMENTI } from '@/lib/mcp/strumenti'

import { argomenti, ha, supabaseFinto, type Chiamata, type RispostaFinta } from './helpers/supabase-finto-mcp'

/**
 * The MCP tools on projects, tasks, notes and time (Claude a 360 gradi, phase
 * 1, 22/10/2026) against a fake client: what reaches the database, as whom,
 * and what never does (another person's time, a client link, a deletion).
 */

const IO = '44444444-4444-4444-8444-444444444444'
const PROGETTO = '0b77b059-ae57-4cc3-a97d-953b79ed3215'
const TASK = '9f000000-0000-4000-8000-000000000001'
const VOCE = '7a000000-0000-4000-8000-000000000001'

let rispondi: (c: Chiamata) => RispostaFinta
let fake: ReturnType<typeof supabaseFinto>

beforeEach(() => {
  rispondi = () => ({ data: [] })
  fake = supabaseFinto((c) => rispondi(c))
})

function contesto(ruolo: RuoloMcp = 'coach', livello: ContestoMcp['livello'] = 'manager'): ContestoMcp {
  return { db: fake.client as never, ruolo, livello, persona: IO, sessione: 's' }
}

function rpc(nome: string) {
  const c = fake.chiamate.find((x) => x.tipo === 'rpc' && x.nome === nome)
  return c ? (argomenti(c, 'args')?.[0] as Record<string, unknown>) : undefined
}

describe('le scritture passano dal nucleo dell’app', () => {
  it('crea_progetto: mai un cliente, e un employee riceve la frase dell’app', async () => {
    rispondi = (c) => (c.nome === 'pm_crea_progetto' ? { data: PROGETTO } : { data: [] })
    const esito = await progetti.creaProgetto(
      { reparto_id: '11111111-1111-4111-8111-111111111111', nome: 'Lancio corso', membri: [] },
      contesto(),
    )
    expect(esito).toEqual({ ok: true, dati: { esito: 'creato', progetto_id: PROGETTO }, esito: undefined })
    expect(rpc('pm_crea_progetto')).toMatchObject({ p_nome: 'Lancio corso' })
    expect(rpc('pm_crea_progetto')?.p_client_id).toBeUndefined()

    fake.chiamate.length = 0
    const employee = await progetti.creaProgetto(
      { reparto_id: '11111111-1111-4111-8111-111111111111', nome: 'Altro progetto' },
      contesto('editor', 'employee'),
    )
    expect(employee).toEqual({ ok: false, messaggio: 'Operazione riservata a chi gestisce i progetti.', esito: undefined })
    expect(fake.chiamate).toHaveLength(0)
  })

  it('crea_task: il task con created_by della persona, poi i dettagli con lo schema di «Modifica»', async () => {
    const salvato = {
      id: TASK,
      progetto_id: PROGETTO,
      titolo: 'Montare il reel',
      descrizione: null,
      stato: 'da_fare',
      priorita: 'media',
      data_inizio: null,
      scadenza: null,
      stima_minuti: null,
      tasklist_id: null,
      parent_id: null,
      assegnatari: [],
    }
    rispondi = (c) => {
      if (c.nome === 'pm_task' && ha(c, 'insert')) return { data: { id: TASK } }
      if (c.nome === 'pm_task' && ha(c, 'update')) return { data: [{ progetto_id: PROGETTO }] }
      if (c.nome === 'v_pm_task') return { data: salvato }
      if (c.nome === 'pm_membri') return { data: [{ profile_id: IO }] }
      return { data: [] }
    }
    const esito = await progetti.creaTask(
      { progetto_id: PROGETTO, titolo: 'Montare il reel', scadenza: '2026-10-30', priorita: 'alta' },
      contesto(),
    )
    expect(esito.ok).toBe(true)
    const insert = fake.chiamate.find((c) => c.nome === 'pm_task' && ha(c, 'insert'))
    expect(insert && argomenti(insert, 'insert')?.[0]).toMatchObject({ titolo: 'Montare il reel', created_by: IO })
    const update = fake.chiamate.find((c) => c.nome === 'pm_task' && ha(c, 'update'))
    expect(update && argomenti(update, 'update')?.[0]).toMatchObject({ scadenza: '2026-10-30', priorita: 'alta', titolo: 'Montare il reel' })
  })

  it('modifica_task: solo i campi detti cambiano, il resto resta com’è', async () => {
    rispondi = (c) => {
      if (c.nome === 'v_pm_task')
        return {
          data: {
            id: TASK,
            progetto_id: PROGETTO,
            titolo: 'Vecchio',
            descrizione: 'Testo',
            stato: 'in_corso',
            priorita: 'bassa',
            data_inizio: '2026-10-01',
            scadenza: '2026-10-20',
            stima_minuti: 90,
            tasklist_id: null,
            parent_id: null,
            assegnatari: [IO],
          },
        }
      if (c.nome === 'pm_task' && ha(c, 'select', 'progetto_id') && !ha(c, 'update')) return { data: { progetto_id: PROGETTO } }
      if (c.nome === 'pm_task' && ha(c, 'update')) return { data: [{ progetto_id: PROGETTO }] }
      if (c.nome === 'pm_membri') return { data: [{ profile_id: IO }] }
      return { data: [] }
    }
    const esito = await progetti.modificaTask({ task_id: TASK, titolo: 'Nuovo' }, contesto())
    expect(esito.ok).toBe(true)
    const update = fake.chiamate.find((c) => c.nome === 'pm_task' && ha(c, 'update'))
    expect(update && argomenti(update, 'update')?.[0]).toEqual({
      titolo: 'Nuovo',
      descrizione: 'Testo',
      stato: 'in_corso',
      priorita: 'bassa',
      data_inizio: '2026-10-01',
      scadenza: '2026-10-20',
      stima_minuti: 90,
      tasklist_id: null,
      parent_id: null,
    })
    expect(rpc('pm_imposta_assegnatari')).toEqual({ p_task: TASK, p_persone: [IO] })
  })
})

describe('il tempo è sempre solo il proprio', () => {
  it('modifica_tempo cerca la voce tra le sue, e una voce di un altro non la trova', async () => {
    rispondi = () => ({ data: null })
    const esito = await progetti.modificaTempo({ voce_id: VOCE, durata: 30 }, contesto('admin', 'admin'))
    expect(esito).toMatchObject({ ok: false, esito: 'non_trovato' })
    const lettura = fake.chiamate.find((c) => c.nome === 'pm_tempo')
    expect(lettura && ha(lettura, 'eq', 'profile_id', IO)).toBe(true)
    expect(fake.chiamate.some((c) => c.nome === 'pm_modifica_tempo')).toBe(false)
  })

  it('modifica_tempo: una durata detta toglie la fascia, il resto resta', async () => {
    rispondi = (c) => {
      if (c.nome === 'pm_tempo')
        return {
          data: {
            id: VOCE,
            progetto_id: PROGETTO,
            task_id: TASK,
            data: '2026-10-20',
            minuti: 60,
            inizio: null,
            fine: null,
            nota: 'Call di check',
          },
        }
      if (c.nome === 'pm_modifica_tempo') return { data: VOCE }
      return { data: [] }
    }
    const esito = await progetti.modificaTempo({ voce_id: VOCE, durata: '45 min' }, contesto())
    expect(esito.ok).toBe(true)
    expect(rpc('pm_modifica_tempo')).toMatchObject({
      p_id: VOCE,
      p_progetto_id: PROGETTO,
      p_task_id: TASK,
      p_data: '2026-10-20',
      p_minuti: 45,
      p_nota: 'Call di check',
    })
  })

  it('mio_tempo legge solo le sue voci', async () => {
    rispondi = (c) => (c.nome === 'pm_riepilogo_tempo' ? { data: [{ livello: 'totale', minuti: 90, voci: 2 }] } : { data: [] })
    const esito = await progetti.mioTempo({ ultimi_giorni: 7 }, contesto('setter', 'employee'))
    expect(esito.ok && esito.dati.totale).toEqual({ minuti: 90, durata: '1 h 30 min', voci: 2 })
    const voci = fake.chiamate.find((c) => c.nome === 'pm_tempo')
    expect(voci && ha(voci, 'eq', 'profile_id', IO)).toBe(true)
  })

  it('tempo_team: un rifiuto del database diventa la frase, mai «nessuno ha registrato»', async () => {
    rispondi = (c) => (c.nome === 'pm_tempo_per_persona' ? { error: { code: '42501', message: 'x' } } : { data: [] })
    expect(await progetti.tempoTeam({}, contesto())).toMatchObject({ ok: false, messaggio: 'Il tempo del team lo legge solo l’admin.' })
  })
})

describe('gli schemi degli strumenti dei progetti', () => {
  it('rifiutano un id che non è un uuid e una chiave sconosciuta, in italiano', () => {
    const registra = STRUMENTI.find((s) => s.nome === 'registra_tempo')!
    const valida = (input: unknown) =>
      schemaMcp(registra.input)['~standard'].validate(input) as { issues?: { message: string }[] }
    expect(valida({ progetto_id: 'Rossi', durata: 30 }).issues?.[0]?.message).toContain('elenco_progetti')
    expect(valida({ progetto_id: PROGETTO, durata: 30, profile_id: IO }).issues?.length).toBeGreaterThan(0)
    expect(valida({ progetto_id: PROGETTO, durata: 30 }).issues).toBeUndefined()
  })

  it('nessuno strumento dei progetti prende il tempo o il task di un’altra persona per id', () => {
    for (const s of STRUMENTI) {
      const json = JSON.stringify(schemaMcp(s.input)['~standard'].jsonSchema.input({ target: 'draft-2020-12' }))
      if (['registra_tempo', 'modifica_tempo', 'avvia_timer', 'ferma_timer', 'mio_tempo'].includes(s.nome)) {
        expect(json, s.nome).not.toMatch(/persona_id|profile_id/)
      }
    }
  })
})
