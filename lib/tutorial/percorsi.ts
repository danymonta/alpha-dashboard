import type { AppRole } from '@/lib/auth/roles'
import type { Lingua } from '@/lib/i18n/lingua'
import { TUTORIAL } from '@/lib/i18n/testi/tutorial'

/**
 * The guided tour shown at the first sign-in, one per role (CLAUDE.md
 * section 21). Configured here, not by the admin: changes go through code.
 *
 * - `target`: data-tour ids in order of preference; the first one visible is
 *   highlighted (a nav item on desktop, "Altro" on the phone when it lives
 *   there). No visible target: the card sits in the middle.
 * - `clic`: the person taps the highlighted element (a link) to go on: the
 *   page opens and the tour continues inside it.
 * - `pagina`: the page the step lives on; the tour opens it if needed.
 */
export type PassoTutorial = {
  id: string
  titolo: string
  testo: string
  target?: string[]
  clic?: boolean
  pagina?: string
}

/** Elements inside pages that a step may point at (data-tour in the page code). */
export const TARGET_DI_PAGINA = [
  'kpi-cash',
  'nuova-vendita',
  'previsione-cassa',
  'oggi-contatori',
  'oggi-salvato',
  'nuova-call',
  'registra-esito',
  'elenco-vendite',
  'mio-task',
  'card-progetto',
  'elenco-contenuti',
  'scheda-insight',
] as const

/** What each role does, as the tour and the admin's preview menu call it. */
export const FUNZIONE: Record<AppRole, string> = {
  admin: 'Admin',
  setter: 'Setter',
  closer: 'Closer',
  coach: 'Coach fitness',
  editor: 'Video editor',
  marketing: 'Marketing',
  nutrizione: 'Nutrizione',
  dev: 'Sviluppo',
  business_coach: 'Business coach',
}

const nav = (href: string, ...alternative: string[]) => [`nav-${href}`, ...alternative]

function benvenuto(funzione: string): PassoTutorial {
  return {
    id: 'benvenuto',
    titolo: 'Benvenuto in Alpha Management',
    testo: `Ti accompagno nelle pagine del tuo lavoro da ${funzione.toLowerCase()}: tocca quello che evidenzio. Puoi rivedere questo tour quando vuoi dal tuo profilo.`,
  }
}

/** "Tocca X": the step that opens a page from the navigation. */
function tocca(href: string, id: string, titolo: string, testo: string): PassoTutorial {
  return { id, titolo, testo, target: nav(href), clic: true }
}

const PROFILO: PassoTutorial = {
  id: 'profilo',
  titolo: 'Il tuo profilo',
  testo: 'Tocca la tua foto per cambiarla, correggere il nome, rivedere questo tour o uscire.',
  target: ['profilo'],
}

function alfire(testo: string): PassoTutorial {
  return { id: 'alfire', titolo: 'Alfire, la nostra AI', testo, target: ['alfire'] }
}

/**
 * The Marketing area, the content calendar (1.32.0): the video editor and
 * marketing pass through it right after the welcome. The admin's tour stays
 * as it is: it already has 12 steps, the most a tour has.
 */
const PASSI_CONTENUTI: PassoTutorial[] = [
  tocca(
    '/marketing/contenuti',
    'vai-contenuti',
    'Piano editoriale',
    'Tocca «Piano editoriale»: il calendario dei reel e dei caroselli di Instagram.',
  ),
  {
    id: 'contenuti',
    pagina: '/marketing/contenuti',
    titolo: 'La tabella dei contenuti',
    testo: 'Una tabella come in Notion, dalla Post Date più recente. Ogni cella si cambia da sola; Reel Type e Format sono etichette colorate che crei tu, direttamente dalla cella. Il nome apre la pagina con gli script.',
    target: ['elenco-contenuti'],
  },
]

/** The "I miei task" step of whoever lands there: it is their daily page. */
const TASK_OGNI_GIORNO = 'Tocca «I miei task»: è la tua pagina di tutti i giorni.'

