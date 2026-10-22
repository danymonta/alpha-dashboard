/*
 * Claude connected to Alpha Management (MCP, Dany 09/10/2026): where the
 * consent page may send the browser, how it reads Supabase Auth's answers and
 * every sentence of the consent page and of «Collega Claude» in Profilo ›
 * Account. Pure: the page, the server actions, the client card and the tests
 * import it.
 */

/** The callbacks of the hosted Claude apps (web, Desktop, mobile, Cowork). */
export const CALLBACK_CLAUDE = [
  'https://claude.ai/api/mcp/auth_callback',
  'https://claude.com/api/mcp/auth_callback',
] as const

/** Claude Code listens on this loopback port (--callback-port); 48721 avoids rclone's 53682. */
export const PORTA_CLAUDE_CODE = 48721

export const CALLBACK_CLAUDE_CODE = [
  `http://localhost:${PORTA_CLAUDE_CODE}/callback`,
  `http://127.0.0.1:${PORTA_CLAUDE_CODE}/callback`,
] as const

const HOST_CLAUDE = new Set(['claude.ai', 'claude.com'])
const HOST_LOOPBACK = new Set(['localhost', '127.0.0.1'])
const PERCORSO_CLAUDE = '/api/mcp/auth_callback'
const PERCORSO_CLAUDE_CODE = '/callback'

export type DestinazioneClaude = {
  /** claude: the hosted apps; claude_code: a program on this computer. */
  tipo: 'claude' | 'claude_code'
  /** The real host, shown on the card: claude.ai, claude.com, localhost or 127.0.0.1. */
  host: string
  /** The URL as parsed: the only form the browser is ever sent to. */
  href: string
}

/**
 * Where the browser may go after the consent page, and nowhere else: https on
 * exactly claude.ai or claude.com with the path /api/mcp/auth_callback, or http
 * on exactly localhost or 127.0.0.1 (any port) with the path /callback. No
 * userinfo, no fragment, no default-port tricks. The raw string is checked
 * first, because the URL parser drops tabs and newlines and reads "\" as "/":
 * any control character, space, backslash or non-ASCII letter is refused (an
 * IDN look-alike of claude.ai never matches either). Supabase already enforces
 * the registered redirect URI exactly; this is defence in depth, and the only
 * thing that ever decides where the browser goes.
 */
export function leggiDestinazione(url: string | null | undefined): DestinazioneClaude | null {
  if (typeof url !== 'string' || url.length === 0 || url.length > 2000) return null
  for (const carattere of url) {
    const codice = carattere.codePointAt(0) ?? 0
    if (codice <= 0x20 || codice >= 0x7f || carattere === '\\' || carattere === '#') return null
  }
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return null
  }
  if (u.username !== '' || u.password !== '') return null
  if (u.protocol === 'https:' && HOST_CLAUDE.has(u.hostname) && u.port === '' && u.pathname === PERCORSO_CLAUDE) {
    return { tipo: 'claude', host: u.hostname, href: u.href }
  }
  if (u.protocol === 'http:' && HOST_LOOPBACK.has(u.hostname) && u.pathname === PERCORSO_CLAUDE_CODE) {
    return { tipo: 'claude_code', host: u.hostname, href: u.href }
  }
  return null
}

export function destinazioneClaude(url: string | null | undefined): boolean {
  return leggiDestinazione(url) !== null
}

/**
 * The same Claude callback, without the code: error=access_denied, the
 * client's state kept. Used when an authorization can no longer be denied in
 * Supabase (already approved: «Annulla» on «Ricollega Claude», or a refusal
 * whose binding call auto-approved an old consent): Claude closes the attempt
 * cleanly and the code dies with the authorization (10 minutes). The other
 * query pieces keep their exact encoding. Null for a URL that is not Claude's.
 */
export function erroreVersoClaude(url: string | null | undefined): string | null {
  const destinazione = leggiDestinazione(url)
  if (!destinazione) return null
  const u = new URL(destinazione.href)
  const tolti = new Set(['code', 'error', 'error_description', 'error_uri'])
  const restanti = u.search
    .replace(/^\?/, '')
    .split('&')
    .filter((pezzo) => pezzo !== '' && !tolti.has(decodeURIComponent(pezzo.split('=')[0] ?? '')))
  restanti.push('error=access_denied', 'error_description=User%20denied%20the%20request')
  u.search = `?${restanti.join('&')}`
  return u.href
}

