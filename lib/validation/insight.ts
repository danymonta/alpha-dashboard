import { z } from 'zod'

import { isDataISO } from '@/lib/date'

/**
 * The forms and actions of the Insight (1.35.0): the same schemas in the
 * browser and in the server actions (CLAUDE.md section 4). The rules are the
 * database's checks (20261014090000_insight_dati.sql and
 * 20261014090100_insight_funzioni.sql), so a value that passes here is never
 * refused there for its shape.
 */

export const CANALI_INSIGHT = ['instagram', 'messenger'] as const

const canale = z.enum(CANALI_INSIGHT, { errorMap: () => ({ message: 'Canale non valido.' }) })

// ---------- Fatto (the page) ----------

/** insight_fatto.chiave: a username, a PSID or a conversation id (chiaveLead). */
export const CHIAVE_FATTO_MAX = 200

/** segnaFatto: one switch of one recap (giorno, canale), shared by the admin and the setters. */
export const segnaFattoSchema = z.object({
  fonte: canale,
  giorno: z
    .string({ required_error: 'Giorno non valido.', invalid_type_error: 'Giorno non valido.' })
    .refine(isDataISO, 'Giorno non valido.'),
  chiave: z
    .string({ required_error: 'Chat non valida.', invalid_type_error: 'Chat non valida.' })
    .min(1, 'Chat non valida.')
    .max(CHIAVE_FATTO_MAX, 'Chat non valida.'),
  fatto: z.boolean({ required_error: 'Valore non valido.', invalid_type_error: 'Valore non valido.' }),
})
export type SegnaFattoInput = z.input<typeof segnaFattoSchema>

// ---------- Automazione (admin) ----------

/** «Pronto alle» moves in steps of 5 minutes (the artifact's step="300", the check on insight_impostazioni.ora). */
export const PASSO_MINUTI_AUTOMAZIONE = 5
const RE_ORA = /^([01]\d|2[0-3]):([0-5]\d)(?::00)?$/

const oraAutomazione = z
  .string({ required_error: 'Scegli l’orario del recap.', invalid_type_error: 'Scegli l’orario del recap.' })
  .trim()
  .min(1, 'Scegli l’orario del recap.')
  .regex(RE_ORA, 'Orario non valido.')
  .transform((v) => v.slice(0, 5))
  .refine(
    (v) => Number(v.slice(3, 5)) % PASSO_MINUTI_AUTOMAZIONE === 0,
    'Scegli un orario a passi di 5 minuti, per esempio 19:00 o 19:05.',
  )

/** The form «Automazione»: on or off, and when the recap is ready ('HH:MM', Rome). */
export const automazioneSchema = z.object({
  attiva: z.boolean({ invalid_type_error: 'Valore non valido.' }),
  ora: oraAutomazione,
})
export type AutomazioneInput = z.input<typeof automazioneSchema>
export type Automazione = z.output<typeof automazioneSchema>

/** The words of the actions when the step URL cannot be built (UrlPassoNonValido, D18). */
export const URL_PASSO_MANCANTE = 'Indirizzo dell’app non configurato: imposta APP_URL su Vercel e rifai il deploy.'

/**
 * What the automation action builds: p_url comes from urlPasso() on the server,
 * never from the form, and is required to turn the automation on. Only
 * p_attivo and p_ora go to public.insight_imposta_automazione; p_url is written
 * apart, with the service role (insight_imposta_url, lib/insight/url-passo.ts).
 */
export const argomentiAutomazioneSchema = z
  .object({
    p_attivo: z.boolean(),
    p_ora: oraAutomazione,
    p_url: z.string().min(1).nullable(),
  })
  .refine((a) => !a.p_attivo || a.p_url !== null, { message: URL_PASSO_MANCANTE, path: ['p_url'] })

// ---------- Messenger (Impostazioni › Instagram e Messenger, admin) ----------

