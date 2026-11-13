import { z } from 'zod'

import { normalizzaHandle } from '@/lib/validation/call'
import { nuovaVenditaSchema, type NuovaVendita, type NuovaVenditaInput } from '@/lib/validation/vendita'

/**
 * The guided onboarding, release A (1.77.0, Dany 12/11/2026): the team's side. The same
 * schemas validate the wizard «Nuovo cliente», «Avvia onboarding» on a sale that exists,
 * the card's actions and the settings page, in the browser and in the server actions
 * (lib/onboarding/operazioni.ts). The states are the checks of the tables
 * (20261108090000_onboarding_dati.sql); the words are in lib/i18n/testi/onboarding.ts.
 */

/** The state of a link: the check of onboarding_inviti.stato («scaduto» is also computed by v_onboarding). */
export const STATI_INVITO = ['in_attesa_pagamento', 'attivo', 'usato', 'scaduto', 'revocato'] as const
export type StatoInvito = (typeof STATI_INVITO)[number]

export const STATI_PERCORSO = ['in_attesa', 'in_corso', 'sospeso', 'completato'] as const
export type StatoPercorso = (typeof STATI_PERCORSO)[number]

export const STATI_PASSO = ['bloccato', 'disponibile', 'in_corso', 'inviato', 'in_attesa_team', 'fatto'] as const
export type StatoPasso = (typeof STATI_PASSO)[number]

/** Who follows a client in onboarding: the columns of onboarding_incarichi, the check of pm_task.per_incarico. */
export const INCARICHI = ['coach', 'revisore', 'responsabile'] as const
export type Incarico = (typeof INCARICHI)[number]

export function eStatoInvito(valore: unknown): valore is StatoInvito {
  return typeof valore === 'string' && (STATI_INVITO as readonly string[]).includes(valore)
}

export function eStatoPercorso(valore: unknown): valore is StatoPercorso {
  return typeof valore === 'string' && (STATI_PERCORSO as readonly string[]).includes(valore)
}

export function eStatoPasso(valore: unknown): valore is StatoPasso {
  return typeof valore === 'string' && (STATI_PASSO as readonly string[]).includes(valore)
}

/** Same bounds as the checks of the tables. */
export const LIMITI_ONBOARDING = {
  nota: 300,
  motivo: 300,
  link: 300,
  giorniLinkMinimo: 1,
  giorniLinkMassimo: 90,
} as const

/**
 * The fixed messages of the schemas and of the core, in one place: the English ones are
 * keyed on these (traduciErroreOnboarding, lib/i18n/testi/onboarding.ts).
 */
export const ERRORI_ONBOARDING = {
  soloAdmin: 'L’onboarding lo gestisce l’admin.',
  controlla: 'Controlla i campi evidenziati.',
  nonValidi: 'Dati non validi.',
  nome: 'Scrivi il nome del cliente',
  email: 'Email non valida',
  telefono: 'Telefono non valido',
  handle: 'Handle non valido',
  telegram: 'Username Telegram non valido: da 5 a 32 caratteri tra lettere, numeri e trattino basso',
  linkTelegram: 'Incolla un link di Telegram, ad esempio https://t.me/…',
  linkLungo: 'Link troppo lungo: al massimo 300 caratteri',
  responsabile: 'Scegli il responsabile dell’onboarding',
  persona: 'Scegli una persona del team',
  vendita: 'Vendita non valida.',
  cliente: 'Cliente non valido.',
  invito: 'Link non valido.',
  soloNuovo: 'L’onboarding parte solo da una vendita a un nuovo cliente.',
  giaAvviato: 'Questo cliente ha già un onboarding avviato.',
  callConVendita: 'Questa call ha già una vendita registrata.',
  nota: 'La nota è troppo lunga: al massimo 300 caratteri.',
  motivo: 'Scrivi il motivo della revoca',
  motivoLungo: 'Il motivo è troppo lungo: al massimo 300 caratteri.',
  revocaConsensoNonFatta: 'Revoca non registrata. Riprova.',
  canaleRevoca: 'Scegli come il cliente ha chiesto la revoca.',
  giorni: 'I giorni di validità del link vanno da 1 a 90',
  nonAvviato: 'Onboarding non avviato. Riprova.',
  nonConfermato: 'Pagamento non confermato. Riprova.',
  consensoNonRegistrato: 'Consenso non registrato. Riprova.',
  nonRevocato: 'Link non revocato. Riprova.',
  nonRiattivato: 'Link non riattivato. Riprova.',
  nonRigenerato: 'Link non rigenerato. Riprova.',
  incarichiNonSalvati: 'Team non aggiornato. Riprova.',
  telegramNonSalvato: 'Telegram non aggiornato. Riprova.',
  impostazioniNonSalvate: 'Impostazioni non salvate. Riprova.',
  risposta: 'L’onboarding è avviato, ma la risposta non si legge: apri la sezione Onboarding.',
  // 1.78.0
  provaNonSalvata: 'Cliente di prova non aggiornato. Riprova.',
  nonEliminato: 'Onboarding non eliminato. Riprova.',
} as const

