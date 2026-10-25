import { GUIDE_CHIAVI, NON_IN_CHAT, type ChiaveId, type GuidaChiave } from '@/lib/impostazioni/chiavi'
import { bilingue } from '@/lib/i18n/lingua'
import { fraseScadePresto } from '@/lib/instagram/stato-token'

/**
 * Impostazioni › Chiavi e collegamenti (1.38.0) in the two languages: the page, the state
 * of every key and the step-by-step guides. The Italian guides are those of
 * lib/impostazioni/chiavi.ts, untouched (tests/chiavi.test.ts reads them); Meta, Fathom,
 * Anthropic, Groq and Vercel are named as their own English menus call them.
 */

const GUIDE_EN: Record<ChiaveId, GuidaChiave> = {
  instagram: {
    id: 'instagram',
    titolo: 'Instagram',
    aCosaServe: 'It reads the account’s DMs for the setter’s report and for the Insight, and the posts and reels for the content calendar.',
    passi: [
      'Open developers.facebook.com › My Apps › Alpha DM Reader.',
      'In the menu on the left go to Instagram › API setup with Instagram business login.',
      'At «1. Generate access tokens» tap «Generate token» next to @_danymonta. If Instagram asks, sign in with the account and allow.',
      'Copy the token that appears.',
      'There must be three permissions: instagram_business_basic, instagram_business_manage_messages and instagram_business_manage_insights. The third (the posts’ statistics) is enabled in App Review › Permissions and features, with Standard access. Without it the DMs and the posts work all the same, but views, saves and shares are missing.',
    ],
    doveIncollarla: 'In the «Access token» field below, then «Save the token». Spaces, line breaks or quotes are fine: the app cleans it.',
    comeCapireCheFunziona:
      'Below appears «Saved, expires on …» with the date. Then, in Instagram and Messenger, «Recalculate yesterday» reads yesterday’s DMs again and says how many chats it read.',
    seScade:
      'The token lasts 60 days and the app renews it on its own every week. If it does not manage to, or if Meta refuses it (for example after the account’s password changes), from 7 days before the expiry you see the warning here and on the day itself it turns red: the DMs, the Insight and the posts stop until you paste a new token. Repeat the steps above.',
  },
  messenger: {
    id: 'messenger',
    titolo: 'Messenger',
    aCosaServe: 'It reads the Messenger chats of the Percorso Alpha Facebook Page for the Insight. It never sends messages.',
    passi: [
      'Open developers.facebook.com › My Apps › Alpha DM Reader.',
      'In the menu on the left go to Messenger › API settings.',
      'In the access tokens part, next to the Percorso Alpha Facebook Page, tap «Generate token» and allow.',
      'Copy the Page token.',
    ],
    doveIncollarla: 'In the «Page token» field below, then «Connect the Page»: the app tries it on Meta before saving it.',
    comeCapireCheFunziona:
      'Below appears «Connected: Page «…»» and the day the token was saved. If Meta refuses it, nothing is saved and the page says so.',
    seScade:
      'If the token stops working, the Messenger chats no longer reach the Insight and its tab says «Messenger not connected». Generate a new token as above and paste it again.',
  },
  fathom: {
    id: 'fathom',
    titolo: 'Fathom',
    aCosaServe: 'It finds a call’s recording from the link the closer pastes and reads its transcript and summary, for Claude’s analysis.',
    passi: [
      'Open Fathom and go to My Settings › API Access.',
      'Tap «Generate Api Key».',
      'Copy the key. No webhook is needed.',
      'On Fathom, still in My Settings, turn off the use of the account’s data to improve their models; in link sharing choose «Only people added».',
    ],
    doveIncollarla: 'In the «API key» field below, then «Save the key».',
    comeCapireCheFunziona:
      'The app tries the key right away and writes «Fathom answers with this key.». In the state appears «Fathom is connected» with the day it was saved.',
    seScade:
      'If the key is revoked or no longer valid, the state shows the last error. The link pasted in the outcome sheet is saved all the same, but without a key no recordings are found and no calls are analysed. Generate a new one and paste it again.',
  },
  anthropic: {
    id: 'anthropic',
    titolo: 'Claude (Anthropic)',
    aCosaServe: 'It makes the Insight of the last 24 hours, the reel analysis, the call analysis and the Marketing Ideas.',
    passi: [
      'Open console.anthropic.com › API Keys and tap «Create Key». The key is shown only once: copy it right away.',
      'Open Vercel › the project › Settings › Environment Variables.',
      'Look for ANTHROPIC_API_KEY (Production): tap Edit, paste the new key and Save. If it is not there, add it with that name.',
      'Go to Deployments, open the latest deploy and tap Redeploy: new variables apply from the next deploy.',
      'In console.anthropic.com › Settings › Limits check the monthly spending limit.',
    ],
    doveIncollarla:
      'Only on Vercel, in the ANTHROPIC_API_KEY variable. The app has no field to paste it into and never shows it: here you only see whether it is there.',
    comeCapireCheFunziona:
      'Above, the state becomes «Present on Vercel». Then in Insight › «Refresh data» the recap starts without saying the key is missing.',
    seScade:
      'If the key is missing or revoked, the Insight, the reel and call analyses and the Ideas stop and say so on their pages; the jobs stay in the queue and start again after the new key.',
  },
  groq: {
    id: 'groq',
    titolo: 'Groq (Alfire and voice)',
    aCosaServe: 'It runs Alfire (the chat and the voice messages, with Whisper) and transcribes the reels’ speech for the analysis.',
    passi: [
      'Open console.groq.com › API Keys and tap «Create API Key». Copy it right away: it is shown only once.',
      'Open Vercel › the project › Settings › Environment Variables.',
      'Look for ALFIRE_API_KEY (Production): tap Edit, paste the new key and Save. If it is not there, add it with that name.',
      'In Deployments open the latest deploy and tap Redeploy.',
    ],
    doveIncollarla:
      'Only on Vercel, in the ALFIRE_API_KEY variable. The app has no field to paste it into and never shows it: here you only see whether it is there.',
    comeCapireCheFunziona:
      'Above, the state becomes «Present on Vercel»; Alfire answers and the microphone transcribes. For Alfire to work as a full agent you need the Developer plan on console.groq.com: nothing changes on Vercel.',
    seScade:
      'Without the key Alfire is off and says what is missing; in the reel analysis the speech is not transcribed and Claude sees only the frames.',
  },
}

