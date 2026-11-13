import { bilingue, type Lingua } from '@/lib/i18n/lingua'
import { FRASI_FOGLIO } from '@/lib/percorso/frasi-foglio'

/**
 * The card «Google Sheets» of Impostazioni › Chiavi e collegamenti (1.82.0): the service account
 * that writes the onboarding questionnaires on Dany's sheet.
 */
export const FOGLIO_GOOGLE = bilingue(
  {
    titolo: 'Google Sheets (questionari dell’onboarding)',
    collegato: (email: string) => `Collegato: ${email}`,
    nonCollegato: 'Non collegato: i questionari restano solo nell’app.',
    errore: 'Ultima scrittura non riuscita',
    account: 'Indirizzo del service account',
    copia: 'Copia l’indirizzo',
    copiato: 'Indirizzo copiato: incollalo come Editor nel foglio.',
    condividi: 'Il foglio va condiviso come Editor con questo indirizzo.',
    righe: (scritte: number, attesa: number) =>
      `${scritte === 1 ? '1 riga scritta' : `${scritte} righe scritte`} · ${attesa === 1 ? '1 in attesa' : `${attesa} in attesa`}`,
    ultima: (quando: string) => `Ultima scrittura ${quando}.`,
    campoFile: 'File della chiave (.json)',
    aiutoFile: 'Il file scaricato da Google Cloud › Account di servizio › Chiavi. Si salva nel Vault e non si mostra più.',
    nuovoFile: 'Nuovo file della chiave (.json)',
    scegli: 'Scegli il file .json scaricato da Google Cloud.',
    salva: 'Salva la chiave',
    togli: 'Togli la chiave',
    conferma: 'Tocca di nuovo per togliere',
    salvataProvata: 'Chiave salvata: Google risponde e il foglio è condiviso.',
    salvataNonProvata: 'Chiave salvata, ma la prova non è riuscita: guarda l’errore qui sopra.',
    tolta: 'Chiave tolta: i questionari restano nell’app e in coda per il foglio.',
    foglio: 'Foglio',
    idFoglio: 'ID o link del foglio',
    aiutoId: 'Il link del foglio va bene: l’app tiene solo l’ID.',
    scheda: 'Nome della scheda',
    salvaFoglio: 'Salva il foglio',
    foglioSalvato: 'Foglio salvato.',
    apri: 'Apri il foglio',
    scriviOra: 'Scrivi ora sul foglio',
    scritto: (scritte: number, svuotate: number, errori: number) =>
      errori > 0
        ? `Fatto in parte: ${scritte} scritte, ${svuotate} cancellate, ${errori} non riuscite (riprovo più tardi).`
        : scritte + svuotate === 0
          ? 'Niente da scrivere: il foglio è aggiornato.'
          : `Fatto: ${scritte === 1 ? '1 riga scritta' : `${scritte} righe scritte`}${svuotate > 0 ? `, ${svuotate} cancellate` : ''}.`,
    nota: 'Sul foglio vanno le risposte del questionario (anche quelle sulla salute, con il consenso del cliente), nelle colonne A-AC, e un codice in AH che ritrova la riga. Le colonne AD-AG (pagamento, rinnovo, somma, note) restano del team: l’app non le tocca mai. I file restano nell’app.',
  },
  {
    titolo: 'Google Sheets (onboarding questionnaires)',
    collegato: (email: string) => `Connected: ${email}`,
    nonCollegato: 'Not connected: the questionnaires stay only in the app.',
    errore: 'Last write failed',
    account: 'Address of the service account',
    copia: 'Copy the address',
    copiato: 'Address copied: paste it as Editor in the sheet.',
    condividi: 'The sheet must be shared as Editor with this address.',
    righe: (scritte: number, attesa: number) =>
      `${scritte === 1 ? '1 row written' : `${scritte} rows written`} · ${attesa} waiting`,
    ultima: (quando: string) => `Last write ${quando}.`,
    campoFile: 'Key file (.json)',
    aiutoFile: 'The file downloaded from Google Cloud › Service accounts › Keys. It is saved in the Vault and never shown again.',
    nuovoFile: 'New key file (.json)',
    scegli: 'Choose the .json file downloaded from Google Cloud.',
    salva: 'Save the key',
    togli: 'Remove the key',
    conferma: 'Tap again to remove',
    salvataProvata: 'Key saved: Google answers and the sheet is shared.',
    salvataNonProvata: 'Key saved, but the test failed: see the error above.',
    tolta: 'Key removed: the questionnaires stay in the app and queued for the sheet.',
    foglio: 'Sheet',
    idFoglio: 'ID or link of the sheet',
    aiutoId: 'The link of the sheet is fine: the app keeps only the ID.',
    scheda: 'Name of the tab',
    salvaFoglio: 'Save the sheet',
    foglioSalvato: 'Sheet saved.',
    apri: 'Open the sheet',
    scriviOra: 'Write to the sheet now',
    scritto: (scritte: number, svuotate: number, errori: number) =>
      errori > 0
        ? `Partly done: ${scritte} written, ${svuotate} cleared, ${errori} failed (retrying later).`
        : scritte + svuotate === 0
          ? 'Nothing to write: the sheet is up to date.'
          : `Done: ${scritte === 1 ? '1 row written' : `${scritte} rows written`}${svuotate > 0 ? `, ${svuotate} cleared` : ''}.`,
    nota: 'The questionnaire answers go on the sheet (health ones too, with the client’s consent), in columns A-AC, with a code in AH that finds the row again. Columns AD-AG (payment, renewal, sum, notes) stay the team’s: the app never touches them. Files stay in the app.',
  },
)

const ERRORI_EN: Record<string, string> = {
  [FRASI_FOGLIO.senzaChiave]: 'The Google service account key is missing: upload it in Settings › Keys and connections.',
  [FRASI_FOGLIO.chiave]: 'Google refused the service account key: upload a new one.',
  [FRASI_FOGLIO.permesso]: 'Google does not let the app write on the sheet: share it as Editor with the address of the service account.',
  [FRASI_FOGLIO.nonTrovato]: 'The sheet or its tab cannot be found: check the sheet ID and the tab name.',
  [FRASI_FOGLIO.rete]: 'Google did not answer: retrying later.',
  [FRASI_FOGLIO.risposta]: 'Google gave an answer that cannot be read: retrying later.',
  'Questo non è il file JSON di un service account: scaricalo di nuovo da Google Cloud.':
    'This is not the JSON file of a service account: download it again from Google Cloud.',
  'L’ID del foglio non è valido: incolla il link del foglio.': 'The sheet ID is not valid: paste the link of the sheet.',
  'Il nome della scheda non è valido.': 'The tab name is not valid.',
}

export function traduciErroreFoglio(testo: string, lingua: Lingua): string {
  return lingua === 'en' ? (ERRORI_EN[testo] ?? testo) : testo
}
