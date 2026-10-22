import { z } from 'zod'

import { isDataISO } from '@/lib/date'
import { PRIORITA, STATI_PROGETTO, STATI_TASK } from '@/lib/validation/progetti'

/**
 * The inputs of the MCP tools on projects, lists, tasks, notes and time
 * (Claude a 360 gradi, phase 1, 22/10/2026), zod 3 like the rest of the app.
 * They describe the shapes; the rules stay in lib/validation/progetti.ts,
 * note.ts and tempo.ts, which the shared core (lib/progetti/operazioni.ts)
 * applies again on every write, so the error messages are the app's. Every
 * object is strict; an optional property accepts null, which means "not said"
 * (on a change: leave it as it is). Ids come from the reads: elenco_progetti,
 * leggi_progetto, miei_task, mio_tempo, persone_del_team, reparti_e_modelli.
 */

const id = (cosa: string, da: string) => z.string().uuid(`Id ${cosa} non valido: usa quello letto con ${da}.`)

const ID_PROGETTO = id('del progetto', 'elenco_progetti o leggi_progetto')
const ID_TASK = id('del task', 'leggi_progetto o miei_task')
const ID_LISTA = id('della lista', 'leggi_progetto')
const ID_PERSONA = id('della persona', 'persone_del_team o leggi_progetto')
const ID_VOCE = id('della voce di tempo', 'mio_tempo')

const data = z.string().refine(isDataISO, 'Data non valida: scrivila come AAAA-MM-GG (giorno di Roma).')

const testo = (max: number) => z.string().max(max, `Al massimo ${max} caratteri.`)

const STATO_PROGETTO = z.enum(STATI_PROGETTO, {
  errorMap: () => ({ message: `Stato del progetto: uno tra ${STATI_PROGETTO.join(', ')}.` }),
})
const STATO_TASK = z.enum(STATI_TASK, { errorMap: () => ({ message: `Stato del task: uno tra ${STATI_TASK.join(', ')}.` }) })
const PRIORITA_TASK = z.enum(PRIORITA, { errorMap: () => ({ message: `Priorità: una tra ${PRIORITA.join(', ')}.` }) })

const persone = z.array(ID_PERSONA).max(50, 'Al massimo 50 persone.')

/** "ultimi 7 giorni", or da–a; by default the month so far. */
const periodo = {
  ultimi_giorni: z
    .number()
    .int()
    .min(1)
    .max(366)
    .nullish()
    .describe('Gli ultimi N giorni, oggi compreso: «ultimi 7 giorni» = 7. Al posto di da e a.'),
  da: data.nullish().describe('Dal giorno (compreso), AAAA-MM-GG. Senza: il primo del mese.'),
  a: data.nullish().describe('Al giorno (compreso), AAAA-MM-GG. Senza: oggi.'),
}

// ── reads ────────────────────────────────────────────────────────────────────
export const elencoProgettiSchema = z
  .object({
    cerca: testo(80).nullish().describe('Un pezzo del nome del progetto (quello di un cliente porta il suo nome).'),
    stato: STATO_PROGETTO.nullish().describe('Solo i progetti in questo stato.'),
    limite: z.number().int().min(1).max(100).nullish().describe('Quanti al massimo (50 se non dici altro, al massimo 100).'),
  })
  .strict()

export const leggiProgettoSchema = z
  .object({
    progetto_id: ID_PROGETTO,
    completati: z.boolean().nullish().describe('Anche i task completati (gli ultimi 50).'),
  })
  .strict()

export const senzaInputSchema = z.object({}).strict()

export const mieiTaskSchema = z
  .object({
    completati: z.boolean().nullish().describe('Anche i task completati di recente (gli ultimi 30).'),
  })
  .strict()

export const mioTempoSchema = z
  .object({
    ...periodo,
    progetto_id: ID_PROGETTO.nullish().describe('Solo il tempo su questo progetto.'),
    task_id: ID_TASK.nullish().describe('Solo il tempo su questo task.'),
  })
  .strict()