/**
 * Only the host, for the log line of a refused redirect: never the path or the
 * query (they can carry a code), and only plain characters.
 */
export function hostDi(url: string | null | undefined): string {
  try {
    return new URL(String(url)).host.replace(/[^A-Za-z0-9.:-]/g, '').slice(0, 64) || '-'
  } catch {
    return '-'
  }
}

export type ErroreAutorizzazione = 'non_attivo' | 'scaduta' | 'usata' | 'sessione' | 'temporaneo'

/**
 * Supabase Auth's answers on /oauth/authorizations (auth-js errors), read for
 * people. 404 oauth_authorization_not_found: expired (10 minutes) or another
 * person's. 400: no longer pending (already approved or denied, a reload).
 * feature_disabled: the OAuth server is off. Network, timeouts and 5xx are
 * transient: the error state with «Riprova».
 */
export function tipoErroreAutorizzazione(
  errore: { name?: string; status?: number; code?: string } | null | undefined,
): ErroreAutorizzazione {
  if (!errore) return 'temporaneo'
  if (errore.code === 'feature_disabled') return 'non_attivo'
  if (errore.name === 'AuthSessionMissingError' || errore.status === 401 || errore.status === 403) return 'sessione'
  if (errore.name === 'AuthRetryableFetchError' || errore.name === 'AuthUnknownError') return 'temporaneo'
  if (errore.code === 'oauth_authorization_not_found' || errore.status === 404) return 'scaduta'
  if (errore.status === 400) return 'usata'
  return 'temporaneo'
}

export const MESSAGGI_AUTORIZZAZIONE: Record<ErroreAutorizzazione, string> = {
  non_attivo: 'Il collegamento a Claude non è ancora attivo.',
  scaduta: 'Questa richiesta di collegamento è scaduta: riprova da Claude.',
  usata: 'Questa richiesta di collegamento è già stata usata: se Claude non è collegato, riprova da Claude.',
  sessione: 'La sessione è scaduta: esci, rientra con Google e riprova da Claude.',
  temporaneo: 'Non riesco a completare il collegamento adesso: riprova tra poco.',
}