/**
 * The Projects tour; `prima` are the steps of another area, right after the
 * welcome. `task`: the words of the "I miei task" step, for a role that lands
 * elsewhere (marketing lands on the Piano editoriale, so I miei task is not his daily page).
 */
function soloProgetti(
  funzione: string,
  progetti: string,
  prima: PassoTutorial[] = [],
  task: string = TASK_OGNI_GIORNO,
): PassoTutorial[] {
  return [
    benvenuto(funzione),
    ...prima,
    tocca('/task', 'vai-task', 'I miei task', task),
    {
      id: 'task',
      pagina: '/task',
      titolo: 'Un task',
      testo: 'Qui c’è tutto quello che ti è stato assegnato, per scadenza. Il titolo apre il task nel suo progetto; spunta quando è fatto; la sveglia a destra avvia il timer, che resta in alto su ogni pagina.',
      target: ['mio-task'],
    },
    tocca('/progetti', 'vai-progetti', 'Progetti', 'Tocca «Progetti».'),
    { id: 'progetto', pagina: '/progetti', titolo: 'I progetti', testo: progetti, target: ['card-progetto'] },
    {
      id: 'tempo',
      titolo: 'Il mio tempo',
      testo: 'Qui ritrovi il tempo che hai registrato, giorno per giorno, e aggiungi i minuti dimenticati. Lo vedi tu e chi gestisce il progetto.',
      target: nav('/tempo'),
    },
    alfire('Chiedile quali task hai aperti o di segnarne uno come fatto, anche col vocale. Scrive solo dopo la tua conferma.'),
    PROFILO,
  ]
}

