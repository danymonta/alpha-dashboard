import { z } from 'zod'

import { isDataISO } from '@/lib/date'
import { Constants } from '@/lib/supabase/database.types'
import { FONTI, PERFORMANCE, TIPI_CALL } from '@/lib/validation/call'
import { STATI_LEAD } from '@/lib/validation/lead'

/**
 * The inputs of the MCP tools on calls, leads and outcomes (Claude a 360
 * gradi, phase 2, 23/10/2026), zod 3 like the rest of the app. They describe
 * the shapes; the rules stay in lib/validation/call.ts, esito.ts, lead.ts and
 * registrazione.ts, which the shared core (lib/call/operazioni.ts) applies
 * again on every write, so the error messages are the app's. Every object is
 * strict; an optional property accepts null, which means "not said" (on a
 * change: leave it as it is). Ids come from the reads: elenco_call, leggi_call,
 * elenco_lead, persone_del_team, prodotti.
 */

const id = (cosa: string, da: string) => z.string().uuid(`Id ${cosa} non valido: usa quello letto con ${da}.`)

const ID_CALL = id('della call', 'elenco_call o leggi_call')
const ID_LEAD = id('del lead', 'elenco_lead o leggi_call')
const ID_PERSONA = id('della persona', 'persone_del_team')
const ID_PRODOTTO = id('del prodotto', 'prodotti')

const data = z.string().refine(isDataISO, 'Data non valida: scrivila come AAAA-MM-GG (giorno di Roma).')
const ora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Ora non valida: scrivila come HH:MM (ora di Roma), per esempio 18:00.')
const testo = (max: number) => z.string().max(max, `Al massimo ${max} caratteri.`)

export const STATI_CALL = Constants.public.Enums.call_status
/** What the outcome sheet offers: «programmata» undoes a wrong outcome, «riprogrammata» is «In attesa di conferma». */
export const ESITI_MCP = ['chiusa', 'follow_up', 'persa', 'no_show', 'cancellata', 'riprogrammata', 'programmata'] as const

const STATO_CALL = z.enum(STATI_CALL, {
  errorMap: () => ({ message: `Stato della call: uno tra ${STATI_CALL.join(', ')}.` }),
})
const STATO_LEAD = z.enum(STATI_LEAD, { errorMap: () => ({ message: `Stato del lead: uno tra ${STATI_LEAD.join(', ')}.` }) })
const FONTE = z.enum(FONTI, { errorMap: () => ({ message: `Fonte: una tra ${FONTI.join(', ')}.` }) })

// ── reads ────────────────────────────────────────────────────────────────────
export const elencoCallSchema = z
  .object({
    da: data.nullish().describe('Dal giorno della call (compreso), AAAA-MM-GG. Senza da, a, lead_id e da_registrare: da 7 giorni fa.'),
    a: data.nullish().describe('Al giorno della call (compreso), AAAA-MM-GG. Senza: 30 giorni da oggi.'),
    stato: STATO_CALL.nullish().describe(
      'Solo le call in questo stato: programmata (Da fare), svolta, no_show, cancellata, riprogrammata (In attesa di conferma).',
    ),
    da_registrare: z.boolean().nullish().describe('Solo le call passate ancora senza esito (da fare con la data già passata), di qualunque giorno.'),
    closer_id: ID_PERSONA.nullish().describe('Solo le call di questo closer (id da persone_del_team).'),
    setter_id: ID_PERSONA.nullish().describe('Solo le call di questo setter.'),
    lead_id: ID_LEAD.nullish().describe('Solo le call di questo lead, di qualunque giorno.'),
    cerca: testo(80).nullish().describe('Un pezzo del nome o dell’handle Instagram del lead.'),
    recenti: z.boolean().nullish().describe('Dalla più recente; senza: in ordine di giorno, dalla prima.'),
    limite: z.number().int().min(1).max(100).nullish().describe('Quante al massimo (50 se non dici altro, al massimo 100).'),
  })
  .strict()

export const leggiCallSchema = z.object({ call_id: ID_CALL }).strict()

export const elencoLeadSchema = z
  .object({
    stato: STATO_LEAD.nullish().describe('Solo i lead in questo stato: call_fissata (Call da fare), follow_up, cliente, perso.'),
    fonte: FONTE.nullish(),
    setter_id: ID_PERSONA.nullish().describe('Solo i lead di questo setter.'),
    cerca: testo(80).nullish().describe('Un pezzo del nome o dell’handle Instagram.'),
    limite: z.number().int().min(1).max(100).nullish().describe('Quanti al massimo (50 se non dici altro, al massimo 100).'),
  })
  .strict()

export const senzaInputSchema = z.object({}).strict()

// ── writes ───────────────────────────────────────────────────────────────────
export const fissaCallSchema = z
  .object({
    nome: testo(120).describe('Il nome del lead, da 2 a 120 caratteri.'),
    instagram_handle: testo(40).nullish().describe('L’handle Instagram del lead, con o senza @: con lo stesso handle si riusa il lead.'),
    fonte: FONTE.describe('Da dove arriva il lead: dm_inbound, dm_outbound, referral, organico, ads, altro. Chiedila se non è detta.'),
    data: data.describe('Il giorno della call, AAAA-MM-GG (giorno di Roma).'),
    ora: ora.describe('L’ora della call, HH:MM (ora di Roma).'),
    closer_id: ID_PERSONA.nullish().describe(
      'Chi fa la call: un admin o un closer attivo (id da persone_del_team). Senza: come nell’app, l’admin per sé, il setter il primo admin (Dany).',
    ),
    setter_id: ID_PERSONA.nullish().describe('Solo l’admin: il setter attivo per cui fissa la call. Senza: sé stesso.'),
  })
  .strict()

