import { z } from 'zod'

import { aggiungiGiorni, etichettaGiorno, nomeGiorno } from '@/lib/date'
import {
  COMMENTO_OBBLIGATORIO,
  LIVELLI_IN_TARGET,
  LIVELLI_QUALITA,
  MASSIMO_TESTO_COMMENTO,
  commentoMancante,
  testoScritto,
} from '@/lib/setting/commento'
import { GRUPPI_REPORT, MASSIMO_GIORNALIERO, type CampoNumericoReport } from '@/lib/validation/report'

/**
 * The setter's report proposed from the Instagram DMs (Dany, 08/10/2026):
 * every night the numbers of the day just ended are worked out from the DMs
 * of the account, and the setter sees them in "Oggi", to confirm, correct or
 * leave (CLAUDE.md section 17 as changed that day: the report stays his own
 * statement, the system only proposes the totals he already states). The
 * admin decides them too, from the "Setter" page (the same day, "Anche tu, con
 * una scheda e la notifica"): the first decision wins, his or the setter's,
 * and the setter sees on his day who decided. The answers of "Com’è andata
 * la giornata" stay the setter's: the proposal never touches them.
 *
 * The six numbers carry the very words of the form (GRUPPI_REPORT, from the
 * legend), in its order, so a label means the same thing on the card and on
 * the stepper right below it.
 */
export const CAMPI_PROPOSTA = [
  'dm_outbound',
  'dm_inbound',
  'follow_up',
  'conversazioni',
  'call_proposte',
  'discovery_prenotate',
] as const satisfies readonly CampoNumericoReport[]

export type CampoProposta = (typeof CAMPI_PROPOSTA)[number]
export type NumeriProposta = Record<CampoProposta, number>

function eCampoProposta(campo: string): campo is CampoProposta {
  return (CAMPI_PROPOSTA as readonly string[]).includes(campo)
}

/** [field, label, hint] of the six numbers, as the form shows them. */
export const VOCI_PROPOSTA: { campo: CampoProposta; etichetta: string; aiuto: string }[] = GRUPPI_REPORT.flatMap(
  (gruppo) => gruppo.campi,
).flatMap(([campo, etichetta, aiuto]) => (eCampoProposta(campo) ? [{ campo, etichetta, aiuto }] : []))

/** A proposal as the page hands it to the card: numbers only, never a text or a username. */
export type PropostaInstagram = NumeriProposta & {
  id: string
  data: string
  chat_lette: number
  chat_incerte: number
  /**
   * When these numbers were computed, exactly as the database wrote it: the
   * confirmation carries it back, and a proposal recomputed meanwhile is
   * refused, so the setter never confirms numbers he has not seen.
   */
  calcolato_il: string
  /** The admin's section: whose day it is (the setter's full name). */
  setter_nome?: string
}

/** Who decides from a card: the setter on his own day ("Oggi"), the admin on a setter's ("Setter"). */
export type ChiDecide = 'setter' | 'admin'

export type Decisione = 'conferma' | 'correzione' | 'scarto'

// calcolato_il: the confirmation carries it back, so a proposal recomputed meanwhile is never confirmed unseen
export const COLONNE_PROPOSTA = ['id', 'data', ...CAMPI_PROPOSTA, 'chat_lette', 'chat_incerte', 'calcolato_il'].join(', ')

/** The numbers out of a row that has them (a proposal or a report). */
export function numeriDi(riga: NumeriProposta): NumeriProposta {
  return Object.fromEntries(CAMPI_PROPOSTA.map((campo) => [campo, riga[campo]])) as NumeriProposta
}

/** The setter already wrote numbers for that day: one of the six is not zero. */
export function haNumeri(riga: NumeriProposta | null | undefined): riga is NumeriProposta {
  return !!riga && CAMPI_PROPOSTA.some((campo) => riga[campo] > 0)
}

const numero = z
  .number({ invalid_type_error: 'Deve essere un numero' })
  .int('Solo numeri interi')
  .min(0, 'Non può essere negativo')
  .max(MASSIMO_GIORNALIERO, `Al massimo ${MASSIMO_GIORNALIERO}`)

const idProposta = z.string().uuid('Proposta non valida')

/** The instant as the page read it: passed on untouched (a Date would drop the microseconds). */
const calcolatoIl = z
  .string()
  .max(64, 'Proposta non valida')
  .refine((v) => Number.isFinite(Date.parse(v)), 'Proposta non valida')

