import {
  Banknote,
  CalendarPlus,
  ClipboardList,
  FolderKanban,
  LayoutDashboard,
  ListChecks,
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

export type SezioneNav = 'Economics' | 'Progetti' | 'Generale'

export type VoceNav = {
  href: string
  etichetta: string
  Icona: LucideIcon
  /** Only match the exact path (used by "/"). */
  esatto?: boolean
  /** Pages outside its path that still belong to it (/changelog opens from Impostazioni). */
  anche?: string[]
  /** Area of the app shell: the desktop sidebar groups by it. Default Economics. */
  sezione?: SezioneNav
}

// The Projects area, the same for every role (CLAUDE.md section 3)
const PROGETTI: VoceNav = { href: '/progetti', etichetta: 'Progetti', Icona: FolderKanban, sezione: 'Progetti' }
const MIEI_TASK: VoceNav = { href: '/task', etichetta: 'I miei task', Icona: ListChecks, sezione: 'Progetti' }
const TEMPO: VoceNav = { href: '/tempo', etichetta: 'Il mio tempo', Icona: Timer, sezione: 'Progetti' }
const SOLO_PROGETTI: NavRuolo = { principali: [MIEI_TASK, PROGETTI, TEMPO], altre: [] }

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
      { href: '/calls', etichetta: 'Le mie call', Icona: Phone },
      { href: '/payments', etichetta: 'Incassi', Icona: Wallet },
      { href: '/sales', etichetta: 'Vendite', Icona: Receipt },
    ],
    altre: [
      { href: '/leads', etichetta: 'Pipeline', Icona: SquareKanban },
      { href: '/clients', etichetta: 'Clienti', Icona: Users },
      { href: '/rinnovi', etichetta: 'Rinnovi', Icona: RefreshCw },
      { href: '/setting', etichetta: 'Setting', Icona: TrendingUp },
      { href: '/commissions', etichetta: 'Provvigioni', Icona: Percent },
      { href: '/expenses', etichetta: 'Costi', Icona: Banknote },
      PROGETTI,
      MIEI_TASK,
      // his own time and, in the "Team" tab, everyone's (29/09/2026)
      { ...TEMPO, etichetta: 'Tempo' },
      { href: '/settings', etichetta: 'Impostazioni', Icona: Settings, sezione: 'Generale', anche: ['/changelog'] },
    ],
  },
  setter: {
    principali: [
      { href: '/today', etichetta: 'Oggi', Icona: ClipboardList },
      { href: '/calls/new', etichetta: 'Nuova call', Icona: CalendarPlus },
      { href: '/leads', etichetta: 'Pipeline', Icona: SquareKanban },
      { href: '/my-numbers', etichetta: 'I miei numeri', Icona: TrendingUp },
    ],
    altre: [{ href: '/calls', etichetta: 'Le mie call', Icona: Phone, esatto: true }, PROGETTI, MIEI_TASK, TEMPO],
  },
  closer: {
    principali: [
      { href: '/calls', etichetta: 'Le mie call', Icona: Phone, esatto: true },
      { href: '/leads', etichetta: 'Pipeline', Icona: SquareKanban },
      { href: '/my-sales', etichetta: 'Le mie vendite', Icona: Receipt },
      // the closer half of the Excel: his calls and sales, day by day
      { href: '/setting/closer', etichetta: 'I miei numeri', Icona: TrendingUp },
    ],
    altre: [PROGETTI, MIEI_TASK, TEMPO],
  },
  coach: SOLO_PROGETTI,
  editor: SOLO_PROGETTI,
  nutrizione: SOLO_PROGETTI,
  dev: SOLO_PROGETTI,
}

export function vociNav(ruolo: AppRole): NavRuolo {
  return NAV[ruolo]
}

export function isAttiva(pathname: string, voce: VoceNav): boolean {
  if (voce.esatto) return pathname === voce.href
  return [voce.href, ...(voce.anche ?? [])].some((href) => pathname === href || pathname.startsWith(`${href}/`))
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