export const PERCORSI: Record<AppRole, PassoTutorial[]> = {
  // the business coach (22/10/2026): six steps, read only, never a "tocca" on something that writes
  business_coach: [
    {
      id: 'benvenuto',
      titolo: 'Benvenuto in Alpha Management',
      testo: 'Vedi tutto quello che vede l’admin, in sola lettura: numeri, call, clienti, setter, contenuti e progetti. Niente si modifica dal tuo account. Puoi rivedere questo tour quando vuoi dal tuo profilo.',
    },
    {
      id: 'panoramica',
      pagina: '/',
      titolo: 'Panoramica',
      testo: 'Il mese in un colpo d’occhio: cash incassato e quanto viene da nuovi clienti, rate di clienti già entrati o rinnovi, margine operativo, obiettivi e chi deve pagare.',
      target: ['kpi-cash'],
    },
    {
      id: 'setter',
      titolo: 'Setter',
      testo: 'I numeri del setting giorno per giorno e, nella scheda «Insight 24h», il recap dei DM.',
      target: nav('/setting'),
    },
    {
      id: 'closer',
      titolo: 'Closer',
      testo: 'I numeri del closer giorno per giorno: call, show rate, chiuse, cash e revenue dei clienti nuovi.',
      target: nav('/setting/closer', 'nav-altro'),
    },
    alfire('Chiedile i numeri, anche col vocale: legge quello che leggi tu, e non scrive niente.'),
    PROFILO,
  ],
  admin: [
    benvenuto('admin'),
    {
      id: 'panoramica',
      pagina: '/',
      titolo: 'Panoramica',
      testo: 'Il mese in un colpo d’occhio: cash incassato e quanto viene da nuovi clienti, rate di clienti già entrati o rinnovi, margine operativo, obiettivi e chi deve pagare.',
      target: ['kpi-cash'],
    },
    tocca('/sales', 'vai-vendite', 'Vendite', 'Tocca «Vendite».'),
    {
      id: 'nuova-vendita',
      pagina: '/sales',
      titolo: 'Nuova vendita',
      testo: 'Da qui registri una vendita: prodotto o percorso su misura, piano rate, setter e closer. Oppure dilla ad Alfire.',
      target: ['nuova-vendita'],
    },
    tocca('/payments', 'vai-incassi', 'Incassi', 'Tocca «Incassi».'),
    {
      id: 'incassi',
      pagina: '/payments',
      titolo: 'I soldi in arrivo',
      testo: 'Quanto entra nei prossimi mesi e quanto è in ritardo. Sotto, rata per rata: segni incassata con un tocco o scrivi al cliente su WhatsApp.',
      target: ['previsione-cassa'],
    },
    {
      // Setter and Closer instead of "Setting" (07/10/2026): his outcomes are recorded every day
      id: 'closer',
      titolo: 'Closer',
      testo: 'In cima le tue call ancora senza esito, da registrare ogni giorno; sotto i numeri del closer giorno per giorno. Accanto, «Setter» con i report dei setter e, nella scheda «Insight 24h», il recap dei DM.',
      target: nav('/setting/closer', 'nav-altro'),
    },
    {
      id: 'rinnovi',
      titolo: 'Rinnovi',
      testo: 'Chi finisce il percorso a breve e chi l’ha finito da poco, con il messaggio WhatsApp pronto e “Registra rinnovo”.',
      target: nav('/rinnovi', 'nav-altro'),
    },
    {
      id: 'impostazioni',
      titolo: 'Impostazioni',
      testo: 'Team e inviti, prodotti, regole provvigioni, reparti, esportazione e backup.',
      target: nav('/settings', 'nav-altro'),
    },
    alfire('Chiedile i numeri o dille cosa registrare, anche col vocale: “Loris ha pagato 2.500 € in contanti”. Scrive solo dopo la tua conferma.'),
    {
      id: 'testa',
      titolo: 'Testa il tutorial',
      testo: 'Da qui provi il tour di ogni ruolo, esattamente come lo vedrà chi inviti.',
      target: ['testa-tutorial'],
    },
    PROFILO,
  ],
  setter: [
    benvenuto('setter'),
    tocca('/today', 'vai-oggi', 'Oggi', 'Tocca «Oggi»: è la pagina che compili ogni giorno.'),
    {
      id: 'contatori',
      pagina: '/today',
      titolo: 'I contatori',
      testo: 'Ogni riga ha −1, +1 e +5: un tocco per ogni DM, conversazione o call. Puoi anche scrivere il numero.',
      target: ['oggi-contatori'],
    },
    {
      id: 'salvato',
      pagina: '/today',
      titolo: 'Si salva da solo',
      testo: 'Qui vedi quando è stato salvato: nessun tasto “invia” da ricordare. Ci metti meno di un minuto.',
      target: ['oggi-salvato'],
    },
    {
      // the recap of the DMs of the last 24 hours is the second tab of Oggi (1.38.0): it lives on /today,
      // so the step follows the two steps of Oggi and is not a "tocca qui"
      id: 'insight',
      pagina: '/today',
      titolo: 'Insight 24h',
      testo: 'Qui sopra, nella scheda «Insight 24h»: ogni sera i DM del giorno letti da Claude, con chi aspetta una risposta e il messaggio da copiare.',
      target: ['scheda-insight'],
    },
    tocca('/calls/new', 'vai-nuova-call', 'Nuova call', 'Tocca «Nuova call».'),
    {
      id: 'nuova-call',
      pagina: '/calls/new',
      titolo: 'Fissa una call',
      testo: 'Nome, handle, fonte, giorno e ora: lead e call nascono insieme e il closer la trova tra le sue.',
      target: ['nuova-call'],
    },
    {
      id: 'pipeline',
      titolo: 'Pipeline',
      testo: 'I tuoi lead: li sposti da Call da fare a Follow-up, Cliente o Perso con un tocco.',
      target: nav('/leads'),
    },
    {
      id: 'numeri',
      titolo: 'I miei numeri',
      testo: 'Le tue metriche del mese e le provvigioni maturate e già pagate.',
      target: nav('/my-numbers'),
    },
    {
      // the closer's numbers, read only (Dany, 07/10/2026: "il setter può accedere alla tab closer")
      id: 'closer',
      titolo: 'Closer',
      testo: 'Come vanno le call di tutti i setter, giorno per giorno: svolte, chiuse, show rate, cash e revenue, dagli esiti che registra il closer.',
      target: nav('/setting/closer', 'nav-altro'),
    },
    alfire('Chiedile come stai andando o dille “aggiungi 20 DM al report di oggi”, anche col vocale. Scrive solo dopo la tua conferma.'),
    PROFILO,
  ],
  closer: [
    benvenuto('closer'),
    tocca('/calls', 'vai-call', 'Le mie call', 'Tocca «Le mie call».'),
    {
      id: 'esito',
      pagina: '/calls',
      titolo: 'Registra l’esito',
      testo: 'Finita la call, da qui scrivi com’è andata in tre tocchi. Se chiudi, si apre la vendita già compilata.',
      target: ['registra-esito'],
    },
    {
      id: 'pipeline',
      titolo: 'Pipeline',
      testo: 'I lead delle tue call: aggiorna lo stato dopo ogni conversazione.',
      target: nav('/leads'),
    },
    tocca('/my-sales', 'vai-vendite', 'Le mie vendite', 'Tocca «Le mie vendite».'),
    {
      id: 'vendite',
      pagina: '/my-sales',
      titolo: 'Le tue vendite',
      testo: 'Le vendite che hai chiuso, con le rate e gli incassi.',
      target: ['elenco-vendite'],
    },
    alfire('Chiedile le call di oggi o di spostarne una, anche col vocale. Scrive solo dopo la tua conferma.'),
    PROFILO,
  ],
  coach: soloProgetti(
    FUNZIONE.coach,
    'Nel Fitness Coaching ogni progetto è un cliente: aprilo per vedere panoramica, tappe del percorso, task, tempo e note.',
  ),
  editor: soloProgetti(
    FUNZIONE.editor,
    'I progetti di Contenuti e Video: aprine uno per vedere panoramica, reel e montaggi come task, Gantt e note.',
    PASSI_CONTENUTI,
  ),
  // marketing lands on the Piano editoriale (percorsoIniziale): that is his daily page, not I miei task
  marketing: soloProgetti(
    FUNZIONE.marketing,
    'I progetti di cui fai parte: aprine uno per vedere panoramica, task, Gantt e note.',
    PASSI_CONTENUTI,
    'Tocca «I miei task»: i task dei progetti assegnati a te.',
  ),
  nutrizione: soloProgetti(FUNZIONE.nutrizione, 'Apri un progetto per vedere panoramica, task con le scadenze, Gantt e note.'),
  dev: soloProgetti(FUNZIONE.dev, 'Apri un progetto per vedere panoramica, task con le scadenze, Gantt e note.'),
}