/** The consent page, word for word. */
export const CONSENSO = {
  titolo: 'Collega Claude ad Alpha Management',
  titoloRicollega: 'Ricollega Claude',
  titoloNonAmmesso: 'Claude non si collega a questo account',
  titoloNonDaClaude: 'Richiesta non riconosciuta',
  titoloInterrotto: 'Collegamento non riuscito',
  nonAmmesso: 'Il tuo account non è attivo: Claude si collega ad Alpha Management solo con un account attivo.',
  nonDaClaude: 'Questa richiesta non arriva da Claude: non la seguo.',
  rifiutataNonDaClaude: 'Richiesta rifiutata. Non torno a quell’indirizzo: non è di Claude.',
  chiede: 'chiede di lavorare ad Alpha Management come',
  account: 'Account:',
  dopo: 'Dopo il consenso torni a:',
  dopoRicollega: 'Continuando torni a:',
  loopback:
    'Qualsiasi programma sul tuo computer può rispondere a quell’indirizzo: consenti solo se hai appena collegato Claude Code tu.',
  potra: 'Claude potrà, a tuo nome:',
  // without the final punctuation: azioniConsenso puts «;» after each item and «.» after the last.
  // The calendar: admin, video editor and marketing (azioni, azioneAdmin)
  azioni: [
    'leggere il calendario dei contenuti (reel e caroselli) con i testi delle sezioni, il profilo del cliente ideale e la guida di Dany ai contenuti',
    'leggere gli ultimi spunti per i contenuti (temi a parole, senza nomi né cifre di persone)',
    'creare contenuti, cambiare proprietà e Status, scrivere script, didascalie e commenti',
  ],
  azioneAdmin: 'eliminare un contenuto, quando glielo chiedi tu',
  // projects, lists, tasks, notes and time (22/10/2026): every role, as in the app
  azioniProgetti: [
    'leggere i progetti di cui fai parte, con liste, task, membri e note, e i task assegnati a te',
    'creare task, modificare quelli che crei o che ti sono assegnati, completarli e scrivere note',
    'registrare, correggere e leggere il tuo tempo, e avviare e fermare il tuo timer',
  ],
  azioneGestione: 'creare progetti e liste, cambiarli, aggiungere persone e scegliere il coach nei progetti che gestisci',
  azioneTempoTeam: 'leggere il tempo già dichiarato dal team, come in Tempo › Team',
  // the business coach (22/10/2026): reads only
  azioniSolaLettura: [
    'leggere il calendario dei contenuti (reel e caroselli) con i testi delle sezioni, il profilo del cliente ideale, la guida di Dany ai contenuti e gli ultimi spunti',
    'leggere tutti i progetti, con liste, task, membri e note',
    'leggere il tempo già dichiarato dal team, come in Tempo › Team',
    'senza mai creare, cambiare o eliminare niente',
  ],
  maiVistoInizio: 'Non vedrà mai',
  maiVisto:
    'soldi, clienti, lead, call, report del setter, messaggi diretti, il tempo degli altri né il resto del gestionale, e non eliminerà niente dei progetti.',
  team: 'Ogni modifica di Claude la vede il team nell’app, come se l’avessi fatta tu.',
  privacy:
    'I testi che Claude legge passano dal tuo account Claude (Anthropic): nelle impostazioni di privacy di Claude tieni spento l’uso delle chat per migliorare i modelli.',
  phishing: 'Hai appena premuto «Connetti» in Claude? Se questo link ti è arrivato da qualcun altro, premi Rifiuta.',
  phishingRicollega:
    'Hai appena premuto «Connetti» in Claude? Se questo link ti è arrivato da qualcun altro, premi Annulla.',
  // Claude Code has no «Connetti»: the person started the sign-in with /mcp › alpha › Authenticate
  phishingClaudeCode:
    'Hai appena avviato l’accesso da Claude Code (/mcp › Authenticate)? Se questo link ti è arrivato da qualcun altro, premi Rifiuta.',
  phishingRicollegaClaudeCode:
    'Hai appena avviato l’accesso da Claude Code (/mcp › Authenticate)? Se questo link ti è arrivato da qualcun altro, premi Annulla.',
  scollega: 'Puoi scollegarlo quando vuoi da Profilo › Account › App collegate.',
  ricollega: 'Hai già collegato Claude ad Alpha Management con questo account. Continua per finire il collegamento.',
  consenti: 'Consenti',
  rifiuta: 'Rifiuta',
  continua: 'Continua',
  annulla: 'Annulla',
  tornaAClaude: 'Torna a Claude',
  vaiAllApp: 'Vai ad Alpha Management',
  inCorso: 'Torno a Claude…',
} as const

/** Whose card it is: the role and the project level, as the MCP server gives its tools. */
export type ChiCollega = { ruolo: string; livello: 'admin' | 'manager' | 'employee' }

const RUOLI_CALENDARIO = new Set(['admin', 'editor', 'marketing'])

/**
 * «Claude potrà, a tuo nome:» as a sentence: «;» after each item, «.» after the
 * last. The calendar for admin, video editor and marketing (deleting a content
 * the admin only), projects and one's own time for everyone, managing projects
 * for who manages them, the team's time for the admin (22/10/2026).
 */
export function azioniConsenso(chi: ChiCollega): string[] {
  const admin = chi.ruolo === 'admin'
  const voci: string[] = chi.ruolo === 'business_coach' ? [...CONSENSO.azioniSolaLettura] : [
    ...(RUOLI_CALENDARIO.has(chi.ruolo) ? CONSENSO.azioni : []),
    ...(admin ? [CONSENSO.azioneAdmin] : []),
    ...CONSENSO.azioniProgetti,
    ...(admin || chi.livello !== 'employee' ? [CONSENSO.azioneGestione] : []),
    ...(admin ? [CONSENSO.azioneTempoTeam] : []),
  ]
  return voci.map((voce, i) => `${voce}${i === voci.length - 1 ? '.' : ';'}`)
}

/**
 * The warning against a link sent by someone else, in the words of what the
 * person has just done: «Connetti» in Claude, or the sign-in from Claude Code.
 */
export function avvisoPhishing(tipo: DestinazioneClaude['tipo'], ricollega = false): string {
  if (tipo === 'claude_code') return ricollega ? CONSENSO.phishingRicollegaClaudeCode : CONSENSO.phishingClaudeCode
  return ricollega ? CONSENSO.phishingRicollega : CONSENSO.phishing
}

/** «claude.ai», or the computer for Claude Code, in the words of the card. */
export function doveTorni(destinazione: Pick<DestinazioneClaude, 'tipo' | 'host'>): string {
  return destinazione.tipo === 'claude'
    ? destinazione.host
    : `un programma sul tuo computer (Claude Code), indirizzo ${destinazione.host}`
}

