import { z } from 'zod'

import { isDataISO } from '@/lib/date'

/**
 * The team's work on an onboarding (release B2, 1.81.0, docs/onboarding/rilascio-b.md,
 * «Funzioni del team»): the schemas of the actions of the coach in charge, of the responsible
 * (the community only) and of the admin. The same schema in the sheet and in the server
 * action; the functions in SQL check again and decide who may (onboarding_guardia_team).
 */

export const ERRORI_ONBOARDING_TEAM = {
  cliente: 'Cliente non valido.',
  call: 'Call non valida.',
  consegna: 'Consegna non valida.',
  giorno: 'Scegli il giorno',
  ora: 'Scegli l’ora',
  meet: 'Il link di Meet comincia con https://meet.google.com/',
  esito: 'Scegli com’è andata la call',
  tipo: 'Scegli il tipo di consegna',
  titolo: 'Scrivi il titolo, al massimo 120 caratteri',
  url: 'Il link comincia con https://',
  youtube: 'Incolla il link del video di YouTube',
  passo: 'Scegli lo step',
  motivo: 'Scrivi il motivo, al massimo 300 caratteri',
  azione: 'Azione non valida.',
  prenotazione: 'Incolla l’indirizzo della pagina di prenotazione di Google Calendar (https://calendar.app.google/…)',
  emailQuestionario: 'Scrivi indirizzi email validi, uno per riga, al massimo 10',
  // the answers of the core
  sessione: 'Sessione scaduta. Rientra e riprova.',
  nonFatto: 'Non sono riuscito a salvarlo. Riprova.',
  areaNonCambiata: 'L’area clienti non è cambiata. Riprova.',
  soloAdminArea: 'L’area clienti la apre e la chiude l’admin.',
} as const

const E = ERRORI_ONBOARDING_TEAM

export const LIMITI_ONBOARDING_TEAM = { titolo: 120, url: 500, motivo: 300, meet: 300 } as const

const RE_ORA = /^([01]\d|2[0-3]):[0-5]\d$/
const RE_MEET = /^https:\/\/meet\.google\.com\/\S+$/
const RE_HTTPS = /^https:\/\/\S+$/
/** The same rule as the check of onboarding_impostazioni.link_prenotazione. */
export const RE_PRENOTAZIONE = /^https:\/\/(calendar\.app\.google|calendar\.google\.com)\/\S*$/

const giorno = z.string({ required_error: E.giorno }).refine(isDataISO, E.giorno)
const ora = z.string({ required_error: E.ora }).regex(RE_ORA, E.ora)
const clientId = z.string().uuid(E.cliente)

/** A link as people paste it: spaces around go, a missing https:// is added. */
export function normalizzaHttps(valore: string | null | undefined): string {
  const pulito = (valore ?? '').trim()
  if (pulito === '') return ''
  return /^https?:\/\//i.test(pulito) ? pulito.replace(/^http:\/\//i, 'https://') : `https://${pulito}`
}

const meet = z
  .string()
  .transform(normalizzaHttps)
  .refine((v) => RE_MEET.test(v) && v.length <= LIMITI_ONBOARDING_TEAM.meet, E.meet)

/** «Conferma la call»: the day and the hour (the client's booking, corrected if needed) and the Meet link. */
export const confermaCallSchema = z.object({ client_id: clientId, giorno, ora, meet_url: meet })
export type ConfermaCallInput = z.input<typeof confermaCallSchema>

export const ESITI_CALL = ['svolta', 'non_presentato', 'spostata'] as const
export type EsitoCallOnboarding = (typeof ESITI_CALL)[number]

/** The outcome of an onboarding call or of a checkpoint: «spostata» and «non_presentato» want the new day. */
export const esitoCallSchema = z
  .object({
    call_id: z.string().uuid(E.call),
    esito: z.enum(ESITI_CALL, { errorMap: () => ({ message: E.esito }) }),
    giorno: z.string().optional(),
    ora: z.string().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.esito === 'svolta') return
    if (!v.giorno || !isDataISO(v.giorno)) ctx.addIssue({ code: 'custom', path: ['giorno'], message: E.giorno })
    if (!v.ora || !RE_ORA.test(v.ora)) ctx.addIssue({ code: 'custom', path: ['ora'], message: E.ora })
  })
export type EsitoCallInput = z.input<typeof esitoCallSchema>

export const clienteTeamSchema = z.object({ client_id: clientId })

export const TIPI_CONSEGNA = ['video', 'pdf', 'link'] as const
export type TipoConsegna = (typeof TIPI_CONSEGNA)[number]