/** The same rule as public.messenger_imposta_token. */
export const RE_TOKEN_PAGINA = /^[A-Za-z0-9_.|-]{20,2048}$/
/** A pasted text is longer than the token (a whole URL, `FB_PAGE_TOKEN=…`): well above it, still bounded. */
export const TOKEN_PAGINA_INCOLLATO_MAX = 8192
export const TOKEN_PAGINA_NON_VALIDO =
  'Il token della Pagina non è valido o non ha accesso ai messaggi: generane uno nuovo da Meta › Messenger › Impostazioni dell’API e incollalo qui.'

/**
 * The Page token as pasted, inside a FormData (field `token`), never a plain
 * argument: `next dev` logs a server function's arguments, a FormData as `{}`.
 * The action then cleans it with pulisciTokenPagina (lib/messenger/graph.ts,
 * server only) and checks it with RE_TOKEN_PAGINA before asking Meta. The
 * token never comes back, not even in an error.
 */
export const tokenPaginaSchema = z
  .instanceof(FormData, { message: TOKEN_PAGINA_NON_VALIDO })
  .transform((dati) => dati.get('token'))
  .pipe(
    z
      .string({ required_error: 'Incolla il token della Pagina copiato da Meta.', invalid_type_error: TOKEN_PAGINA_NON_VALIDO })
      .min(1, 'Incolla il token della Pagina copiato da Meta.')
      .max(TOKEN_PAGINA_INCOLLATO_MAX, TOKEN_PAGINA_NON_VALIDO),
  )

/** A Messenger PSID: the check of messenger_esclusi.utente_id. */
export const RE_PSID = /^[0-9]{1,30}$/
/** An Instagram username as stored: the check of instagram_esclusi and insight_chat. */
export const RE_USERNAME_INSIGHT = /^[a-z0-9._]{1,30}$/
export const NOME_CHAT_MAX = 120
export const MOTIVO_ESCLUSIONE_MAX = 120

/** «Cancella anche i suoi messaggi già salvati nell’Insight»: checked by default, in both exclusion forms. */
export const ETICHETTA_CANCELLA_MESSAGGI = 'Cancella anche i suoi messaggi già salvati nell’Insight'
const cancellaMessaggi = z.boolean({ invalid_type_error: 'Valore non valido.' }).default(true)

/** The flag alone, to merge into the Instagram exclusion form (esclusioneSchema of the settings). */
export const cancellaMessaggiSchema = z.object({ cancella_messaggi: cancellaMessaggi })

const psid = z
  .string({ required_error: 'Scegli una chat dell’elenco.', invalid_type_error: 'Scegli una chat dell’elenco.' })
  .trim()
  .regex(RE_PSID, 'Scegli una chat dell’elenco.')

const motivo = z
  .string()
  .trim()
  .max(MOTIVO_ESCLUSIONE_MAX, `Il motivo: al massimo ${MOTIVO_ESCLUSIONE_MAX} caratteri`)
  .nullish()
  .transform((v) => (v ? v : null))

/** «Escludi una chat» of Messenger: picked from rpc('insight_chat_messenger'), never typed. */
export const esclusioneMessengerSchema = z.object({
  utente_id: psid,
  nome: z
    .string({ required_error: 'Scegli una chat dell’elenco.', invalid_type_error: 'Scegli una chat dell’elenco.' })
    .trim()
    .min(1, 'Scegli una chat dell’elenco.')
    .max(NOME_CHAT_MAX, 'Scegli una chat dell’elenco.'),
  motivo,
  cancella_messaggi: cancellaMessaggi,
})
export type EsclusioneMessengerInput = z.input<typeof esclusioneMessengerSchema>
export type EsclusioneMessenger = z.output<typeof esclusioneMessengerSchema>

/** The trash icon of a Messenger exclusion. */
export const togliEsclusioneMessengerSchema = z.object({ utente_id: psid })

/**
 * The arguments of public.insight_dimentica (D16): the username of an
 * Instagram chat or the PSID of a Messenger one.
 */
export const dimenticaChatSchema = z.discriminatedUnion('canale', [
  z.object({ canale: z.literal('instagram'), chiave: z.string().regex(RE_USERNAME_INSIGHT, 'Chat non valida.') }),
  z.object({ canale: z.literal('messenger'), chiave: z.string().regex(RE_PSID, 'Chat non valida.') }),
])
export type DimenticaChat = z.output<typeof dimenticaChatSchema>
