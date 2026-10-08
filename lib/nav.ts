import {
  Banknote,
  CalendarPlus,
  ClipboardList,
  FolderKanban,
  Handshake,
  LayoutDashboard,
  ListChecks,
  MessagesSquare,
  Percent,
  Phone,
  Receipt,
  RefreshCw,
  Settings,
  Sparkles,
  SquareKanban,
  Timer,
  TrendingUp,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react'

import type { AppRole } from '@/lib/auth/roles'

export type SezioneNav = 'Economics' | 'Progetti' | 'Generale'

export type VoceNav = {
  href: string
  etichetta: string
  Icona: LucideIcon
  /** Only match the exact path (used by "/"). */
  esatto?: boolean
  /** Area of the app shell: the desktop sidebar groups by it. Default Economics. */
  sezione?: SezioneNav
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
}

// The Projects area, the same for every role (CLAUDE.md section 3)
const PROGETTI: VoceNav = { href: '/progetti', etichetta: 'Progetti', Icona: FolderKanban, sezione: 'Progetti' }
const MIEI_TASK: VoceNav = { href: '/task', etichetta: 'I miei task', Icona: ListChecks, sezione: 'Progetti' }
const TEMPO: VoceNav = { href: '/tempo', etichetta: 'Il mio tempo', Icona: Timer, sezione: 'Progetti' }
// The changelog, for every role: each person reads the items of their own work
// (CLAUDE.md section 23). In "Altro", never in the bottom bar's four items.
const NOVITA: VoceNav = { href: '/changelog', etichetta: 'Novità', Icona: Sparkles, sezione: 'Generale' }
const SOLO_PROGETTI: NavRuolo = { principali: [MIEI_TASK, PROGETTI, TEMPO], altre: [NOVITA] }

// Setter and Closer, two items instead of the old "Setting" with two tabs
// (Dany, 07/10/2026): the URLs stay, many links and Alfire use them. "Setter"
// lights only on itself, "Closer" also on its day (/setting/closer/giorno).
const SETTER: VoceNav = { href: '/setting', etichetta: 'Setter', Icona: MessagesSquare, esatto: true }
const CLOSER: VoceNav = { href: '/setting/closer', etichetta: 'Closer', Icona: Handshake }

export type NavRuolo = {
  /** Up to 4 items: they are the mobile bottom bar. */
  principali: VoceNav[]
  /** Everything else: desktop sidebar and the mobile "Altro" sheet. */
  altre: VoceNav[]
}

const NAV: Record<AppRole, NavRuolo> = {
  admin: {
    // Dany is also the default closer: after a call, his outcome screen must be
    // one tap away on the phone. He books calls too (29/09/2026): "Nuova call"
    // is the button on that page, so /calls/new keeps this item lit.
    principali: [
      { href: '/', etichetta: 'Panoramica', Icona: LayoutDashboard, esatto: true },
      { href: '/calls', etichetta: 'Le mie call', Icona: Phone, esiti: true },
      { href: '/payments', etichetta: 'Incassi', Icona: Wallet },
      { href: '/sales', etichetta: 'Vendite', Icona: Receipt },
    ],
    altre: [
      { href: '/leads', etichetta: 'Pipeline', Icona: SquareKanban },
      { href: '/clients', etichetta: 'Clienti', Icona: Users },
      { href: '/rinnovi', etichetta: 'Rinnovi', Icona: RefreshCw },
      // the setters' days from Instagram still to decide, on top of the page (08/10/2026)
      { ...SETTER, daApprovare: true },
      // his calls to record on top, then the closer's numbers (07/10/2026)
      { ...CLOSER, esiti: true },
      { href: '/commissions', etichetta: 'Provvigioni', Icona: Percent },
      { href: '/expenses', etichetta: 'Costi', Icona: Banknote },
      PROGETTI,
      MIEI_TASK,
      // his own time and, in the "Team" tab, everyone's (29/09/2026)
      { ...TEMPO, etichetta: 'Tempo' },
      NOVITA,
      { href: '/settings', etichetta: 'Impostazioni', Icona: Settings, sezione: 'Generale' },
    ],
  },
  setter: {
    principali: [
      // his days from Instagram still to decide, as cards on top of the page (08/10/2026)
      { href: '/today', etichetta: 'Oggi', Icona: ClipboardList, daApprovare: true },
      { href: '/calls/new', etichetta: 'Nuova call', Icona: CalendarPlus },
      { href: '/leads', etichetta: 'Pipeline', Icona: SquareKanban },
      { href: '/my-numbers', etichetta: 'I miei numeri', Icona: TrendingUp },
    ],
    altre: [
      { href: '/calls', etichetta: 'Le mie call', Icona: Phone, esatto: true },
      // the closer's numbers of every setter, read only (Dany, 07/10/2026: "il setter può accedere alla tab closer")
      CLOSER,
      PROGETTI,
      MIEI_TASK,
      TEMPO,
      NOVITA,
    ],
  },
  closer: {
    principali: [
      { href: '/calls', etichetta: 'Le mie call', Icona: Phone, esatto: true, esiti: true },
      { href: '/leads', etichetta: 'Pipeline', Icona: SquareKanban },
      { href: '/my-sales', etichetta: 'Le mie vendite', Icona: Receipt },
      // the closer half of the Excel: his calls and sales, day by day
      { href: '/setting/closer', etichetta: 'I miei numeri', Icona: TrendingUp, esiti: true },
    ],
    altre: [PROGETTI, MIEI_TASK, TEMPO, NOVITA],
  },
  coach: SOLO_PROGETTI,
  editor: SOLO_PROGETTI,
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

/** What a navigation item reminds the person of: never someone else's (CLAUDE.md section 17). */
export type Promemoria = {
  /** Their own past calls still without an outcome (admin and closer). */
  esiti: number
  /** The setters' days from Instagram still to decide (the setter's own; every setter's for the admin). */
  daApprovare: number
}

export const NESSUN_PROMEMORIA: Promemoria = { esiti: 0, daApprovare: 0 }

/**
 * The accessible name of an item with its badge, "Le mie call, 2 esiti da
 * registrare", "Setter, 1 giornata da approvare", "Altro, 2 esiti da
 * registrare, 1 giornata da approvare"; undefined without one (the visible
 * label is the name).
 */
export function nomeConPromemoria(etichetta: string, promemoria: Promemoria): string | undefined {
  const parti = [
    promemoria.esiti > 0 ? testoEsiti(promemoria.esiti) : null,
    promemoria.daApprovare > 0 ? testoDaApprovare(promemoria.daApprovare) : null,
  ].filter((parte) => parte !== null)
  return parti.length > 0 ? `${etichetta}, ${parti.join(', ')}` : undefined
}

/** The same with the outcomes only. */
export function nomeConEsiti(etichetta: string, numero: number): string | undefined {
  return nomeConPromemoria(etichetta, { esiti: numero, daApprovare: 0 })
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
  }
}

/** The digit on the badge: one item carries one count, "Altro" may carry both. */
export function totalePromemoria(promemoria: Promemoria): number {
  return promemoria.esiti + promemoria.daApprovare
}

export function isAttiva(pathname: string, voce: VoceNav): boolean {
  if (voce.esatto) return pathname === voce.href
  return pathname === voce.href || pathname.startsWith(`${voce.href}/`)
}

/** Items grouped by area, in order, for the sidebar headings. */
export function perSezione(voci: VoceNav[]): { sezione: SezioneNav; voci: VoceNav[] }[] {
  const gruppi: { sezione: SezioneNav; voci: VoceNav[] }[] = []
  for (const voce of voci) {
    const sezione = voce.sezione ?? 'Economics'
    const ultimo = gruppi.at(-1)
    if (ultimo?.sezione === sezione) ultimo.voci.push(voce)
    else gruppi.push({ sezione, voci: [voce] })
  }
  return gruppi
}