export const registraEsitoSchema = z
  .object({
    call_id: ID_CALL,
    esito: z.enum(ESITI_MCP, { errorMap: () => ({ message: `Esito: uno tra ${ESITI_MCP.join(', ')}.` }) }),
    qualificata: z.boolean().nullish().describe('Con follow_up o persa: se il lead era qualificato (obbligatorio).'),
    motivo: testo(500).nullish().describe('Con follow_up o persa: il motivo di non chiusura (obbligatorio, al massimo 500 caratteri, mai importi).'),
    note_closer: testo(2000)
      .nullish()
      .describe('Le note aggiuntive del closer, con follow_up, persa o riprogrammata; "" le toglie. Senza restano quelle salvate.'),
    follow_up_data: data.nullish().describe('Con follow_up: il giorno della call di follow-up già fissata, AAAA-MM-GG. Senza: follow-up in chat.'),
    follow_up_ora: ora.nullish().describe('Con follow_up: l’ora della call di follow-up, HH:MM (insieme a follow_up_data).'),
    data: data.nullish().describe('Con riprogrammata: il nuovo giorno, se il lead l’ha già confermato (la call si sposta lì). Senza: In attesa di conferma.'),
    ora: ora.nullish().describe('Con riprogrammata: la nuova ora, HH:MM (insieme a data).'),
    link_fathom: testo(500)
      .nullish()
      .describe('Con chiusa, follow_up o persa: il link della registrazione di Fathom (https://fathom.video/…).'),
    non_registrata: z.boolean().nullish().describe('Con chiusa, follow_up o persa: true se la call non è stata registrata, al posto del link.'),
  })
  .strict()

export const spostaCallSchema = z
  .object({
    call_id: ID_CALL,
    data: data.describe('Il nuovo giorno, AAAA-MM-GG (giorno di Roma): da oggi in avanti (l’admin anche nel passato).'),
    ora: ora.describe('La nuova ora, HH:MM (ora di Roma).'),
  })
  .strict()

export const fissaFollowUpSchema = z
  .object({
    call_id: ID_CALL.describe('La call svolta finita in follow-up (id da elenco_call o leggi_call).'),
    data: data.describe('Il giorno della call di follow-up, AAAA-MM-GG: da oggi in avanti (l’admin anche nel passato), dopo la call di partenza.'),
    ora: ora.describe('L’ora della call di follow-up, HH:MM.'),
  })
  .strict()

export const modificaCallSchema = z
  .object({
    call_id: ID_CALL,
    data: data.nullish().describe('Il giorno corretto, AAAA-MM-GG: una correzione senza traccia (per spostare la call usa sposta_call).'),
    ora: ora.nullish().describe('L’ora corretta, HH:MM.'),
    tipo: z.enum(TIPI_CALL).nullish().describe('Il tipo della call (discovery, strategy): solo closer e admin.'),
    closer_id: ID_PERSONA.nullish().describe('Il closer a cui passa la call (un admin o un closer attivo): il setter e l’admin.'),
    note: testo(2000).nullish().describe('Le note del setter: il setter e l’admin; "" le toglie.'),
  })
  .strict()

export const dettagliCallSchema = z
  .object({
    call_id: ID_CALL,
    link_registrazione: testo(500).nullish().describe('Il link della registrazione di Fathom; "" lo toglie.'),
    performance: z
      .enum([...PERFORMANCE, ''] as [string, ...string[]])
      .nullish()
      .describe(`Come è andata: ${PERFORMANCE.join(', ')}; "" la toglie.`),
    prodotto_proposto_id: ID_PRODOTTO.or(z.literal('')).nullish().describe('Il prodotto proposto (id da prodotti); "" lo toglie.'),
    importo_proposto: z
      .union([z.number().nonnegative().max(100_000), z.literal('')])
      .nullish()
      .describe('L’importo proposto in euro; "" lo toglie.'),
    note_closer: testo(2000).nullish().describe('Le note aggiuntive del closer; "" le toglie.'),
  })
  .strict()

export const statoLeadSchema = z
  .object({
    lead_id: ID_LEAD,
    stato: STATO_LEAD.describe('call_fissata (Call da fare), follow_up, cliente o perso.'),
  })
  .strict()

export type ElencoCallInput = z.output<typeof elencoCallSchema>
export type LeggiCallInput = z.output<typeof leggiCallSchema>
export type ElencoLeadInput = z.output<typeof elencoLeadSchema>
export type FissaCallInput = z.output<typeof fissaCallSchema>
export type RegistraEsitoInput = z.output<typeof registraEsitoSchema>
export type SpostaCallInput = z.output<typeof spostaCallSchema>
export type FissaFollowUpInput = z.output<typeof fissaFollowUpSchema>
export type ModificaCallInput = z.output<typeof modificaCallSchema>
export type DettagliCallInput = z.output<typeof dettagliCallSchema>
export type StatoLeadInput = z.output<typeof statoLeadSchema>