/**
 * "Conferma" (no values: the proposal's numbers) and "Conferma questi numeri"
 * (all six, corrected); both only on the proposal as the setter saw it.
 */
export const confermaPropostaSchema = z.object({
  id: idProposta,
  calcolato_il: calcolatoIl,
  valori: z
    .object(Object.fromEntries(CAMPI_PROPOSTA.map((campo) => [campo, numero])) as Record<CampoProposta, typeof numero>)
    .strict()
    .optional(),
})

export type ConfermaPropostaInput = z.input<typeof confermaPropostaSchema>

/** "Tieni i miei": the proposal is left, the report stays as he wrote it. */
export const scartaPropostaSchema = z.object({ id: idProposta })

/**
 * The required comment of the day given with the setter's decision (Dany,
 * 08/10/2026: "che sia lui o Instagram poi a caricare deve lui sempre
 * lasciare un commento della giornata"): the three answers, all given, as
 * the card's step asks them. Written by the database in the same transaction
 * as the decision (p_commento). The setter's only: never the admin's.
 */
export const commentoPropostaSchema = z
  .object({
    lead_in_target: z.enum(LIVELLI_IN_TARGET, { message: COMMENTO_OBBLIGATORIO.errore.lead_in_target }),
    qualita_conversazioni: z.enum(LIVELLI_QUALITA, { message: COMMENTO_OBBLIGATORIO.errore.qualita_conversazioni }),
    cosa_frenava: z
      .string({ invalid_type_error: COMMENTO_OBBLIGATORIO.errore.cosa_frenava })
      .max(MASSIMO_TESTO_COMMENTO, `Al massimo ${MASSIMO_TESTO_COMMENTO} caratteri`)
      .refine(testoScritto, COMMENTO_OBBLIGATORIO.errore.cosa_frenava),
  })
  .strict()

export type CommentoProposta = z.output<typeof commentoPropostaSchema>

/** The setter's "Conferma", "Usa quelli di Instagram" and "Conferma questi numeri": with the comment when the step asked it. */
export const confermaPropostaSetterSchema = confermaPropostaSchema.extend({ commento: commentoPropostaSchema.optional() })

/** The setter's "Tieni i miei": with the comment when the step asked it. */
export const scartaPropostaSetterSchema = scartaPropostaSchema.extend({ commento: commentoPropostaSchema.optional() })

/** The answers of the day as they are now: the setter's report, or "Oggi"'s form of that day. */
export type RisposteCommento = {
  lead_in_target: string | null
  qualita_conversazioni: string | null
  cosa_frenava: string | null
}

export const NESSUNA_RISPOSTA: RisposteCommento = { lead_in_target: null, qualita_conversazioni: null, cosa_frenava: null }

/** The three answers out of a row that has them (a report, the form's values). */
export function risposteDi(riga: {
  lead_in_target?: string | null
  qualita_conversazioni?: string | null
  cosa_frenava?: string | null
}): RisposteCommento {
  return {
    lead_in_target: riga.lead_in_target ?? null,
    qualita_conversazioni: riga.qualita_conversazioni ?? null,
    cosa_frenava: riga.cosa_frenava ?? null,
  }
}

/**
 * A decision of the setter that needs the comment first: the day is one it is
 * required on (from 08/10/2026), the report has activity after the decision
 * (`numeri`: Instagram's for a confirmation, his correction, his own for
 * "Tieni i miei") and misses one of the three answers. The database checks
 * the same (commento_da_scrivere) and refuses the decision without it.
 */
export function decisioneChiedeCommento(data: string, numeri: NumeriProposta, risposte: RisposteCommento): boolean {
  return commentoMancante({ ...numeri, ...risposte }, data)
}

/** The database refused a setter's decision for the missing comment of the day. */
export function chiedeCommento(error: { code?: string; message: string }) {
  return error.code === '22023' && /scrivi com.è andata la giornata/i.test(error.message)
}

const numeriProposta = z
  .object(Object.fromEntries(CAMPI_PROPOSTA.map((campo) => [campo, numero])) as Record<CampoProposta, typeof numero>)
  .strict()

