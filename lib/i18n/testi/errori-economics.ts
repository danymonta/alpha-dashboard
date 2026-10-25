import { SOLA_LETTURA } from '@/lib/auth/roles'
import { FRASI_FATHOM } from '@/lib/fathom/frasi'
import { LINK_INCOMPLETO } from '@/lib/fathom/link'
import { bilingue, type Bilingue, type Lingua } from '@/lib/i18n/lingua'
import { ANALISI_TESTI, FRASI_CALL_TESTI } from '@/lib/i18n/testi/analisi-call'
import { ERRORI_DRIVE_TESTI } from '@/lib/i18n/testi/clienti-fogli'
import {
  FOLLOW_UP_TESTI,
  NOTE_CALL,
  REGISTRAZIONE_TESTI,
  SPOSTA_TESTI,
  VENDITA_TESTI,
} from '@/lib/i18n/testi/esito'
import { CARTELLA_NON_TOLTA, CARTELLA_NON_TUA, ERRORE_URL_DRIVE } from '@/lib/validation/cartella'
import { CONTRATTO_NON_TOLTO, CONTRATTO_NON_TUO, ERRORE_URL_CONTRATTO } from '@/lib/validation/contratto'
import { SPOSTA_SOLO_AVANTI } from '@/lib/validation/call'
import { ERRORE_SOSPENDI_CHIUSO, ERRORE_SOSPENDI_SENZA_PERCORSO } from '@/lib/validation/sospensione'

/**
 * The fixed messages of calls, sales, clients, payments, commissions and costs in English
 * (1.53.0, the second pass), as traduciErroreTempo does for the time: the schemas of
 * lib/validation and the answers of the server actions and of the shared cores
 * (lib/call, lib/vendite, lib/clienti, lib/economics) stay Italian, because Claude (MCP) and
 * Alfire read them; the sheets translate what they show. Exact match on known sentences, a
 * few patterns for the ones with a value inside, and the original for anything else (the
 * database's own words stay Italian).
 */
export const ERRORI_ECONOMICS = bilingue(
  {
    connessione: 'Connessione assente. Riprova.',
    sessione: 'Sessione scaduta. Rientra e riprova.',
  },
  {
    connessione: 'No connection. Try again.',
    sessione: 'Session expired. Sign in again and retry.',
  },
)

