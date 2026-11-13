import type { Lingua } from '@/lib/i18n/lingua'
import { ONBOARDING, titoloPasso, motivoInLingua } from '@/lib/i18n/testi/onboarding'
import type { Database } from '@/lib/supabase/database.types'

/**
 * The onboarding of a client in words (1.77.0): which state the admin reads, in which
 * group of the list the client sits, what the card offers, what a line of the log says.
 * Pure: everything comes from a row of public.v_onboarding (SQL decides the states, also
 * «scaduto») and from onboarding_impostazioni.aperto_ai_clienti; this file only names them.
 * Never a person of the team, never an amount (CLAUDE.md sections 6 and 17).
 */

export type RigaOnboarding = Database['public']['Views']['v_onboarding']['Row']

/** What the states need of a row: the pages pass the whole row, the tests only these. */
export type StatoRiga = Pick<
  RigaOnboarding,
  | 'invito_id'
  | 'invito_stato'
  | 'percorso_stato'
  | 'minorenne'
  | 'consenso_genitore_il'
  | 'passo_attore'
  | 'passo_stato'
> & {
  /** A test link (1.79.0): it works with the client area closed. Optional: the rows of before have none. */
  prova?: boolean | null
  /** The client's account (1.79.0): with one, the client has registered. Optional: the rows of before have none. */
  account_stato?: string | null
}

export const STATI_ONBOARDING = [
  'in_attesa_pagamento',
  'in_attesa_consenso',
  'pronto',
  'in_attesa_registrazione',
  'in_corso',
  'scaduto',
  'revocato',
  'sospeso',
  'completato',
  'senza_link',
] as const
export type StatoOnboarding = (typeof STATI_ONBOARDING)[number]

/**
 * The one state the admin reads, from the link and the path together.
 * - a minor without a parent's consent waits for it, paid or not: the link never turns active before;
 * - an active link is «pronto» while the client area is closed (release A: nobody can use it yet),
 *   «in attesa di registrazione» once it is open.
 */
export function statoOnboarding(riga: StatoRiga, aperto: boolean): StatoOnboarding {
  if (riga.percorso_stato === 'completato') return 'completato'
  switch (riga.invito_stato) {
    case 'revocato':
      return 'revocato'
    case 'scaduto':
      return 'scaduto'
    case 'in_attesa_pagamento':
      return riga.minorenne && !riga.consenso_genitore_il ? 'in_attesa_consenso' : 'in_attesa_pagamento'
    case 'attivo':
      // a test link (1.79.0) can be used with the area closed: it waits for the registration
      return aperto || riga.prova === true ? 'in_attesa_registrazione' : 'pronto'
    case 'usato':
      return riga.percorso_stato === 'sospeso' ? 'sospeso' : 'in_corso'
    default:
      if (riga.percorso_stato === 'sospeso') return 'sospeso'
      return riga.percorso_stato === 'in_corso' ? 'in_corso' : 'senza_link'
  }
}

/** How a state reads next to its icon: the pages choose the icon and the token from this, never colour alone. */
export type TonoStato = 'attesa' | 'ok' | 'avviso' | 'critico' | 'neutro'

export const TONO_STATO: Record<StatoOnboarding, TonoStato> = {
  in_attesa_pagamento: 'attesa',
  in_attesa_consenso: 'avviso',
  pronto: 'ok',
  in_attesa_registrazione: 'attesa',
  in_corso: 'ok',
  scaduto: 'avviso',
  revocato: 'critico',
  sospeso: 'avviso',
  completato: 'ok',
  senza_link: 'neutro',
}

export function etichettaStato(stato: StatoOnboarding, lingua: Lingua = 'it'): string {
  return ONBOARDING[lingua].stati[stato]
}

export function dettaglioStato(stato: StatoOnboarding, lingua: Lingua = 'it'): string {
  return ONBOARDING[lingua].statiDettaglio[stato]
}

/** The groups of the list (the stopped ones after the waiting), and the finished ones, which the list keeps apart. */
export const GRUPPI_LISTA = ['noi', 'cliente', 'attesa', 'fermi'] as const
export type GruppoLista = (typeof GRUPPI_LISTA)[number] | 'conclusi'

/**
 * Whose turn it is. While the client follows the steps: ours when the current step is the
 * team's, or waits for the team to check it; the client's otherwise. Everything before the
 * registration (payment, consent, an active link) waits; a revoked or expired link, or a path
 * on hold, is stopped: it waits for nothing until the admin moves it.
 */