const vuotoANull = (v: string | null | undefined) => {
  const t = v?.trim() ?? ''
  return t === '' ? null : t
}

/**
 * A Telegram username as people paste it («@Mario_Rossi», «t.me/mario_rossi», the whole
 * link): lower case, without @ and without the address, as public.clienti_telegram keeps it.
 */
export function normalizzaTelegram(valore: string | null | undefined): string | null {
  const pulito = (valore ?? '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/^(www\.)?(t|telegram)\.me\//i, '')
    .replace(/^@+/, '')
    .replace(/[/?#].*$/, '')
    .toLowerCase()
  return pulito === '' ? null : pulito
}

/** The same rule as the check of clienti_telegram.username. */
export const USERNAME_TELEGRAM = /^[a-z0-9_]{5,32}$/

/** A Telegram link as people paste it: «t.me/+abc» and «http://t.me/…» become https://t.me/…. */
export function normalizzaLinkTelegram(valore: string | null | undefined): string | null {
  const pulito = (valore ?? '').trim()
  if (pulito === '') return null
  const senzaSchema = pulito.replace(/^https?:\/\//i, '')
  return /^t\.me\//i.test(senzaSchema) ? `https://t.me/${senzaSchema.slice('t.me/'.length)}` : pulito
}

/** The same rule as the checks of clienti_telegram.gruppo_privato_url and onboarding_impostazioni.link_community. */
export const LINK_TELEGRAM = /^https:\/\/t\.me\/\S+$/

const usernameTelegram = z
  .string()
  .max(120, ERRORI_ONBOARDING.telegram)
  .nullish()
  .transform(normalizzaTelegram)
  .refine((u) => u === null || USERNAME_TELEGRAM.test(u), ERRORI_ONBOARDING.telegram)

const linkTelegram = z
  .string()
  .max(400, ERRORI_ONBOARDING.linkLungo)
  .nullish()
  .transform(normalizzaLinkTelegram)
  .refine((l) => l === null || LINK_TELEGRAM.test(l), ERRORI_ONBOARDING.linkTelegram)
  .refine((l) => l === null || l.length <= LIMITI_ONBOARDING.link, ERRORI_ONBOARDING.linkLungo)

/** A person of the team, or nobody: an unselected select reaches Zod as '' or null. */
const personaFacoltativa = z
  .union([z.string().uuid(ERRORI_ONBOARDING.persona), z.literal('')])
  .nullish()
  .transform((v) => v || null)

/**
 * The screen «Cliente» of the wizard, and the contacts of «Avvia onboarding»: the same
 * rules as the client fields of «Nuova vendita» (nuovaVenditaSchema), plus Telegram and
 * the minor. Every field shown is written: an emptied one is saved empty.
 */
export const clienteOnboardingSchema = z.object({
  nome: z
    .string({ required_error: ERRORI_ONBOARDING.nome, invalid_type_error: ERRORI_ONBOARDING.nome })
    .trim()
    .min(1, ERRORI_ONBOARDING.nome)
    .max(80, 'Al massimo 80 caratteri'),
  cognome: z.string().max(80, 'Al massimo 80 caratteri').nullish().transform(vuotoANull),
  email: z
    .string()
    .trim()
    .max(160, ERRORI_ONBOARDING.email)
    .nullish()
    .transform(vuotoANull)
    .transform((v) => v?.toLowerCase() ?? null)
    .refine((v) => v === null || z.string().email().safeParse(v).success, ERRORI_ONBOARDING.email),
  telefono: z
    .string()
    .max(30, 'Numero troppo lungo')
    .nullish()
    .transform(vuotoANull)
    .refine((v) => v === null || /^[+\d\s().-]{6,}$/.test(v), ERRORI_ONBOARDING.telefono),
  instagram_handle: z
    .string()
    .max(40, ERRORI_ONBOARDING.handle)
    .nullish()
    .transform((h) => normalizzaHandle(h ?? ''))
    .refine((h) => h === null || /^@[a-z0-9._]{1,30}$/.test(h), ERRORI_ONBOARDING.handle),
  telegram: usernameTelegram,
  minorenne: z.boolean().default(false),
})

export type ClienteOnboardingInput = z.input<typeof clienteOnboardingSchema>
export type ClienteOnboarding = z.output<typeof clienteOnboardingSchema>

/** The screen «Team»: the responsible is required, coach and reviewer may be missing. */
export const teamOnboardingSchema = z.object({
  coach: personaFacoltativa,
  revisore: personaFacoltativa,
  responsabile: z
    .string({ required_error: ERRORI_ONBOARDING.responsabile, invalid_type_error: ERRORI_ONBOARDING.responsabile })
    .uuid(ERRORI_ONBOARDING.responsabile),
})

export type TeamOnboardingInput = z.input<typeof teamOnboardingSchema>
export type TeamOnboarding = z.output<typeof teamOnboardingSchema>

/**
 * The screen «Vendita»: the fields of «Nuova vendita» without the ones the wizard
 * fills by itself (the type, always «nuovo», and the client of the first screen).
 */
export type VenditaWizardInput = Omit<
  NuovaVenditaInput,
  'tipo' | 'nome' | 'cognome' | 'email' | 'telefono' | 'instagram_handle'
>

export type NuovoClienteInput = {
  cliente: ClienteOnboardingInput
  vendita: VenditaWizardInput
  team: TeamOnboardingInput
}

export type NuovoCliente = { cliente: ClienteOnboarding; vendita: NuovaVendita; team: TeamOnboarding }

/** The first message of each field with a problem, screen by screen. */
export type CampiWizard = {
  cliente?: Partial<Record<keyof ClienteOnboardingInput, string>>
  vendita?: Partial<Record<keyof NuovaVenditaInput, string>>
  team?: Partial<Record<keyof TeamOnboardingInput, string>>
}

function primiMessaggi<T extends string>(errore: z.ZodError): Partial<Record<T, string>> {
  const campi: Partial<Record<T, string>> = {}
  for (const issue of errore.issues) {
    const chiave = String(issue.path[0] ?? '') as T
    campi[chiave] ??= issue.message
  }
  return campi
}

const oggetto = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})

/** The sale as «Nuova vendita» validates it: always «nuovo», with the client of the first screen. */
export function venditaDelWizard(cliente: ClienteOnboarding, vendita: unknown): unknown {
  return {
    ...oggetto(vendita),
    tipo: 'nuovo',
    nome: cliente.nome,
    cognome: cliente.cognome,
    email: cliente.email,
    telefono: cliente.telefono,
    instagram_handle: cliente.instagram_handle,
  }
}

/**
 * The whole wizard, the three screens together: the client, the sale through
 * nuovaVenditaSchema (the rules of «Nuova vendita», never a copy of them) and the team.
 * Every screen is checked, so the answer names every field to fix at once.
 */
export function validaNuovoCliente(
  input: unknown,
): { ok: true; dati: NuovoCliente } | { ok: false; campi: CampiWizard } {
  const { cliente, vendita, team } = oggetto(input)
  const campi: CampiWizard = {}

  // a missing screen answers field by field, like an empty one
  const c = clienteOnboardingSchema.safeParse(oggetto(cliente))
  if (!c.success) campi.cliente = primiMessaggi(c.error)

  const t = teamOnboardingSchema.safeParse(oggetto(team))
  if (!t.success) campi.team = primiMessaggi(t.error)

  // the sale needs the client's name: with the first screen wrong its own fields are checked on a placeholder
  const v = nuovaVenditaSchema.safeParse(
    venditaDelWizard(
      c.success
        ? c.data
        : { nome: '–', cognome: null, email: null, telefono: null, instagram_handle: null, telegram: null, minorenne: false },
      vendita,
    ),
  )
  if (!v.success) campi.vendita = primiMessaggi(v.error)

  if (!c.success || !t.success || !v.success) return { ok: false, campi }
  return { ok: true, dati: { cliente: c.data, vendita: v.data, team: t.data } }
}

/** «Avvia onboarding» on a «nuovo» sale that exists: the screens «Cliente» and «Team». */
export const avviaOnboardingSchema = z.object({
  sale_id: z.string().uuid(ERRORI_ONBOARDING.vendita),
  cliente: clienteOnboardingSchema,
  team: teamOnboardingSchema,
})

export type AvviaOnboardingInput = z.input<typeof avviaOnboardingSchema>

/** The actions on a link that need only the link: «Conferma pagamento», «Riattiva», «Rigenera link». */
export const invitoSchema = z.object({ invito_id: z.string().uuid(ERRORI_ONBOARDING.invito) })

export const consensoGenitoreSchema = z.object({
  invito_id: z.string().uuid(ERRORI_ONBOARDING.invito),
  nota: z.string().trim().max(LIMITI_ONBOARDING.nota, ERRORI_ONBOARDING.nota).nullish().transform(vuotoANull),
})

/** How a client asked to revoke the consent on health data: a closed list, the same as the SQL. */
export const CANALI_REVOCA = ['telegram', 'email', 'di_persona', 'altro'] as const
export type CanaleRevoca = (typeof CANALI_REVOCA)[number]

/**
 * «Registra la revoca» of the consent on health data (1.79.0): the client and how he asked,
 * never a free text (it would reach the log and the backup, and could say something about health).
 */
export const revocaConsensoSchema = z.object({
  client_id: z.string().uuid(ERRORI_ONBOARDING.cliente),
  tipo: z.literal('salute'),
  motivo: z.enum(CANALI_REVOCA, { errorMap: () => ({ message: ERRORI_ONBOARDING.canaleRevoca }) }),
})

/** «Revoca» always says why: the reason stays in the log. */
export const revocaSchema = z.object({
  invito_id: z.string().uuid(ERRORI_ONBOARDING.invito),
  motivo: z
    .string({ required_error: ERRORI_ONBOARDING.motivo, invalid_type_error: ERRORI_ONBOARDING.motivo })
    .trim()
    .min(1, ERRORI_ONBOARDING.motivo)
    .max(LIMITI_ONBOARDING.motivo, ERRORI_ONBOARDING.motivoLungo),
})

/** The people in charge of a client, from the card. */
export const incarichiSchema = teamOnboardingSchema.extend({
  client_id: z.string().uuid(ERRORI_ONBOARDING.cliente),
})

export type IncarichiInput = z.input<typeof incarichiSchema>

/** The client on Telegram, from the card: the username and the link of the private group. */
export const telegramClienteSchema = z.object({
  client_id: z.string().uuid(ERRORI_ONBOARDING.cliente),
  username: usernameTelegram,
  gruppo_privato_url: linkTelegram,
})

export type TelegramClienteInput = z.input<typeof telegramClienteSchema>

/**
 * Impostazioni › Onboarding: the people proposed by the wizard, the community's link and
 * the days a link lasts. aperto_ai_clienti is not here: no session writes it.
 */
export const impostazioniOnboardingSchema = z.object({
  coach_predefinito_id: personaFacoltativa,
  revisore_predefinito_id: personaFacoltativa,
  responsabile_predefinito_id: personaFacoltativa,
  link_community: linkTelegram,
  giorni_validita_link: z.coerce
    .number({ invalid_type_error: ERRORI_ONBOARDING.giorni })
    .int(ERRORI_ONBOARDING.giorni)
    .min(LIMITI_ONBOARDING.giorniLinkMinimo, ERRORI_ONBOARDING.giorni)
    .max(LIMITI_ONBOARDING.giorniLinkMassimo, ERRORI_ONBOARDING.giorni),
})

export type ImpostazioniOnboardingInput = z.input<typeof impostazioniOnboardingSchema>