const ERRORI_EN: Record<string, string> = {
  'Connessione assente. Riprova.': 'No connection. Try again.',
  'Connessione assente. Controlla la rete e riprova.': 'No connection. Check the network and try again.',
  'Sessione scaduta. Rientra e riprova.': 'Session expired. Sign in again and retry.',
  [SOLA_LETTURA]: 'Your account only reads: the admin makes this change.',
  'Dati non validi.': 'Invalid data.',
  'Richiesta non valida.': 'Invalid request.',
  'Controlla i campi evidenziati.': 'Check the highlighted fields.',
  'Operazione non consentita.': 'Operation not allowed.',
  'Operazione non riuscita. Riprova.': 'Operation failed. Try again.',
  'Operazione riservata all’admin.': 'Only the admin can do this.',
  'Questa operazione è riservata all’admin.': 'Only the admin can do this.',
  'Anteprima non disponibile. Riprova.': 'Preview not available. Try again.',
  // calls and leads
  'Call non valida': 'Invalid call',
  'Call non valida.': 'Invalid call.',
  'Call non trovata.': 'Call not found.',
  'Call non aggiornata. Riprova.': 'Call not updated. Try again.',
  'Call non eliminata. Riprova.': 'Call not deleted. Try again.',
  'Call non spostata. Riprova.': 'Call not moved. Try again.',
  'Call spostata, note non salvate. Riprova.': 'Call moved, notes not saved. Try again.',
  'Call di follow-up non fissata. Riprova.': 'Follow-up call not booked. Try again.',
  'Data salvata, dettagli no. Riprova.': 'Date saved, details not. Try again.',
  'Esito non salvato. Riprova.': 'Outcome not saved. Try again.',
  'Esito non valido.': 'Invalid outcome.',
  'L’esito lo registra chi ha fatto la call.': 'The outcome is recorded by whoever held the call.',
  'Questa call non è assegnata a te.': 'This call is not assigned to you.',
  'Le call le spostano chi le ha fissate, il closer e l’admin.': 'Calls are moved by whoever booked them, the closer and the admin.',
  'Le call le fissano il setter e l’admin.': 'Calls are booked by the setter and the admin.',
  'Non è stato possibile fissare la call. Riprova.': 'The call could not be booked. Try again.',
  'Solo l’admin elimina una call.': 'Only the admin deletes a call.',
  'Vendita o call non valida.': 'Invalid sale or call.',
  'Vendita non collegata. Riprova.': 'Sale not tied. Try again.',
  'Vendite non disponibili. Riprova.': 'Sales not available. Try again.',
  'Registrazione non salvata. Riprova.': 'Recording not saved. Try again.',
  'Registrazione non tolta. Riprova.': 'Recording not removed. Try again.',
  'Registrazione non valida.': 'Invalid recording.',
  'Claude non ha proposto un motivo per questa call.': 'Claude did not propose a reason for this call.',
  'Motivo non salvato. Riprova.': 'Reason not saved. Try again.',
  'Livello non valido.': 'Invalid level.',
  'Performance non salvata. Riprova.': 'Performance not saved. Try again.',
  'Il riassunto lo leggono il closer della call e l’admin.': 'The summary is read by the call’s closer and the admin.',
  'La trascrizione la leggono il closer della call e l’admin.': 'The transcript is read by the call’s closer and the admin.',
  'L’analisi la chiedono il closer della call e l’admin.': 'The analysis is asked for by the call’s closer and the admin.',
  'Questa call non ha una registrazione di Fathom.': 'This call has no Fathom recording.',
  'I dati del lead li corregge il setter o l’admin.': 'The lead’s details are corrected by the setter or the admin.',
  'Lead non aggiornato. Riprova.': 'Lead not updated. Try again.',
  'Lead non trovato o non tuo.': 'Lead not found or not yours.',
  'Lead non valido': 'Invalid lead',
  'Stato non valido': 'Invalid state',
  'Stato non aggiornato. Riprova.': 'State not updated. Try again.',
  'Scrivi il nome del lead': 'Write the lead’s name',
  'Handle troppo lungo': 'Handle too long',
  'Handle non valido: solo lettere, numeri, punto e trattino basso': 'Invalid handle: only letters, numbers, dot and underscore',
  'Scegli la fonte': 'Choose the source',
  'Scegli il tipo di call': 'Choose the type of call',
  'Scegli la data': 'Choose the date',
  'Scegli l’ora': 'Choose the time',
  'Scegli il closer': 'Choose the closer',
  'Scegli il setter': 'Choose the setter',
  'La data deve stare tra 7 giorni fa e 6 mesi da oggi': 'The date must be between 7 days ago and 6 months from today',
  'La data deve stare tra un anno fa e 6 mesi da oggi': 'The date must be between a year ago and 6 months from today',
  'Scegli il nuovo giorno': 'Choose the new day',
  'Scegli il nuovo giorno e l’ora': 'Choose the new day and the time',
  [SPOSTA_SOLO_AVANTI]: 'A call moves from today on: the date of a past call is corrected with the pencil',
  'Al massimo 6 mesi da oggi': '6 months from today at most',
  'Al massimo un anno indietro': 'A year back at most',
  'Indica se era qualificata': 'Say whether it was qualified',
  'Link troppo lungo': 'Link too long',
  [LINK_INCOMPLETO]: 'Paste the full link, with https://',
  'Scrivi l’importo, ad esempio 1.500': 'Write the amount, for example 1,500',
  'Importo troppo alto: controlla gli zeri': 'Amount too high: check the zeros',
  // sales and instalments
  'Vendita non valida': 'Invalid sale',
  'Vendita non valida.': 'Invalid sale.',
  'Vendita non trovata.': 'Sale not found.',
  'Vendita non registrata. Riprova.': 'Sale not recorded. Try again.',
  'Vendita non aggiornata. Riprova.': 'Sale not updated. Try again.',
  'Vendita non eliminata. Riprova.': 'Sale not deleted. Try again.',
  'Le vendite le registra chi le chiude.': 'Sales are recorded by whoever closes them.',
  'Questa call ha già una vendita registrata.': 'This call already has a recorded sale.',
  'Rata non valida': 'Invalid instalment',
  'Rata non valida.': 'Invalid instalment.',
  'Rata non trovata o già da incassare.': 'Instalment not found or already to collect.',
  'Rata non aggiunta. Riprova.': 'Instalment not added. Try again.',
  'Rata non eliminata. Riprova.': 'Instalment not deleted. Try again.',
  'Rata non modificata. Riprova.': 'Instalment not changed. Try again.',
  'Incasso non registrato. Riprova.': 'Payment not recorded. Try again.',
  'Incasso non modificato. Riprova.': 'Payment not changed. Try again.',
  'Rimborso non registrato. Riprova.': 'Refund not recorded. Try again.',
  'Si corregge solo una rata già incassata.': 'Only an instalment already collected can be corrected.',
  'Si modifica solo una rata ancora da incassare.': 'Only an instalment still to collect can be changed.',
  'Solo una rata da incassare può fallire.': 'Only an instalment to collect can fail.',
  'Percorso non interrotto. Riprova.': 'Programme not stopped. Try again.',
  'Scegli l’ultimo giorno': 'Choose the last day',
  'Aggiungi almeno una rata': 'Add at least one instalment',
  'Almeno una rata': 'At least one instalment',
  'Al massimo 60 rate': '60 instalments at most',
  'Data non valida': 'Invalid date',
  'Email non valida': 'Invalid email',
  'Handle non valido': 'Invalid handle',
  'Numero troppo lungo': 'Number too long',
  'Telefono non valido': 'Invalid phone',
  'Indica quando finisce il percorso': 'Say when the programme ends',
  'La data della vendita non può essere nel futuro': 'The sale date cannot be in the future',
  'La fine viene dopo l’inizio': 'The end comes after the start',
  'L’inizio del rinnovo deve cadere entro un anno dalla vendita': 'The renewal must start within a year of the sale',
  'L’inizio deve cadere entro tre mesi dalla vendita': 'The start must fall within three months of the sale',
  'Rinnovo e upsell richiedono un cliente esistente': 'Renewals and upsells need an existing client',
  'Scegli il prodotto': 'Choose the product',
  'Scegli il tipo di vendita': 'Choose the type of sale',
  'Scegli il numero di rate': 'Choose the number of instalments',
  'Scegli la scadenza': 'Choose the due date',
  'Scrivi cosa hai venduto, ad esempio Annuale': 'Write what you sold, for example Yearly',
  'Scrivi il nome del cliente': 'Write the client’s name',
  'Scrivi il valore del contratto, ad esempio 1.500': 'Write the contract value, for example 1,500',
  'Scrivi un importo, ad esempio 500': 'Write an amount, for example 500',
  'Scrivi un importo, ad esempio 800 o 800,50': 'Write an amount, for example 800 or 800.50',
  'Un incasso non può essere nel futuro': 'A payment cannot be in the future',
  'Un rimborso non può essere nel futuro': 'A refund cannot be in the future',
  // clients
  'Cliente non valido': 'Invalid client',
  'Cliente non valido.': 'Invalid client.',
  'Cliente non aggiornato. Riprova.': 'Client not updated. Try again.',
  'Cliente non archiviato. Riprova.': 'Client not archived. Try again.',
  'Cliente non chiuso. Riprova.': 'Client not closed. Try again.',
  'Cliente non creato. Riprova.': 'Client not created. Try again.',
  'Cliente non eliminato. Riprova.': 'Client not deleted. Try again.',
  'Cliente non riaperto. Riprova.': 'Client not reopened. Try again.',
  'Cliente non riattivato. Riprova.': 'Client not reactivated. Try again.',
  'Cliente non sospeso. Riprova.': 'Client not put on hold. Try again.',
  'Cliente non tolto dall’archivio. Riprova.': 'Client not taken out of the archive. Try again.',
  'Cliente non trovato: ricarica la pagina.': 'Client not found: reload the page.',
  'Il cliente non è chiuso: non c’è niente da togliere dall’archivio.': 'The client is not closed: there is nothing to take out of the archive.',
  'Il cliente non è chiuso: prima «Non rinnova», poi l’archivio.': 'The client is not closed: first «Not renewing», then the archive.',
  'Il cliente non è più chiuso: ricarica la pagina.': 'The client is no longer closed: reload the page.',
  'Il cliente non è sospeso (forse l’hai già riattivato): ricarica la pagina.':
    'The client is not on hold (maybe you already reactivated them): reload the page.',
  'Nel frattempo la chiusura è cambiata: l’archivio resta com’è. Ricarica la pagina.':
    'Meanwhile the closure changed: the archive stays as it is. Reload the page.',
  [ERRORE_SOSPENDI_CHIUSO]: 'The client is closed: first «Reopen», then you can put them on hold.',
  [ERRORE_SOSPENDI_SENZA_PERCORSO]: 'The client has no programme yet: there is nothing to put on hold.',
  'Il giorno non può essere nel futuro': 'The day cannot be in the future',
  'Scegli il giorno': 'Choose the day',
  'Versione non valida': 'Invalid version',
  'Scrivi il nome': 'Write the name',
  'Link non salvato. Riprova.': 'Link not saved. Try again.',
  'Link non tolto. Riprova.': 'Link not removed. Try again.',
  'Incolla il link della cartella': 'Paste the folder link',
  'Incolla il link del contratto': 'Paste the contract link',
  [ERRORE_URL_DRIVE]: 'Paste the link of a Google Drive folder (https://drive.google.com/…)',
  [CARTELLA_NON_TUA]: 'The Drive folder link is changed only by the admin and the client’s coach.',
  [CARTELLA_NON_TOLTA]: 'The link is no longer there or you can no longer remove it: reload the page.',
  [ERRORE_URL_CONTRATTO]: 'Paste the link of the contract on Google Drive (https://drive.google.com/…)',
  [CONTRATTO_NON_TUO]: 'Only the admin changes the contract link.',
  [CONTRATTO_NON_TOLTO]: 'The link is no longer there: reload the page.',
  // commissions and costs
  'Pagamento non valido': 'Invalid payment',
  'Pagamento non valido.': 'Invalid payment.',
  'Pagamento non trovato.': 'Payment not found.',
  'Pagamento non registrato. Riprova.': 'Payment not recorded. Try again.',
  'Pagamento non aggiornato. Riprova.': 'Payment not updated. Try again.',
  'Pagamento non eliminato. Riprova.': 'Payment not deleted. Try again.',
  'Collaboratore non valido': 'Invalid team member',
  'Scegli il mese a cui si riferisce': 'Choose the month it refers to',
  'Scrivi l’importo pagato': 'Write the amount paid',
  'Un pagamento non può essere nel futuro': 'A payment cannot be in the future',
  'Mese non valido.': 'Invalid month.',
  'Costo non valido': 'Invalid cost',
  'Costo non valido.': 'Invalid cost.',
  'Costo non trovato.': 'Cost not found.',
  'Costo non salvato. Riprova.': 'Cost not saved. Try again.',
  'Costo non aggiornato. Riprova.': 'Cost not updated. Try again.',
  'Costo non eliminato. Riprova.': 'Cost not deleted. Try again.',
  'Copia non riuscita. Riprova.': 'Copy failed. Try again.',
  'Scegli la categoria': 'Choose the category',
  'Scrivi a cosa si riferisce': 'Write what it refers to',
  'Scrivi l’importo, ad esempio 89': 'Write the amount, for example 89',
  'L’importo deve essere positivo': 'The amount must be positive',
  'Un costo non può essere nel futuro': 'A cost cannot be in the future',
  'Regola non trovata.': 'Rule not found.',
  // Fathom's fixed sentences
  [FRASI_FATHOM.chiave]: 'Fathom’s key no longer works: the admin changes it in Settings › Fathom.',
  [FRASI_FATHOM.non_trovata]: 'Fathom does not give this recording: it was deleted, or it is private to another account.',
  [FRASI_FATHOM.limite]: 'Fathom asks to slow down: try again shortly.',
  [FRASI_FATHOM.rete]: 'Fathom is not answering: try again later.',
  [FRASI_FATHOM.formato]: 'Fathom answered in a way the app does not know: try again later.',
  [FRASI_FATHOM.non_collegato]: 'Fathom is not connected: the admin pastes the key in Settings › Fathom.',
}