export const CHIAVI = bilingue(
  {
    errore: 'Impossibile caricare le chiavi e i collegamenti',
    caricamento: 'Caricamento delle chiavi',
    erroreDescrizione: 'Non siamo riusciti a caricare le chiavi e i collegamenti. Riprova fra un momento.',
    titolo: 'Chiavi e collegamenti',
    descrizione:
      'Tutto quello che l’app usa per parlare con Instagram, Messenger, Fathom, Claude e Groq: se ognuno funziona, quando scade e, in un pannello, come rigenerare la chiave. Le chiavi non tornano mai nella pagina e non vanno mai incollate in chat.',
    daSistemareScaduto: 'Il token di Instagram è scaduto o non è più valido.',
    daSistemareScadePresto: (giorni: number) => `Il token di Instagram ${fraseScadePresto(giorni).toLowerCase()}.`,
    daSistemareClaude: 'Manca la chiave di Claude su Vercel: Insight, analisi e Spunti sono spenti.',
    avvisoScaduto: 'Token Instagram scaduto: generane uno nuovo dal pannello Meta e incollalo qui.',
    // the Instagram token
    nonCollegato: 'Non collegato',
    scaduto: (data: string | null) => `Scaduto${data ? ` il ${data}` : ''}`,
    rifiutato: 'Non più valido: Instagram lo ha rifiutato',
    scadeTra: (giorni: number) => fraseScadePresto(giorni),
    salvato: (data: string | null) => `Salvato${data ? `, scade il ${data}` : ''}`,
    rinnovaPrima: (giorni: number) =>
      `${fraseScadePresto(giorni)}: se non si rinnova da solo, incolla un token nuovo prima di allora.`,
    account: 'Account',
    primoCalcolo: 'Si legge dal token al primo calcolo',
    ultimoErrore: 'Ultimo errore',
    nessuno: 'Nessuno',
    notaInstagram:
      'Si salva cifrato, non si mostra più e si rinnova da solo ogni settimana finché resta valido. Chi lavora i DM, le chat escluse e «Ricalcola ieri» stanno in',
    instagramMessenger: 'Instagram e Messenger',
    // Messenger
    collegata: (pagina: string | null) => (pagina ? `Collegata: Pagina «${pagina}»` : 'Collegata'),
    nonCollegata: 'Non collegata',
    descrizioneMessenger:
      'Il token della Pagina Facebook di Percorso Alpha. Serve solo per leggere le chat Messenger nell’Insight. Non manda mai messaggi.',
    pagina: 'Pagina',
    tokenSalvatoIl: (data: string) => `Token salvato il ${data}`,
    notaMessenger: 'Le chat Messenger da escludere si scelgono in',
    // Fathom
    fathomNonRisponde: 'Non risponde bene',
    fathomCollegato: (data: string | null) => `Fathom è collegato${data ? `: chiave salvata il ${data}` : ''}.`,
    fathomNonCollegato:
      'Non collegato: senza la chiave l’app non trova le registrazioni. Il link incollato nel foglio dell’esito si salva lo stesso.',
    notaFathom:
      'L’app legge da Fathom solo la registrazione che corrisponde al link incollato dal closer, e la trascrizione quando la apri o quando Claude analizza la call. Trascrizioni e riassunti non si conservano. Interruttori e limite di spesa delle analisi stanno in',
    fathom: 'Fathom',
    // Claude and Groq
    presenteSuVercel: 'Presente su Vercel',
    mancaAnthropic: 'Manca ANTHROPIC_API_KEY su Vercel',
    mancaGroq: 'Manca ALFIRE_API_KEY su Vercel',
    staSuVercel: 'La chiave sta su Vercel, non in questa app: qui si vede soltanto se c’è, mai il suo valore.',
    // the guide beside every key
    guida: {
      apri: 'Come si genera o si rigenera la chiave',
      comeFare: 'Come fare',
      doveIncollarla: 'Dove incollarla',
      comeCapire: 'Come capire che funziona',
      seScade: 'Cosa succede quando scade',
      nonInChat: NON_IN_CHAT,
      guide: GUIDE_CHIAVI,
    },
  },
  {
    errore: 'The keys and connections could not be loaded',
    caricamento: 'Loading the keys',
    erroreDescrizione: 'We could not load the keys and connections. Try again in a moment.',
    titolo: 'Keys and connections',
    descrizione:
      'Everything the app uses to talk to Instagram, Messenger, Fathom, Claude and Groq: whether each one works, when it expires and, in a panel, how to renew the key. Keys never come back to the page and must never be pasted in a chat.',
    daSistemareScaduto: 'The Instagram token has expired or is no longer valid.',
    daSistemareScadePresto: (giorni: number) => `The Instagram token expires in ${giorni === 1 ? '1 day' : `${giorni} days`}.`,
    daSistemareClaude: 'Claude’s key is missing on Vercel: Insight, analyses and Ideas are off.',
    avvisoScaduto: 'Instagram token expired: generate a new one from the Meta panel and paste it here.',
    nonCollegato: 'Not connected',
    scaduto: (data: string | null) => `Expired${data ? ` on ${data}` : ''}`,
    rifiutato: 'No longer valid: Instagram refused it',
    scadeTra: (giorni: number) => `Expires in ${giorni === 1 ? '1 day' : `${giorni} days`}`,
    salvato: (data: string | null) => `Saved${data ? `, expires on ${data}` : ''}`,
    rinnovaPrima: (giorni: number) =>
      `Expires in ${giorni === 1 ? '1 day' : `${giorni} days`}: if it does not renew on its own, paste a new token before then.`,
    account: 'Account',
    primoCalcolo: 'Read from the token at the first calculation',
    ultimoErrore: 'Last error',
    nessuno: 'None',
    notaInstagram:
      'It is saved encrypted, never shown again and renews on its own every week while it stays valid. Who works the DMs, the excluded chats and «Recalculate yesterday» are in',
    instagramMessenger: 'Instagram and Messenger',
    collegata: (pagina: string | null) => (pagina ? `Connected: Page «${pagina}»` : 'Connected'),
    nonCollegata: 'Not connected',
    descrizioneMessenger:
      'The token of the Percorso Alpha Facebook Page. It is only used to read the Messenger chats in the Insight. It never sends messages.',
    pagina: 'Page',
    tokenSalvatoIl: (data: string) => `Token saved on ${data}`,
    notaMessenger: 'The Messenger chats to exclude are chosen in',
    fathomNonRisponde: 'Not answering properly',
    fathomCollegato: (data: string | null) => `Fathom is connected${data ? `: key saved on ${data}` : ''}.`,
    fathomNonCollegato:
      'Not connected: without the key the app cannot find the recordings. The link pasted in the outcome sheet is saved all the same.',
    notaFathom:
      'The app reads from Fathom only the recording that matches the link the closer pasted, and the transcript when you open it or when Claude analyses the call. Transcripts and summaries are not kept. The analyses’ switches and spending limit are in',
    fathom: 'Fathom',
    presenteSuVercel: 'Present on Vercel',
    mancaAnthropic: 'ANTHROPIC_API_KEY missing on Vercel',
    mancaGroq: 'ALFIRE_API_KEY missing on Vercel',
    staSuVercel: 'The key lives on Vercel, not in this app: here you only see whether it is there, never its value.',
    guida: {
      apri: 'How to generate or renew the key',
      comeFare: 'How to do it',
      doveIncollarla: 'Where to paste it',
      comeCapire: 'How to tell it works',
      seScade: 'What happens when it expires',
      nonInChat: 'Never paste a key in a chat: only here or on Vercel. If it happened, rotate it.',
      guide: GUIDE_EN,
    },
  },
)
