import {
  Banknote,
  CalendarPlus,
  ChartNoAxesCombined,
  Clapperboard,
  ClipboardList,
  FolderKanban,
  Handshake,
  Images,
  LayoutDashboard,
  Lightbulb,
  ListChecks,
  Megaphone,
  MessagesSquare,
  Percent,
  Phone,
  Receipt,
  RefreshCw,
  Settings,
  SquareKanban,
  Timer,
  TrendingUp,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react'

import type { AppRole } from '@/lib/auth/roles'

/**
 * The title of a group of the menu (1.38.0, Dany 16/10/2026: "sistemami la
 * parte grafica di dove trovo che cosa… diviso per categoria"). The same
 * titles on the desktop sidebar and in the phone's "Altro" sheet; null is the
 * group without a title (the admin's Panoramica, on top of the others).
 */
export type TitoloGruppo =
  | 'Vendite'
  | 'Team'
  | 'Marketing'
  | 'Progetti'
  | 'Amministrazione'
  | 'Il mio lavoro'
  | 'Generale'

export type GruppoNav = { titolo: TitoloGruppo | null; voci: VoceNav[] }

export type VoceNav = {
  href: string
  etichetta: string
  Icona: LucideIcon
  /** Only match the exact path (used by "/"). */
  esatto?: boolean
  /**
   * The item also lights on these pages, which are tabs of its own page, not
   * routes under it (1.38.0: "Setter" of the admin and "Oggi" of the setter
   * stay lit on /insight, their "Insight 24h" tab).
   */
  attivaAnche?: string[]
  /**
   * The item carries the number of the person's own past calls still without
   * an outcome (admin and closer, 07/10/2026): counted in the app layout, shown
   * only to the person who has to record them (CLAUDE.md section 17).
   */
  esiti?: true
  /**
   * The item carries the number of the setters' days proposed from the
   * Instagram DMs and still to decide (08/10/2026): the setter's own on
   * "Oggi", every setter's on the admin's "Setter" (Dany: "una tab con una
   * notifica «tracciamento setter da approvare»").
   */
  daApprovare?: true
  /**
   * The item carries the number of the setter's own days from 08/10/2026
   * still without the required comment of the day (Dany, 08/10/2026: "deve
   * lui sempre lasciare un commento della giornata"): only on his "Oggi",
   * never to the admin (CLAUDE.md section 17).
   */
  commenti?: true
  /**
   * The item carries the number of Instagram posts still to link to the
   * content calendar (1.33.0 on the tab, 1.38.0 on the menu item too): posts
   * to link, never persons (CLAUDE.md section 17).
   */
  daCollegare?: true
}

// The Projects area, the same for every role (CLAUDE.md section 3)
const PROGETTI: VoceNav = { href: '/progetti', etichetta: 'Progetti', Icona: FolderKanban }
const MIEI_TASK: VoceNav = { href: '/task', etichetta: 'I miei task', Icona: ListChecks }
const TEMPO: VoceNav = { href: '/tempo', etichetta: 'Il mio tempo', Icona: Timer }
// The changelog, for every role: each person reads the items of their own work
// (CLAUDE.md section 23). In "Altro", never in the bottom bar's four items. The
// megaphone from 1.35.0: the sparkles are the Insight's.
const NOVITA: VoceNav = { href: '/changelog', etichetta: 'Novità', Icona: Megaphone }

// The Marketing area, the content calendar, Notion's "Instagram Posts" (Dany,
// 08/10/2026): the admin, the video editor and marketing (RUOLI_MARKETING).
// Since 1.38.0 every page of the area is an item of the menu, lit on its own
// page (the tabs on top of the pages stay). Only "Post di Instagram" carries a
// number: the posts to link, never persons (CLAUDE.md section 17).
const CONTENUTI: VoceNav = { href: '/marketing/contenuti', etichetta: 'Contenuti', Icona: Clapperboard }
const POST_INSTAGRAM: VoceNav = {
  href: '/marketing/instagram',
  etichetta: 'Post di Instagram',
  Icona: Images,
  daCollegare: true,
}
const ANALISI: VoceNav = { href: '/marketing/analisi', etichetta: 'Analisi', Icona: ChartNoAxesCombined }
const SPUNTI: VoceNav = { href: '/marketing/spunti', etichetta: 'Spunti', Icona: Lightbulb }
const VOCI_MARKETING: VoceNav[] = [CONTENUTI, POST_INSTAGRAM, ANALISI, SPUNTI]

// Setter and Closer, two items instead of the old "Setting" with two tabs
// (Dany, 07/10/2026): the URLs stay, many links and Alfire use them. "Setter"
// lights only on itself and on its Insight tab, "Closer" also on its day
// (/setting/closer/giorno). The Insight of the last 24 hours is not an item
// any more (1.38.0): it is a tab of "Setter" for the admin and of "Oggi" for
// the setter, on /insight (CLAUDE.md section 29).
const SETTER: VoceNav = {
  href: '/setting',
  etichetta: 'Setter',
  Icona: MessagesSquare,
  esatto: true,
  attivaAnche: ['/insight'],
  daApprovare: true,
}
const CLOSER: VoceNav = { href: '/setting/closer', etichetta: 'Closer', Icona: Handshake }

export type NavRuolo = {
  /** The sidebar: every item of the role in groups, in order. */
  gruppi: GruppoNav[]
  /** Up to 4 items: they are the mobile bottom bar. */
  principali: VoceNav[]
  /** Everything else, in the sidebar's order. */
  altre: VoceNav[]
  /** The same "everything else" in the sidebar's groups, for the phone's "Altro" sheet. */
  gruppiAltro: GruppoNav[]
}

/**
 * A role's menu: the groups of the sidebar and the hrefs of the bar's items
 * (the phone's bottom bar). The "Altro" sheet holds the rest, with the same
 * group titles.
 */
function menu(gruppi: GruppoNav[], barra: string[]): NavRuolo {
  const tutte = gruppi.flatMap((g) => g.voci)
  const principali = barra.map((href) => {
    const voce = tutte.find((v) => v.href === href)
    if (!voce) throw new Error(`La barra in basso nomina ${href}, che il menu non ha`)
    return voce
  })
  const nellaBarra = new Set(barra)
  const gruppiAltro = gruppi
    .map((g) => ({ titolo: g.titolo, voci: g.voci.filter((v) => !nellaBarra.has(v.href)) }))
    .filter((g) => g.voci.length > 0)
  return { gruppi, principali, altre: gruppiAltro.flatMap((g) => g.voci), gruppiAltro }
}

// The Projects area alone: coach, nutrizione and dev.
const SOLO_PROGETTI = menu(
  [
    { titolo: 'Progetti', voci: [MIEI_TASK, PROGETTI, TEMPO] },
    { titolo: 'Generale', voci: [NOVITA] },
  ],
  ['/task', '/progetti', '/tempo'],
)

const NAV: Record<AppRole, NavRuolo> = {
  admin: menu(
    [
      { titolo: null, voci: [{ href: '/', etichetta: 'Panoramica', Icona: LayoutDashboard, esatto: true }] },
      {
        titolo: 'Vendite',
        voci: [
          // Dany is also the default closer: after a call, his outcome screen must be
          // one tap away on the phone. He books calls too (29/09/2026): "Nuova call"
          // is the button on that page, so /calls/new keeps this item lit.
          { href: '/calls', etichetta: 'Le mie call', Icona: Phone, esiti: true },
          { href: '/leads', etichetta: 'Pipeline', Icona: SquareKanban },
          { href: '/clients', etichetta: 'Clienti', Icona: Users },
          { href: '/sales', etichetta: 'Vendite', Icona: Receipt },
          { href: '/payments', etichetta: 'Incassi', Icona: Wallet },
          { href: '/rinnovi', etichetta: 'Rinnovi', Icona: RefreshCw },
        ],
      },
      {
        titolo: 'Team',
        // the setters' days from Instagram still to decide on "Setter" (08/10/2026); his calls to record on top of the
        // closer's numbers (07/10/2026)
        voci: [SETTER, { ...CLOSER, esiti: true }, { href: '/commissions', etichetta: 'Provvigioni', Icona: Percent }],
      },
      { titolo: 'Marketing', voci: VOCI_MARKETING },
      // his own time and, in the "Team" tab, everyone's (29/09/2026)
      { titolo: 'Progetti', voci: [PROGETTI, MIEI_TASK, { ...TEMPO, etichetta: 'Tempo' }] },
      {
        titolo: 'Amministrazione',
        voci: [
          { href: '/expenses', etichetta: 'Costi', Icona: Banknote },
          { href: '/settings', etichetta: 'Impostazioni', Icona: Settings },
          NOVITA,
        ],
      },
    ],
    ['/', '/calls', '/setting', '/marketing/contenuti'],
  ),
  setter: menu(
    [
      {
        titolo: 'Il mio lavoro',
        voci: [
          // his days from Instagram still to decide, as cards on top of the page (08/10/2026),
          // his days still without the required comment (08/10/2026) and the recap of the DMs
          // of the last 24 hours as its second tab (1.38.0)
          {
            href: '/today',
            etichetta: 'Oggi',
            Icona: ClipboardList,
            daApprovare: true,
            commenti: true,
            attivaAnche: ['/insight'],
          },
          { href: '/calls/new', etichetta: 'Nuova call', Icona: CalendarPlus },
          { href: '/calls', etichetta: 'Le mie call', Icona: Phone, esatto: true },
          { href: '/leads', etichetta: 'Pipeline', Icona: SquareKanban },
          { href: '/my-numbers', etichetta: 'I miei numeri', Icona: TrendingUp },
        ],
      },
      // the closer's numbers of every setter, read only (Dany, 07/10/2026: "il setter può accedere alla tab closer")
      { titolo: 'Team', voci: [CLOSER] },
      { titolo: 'Progetti', voci: [PROGETTI, MIEI_TASK, TEMPO] },
      { titolo: 'Generale', voci: [NOVITA] },
    ],
    ['/today', '/calls/new', '/leads', '/my-numbers'],
  ),
  closer: menu(
    [
      {
        titolo: 'Il mio lavoro',
        voci: [
          { href: '/calls', etichetta: 'Le mie call', Icona: Phone, esatto: true, esiti: true },
          { href: '/leads', etichetta: 'Pipeline', Icona: SquareKanban },
          { href: '/my-sales', etichetta: 'Le mie vendite', Icona: Receipt },
          // the closer half of the Excel: his calls and sales, day by day
          { href: '/setting/closer', etichetta: 'I miei numeri', Icona: TrendingUp, esiti: true },
        ],
      },
      { titolo: 'Progetti', voci: [PROGETTI, MIEI_TASK, TEMPO] },
      { titolo: 'Generale', voci: [NOVITA] },
    ],
    ['/calls', '/leads', '/my-sales', '/setting/closer'],
  ),
  coach: SOLO_PROGETTI,
  // the video editor still lands on his tasks; the calendar is his fourth item
  editor: menu(
    [
      { titolo: 'Progetti', voci: [MIEI_TASK, PROGETTI, TEMPO] },
      { titolo: 'Marketing', voci: VOCI_MARKETING },
      { titolo: 'Generale', voci: [NOVITA] },
    ],
    ['/task', '/progetti', '/tempo', '/marketing/contenuti'],
  ),
  // marketing lands on the calendar, and works in Projects like the video editor
  marketing: menu(
    [
      { titolo: 'Marketing', voci: VOCI_MARKETING },
      { titolo: 'Progetti', voci: [MIEI_TASK, PROGETTI, TEMPO] },
      { titolo: 'Generale', voci: [NOVITA] },
    ],
    ['/marketing/contenuti', '/task', '/progetti', '/tempo'],
  ),
  nutrizione: SOLO_PROGETTI,
  dev: SOLO_PROGETTI,
}

export function vociNav(ruolo: AppRole): NavRuolo {
  return NAV[ruolo]
}

/** "1 esito da registrare", "3 esiti da registrare": the badge's words for screen readers. */
export function testoEsiti(numero: number): string {
  return `${numero} ${numero === 1 ? 'esito' : 'esiti'} da registrare`
}

/** "1 giornata da approvare", "3 giornate da approvare". */
export function testoDaApprovare(numero: number): string {
  return `${numero} ${numero === 1 ? 'giornata' : 'giornate'} da approvare`
}

/** "1 commento da scrivere", "3 commenti da scrivere". */
export function testoCommenti(numero: number): string {
  return `${numero} ${numero === 1 ? 'commento' : 'commenti'} da scrivere`
}

/** "1 post da collegare", "3 post da collegare". */
export function testoDaCollegare(numero: number): string {
  return `${numero} post da collegare`
}

/** What a navigation item reminds the person of: never someone else's (CLAUDE.md section 17). */
export type Promemoria = {
  /** Their own past calls still without an outcome (admin and closer). */
  esiti: number
  /** The setters' days from Instagram still to decide (the setter's own; every setter's for the admin). */
  daApprovare: number
  /** The setter's own days still without the required comment (the setter only). */
  commenti: number
  /** Instagram posts still to link to the calendar (admin, video editor, marketing): posts, never persons. */
  daCollegare: number
}

export const NESSUN_PROMEMORIA: Promemoria = { esiti: 0, daApprovare: 0, commenti: 0, daCollegare: 0 }

/**
 * The accessible name of an item with its badge, "Le mie call, 2 esiti da
 * registrare", "Setter, 1 giornata da approvare", "Altro, 2 esiti da
 * registrare, 1 giornata da approvare", "Oggi, 1 giornata da approvare, 2
 * commenti da scrivere", "Post di Instagram, 5 post da collegare"; undefined
 * without one (the visible label is the name).
 */
export function nomeConPromemoria(etichetta: string, promemoria: Promemoria): string | undefined {
  const parti = [
    promemoria.esiti > 0 ? testoEsiti(promemoria.esiti) : null,
    promemoria.daApprovare > 0 ? testoDaApprovare(promemoria.daApprovare) : null,
    promemoria.commenti > 0 ? testoCommenti(promemoria.commenti) : null,
    promemoria.daCollegare > 0 ? testoDaCollegare(promemoria.daCollegare) : null,
  ].filter((parte) => parte !== null)
  return parti.length > 0 ? `${etichetta}, ${parti.join(', ')}` : undefined
}

/** The same with the outcomes only. */
export function nomeConEsiti(etichetta: string, numero: number): string | undefined {
  return nomeConPromemoria(etichetta, { ...NESSUN_PROMEMORIA, esiti: numero })
}

/** The badge of an item: the count when the item carries it and there is something to record. */
export function esitiDellaVoce(voce: VoceNav, esitiDaRegistrare: number): number {
  return voce.esiti && esitiDaRegistrare > 0 ? esitiDaRegistrare : 0
}

/** What an item carries of the person's reminders: zero where it carries nothing. */
export function promemoriaDellaVoce(voce: VoceNav, promemoria: Promemoria): Promemoria {
  return {
    esiti: esitiDellaVoce(voce, promemoria.esiti),
    daApprovare: voce.daApprovare && promemoria.daApprovare > 0 ? promemoria.daApprovare : 0,
    commenti: voce.commenti && promemoria.commenti > 0 ? promemoria.commenti : 0,
    daCollegare: voce.daCollegare && promemoria.daCollegare > 0 ? promemoria.daCollegare : 0,
  }
}

/**
 * "Altro" on the phone: what its items carry. The same count on two items (the
 * outcomes on "Le mie call" and on "Closer") is one count, not two.
 */
export function promemoriaDiAltro(voci: VoceNav[], promemoria: Promemoria): Promemoria {
  const delleVoci = voci.map((voce) => promemoriaDellaVoce(voce, promemoria))
  return {
    esiti: Math.max(0, ...delleVoci.map((p) => p.esiti)),
    daApprovare: Math.max(0, ...delleVoci.map((p) => p.daApprovare)),
    commenti: Math.max(0, ...delleVoci.map((p) => p.commenti)),
    daCollegare: Math.max(0, ...delleVoci.map((p) => p.daCollegare)),
  }
}

/** The digit on the badge: the counts an item carries add up, its name says each. */
export function totalePromemoria(promemoria: Promemoria): number {
  return promemoria.esiti + promemoria.daApprovare + promemoria.commenti + promemoria.daCollegare
}

function sotto(pathname: string, prefisso: string): boolean {
  return pathname === prefisso || pathname.startsWith(`${prefisso}/`)
}

export function isAttiva(pathname: string, voce: VoceNav): boolean {
  if (voce.attivaAnche?.some((pagina) => sotto(pathname, pagina))) return true
  if (voce.esatto) return pathname === voce.href
  return sotto(pathname, voce.href)
}