export const tempoTeamSchema = z
  .object({
    ...periodo,
    persona_id: ID_PERSONA.nullish().describe('Solo questa persona; senza: tutto il team.'),
    progetto_id: ID_PROGETTO.nullish().describe('Solo questo progetto.'),
  })
  .strict()

// ── projects, members, lists ─────────────────────────────────────────────────
export const creaProgettoSchema = z
  .object({
    reparto_id: id('del reparto', 'reparti_e_modelli'),
    nome: testo(120).describe('Il nome del progetto, da 2 a 120 caratteri.'),
    descrizione: testo(2000).nullish(),
    modello_id: id('del modello', 'reparti_e_modelli').nullish().describe('Un modello del reparto: crea liste e task datati dall’inizio.'),
    data_inizio: data.nullish().describe('AAAA-MM-GG; senza: oggi.'),
    data_fine: data.nullish().describe('AAAA-MM-GG.'),
    membri: persone.nullish().describe('Le persone del progetto oltre a te (id da persone_del_team).'),
  })
  .strict()

export const modificaProgettoSchema = z
  .object({
    progetto_id: ID_PROGETTO,
    nome: testo(120).nullish(),
    descrizione: testo(2000).nullish().describe('"" la toglie.'),
    stato: STATO_PROGETTO.nullish(),
    reparto_id: id('del reparto', 'reparti_e_modelli').nullish(),
    data_inizio: data.or(z.literal('')).nullish().describe('AAAA-MM-GG; "" la toglie.'),
    data_fine: data.or(z.literal('')).nullish().describe('AAAA-MM-GG; "" la toglie.'),
    responsabile_id: ID_PERSONA.or(z.literal('')).nullish().describe('Un membro del progetto; "" nessuno.'),
  })
  .strict()

export const membroProgettoSchema = z
  .object({
    progetto_id: ID_PROGETTO,
    persona_id: ID_PERSONA,
  })
  .strict()

export const creaListaSchema = z
  .object({
    progetto_id: ID_PROGETTO,
    nome: testo(120),
    descrizione: testo(1000).nullish(),
    data_inizio: data.nullish(),
    data_fine: data.nullish(),
  })
  .strict()

export const modificaListaSchema = z
  .object({
    lista_id: ID_LISTA,
    nome: testo(120).nullish(),
    descrizione: testo(1000).nullish().describe('"" la toglie.'),
    data_inizio: data.or(z.literal('')).nullish().describe('AAAA-MM-GG; "" la toglie.'),
    data_fine: data.or(z.literal('')).nullish().describe('AAAA-MM-GG; "" la toglie.'),
  })
  .strict()

// ── tasks and notes ─────────────────────────────────────────────────────────
const campiTask = {
  descrizione: testo(5000).nullish().describe('"" la toglie.'),
  priorita: PRIORITA_TASK.nullish(),
  data_inizio: data.or(z.literal('')).nullish().describe('AAAA-MM-GG; "" la toglie.'),
  scadenza: data.or(z.literal('')).nullish().describe('AAAA-MM-GG; "" la toglie.'),
  stima: z.string().max(40).nullish().describe('La stima, come 45 min, 2 h o 1 h 30 min; "" la toglie.'),
}

export const creaTaskSchema = z
  .object({
    progetto_id: ID_PROGETTO,
    titolo: testo(200),
    lista_id: ID_LISTA.nullish().describe('La lista (tappa) in cui metterlo; senza: fuori dalle liste.'),
    sotto_task_di: ID_TASK.nullish().describe('Il task di cui è un sotto-task (un livello solo).'),
    assegnatari: persone.nullish().describe('Chi lo fa: membri del progetto (id da leggi_progetto).'),
    ...campiTask,
  })
  .strict()

