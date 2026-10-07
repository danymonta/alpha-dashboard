import { quandoBreve } from '@/lib/call/spostamento'
import { formatOra, nomeGiorno, oggiRoma } from '@/lib/date'
import { formatData } from '@/lib/format'

/**
 * The follow-up call (Dany, 07/10/2026: "quando apro follow up dovrebbe
 * chiedermi se ho fissato una call o meno di follow up, se sì inserire la data
 * della call di follow up"). A held call that ends in follow-up goes on by
 * chat, or has a follow-up call booked on a day: a NEW call, linked to the
 * first one (calls.follow_up_di, public.fissa_follow_up), with the same lead,
 * setter, closer and type. If it closes, the sale is still the setter's (and
 * so is the commission). It counts in the closer's numbers like every call;
 * it is not one of the setter's bookings.
 *
 * The words of the outcome sheet, the card, the "Fissa la call di follow-up"
 * sheet and the closed call without its sale live here: a word changes here.
 * The ones the database also says (fissa_follow_up) are the same, apostrophes
 * included: tests/follow-up.test.ts compares them.
 */
export const FOLLOW_UP = {
  etichetta: 'Follow-up',
  /** The outcome sheet, after the tap on "Follow-up". */
  domanda: 'Hai fissato una call di follow-up?',
  si: 'Sì, call fissata',
  no: 'No, follow-up in chat',
  quando: 'Quando è la call di follow-up?',
  /** Under the day and time: whose sale a close on the follow-up call is. */
  stessoSetter: (setter: string) => `Stesso lead e stesso setter: se chiude, la vendita resta di ${setter}`,
  senzaSetter: 'Stesso lead e stesso closer di questa call: la trovi nel suo giorno, da fare',
  avanti: 'Avanti',
  /** On top of the reason step: the choice made, with the way back. */
  sceltaCall: (quando: string) => `Follow-up · call ${quando}`,
  inChat: 'Follow-up in chat',
  cambia: 'cambia',
  giaFissata: (quando: string) => `Call di follow-up già fissata: ${quando}`,
  /** In place of its day, when it was handed to another closer (RLS hides it from this one). */
  assegnataAltroCloser: 'assegnata a un altro closer',
  /** The card of the first call. */
  diCall: (quando: string) => `Call di follow-up: ${quando}`,
  /** The card of the first call, its follow-up handed to another closer: never its day, no button. */
  diAltroCloser: 'Call di follow-up fissata, assegnata a un altro closer',
  /** The card of the follow-up call: the call it follows up. */
  della: (quando: string) => `Follow-up della call del ${quando}`,
  /**
   * Its first call is not readable (handed to another closer) or was deleted:
   * the follow-up call keeps its mark (calls.di_follow_up) without the link.
   */
  dellaSenzaData: 'Follow-up di una call precedente',
  /** "Fissa la call di follow-up": the card of a held call in follow-up without one. */
  bottone: 'Fissa la call di follow-up',
  nomeBottone: (lead: string) => `Fissa la call di follow-up con ${lead}`,
  titolo: (lead: string) => `Call di follow-up con ${lead}`,
  descrizione:
    'Una call nuova nel giorno scelto, da fare: stesso lead, stesso setter e stesso closer. Conta nei numeri del closer come ogni call.',
  salva: 'Fissa la call di follow-up',
  fatto: (lead: string) => `${lead}: call di follow-up fissata`,
  /** The outcome is saved, the follow-up call is not: a warning, never a sheet left open to repeat. */
  nonFissata: (motivo: string) => `Esito salvato, ma la call di follow-up non è fissata: ${motivo}`,
  /** Under that warning, only when booking it again from the card can work (not when the call already has one). */
  riprova: 'Fissala dalla scheda della call con «Fissa la call di follow-up».',
  /** How every «the call already has its follow-up call» of public.fissa_follow_up starts. */
  giaPresente: 'Questa call ha già la sua call di follow-up',
  conPersa: 'Una call persa non ha una call di follow-up: per fissarla scegli Follow-up',
  /** The same words as public.fissa_follow_up. */
  manca: "Scegli il giorno e l'ora della call di follow-up",
  soloAvanti: 'Una call di follow-up si fissa da oggi in avanti',
  dopoLaCall: (quando: string) =>
    `La call di follow-up viene dopo la call di partenza, del ${quando}: scegli un giorno e un'ora dopo`,
  soloSuFollowUp: 'La call di follow-up si fissa su una call svolta finita in follow-up.',
  chiPuo: "La call di follow-up la fissano il closer della call e l'admin.",
  /** The follow-up handed to another closer: the first call's closer no longer reads it. */
  altroCloser: 'Questa call ha già la sua call di follow-up, assegnata a un altro closer.',
  /** As in fissa_call: whoever runs the call must be able to close it. */
  closerNonAttivo: 'Il closer di questa call non è attivo o non può chiudere: cambialo prima con la matita',
} as const

/**
 * A closed call without its sale (Dany, 07/10/2026: "il valore delle call
 * chiuse lo devi prendere direttamente quando registro l'esito della call"):
 * "Chiusa" already opens the prefilled sale; this is the net under it, for the
 * call's closer and the admin. The sale takes the call's setter
 * (registra_vendita), so his commission is never lost.
 */
