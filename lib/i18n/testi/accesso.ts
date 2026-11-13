import { PAROLE_ACCESSO, testoAttesa } from '@/lib/auth/accesso'
import { bilingue, type Lingua } from '@/lib/i18n/lingua'
import { CIFRE_CODICE, VALIDITA_CODICE_MINUTI } from '@/lib/validation/accesso'

/**
 * The words of the login page (1.53.0). The Italian ones are those of lib/auth/accesso.ts,
 * untouched (the server actions still answer with them); in English the page translates
 * the answers it receives (traduciAccesso), so the actions and their tests stay as they are.
 */
export const ACCESSO = bilingue(
  {
    parole: { ...PAROLE_ACCESSO } as Record<keyof typeof PAROLE_ACCESSO, string>,
    attesa: testoAttesa,
    descrizione:
      'Il gestionale di Percorso Alpha: vendite, incassi, setting, provvigioni e progetti del team in un solo posto, con Alfire, l’AI sui tuoi numeri.',
    riservato: 'Accesso riservato al team, solo su invito.',
    accessoNegato: 'Questo indirizzo non è stato invitato. Chiedi a Dany di aggiungerti al team.',
    google: 'Non è stato possibile aprire l’accesso con Google. Riprova.',
    callback: 'Accesso non riuscito. Riprova.',
    accediGoogle: 'Accedi con Google',
    aperturaGoogle: 'Apertura di Google…',
    posta: 'Indirizzo di posta',
    esempioPosta: 'nome@dominio.it',
    invioInCorso: 'Invio in corso…',
    inviaCodice: 'Invia il codice',
    inviatoDiNuovo: 'Codice inviato di nuovo.',
    indirizzo: 'Indirizzo:',
    codice: 'Codice di accesso',
    entra: 'Entra',
    cambiaEmail: 'Cambia email',
    inviaDiNuovo: 'Invia di nuovo',
    ambienteLocale: 'Ambiente locale: accesso rapido con gli utenti di prova.',
    // 1.79.0: the clients of the path come in from /entra
    cliente: 'Sei un cliente del Percorso Alpha? Entra da qui',
  },
  {
    parole: {
      titolo: 'Or sign in with a code by email',
      introduzione: `Write the address you use in the team: we send you a link and a ${CIFRE_CODICE}-digit code.`,
      inviata: 'If the address is registered, we have written to you: open the link or enter the code.',
      validita: `The link and the code last ${VALIDITA_CODICE_MINUTI} minutes. Check the spam folder too.`,
      codiceErrato: 'The code is not valid or has expired. Check the digits or ask for a new one.',
      linkScaduto: 'The link has expired or was already used: ask for a new one.',
      troppeRichieste: 'Too many attempts in a row. Wait a few minutes and try again.',
      nonDisponibile: 'The request cannot be completed right now. Try again shortly.',
      connessione: 'No connection. Try again.',
      disattivato: 'Account deactivated. Contact the administrator.',
    },
    attesa: (secondi: number) => `Send again in ${secondi} ${secondi === 1 ? 'second' : 'seconds'}`,
    descrizione:
      'The Percorso Alpha back office: the team’s sales, payments, setting, commissions and projects in one place, with Alfire, the AI on your numbers.',
    riservato: 'Team access only, by invitation.',
    accessoNegato: 'This address has not been invited. Ask Dany to add you to the team.',
    google: 'Sign-in with Google could not be opened. Try again.',
    callback: 'Sign-in failed. Try again.',
    accediGoogle: 'Sign in with Google',
    aperturaGoogle: 'Opening Google…',
    // never «Email»: the dev login below owns that label
    posta: 'Your mail address',
    esempioPosta: 'name@domain.com',
    invioInCorso: 'Sending…',
    inviaCodice: 'Send the code',
    inviatoDiNuovo: 'Code sent again.',
    indirizzo: 'Address:',
    codice: 'Sign-in code',
    entra: 'Sign in',
    cambiaEmail: 'Change email',
    inviaDiNuovo: 'Send again',
    ambienteLocale: 'Local environment: quick sign-in with the test users.',
    cliente: 'Are you a client of Percorso Alpha? Sign in here',

  },
)

/** The field checks of the schemas (lib/validation/accesso.ts), in English. */
const ERRORI_EN: Record<string, string> = {
  'Scrivi il tuo indirizzo di posta': 'Write your email address',
  'Questo indirizzo è troppo lungo': 'This address is too long',
  'Scrivi un indirizzo valido, ad esempio nome@dominio.it': 'Write a valid address, for example name@domain.com',
  'Scrivi il codice': 'Write the code',
  [`Il codice ha ${CIFRE_CODICE} cifre`]: `The code has ${CIFRE_CODICE} digits`,
  'Dati non validi.': 'Invalid data.',
  // the dev login (local only)
  'Login di sviluppo non disponibile.': 'Dev login not available.',
  'Inserisci email e password.': 'Enter email and password.',
  'Credenziali non valide.': 'Invalid credentials.',
}

/**
 * What the server and the field checks answer, in the page's language: the Italian
 * sentences of lib/auth/accesso.ts and of the schemas have their English one here.
 */
export function traduciAccesso(testo: string | undefined | null, lingua: Lingua): string | undefined {
  if (!testo) return testo ?? undefined
  if (lingua === 'it') return testo
  const { parole } = ACCESSO.en
  for (const [chiave, italiano] of Object.entries(PAROLE_ACCESSO)) {
    if (italiano === testo) return parole[chiave as keyof typeof PAROLE_ACCESSO]
  }
  return ERRORI_EN[testo] ?? testo
}