export function gruppoOnboarding(riga: StatoRiga): GruppoLista {
  if (riga.percorso_stato === 'completato') return 'conclusi'
  if (riga.invito_stato === 'revocato' || riga.invito_stato === 'scaduto' || riga.percorso_stato === 'sospeso') return 'fermi'
  if (riga.percorso_stato !== 'in_corso') return 'attesa'
  if (riga.passo_attore === 'cliente' && riga.passo_stato !== 'inviato' && riga.passo_stato !== 'in_attesa_team') {
    return 'cliente'
  }
  return 'noi'
}

/** The rows of the list by group, in the order they came (the most recent first). */
export function perGruppo<T extends StatoRiga>(righe: readonly T[]): Record<GruppoLista, T[]> {
  const gruppi: Record<GruppoLista, T[]> = { noi: [], cliente: [], attesa: [], fermi: [], conclusi: [] }
  for (const riga of righe) gruppi[gruppoOnboarding(riga)].push(riga)
  return gruppi
}

type DateRiga = Pick<
  RigaOnboarding,
  'created_at' | 'attivato_il' | 'scade_il' | 'revocato_il' | 'giorno_zero' | 'completato_il' | 'consenso_genitore_il'
>

/** Since when the client is in that state: the moment the list shows next to it. */
export function daQuando(riga: DateRiga, stato: StatoOnboarding): string | null {
  switch (stato) {
    case 'pronto':
    case 'in_attesa_registrazione':
      return riga.attivato_il ?? riga.created_at
    case 'scaduto':
      return riga.scade_il ?? riga.created_at
    case 'revocato':
      return riga.revocato_il ?? riga.created_at
    case 'in_corso':
      return riga.giorno_zero ?? riga.attivato_il ?? riga.created_at
    case 'completato':
      return riga.completato_il ?? riga.created_at
    default:
      return riga.created_at
  }
}

export type AzioniLink = {
  confermaPagamento: boolean
  consensoGenitore: boolean
  rigenera: boolean
  revoca: boolean
  riattiva: boolean
  /** «Copia link» and «Copia il messaggio»: only with the client area open (or a test link) and a link the client can use. */
  copia: boolean
  /** «Cliente di prova» (1.79.0): a link not used yet. */
  prova: boolean
}

/**
 * What the card's box «Link» offers: the same conditions the functions in SQL check
 * (20261108090200), so a button never leads to a refusal. «Copia link» and the ready
 * message appear only once the client area is open.
 */
export function azioniLink(
  riga: StatoRiga & { pagamento_confermato?: RigaOnboarding['pagamento_confermato'] },
  aperto: boolean,
): AzioniLink {
  const stato = riga.invito_stato
  const invito = riga.invito_id != null && stato != null
  // a client who has registered: his access comes back only with «Riattiva», never with a new link
  const registrato = riga.account_stato != null
  return {
    // a minor whose payment is there already waits only for the consent: confirming again would change nothing
    confermaPagamento: invito && stato === 'in_attesa_pagamento' && riga.pagamento_confermato !== true,
    consensoGenitore: invito && riga.minorenne === true && !riga.consenso_genitore_il && stato !== 'revocato',
    rigenera: invito && stato !== 'usato' && !registrato,
    revoca: invito && stato !== 'revocato',
    riattiva: invito && stato === 'revocato',
    copia: invito && (aperto || riga.prova === true) && stato === 'attivo',
    prova: invito && stato !== 'usato' && !registrato,
  }
}

export type EventoRegistro = { tipo: string; dettagli: unknown }

function dettagli(evento: EventoRegistro): Record<string, unknown> {
  const d = evento.dettagli
  return d && typeof d === 'object' && !Array.isArray(d) ? (d as Record<string, unknown>) : {}
}

/**
 * A line of the log in words, from the kind of event and its details (written by the
 * triggers and the functions of 20261108090200). An unknown kind says only that something
 * was recorded: a later release may write kinds this page does not know yet.
 */