export const VENDITA_DA_REGISTRARE = {
  etichetta: 'Vendita da registrare',
  bottone: 'Registra la vendita',
  nomeBottone: (lead: string) => `Registra la vendita di ${lead}`,
  sezione: 'Vendita da registrare',
  descrizioneSezione:
    'Call chiuse senza la loro vendita: registrala, così cash e revenue della call entrano nei numeri e la provvigione va al setter.',
  /**
   * The closer: the sale may be there already, registered without the call
   * (Vendite, Alfire); only the admin ties it, and «Registra la vendita» would
   * make a second one.
   */
  chiediAdmin: 'La vendita c’è già? Chiedi all’admin di collegarla alla call: «Registra la vendita» ne farebbe una seconda.',
  /**
   * The admin ties a sale registered without the call (Vendite, Alfire) to
   * it (public.collega_vendita_call): never a second sale for the same money.
   * The button's name starts with its visible words (WCAG 2.5.3).
   */
  collega: 'La vendita c’è già: collegala',
  nomeCollega: (lead: string) => `La vendita c’è già: collegala alla call di ${lead}`,
  titoloCollega: (lead: string) => `Vendita di ${lead}`,
  descrizioneCollega:
    'Le vendite registrate senza la call: prima quelle di un cliente col nome o l’handle del lead, poi quelle firmate entro un mese dalla call. Collegata, la call non chiede più la vendita; setter, closer e importi restano quelli della vendita.',
  stessoCliente: 'Stesso nome o handle del lead',
  nessuna: 'Nessuna vendita senza call di questo lead né firmata entro un mese dalla call: se non c’è, registrala.',
  bottoneCollega: 'Collega',
  /** Two sales of the same client stay apart: type, day and amount in the name (dettaglio: «Nuovo cliente del 07/10/2026, 1.500,00 €»). */
  nomeBottoneCollega: (cliente: string, dettaglio: string) => `Collega la vendita di ${cliente}: ${dettaglio}`,
  collegata: (lead: string) => `${lead}: vendita collegata alla call`,
  soloAdmin: "La vendita la collega alla call solo l'admin.",
  /**
   * The new sale of a closed call (/sales/new?call=), when a sale without a call
   * of a client with the lead's name or handle was signed within a month of it.
   */
  giaRegistrataTitolo: 'Questa vendita sembra già registrata',
  giaRegistrataTesto:
    'C’è già una vendita senza call di un cliente col nome o l’handle del lead, firmata entro un mese dalla call. Se è questa, non registrarne un’altra: cash, revenue e provvigione conterebbero due volte.',
  giaRegistrataAdmin: 'Collegala alla call; se è un’altra vendita, registrala qui sotto.',
  giaRegistrataCloser: 'Chiedi all’admin di collegarla alla call; se è un’altra vendita, registrala qui sotto.',
  apriVendita: 'Apri la vendita',
  nomeApriVendita: (cliente: string, dettaglio: string) => `Apri la vendita di ${cliente}: ${dettaglio}`,
} as const

/** «Nuovo cliente del 07/10/2026, 1.500,00 €»: what tells two sales of the same client apart. */
export function dettaglioVendita(tipo: string, data: string, importo: string): string {
  return `${tipo} del ${data}, ${importo}`
}

/** The days a sale without its call may be from the call and still look like its own (public.vendite_da_collegare). */
export const GIORNI_VENDITA_VICINA = 31

/**
 * The calls that ask for their sale: closed, without a sale, and not imported.
 * The calls imported from Dany's call sheet (scripts/import-prospect.ts) carry
 * calls.importata: their sales came from the Excel, without the call, and a
 * second sale would count the money twice. A mark, never the missing author:
 * elimina_persona empties created_by too, and the calls of a deleted setter
 * keep asking. Whether the sale is there comes from public.call_ha_vendita
 * (the closer does not read a sale of his call that carries another closer),
 * and only when it was read (the closer's and the admin's query): false asks,
 * true and null (not read) never do; the same for importata.
 */
export function chiedeVendita(call: {
  esito: string | null
  importata?: boolean | null
  ha_vendita?: boolean | null
}): boolean {
  return call.esito === 'chiusa' && call.importata === false && call.ha_vendita === false
}

/** "giovedì 08/10 alle 18:00" (the year too outside the current one): a day the closer can't misread. */
export function quandoFollowUpDa(giorno: string, ora: string, oggi: string = oggiRoma()): string {
  const [anno, mese, gg] = giorno.split('-')
  const data = anno === oggi.slice(0, 4) ? `${gg}/${mese}` : `${gg}/${mese}/${anno}`
  return `${nomeGiorno(giorno)} ${data} alle ${ora}`
}

/** The same from a timestamptz, in Europe/Rome. */
export function quandoFollowUp(istante: string, oggi: string = oggiRoma()): string {
  const d = new Date(istante)
  return quandoFollowUpDa(oggiRoma(d), formatOra(d), oggi)
}

/** "Follow-up della call del 29/09 alle 19:00", or without its day when the first call can't be read. */
export function rigaFollowUpDi(partenza: { programmata_il: string } | null | undefined, oggi: string = oggiRoma()): string {
  return partenza ? FOLLOW_UP.della(quandoBreve(partenza.programmata_il, oggi)) : FOLLOW_UP.dellaSenzaData
}

/**
 * The follow-up call comes after the first one (public.fissa_follow_up): null
 * when it does, otherwise the database's words. Wall-clock Europe/Rome on both
 * sides, so the strings compare as moments.
 */
export function erroreFollowUpPrimaDellaCall(
  data: string,
  ora: string,
  giornoCall: string,
  oraCall: string,
): string | null {
  return `${data}T${ora}` > `${giornoCall}T${oraCall}` ? null : FOLLOW_UP.dopoLaCall(`${formatData(giornoCall)} alle ${oraCall}`)
}