export const modificaTaskSchema = z
  .object({
    task_id: ID_TASK,
    titolo: testo(200).nullish(),
    stato: STATO_TASK.nullish(),
    assegnatari: persone.nullish().describe('L’elenco intero: chi non c’è non è più assegnato. [] nessuno.'),
    lista_id: ID_LISTA.or(z.literal('')).nullish().describe('"" lo toglie dalle liste.'),
    sotto_task_di: ID_TASK.or(z.literal('')).nullish().describe('"" non è più un sotto-task.'),
    ...campiTask,
  })
  .strict()

export const completaTaskSchema = z
  .object({
    task_id: ID_TASK,
    completato: z.boolean().nullish().describe('false lo riapre; senza: lo completa.'),
  })
  .strict()

export const aggiungiNotaSchema = z
  .object({
    progetto_id: ID_PROGETTO,
    testo: testo(5000).describe('Il testo della nota, al massimo 5000 caratteri.'),
    data: data.nullish().describe('Il giorno della nota, AAAA-MM-GG; senza: oggi.'),
  })
  .strict()

// ── time ────────────────────────────────────────────────────────────────────
const campiTempo = {
  task_id: ID_TASK.nullish().describe('Il task del progetto (facoltativo).'),
  data: data.nullish().describe('Il giorno, oggi o un giorno passato, AAAA-MM-GG; senza: oggi.'),
  durata: z
    .union([z.string().max(40), z.number().int()])
    .nullish()
    .describe('La durata: minuti (90) o come la dice la persona (1:30, 1h30, «un’ora e mezza»). Al posto di dalle e alle.'),
  dalle: z.string().max(10).nullish().describe('Inizio della fascia, HH:mm, insieme ad alle.'),
  alle: z.string().max(10).nullish().describe('Fine della fascia, HH:mm, nello stesso giorno.'),
  nota: testo(2000).nullish(),
}

export const registraTempoSchema = z
  .object({
    progetto_id: ID_PROGETTO,
    ...campiTempo,
  })
  .strict()

export const modificaTempoSchema = z
  .object({
    voce_id: ID_VOCE,
    progetto_id: ID_PROGETTO.nullish().describe('Per spostarla su un altro progetto.'),
    ...campiTempo,
    task_id: ID_TASK.or(z.literal('')).nullish().describe('Il task; "" nessun task.'),
    nota: testo(2000).nullish().describe('"" la toglie.'),
  })
  .strict()

export const avviaTimerSchema = z
  .object({
    progetto_id: ID_PROGETTO,
    task_id: ID_TASK.nullish(),
    nota: testo(2000).nullish(),
  })
  .strict()

export const fermaTimerSchema = z
  .object({
    nota: testo(2000).nullish().describe('Cosa hai fatto, se vuoi.'),
  })
  .strict()

export type ElencoProgettiInput = z.output<typeof elencoProgettiSchema>
export type LeggiProgettoInput = z.output<typeof leggiProgettoSchema>
export type MieiTaskInput = z.output<typeof mieiTaskSchema>
export type MioTempoInput = z.output<typeof mioTempoSchema>
export type TempoTeamInput = z.output<typeof tempoTeamSchema>
export type CreaProgettoInput = z.output<typeof creaProgettoSchema>
export type ModificaProgettoInput = z.output<typeof modificaProgettoSchema>
export type MembroProgettoInput = z.output<typeof membroProgettoSchema>
export type CreaListaInput = z.output<typeof creaListaSchema>
export type ModificaListaInput = z.output<typeof modificaListaSchema>
export type CreaTaskInput = z.output<typeof creaTaskSchema>
export type ModificaTaskInput = z.output<typeof modificaTaskSchema>
export type CompletaTaskInput = z.output<typeof completaTaskSchema>
export type AggiungiNotaInput = z.output<typeof aggiungiNotaSchema>
export type RegistraTempoInput = z.output<typeof registraTempoSchema>
export type ModificaTempoInput = z.output<typeof modificaTempoSchema>
export type AvviaTimerInput = z.output<typeof avviaTimerSchema>
export type FermaTimerInput = z.output<typeof fermaTimerSchema>
