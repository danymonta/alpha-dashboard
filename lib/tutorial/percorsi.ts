import type { AppRole } from '@/lib/auth/roles'

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
] as const

/** What each role does, as the tour and the admin's preview menu call it. */
export const FUNZIONE: Record<AppRole, string> = {
  admin: 'Admin',
  setter: 'Setter',
  closer: 'Closer',
  coach: 'Coach fitness',
  editor: 'Video editor',
  nutrizione: 'Nutrizione',
  dev: 'Sviluppo',
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

function soloProgetti(funzione: string, progetti: string): PassoTutorial[] {
  return [
    benvenuto(funzione),
    tocca('/task', 'vai-task', 'I miei task', 'Tocca «I miei task»: è la tua pagina di tutti i giorni.'),
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
  ),
  nutrizione: soloProgetti(FUNZIONE.nutrizione, 'Apri un progetto per vedere panoramica, task con le scadenze, Gantt e note.'),
  dev: soloProgetti(FUNZIONE.dev, 'Apri un progetto per vedere panoramica, task con le scadenze, Gantt e note.'),
}

/** How long a step stays before it can be closed or skipped: time to read. */
export const ATTESA_LETTURA_MS = 2000

/** Is `pathname` the step's page ("/" only itself, the others with their sub-pages). */
export function suPagina(pathname: string, pagina: string): boolean {
  return pagina === '/' ? pathname === '/' : pathname === pagina || pathname.startsWith(`${pagina}/`)
}