/**
 * The admin's "Conferma" and "Conferma questi numeri": as the setter's, plus
 * the setter's own numbers of that day as the card showed them (null: none
 * written). The report is the setter's: the database compares them with his
 * report under a lock, in the transaction of the write (p_visti of
 * conferma_proposta_instagram), so numbers he wrote after the admin looked are
 * never replaced unseen.
 */
export const confermaPropostaAdminSchema = confermaPropostaSchema.extend({
  visti: numeriProposta.nullable(),
})

export type ConfermaPropostaAdminInput = z.input<typeof confermaPropostaAdminSchema>

/**
 * Our functions raise 22023/42501 with words already for people ("Questa
 * proposta è già stata confermata", "Un giorno che non è ancora arrivato non
 * si compila."); a proposal that cannot be read, or is not there any more,
 * is P0002. A policy refusal from PostgREST is not worded: the generic
 * sentence.
 */
export function messaggioProposta(error: { code?: string; message: string }, fallback: string) {
  if (error.code === 'P0002') return 'Questa proposta non c’è più.'
  if ((error.code === '22023' || error.code === '42501') && !/row-level security/i.test(error.message)) {
    return error.message.endsWith('.') ? error.message : `${error.message}.`
  }
  return fallback
}

/**
 * Recomputed after the page read it (the nightly job, "Ricalcola ieri"): the
 * confirmation is refused, and the card shows the new numbers before a new tap.
 */
export function propostaCambiata(error: { code?: string; message: string }) {
  return error.code === '22023' && /^I numeri della proposta sono cambiati/.test(error.message)
}

/** Decided by someone else (the setter, the admin, another tab or device), or not there any more. */
export function propostaChiusa(error: { code?: string; message: string }) {
  return error.code === 'P0002' || (error.code === '22023' && /^Questa proposta è già stata/.test(error.message))
}

/** At most this many cards: the nightly job proposes one day, the rest piles up only if left. */
export const PROPOSTE_MAX = 14

/**
 * The proposals of "Oggi" in one string: the ones still to decide, as the page
 * reads them (at most PROPOSTE_MAX + 1, most recent first: id and when they
 * were computed), and when the open day's proposal was decided. The page
 * computes it from what it read, the browser from the same reads when the app
 * comes back to the front: a different string, and the page is read again.
 * Null (a read that failed) never equals a list.
 */
export function firmaProposte(
  daDecidere: { id: string; calcolato_il: string }[] | null,
  decisaIl: string | null,
): string {
  return JSON.stringify([daDecidere?.map((p) => [p.id, p.calcolato_il]) ?? null, decisaIl])
}

/**
 * Before a decision on a day, the card tells "Oggi"'s form of that same day
 * to send what it still holds (a counter tapped a moment ago, a note that did
 * not save) and to stop: the form pushes the promise of that save into
 * `attese` (true: everything saved, false: the save failed, 'cambiato': the
 * report changed elsewhere meanwhile, the admin's decision or another device,
 * and the form is reading it again) and the card waits for all of them before
 * deciding, so no save of the form ever lands after the confirmation. From then on the form takes no change until the page
 * reloads it with the decided numbers; EVENTO_PROPOSTA_FINE, sent when the
 * decision did not happen, gives it back to the setter. With `rileggi` the
 * day changed in the database all the same (the proposal decided elsewhere,
 * his answers of the step saved into his report): the form reads it again,
 * since the page may not give it a new key.
 */
export const EVENTO_PROPOSTA = 'alpha:proposta-instagram'
export type DettaglioEventoProposta = { data: string; attese: Promise<boolean | 'cambiato'>[] }
export const EVENTO_PROPOSTA_FINE = 'alpha:proposta-instagram-fine'
export type DettaglioEventoPropostaFine = { data: string; rileggi?: boolean }

/**
 * Before a decision on a day, the card asks "Oggi"'s form of that same day
 * what it holds now (answers typed a moment ago, numbers not saved yet): the
 * form fills `attuale` right away (listeners run synchronously inside
 * dispatchEvent). No form of that day open: `attuale` stays empty and the card
 * goes by the report as the page read it. The step of the comment starts from
 * these answers, and the numbers say whether "Tieni i miei" leaves a day with
 * activity.
 */
export const EVENTO_COMMENTO_GIORNO = 'alpha:commento-giorno'
export type DettaglioEventoCommento = {
  data: string
  attuale?: { risposte: RisposteCommento; numeri: NumeriProposta }
}