export function eventoInParole(evento: EventoRegistro, lingua: Lingua = 'it'): string {
  const t = ONBOARDING[lingua].registro.eventi
  const d = dettagli(evento)
  switch (evento.tipo) {
    case 'avviato':
      return d.minorenne === true ? t.avviatoMinorenne : t.avviato
    case 'link_attivo':
      return d.attivato_da === 'manuale' ? t.linkAttivoManuale : t.linkAttivoPagamento
    case 'in_attesa_consenso':
      return d.modo === 'manuale' ? t.attesaConsensoManuale : t.attesaConsensoPagamento
    case 'link_revocato': {
      const frase = d.automatica === true ? t.linkRevocatoAutomatico : t.linkRevocato
      const motivo = typeof d.motivo === 'string' ? d.motivo.trim() : ''
      return motivo ? t.conMotivo(frase, motivoInLingua(motivo, lingua)) : frase
    }
    case 'link_riattivato':
      if (d.stato === 'usato') return t.accessoRiattivato
      return d.stato === 'in_attesa_pagamento' ? t.linkRiattivatoInAttesa : t.linkRiattivato
    case 'link_rigenerato':
      return t.linkRigenerato
    case 'consenso_genitore':
      return t.consensoGenitore
    case 'incarichi_modificati':
      return t.incarichiModificati
    // release B1a (1.79.0): the client's own steps, never his answers
    case 'registrato':
      return t.registrato
    case 'email_cambiata':
      return t.emailCambiata
    case 'prova':
      return d.prova === false ? t.provaTolta : t.provaSegnata
    case 'consenso_dato':
      return t.consensoDato
    case 'passo_completato':
      return typeof d.passo === 'string' ? t.passoCompletato(titoloPasso(d.passo, null, lingua)) : t.altro
    // release B1b (1.80.0): how the client asked, from a closed list; never a free text, never an answer
    case 'consenso_revocato': {
      const come = typeof d.come === 'string' ? ONBOARDING[lingua].cliente.canaliRevoca[d.come] : undefined
      return come ? t.conMotivo(t.consensoRevocato, come) : t.consensoRevocato
    }
    // release B2 (1.81.0): the team's work; never a Meet link. The reasons of «Sblocca» and «Riavvia» are the
    // words of the person who wrote them: the log is the admin's only
    case 'passo_inviato':
      return typeof d.passo === 'string' ? t.passoInviato(titoloPasso(d.passo, null, lingua)) : t.altro
    case 'call_confermata':
      return t.callConfermata
    case 'call_svolta':
      return d.tipo === 'checkpoint' ? t.checkpointSvolto : t.callSvolta
    case 'call_spostata':
      return t.callSpostata
    case 'call_non_presentato':
      return t.callNonPresentato
    case 'obiettivo_aperto':
      return t.obiettivoAperto
    case 'test_ricevuti':
      return t.testRicevuti
    case 'programma_consegnato':
      return t.programmaConsegnato
    case 'community_approvata':
      return t.communityApprovata
    case 'community_controllata':
      return t.communityControllata
    case 'passo_sbloccato': {
      const frase = typeof d.passo === 'string' ? t.passoSbloccato(titoloPasso(d.passo, null, lingua)) : t.altro
      const motivo = typeof d.motivo === 'string' ? d.motivo.trim() : ''
      return motivo ? t.conMotivo(frase, motivo) : frase
    }
    case 'onboarding_riavviato': {
      const motivo = typeof d.motivo === 'string' ? d.motivo.trim() : ''
      return motivo ? t.conMotivo(t.onboardingRiavviato, motivo) : t.onboardingRiavviato
    }
    case 'onboarding_completato':
      return t.onboardingCompletato
    case 'telegram_gruppo_creato':
      return t.telegramGruppo
    default:
      return t.altro
  }
}

/** «Mario Rossi», or the words for a client without a name. */
export function nomeCliente(
  cliente: { nome: string | null | undefined; cognome: string | null | undefined },
  lingua: Lingua = 'it',
): string {
  const nome = [cliente.nome, cliente.cognome]
    .map((parte) => parte?.trim())
    .filter(Boolean)
    .join(' ')
  return nome || ONBOARDING[lingua].senzaNome
}

export type PersonaTeam = { id: string; nome: string }
export type IncarichiProposti = { coach: string | null; revisore: string | null; responsabile: string | null }

/**
 * The team the wizard proposes: the people of Impostazioni › Onboarding while they are
 * still active, and for the responsible, when none is set, whoever is using the wizard.
 */
export function incarichiPredefiniti(
  impostazioni: {
    coach_predefinito_id: string | null
    revisore_predefinito_id: string | null
    responsabile_predefinito_id: string | null
  } | null,
  persone: readonly PersonaTeam[],
  io: string,
): IncarichiProposti {
  const attiva = (id: string | null | undefined) => (id && persone.some((p) => p.id === id) ? id : null)
  return {
    coach: attiva(impostazioni?.coach_predefinito_id),
    revisore: attiva(impostazioni?.revisore_predefinito_id),
    responsabile: attiva(impostazioni?.responsabile_predefinito_id) ?? attiva(io),
  }
}