/** Every Italian sentence of a dictionary paired with its English one, by the same path. */
function coppie(dizionario: Bilingue<unknown>, fuori: Record<string, string>): void {
  const giro = (it: unknown, en: unknown) => {
    if (typeof it === 'string' && typeof en === 'string') {
      if (!(it in fuori)) fuori[it] = en
      return
    }
    if (it && en && typeof it === 'object' && typeof en === 'object') {
      for (const k of Object.keys(it)) giro((it as Record<string, unknown>)[k], (en as Record<string, unknown>)[k])
    }
  }
  giro(dizionario.it, dizionario.en)
}

const NOTI: Record<string, string> = { ...ERRORI_EN }
for (const d of [
  SPOSTA_TESTI,
  FOLLOW_UP_TESTI,
  VENDITA_TESTI,
  REGISTRAZIONE_TESTI,
  NOTE_CALL,
  FRASI_CALL_TESTI,
  ANALISI_TESTI,
  ERRORI_DRIVE_TESTI,
] as Bilingue<unknown>[]) {
  coppie(d, NOTI)
}

const AL_MASSIMO = /^Al massimo (\d+) (caratteri|rate|mesi)$/
const DOPO_LA_CALL = /^La call di follow-up viene dopo la call di partenza, del (.+): scegli un giorno e un'ora dopo$/
const NON_FISSATA = /^Esito salvato, ma la call di follow-up non è fissata: (.+)$/