/** A YouTube link (watch, youtu.be, shorts, embed, live) or the 11-character id: the same rule as the function. */
export function youtubeValido(valore: string): boolean {
  const v = valore.trim()
  if (/^[A-Za-z0-9_-]{11}$/.test(v)) return true
  return /^https:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:[^#]*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/|youtube-nocookie\.com\/embed\/)[A-Za-z0-9_-]{11}/.test(
    normalizzaHttps(v),
  )
}

/** «Aggiungi una consegna»: a YouTube video (it can be compulsory), a PDF or a link. */
export const consegnaSchema = z
  .object({
    client_id: clientId,
    tipo: z.enum(TIPI_CONSEGNA, { errorMap: () => ({ message: E.tipo }) }),
    titolo: z
      .string()
      .transform((v) => v.trim())
      .refine((v) => v.length >= 1 && v.length <= LIMITI_ONBOARDING_TEAM.titolo, E.titolo),
    url: z.string().transform((v) => v.trim()),
    obbligatoria: z.boolean().default(false),
  })
  .superRefine((v, ctx) => {
    if (v.tipo === 'video') {
      if (!youtubeValido(v.url)) ctx.addIssue({ code: 'custom', path: ['url'], message: E.youtube })
      return
    }
    const link = normalizzaHttps(v.url)
    if (!RE_HTTPS.test(link) || link.length > LIMITI_ONBOARDING_TEAM.url) {
      ctx.addIssue({ code: 'custom', path: ['url'], message: E.url })
    }
  })
  .transform((v) => ({
    ...v,
    // an id alone stays as it is; a link without its scheme gets it
    url: /^[A-Za-z0-9_-]{11}$/.test(v.url) ? v.url : normalizzaHttps(v.url),
    obbligatoria: v.tipo === 'video' ? v.obbligatoria : false,
  }))
export type ConsegnaInput = z.input<typeof consegnaSchema>

export const togliConsegnaSchema = z.object({ id: z.string().uuid(E.consegna) })

/** «Programma consegnato»: the day and the hour of the first checkpoint. */
export const programmaSchema = z.object({ client_id: clientId, giorno, ora })
export type ProgrammaInput = z.input<typeof programmaSchema>

export const AZIONI_COMMUNITY = ['approvata', 'controllata'] as const
export const communitySchema = z.object({
  client_id: clientId,
  azione: z.enum(AZIONI_COMMUNITY, { errorMap: () => ({ message: E.azione }) }),
})

const motivo = z
  .string()
  .transform((v) => v.trim())
  .refine((v) => v.length >= 1 && v.length <= LIMITI_ONBOARDING_TEAM.motivo, E.motivo)

/** The steps the team may open by hand: every step of the flow of version 1. */
export const PASSI_FLUSSO = [
  'benvenuto',
  'regole',
  'questionario',
  'prenotazione',
  'community',
  'call',
  'obiettivo',
  'test',
  'programma',
] as const

export const sbloccaPassoSchema = z.object({
  client_id: clientId,
  passo: z.enum(PASSI_FLUSSO, { errorMap: () => ({ message: E.passo }) }),
  motivo,
})
export type SbloccaPassoInput = z.input<typeof sbloccaPassoSchema>

export const riavviaSchema = z.object({ client_id: clientId, motivo })
export type RiavviaInput = z.input<typeof riavviaSchema>

/** The booking page of the settings (Google Calendar's appointment schedule): empty is none. */
export const linkPrenotazione = z
  .string()
  .max(LIMITI_ONBOARDING_TEAM.url, E.prenotazione)
  .nullish()
  .transform((v) => {
    const pulito = normalizzaHttps(v)
    return pulito === '' ? null : pulito
  })
  .refine((v) => v === null || (RE_PRENOTAZIONE.test(v) && v.length <= LIMITI_ONBOARDING_TEAM.url), E.prenotazione)

/**
 * Who receives the email of a questionnaire sent (Impostazioni › Onboarding): a text with one address per line (or
 * separated by commas), or a list; lowercase, no duplicates, at most 10. The same rule as onboarding_email_valide.
 */
export const RE_EMAIL_DESTINATARIO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
export const EMAIL_QUESTIONARIO_MAX = 10
export const emailQuestionario = z
  .union([z.string(), z.array(z.string())])
  .nullish()
  .transform((v) => {
    const voci = (Array.isArray(v) ? v : (v ?? '').split(/[\s,;]+/)).map((x) => x.trim().toLowerCase()).filter(Boolean)
    return [...new Set(voci)]
  })
  .refine((v) => v.length <= EMAIL_QUESTIONARIO_MAX && v.every((x) => x.length <= 320 && RE_EMAIL_DESTINATARIO.test(x)), E.emailQuestionario)