/** "Loris", from "Loris Lo Presti": the setter on the admin's card, where space is short. */
export function primoNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] || nome
}

/** "ieri, mercoledì 07/10", "lunedì 05/10": the day of a proposal on the admin's card. */
export function giornoProposta(data: string, oggi: string): string {
  const giorno = `${nomeGiorno(data)} ${data.slice(8, 10)}/${data.slice(5, 7)}`
  return data === aggiungiGiorni(oggi, -1) ? `ieri, ${giorno}` : giorno
}

/**
 * The line on the setter's open day when someone else decided its proposal
 * (the admin, 08/10/2026): who, and what, never the proposal's numbers. A
 * confirmation with a number changed in "Correggi" (corretta, written by the
 * database) says "ha corretto": his day does not hold Instagram's numbers.
 * Null when he decided it himself, or when the person who decided is no
 * longer in the team (deciso_da emptied).
 */
export function decisaDaUnAltro(
  decisa: { stato: string; corretta: boolean; deciso_da: string | null; decisore: { nome: string } | null },
  setterId: string,
): string | null {
  if (!decisa.deciso_da || decisa.deciso_da === setterId || !decisa.decisore?.nome) return null
  const chi = decisa.decisore.nome
  if (decisa.stato === 'confermata') {
    return decisa.corretta
      ? `${chi} ha corretto i numeri di Instagram per questo giorno.`
      : `${chi} ha confermato i numeri di Instagram per questo giorno.`
  }
  if (decisa.stato === 'scartata') return `${chi} ha tenuto i tuoi numeri per questo giorno.`
  return null
}

/** Every word of the card and of its sheet. */
export const PROPOSTA = {
  regione: 'Proposte da Instagram',
  titolo: (data: string, oggi: string) => `Da Instagram · ${etichettaGiorno(data, oggi).toLowerCase()}`,
  spiegazione: 'Calcolati dai DM dell’account: controlla e conferma. Le domande della giornata restano tue.',
  prenotate: 'Discovery prenotate: le call che hai fissato nell’app quel giorno.',
  chatLette: (n: number) => (n === 1 ? '1 chat letta' : `${n} chat lette`),
  chatIncerte: (n: number) =>
    n === 1 ? '1 chat lunga: lì qualcosa può sfuggire' : `${n} chat lunghe: lì qualcosa può sfuggire`,
  tu: 'tu',
  instagram: 'Instagram',
  conferma: 'Conferma',
  correggi: 'Correggi',
  usaInstagram: 'Usa quelli di Instagram',
  tieniMiei: 'Tieni i miei',
  confermaCorretti: 'Conferma questi numeri',
  titoloFoglio: (data: string, oggi: string) => `Correggi i numeri di ${etichettaGiorno(data, oggi).toLowerCase()}`,
  descrizioneFoglio:
    'Partono da quelli di Instagram: cambia quelli che non tornano. Vanno nel tuo report di quel giorno.',
  confrontoFoglio: (instagram: string, tuo: string) => `Instagram ${instagram} · tu ${tuo}`,
  fatto: {
    conferma: (data: string, oggi: string) =>
      `Report di ${etichettaGiorno(data, oggi).toLowerCase()} compilato con i numeri di Instagram`,
    correzione: (data: string, oggi: string) =>
      `Report di ${etichettaGiorno(data, oggi).toLowerCase()} compilato con i tuoi numeri`,
    scarto: (data: string, oggi: string) =>
      `Report di ${etichettaGiorno(data, oggi).toLowerCase()}: tenuti i tuoi numeri`,
  },
  dopo: 'Le domande della giornata restano tue.',
  /** the form of the open day while the decision is on its way */
  sospeso: 'Aggiorno il report con la tua scelta…',
  /** the form's own save failed: nothing is decided over numbers not saved */
  salvaPrima: 'Prima salva il report di quel giorno: tocca Riprova qui sotto.',
  /**
   * The same in a sheet ("Correggi", the comment of the day), where the
   * form's Riprova is behind it: the next tap on the sheet's button saves the
   * form first.
   */
  salvaPrimaFoglio: (bottone: string) =>
    `Il report di quel giorno non si è salvato: controlla la connessione e tocca di nuovo «${bottone}».`,
  /** the form's save was refused: the report of that day changed elsewhere, and is read again */
  cambiatoPrima: 'Il report di quel giorno è cambiato da un’altra parte: ricontrolla i numeri e decidi di nuovo.',
  apriGiorno: 'Apri il giorno',
  altre: 'Ci sono altre proposte più vecchie: compaiono man mano che decidi queste.',
  errore: 'Le proposte da Instagram non si sono caricate.',
  riprova: 'Riprova',
} as const

