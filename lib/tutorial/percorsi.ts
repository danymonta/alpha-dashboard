import type { AppRole } from '@/lib/auth/roles'

/**
 * The guided tour shown at the first sign-in, one per role (CLAUDE.md
 * section 21). Configured here, not by the admin: changes go through code.
 *
 * `target` lists data-tour ids in order of preference: the first one visible
 * on screen is highlighted (e.g. a nav item on desktop, "Altro" on the phone
 * when the item lives there). No visible target: the card sits in the middle.
 */
export type PassoTutorial = {
  id: string
  titolo: string
  testo: string
  target?: string[]
}

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
    titolo: 'Benvenuto in Percorso Alpha',
    testo: `Ti mostro in un minuto dove trovi le cose del tuo lavoro da ${funzione.toLowerCase()}. Puoi rivedere questo tour quando vuoi dal tuo profilo.`,
  }
}

const ALFIRE_PROGETTI: PassoTutorial = {
  id: 'alfire',
  titolo: 'Alfire, la nostra AI',
  testo: 'Chiedile quali task hai aperti, come va un progetto o di segnare un task come fatto. Puoi anche parlarle col vocale: scrive solo dopo la tua conferma.',
  target: ['alfire'],
}

const PROFILO: PassoTutorial = {
  id: 'profilo',
  titolo: 'Il tuo profilo',
  testo: 'Tocca la tua foto per cambiarla, correggere il nome, rivedere questo tour o uscire.',
  target: ['profilo'],
}

function soloProgetti(funzione: string, progetti: string, tempo: string): PassoTutorial[] {
  return [
    benvenuto(funzione),
    { id: 'progetti', titolo: 'Progetti', testo: progetti, target: nav('/progetti') },
    { id: 'tempo', titolo: 'Il mio tempo', testo: tempo, target: nav('/tempo') },
    ALFIRE_PROGETTI,
    PROFILO,
  ]
}

const TEMPO_PERSONALE =
  'Tocca la sveglia accanto a un task: il timer resta in alto a destra su ogni pagina e quando lo fermi ti chiede una nota. Il tuo tempo lo vedi tu e chi gestisce il progetto.'

export const PERCORSI: Record<AppRole, PassoTutorial[]> = {
  admin: [
    benvenuto('admin'),
    {
      id: 'panoramica',
      titolo: 'Panoramica',
      testo: 'Il mese in un colpo d’occhio: cash incassato, quanto è nuovo e quanto rinnovo, margine operativo, funnel e chi deve ancora pagare.',
      target: nav('/'),
    },
    {
      id: 'vendite',
      titolo: 'Vendite',
      testo: 'I contratti firmati. Da qui registri una nuova vendita: prodotto o percorso su misura, piano rate, setter e closer.',
      target: nav('/sales'),
    },
    {
      id: 'incassi',
      titolo: 'Incassi',
      testo: 'I soldi, rata per rata: segni incassata con un tocco e le rate in ritardo sono in evidenza.',
      target: nav('/payments'),
    },
    {
      id: 'clienti',
      titolo: 'Clienti',
      testo: 'Ogni cliente con il suo stato, le vendite, le rate e quanto ha pagato nel tempo.',
      target: nav('/clients', 'nav-altro'),
    },
    {
      id: 'impostazioni',
      titolo: 'Impostazioni',
      testo: 'Team e inviti, prodotti, regole provvigioni, reparti e l’esportazione per la commercialista.',
      target: nav('/settings', 'nav-altro'),
    },
    {
      id: 'alfire',
      titolo: 'Alfire, la nostra AI',
      testo: 'Chiedile i numeri o dille cosa registrare, anche col vocale: “Loris ha pagato 2.500 € in contanti”. Scrive solo dopo la tua conferma.',
      target: ['alfire'],
    },
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
    {
      id: 'oggi',
      titolo: 'Oggi',
      testo: 'Il tuo report del giorno: tocca + e − per DM, conversazioni e call. Si salva da solo, ci metti meno di un minuto.',
      target: nav('/today'),
    },
    {
      id: 'nuova-call',
      titolo: 'Nuova call',
      testo: 'Quando fissi una call la registri qui: lead e call nascono insieme, e il closer la trova tra le sue.',
      target: nav('/calls/new'),
    },
    {
      id: 'pipeline',
      titolo: 'Pipeline',
      testo: 'I tuoi lead: spostali da Call da fare a Follow-up, Cliente o Perso con un tocco.',
      target: nav('/leads'),
    },
    {
      id: 'numeri',
      titolo: 'I miei numeri',
      testo: 'Le tue metriche del mese e le provvigioni maturate e già pagate.',
      target: nav('/my-numbers'),
    },
    {
      id: 'alfire',
      titolo: 'Alfire, la nostra AI',
      testo: 'Chiedile come stai andando o dille “aggiungi 20 DM al report di oggi”, anche col vocale. Scrive solo dopo la tua conferma.',
      target: ['alfire'],
    },
    PROFILO,
  ],
  closer: [
    benvenuto('closer'),
    {
      id: 'call',
      titolo: 'Le mie call',
      testo: 'Le call di oggi e le prossime: registri l’esito in tre tocchi. Se chiudi, si apre la vendita già compilata.',
      target: nav('/calls'),
    },
    {
      id: 'pipeline',
      titolo: 'Pipeline',
      testo: 'I lead delle tue call: aggiorna lo stato dopo ogni conversazione.',
      target: nav('/leads'),
    },
    {
      id: 'vendite',
      titolo: 'Le mie vendite',
      testo: 'Le vendite che hai chiuso, con le rate e gli incassi.',
      target: nav('/my-sales'),
    },
    {
      id: 'alfire',
      titolo: 'Alfire, la nostra AI',
      testo: 'Chiedile le call di oggi o di spostarne una, anche col vocale. Scrive solo dopo la tua conferma.',
      target: ['alfire'],
    },
    PROFILO,
  ],
  coach: soloProgetti(
    FUNZIONE.coach,
    'Qui trovi i percorsi dei tuoi clienti: liste con le tappe, task con le scadenze (onboarding, programmazione, call di check), note e Gantt.',
    TEMPO_PERSONALE,
  ),
  editor: soloProgetti(
    FUNZIONE.editor,
    'Qui trovi i progetti di Contenuti e Video: reel e montaggi come task, con scadenze, note e Gantt.',
    TEMPO_PERSONALE,
  ),
  nutrizione: soloProgetti(
    FUNZIONE.nutrizione,
    'Qui trovi i progetti su cui lavori: liste, task con le scadenze, note e Gantt.',
    TEMPO_PERSONALE,
  ),
  dev: soloProgetti(
    FUNZIONE.dev,
    'Qui trovi i progetti su cui lavori: liste, task con le scadenze, note e Gantt.',
    TEMPO_PERSONALE,
  ),
}

/** How long a step stays before it can be closed or skipped: time to read. */
export const ATTESA_LETTURA_MS = 2000
