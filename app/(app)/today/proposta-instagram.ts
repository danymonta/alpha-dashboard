import { z } from 'zod'

import { etichettaGiorno } from '@/lib/date'
import { GRUPPI_REPORT, MASSIMO_GIORNALIERO, type CampoNumericoReport } from '@/lib/validation/report'

/**
 * The setter's report proposed from the Instagram DMs (Dany, 08/10/2026):
 * every night the numbers of the day just ended are worked out from the DMs
 * of the account, and only the setter sees them, in "Oggi", to confirm,
 * correct or leave (CLAUDE.md section 17 as changed that day: the report
 * stays his own statement, the system only proposes the totals he already
 * states, and his choice always wins). The answers of "Com’è andata la
 * giornata" stay his: the proposal never touches them.
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
}

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

/** At most this many cards: the nightly job proposes one day, the rest piles up only if left. */
export const PROPOSTE_MAX = 14

/**
 * Before a decision on a day, the card tells "Oggi"'s form of that same day
 * to send what it still holds (a counter tapped a moment ago, a note that did
 * not save) and to stop: the form pushes the promise of that save into
 * `attese` (true: everything saved, false: the save failed) and the card waits
 * for all of them before deciding, so no save of the form ever lands after
 * the confirmation. From then on the form takes no change until the page
 * reloads it with the decided numbers; EVENTO_PROPOSTA_FINE, sent when the
 * decision did not happen, gives it back to the setter.
 */
export const EVENTO_PROPOSTA = 'alpha:proposta-instagram'
export type DettaglioEventoProposta = { data: string; attese: Promise<boolean>[] }
export const EVENTO_PROPOSTA_FINE = 'alpha:proposta-instagram-fine'
export type DettaglioEventoPropostaFine = { data: string }

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
   * The same in the "Correggi" sheet, where the form's Riprova is behind the
   * sheet: the next tap on "Conferma questi numeri" saves the form first.
   */
  salvaPrimaFoglio:
    'Il report di quel giorno non si è salvato: controlla la connessione e tocca di nuovo «Conferma questi numeri».',
  apriGiorno: 'Apri il giorno',
  altre: 'Ci sono altre proposte più vecchie: compaiono man mano che decidi queste.',
  errore: 'Le proposte da Instagram non si sono caricate.',
  riprova: 'Riprova',
} as const