/**
 * The admin's section on the "Setter" page (08/10/2026): the setters' days
 * still to decide, one card each, with the setter's name.
 */
export const DA_APPROVARE = {
  /** The anchor of the section: the notification's place on the page. */
  ancora: 'da-approvare',
  titolo: 'Tracciamento da approvare',
  descrizione:
    'Le giornate dei setter contate ogni notte dai DM di Instagram e non ancora decise. Vale la prima scelta, tua o del setter, e lui vede nel suo giorno che l’hai decisa tu.',
  finito: 'Niente più da approvare.',
  altre: 'Ci sono altre giornate più vecchie: compaiono man mano che decidi queste.',
  errore: 'Le giornate da approvare non si sono caricate.',
} as const

/** Every word of one card and of its sheet: the setter's own day, or a setter's day for the admin. */
export type ParoleScheda = {
  titolo: string
  spiegazione: string
  prenotate: string
  /** Who wrote the other numbers: "tu", or the setter's first name. */
  suoi: string
  tieni: string
  titoloFoglio: string
  descrizioneFoglio: string
  confrontoFoglio: (instagram: string, suo: string) => string
  fatto: Record<Decisione, string>
  /** Under the toast of a decision and in the sheet: what stays as it is. */
  dopo: string
  /** The toast of a discard says it too (the admin's: the setter sees who decided). */
  dopoLoScarto: boolean
}

export function paroleScheda(proposta: Pick<PropostaInstagram, 'data' | 'setter_nome'>, oggi: string, per: ChiDecide): ParoleScheda {
  const giorno = etichettaGiorno(proposta.data, oggi).toLowerCase()
  if (per === 'setter') {
    return {
      titolo: PROPOSTA.titolo(proposta.data, oggi),
      spiegazione: PROPOSTA.spiegazione,
      prenotate: PROPOSTA.prenotate,
      suoi: PROPOSTA.tu,
      tieni: PROPOSTA.tieniMiei,
      titoloFoglio: PROPOSTA.titoloFoglio(proposta.data, oggi),
      descrizioneFoglio: PROPOSTA.descrizioneFoglio,
      confrontoFoglio: PROPOSTA.confrontoFoglio,
      fatto: {
        conferma: PROPOSTA.fatto.conferma(proposta.data, oggi),
        correzione: PROPOSTA.fatto.correzione(proposta.data, oggi),
        scarto: PROPOSTA.fatto.scarto(proposta.data, oggi),
      },
      dopo: PROPOSTA.dopo,
      dopoLoScarto: false,
    }
  }
  const nome = proposta.setter_nome?.trim() || 'Setter'
  const primo = primoNome(nome)
  return {
    titolo: `${nome} · ${giornoProposta(proposta.data, oggi)}`,
    spiegazione: `Calcolati dai DM dell’account per il report di ${primo}: controlla e conferma. Vale la prima scelta, tua o sua.`,
    prenotate: `Discovery prenotate: le call che ${primo} ha fissato nell’app quel giorno.`,
    suoi: primo,
    tieni: `Tieni quelli di ${primo}`,
    titoloFoglio: `Correggi i numeri di ${primo} di ${giorno}`,
    descrizioneFoglio: `Partono da quelli di Instagram: cambia quelli che non tornano. Vanno nel report di ${primo} di quel giorno.`,
    confrontoFoglio: (instagram, suo) => `Instagram ${instagram} · ${primo} ${suo}`,
    fatto: {
      conferma: `Report di ${primo} di ${giorno} compilato con i numeri di Instagram`,
      correzione: `Report di ${primo} di ${giorno} compilato con i numeri corretti`,
      scarto: `Report di ${primo} di ${giorno}: tenuti i suoi numeri`,
    },
    dopo: `Le domande della giornata restano di ${primo}, che nel suo giorno vede che hai deciso tu.`,
    dopoLoScarto: true,
  }
}