/** A fixed message of the area in the page's language; an unknown one stays as it came. */
export function traduciErrore(testo: string, lingua: Lingua): string
export function traduciErrore(testo: string | null | undefined, lingua: Lingua): string | undefined
export function traduciErrore(testo: string | null | undefined, lingua: Lingua): string | undefined {
  if (!testo) return testo ?? undefined
  if (lingua === 'it') return testo
  const noto = NOTI[testo]
  if (noto) return noto
  let m = AL_MASSIMO.exec(testo)
  if (m) {
    const cosa = m[2] === 'caratteri' ? 'characters' : m[2] === 'rate' ? 'instalments' : 'months'
    return `${m[1]} ${cosa} at most`
  }
  m = DOPO_LA_CALL.exec(testo)
  if (m) return FOLLOW_UP_TESTI.en.dopoLaCall(m[1].replace(' alle ', ' at '))
  m = NON_FISSATA.exec(testo)
  if (m) return FOLLOW_UP_TESTI.en.nonFissata(traduciErrore(m[1], lingua))
  return testo
}

/** The answer of an action with its error in the page's language (for Elimina and the sheets). */
export function tradotto<T extends { ok: boolean }>(esito: T, lingua: Lingua): T {
  if (lingua === 'it' || esito.ok || !('errore' in esito) || typeof esito.errore !== 'string') return esito
  return { ...esito, errore: traduciErrore(esito.errore, lingua) }
}