/** How long a step stays before it can be closed or skipped: time to read. */
/**
 * The tour in the page's language (1.53.0): the business coach's in English when he reads
 * the app in English, the same steps and targets; every other tour stays Italian.
 */
export function percorsoPer(ruolo: AppRole, lingua: Lingua): PassoTutorial[] {
  const passi = PERCORSI[ruolo]
  if (lingua !== 'en' || ruolo !== 'business_coach') return passi
  const t = TUTORIAL.en.businessCoach
  const testi: Record<string, [string, string]> = {
    benvenuto: [t.benvenuto, t.benvenutoTesto],
    panoramica: [t.panoramica, t.panoramicaTesto],
    setter: [t.setter, t.setterTesto],
    closer: [t.closer, t.closerTesto],
    alfire: [t.alfire, t.alfireTesto],
    profilo: [t.profilo, t.profiloTesto],
  }
  return passi.map((p) => (testi[p.id] ? { ...p, titolo: testi[p.id][0], testo: testi[p.id][1] } : p))
}

export const ATTESA_LETTURA_MS = 2000

/** Is `pathname` the step's page ("/" only itself, the others with their sub-pages). */
export function suPagina(pathname: string, pagina: string): boolean {
  return pagina === '/' ? pathname === '/' : pathname === pagina || pathname.startsWith(`${pagina}/`)
}