/** «Collega Claude» in Claude Code: user scope, so it works in every folder. */
export function comandoClaudeCode(clientId: string, urlMcp: string): string {
  return `claude mcp add --scope user --transport http --client-id ${clientId} --callback-port ${PORTA_CLAUDE_CODE} alpha ${urlMcp}`
}

/**
 * The labels of Claude's «Add custom connector» dialog. The English ones are
 * verified in Claude's docs (09/10/2026); the Italian ones are a translation,
 * to check against the real interface at the first connection and fix here.
 * Until then the card shows the English label in brackets.
 */
export const DIALOGO_CLAUDE = {
  menu: { it: 'Personalizza › Connettori', en: 'Customize › Connectors' },
  aggiungiConnettore: { it: 'Aggiungi connettore personalizzato', en: 'Add custom connector' },
  accediOra: { it: 'Accedi ora', en: 'Sign in now' },
  clientProprio: { it: 'Usa il tuo client OAuth', en: 'Use your own OAuth client' },
  identitaPubblicata: { it: 'identità pubblicata di Claude', en: 'Use Claude’s published identity' },
  registrazioneAutomatica: { it: 'registrazione automatica', en: 'Register automatically' },
  avanzate: { it: 'Impostazioni avanzate', en: 'Advanced settings' },
  aggiungi: { it: 'Aggiungi', en: 'Add' },
  connetti: { it: 'Connetti', en: 'Connect' },
} as const

export function etichettaDialogo(chiave: keyof typeof DIALOGO_CLAUDE): string {
  const { it, en } = DIALOGO_CLAUDE[chiave]
  return `${it} (${en})`
}

/** «Collega Claude» in Profilo › Account, word for word. */
export const COLLEGA_CLAUDE = {
  titolo: 'Collega Claude',
  descrizione:
    'Dal tuo account Claude lavori a parole sui progetti, sui task e sul tuo tempo, e nel Marketing sul calendario dei contenuti, con i tuoi permessi dell’app. Non raggiunge soldi, clienti, lead, call né messaggi diretti, e non elimina niente dei progetti.',
  nome: 'Alpha Management',
  indirizzoMenu: 'claude.ai/customize/connectors',
  telefono: 'Sul telefono: dopo averlo collegato dal sito o dal computer, lo trovi anche nell’app di Claude.',
  privacy: 'Nelle impostazioni di privacy di Claude tieni spento l’uso delle chat per migliorare i modelli.',
  claudeCode: 'Claude Code',
  claudeCodeDopo: 'poi in una sessione di Claude Code',
  nonAttivoAdmin:
    'Il collegamento a Claude non è ancora attivo: attiva il server OAuth in Supabase (Authentication › OAuth Server) e registra i due client con Client type Public, senza segreto (un client Confidential non vale).',
  nonAttivo: 'Il collegamento a Claude non è ancora attivo: chiedi all’admin.',
  mancaClaude: 'Il collegamento dal sito e dalle app di Claude non è ancora attivo: chiedi all’admin.',
  errore: 'Non riesco a leggere i dati per collegare Claude.',
} as const

/** To the admin only, when one of the two clients is missing: what to register in Supabase. */
export function clientMancante(tipo: 'claude' | 'claude_code'): string {
  return tipo === 'claude'
    ? `Manca il client «Claude» (sito, app per computer e telefono): in Supabase › Authentication › OAuth Apps registra un client con Client type Public, senza segreto (un client Confidential non vale), e Redirect URIs ${CALLBACK_CLAUDE.join(' e ')}.`
    : `Manca il client «Claude Code»: in Supabase › Authentication › OAuth Apps registra un client con Client type Public, senza segreto (un client Confidential non vale), e Redirect URIs ${CALLBACK_CLAUDE_CODE.join(' e ')}.`
}

/** «App collegate» in Profilo › Account, word for word. */
export const APP_COLLEGATE = {
  titolo: 'App collegate',
  descrizione: 'Le app che lavorano a tuo nome su Alpha Management. Le vedi solo tu.',
  vuoto: 'Nessuna app collegata.',
  errore: 'Non riesco a leggere le app collegate.',
  scollega: 'Scollega',
  conseguenza: 'Claude non potrà più leggere né scrivere niente a tuo nome finché non lo ricolleghi.',
} as const
