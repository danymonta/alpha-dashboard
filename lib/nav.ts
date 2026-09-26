import {
  Banknote,
  CalendarPlus,
  ClipboardList,
  LayoutDashboard,
  Percent,
  Phone,
  Receipt,
  Settings,
  TrendingUp,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react'

import type { AppRole } from '@/lib/auth/roles'

export type VoceNav = {
  href: string
  etichetta: string
  Icona: LucideIcon
  /** Only match the exact path (used by "/"). */
  esatto?: boolean
}

export type NavRuolo = {
  /** Up to 4 items: they are the mobile bottom bar. */
  principali: VoceNav[]
  /** Everything else: desktop sidebar and the mobile "Altro" sheet. */
  altre: VoceNav[]
}

const NAV: Record<AppRole, NavRuolo> = {
  admin: {
    principali: [
      { href: '/', etichetta: 'Panoramica', Icona: LayoutDashboard, esatto: true },
      { href: '/sales', etichetta: 'Vendite', Icona: Receipt },
      { href: '/payments', etichetta: 'Incassi', Icona: Wallet },
      { href: '/clients', etichetta: 'Clienti', Icona: Users },
    ],
    altre: [
      { href: '/setting', etichetta: 'Setting', Icona: TrendingUp },
      { href: '/commissions', etichetta: 'Provvigioni', Icona: Percent },
      { href: '/expenses', etichetta: 'Costi', Icona: Banknote },
      { href: '/settings/team', etichetta: 'Impostazioni', Icona: Settings },
    ],
  },
  setter: {
    principali: [
      { href: '/today', etichetta: 'Oggi', Icona: ClipboardList },
      { href: '/calls/new', etichetta: 'Nuova call', Icona: CalendarPlus },
      { href: '/calls', etichetta: 'Le mie call', Icona: Phone, esatto: true },
      { href: '/my-numbers', etichetta: 'I miei numeri', Icona: TrendingUp },
    ],
    altre: [],
  },
  closer: {
    principali: [
      { href: '/calls', etichetta: 'Le mie call', Icona: Phone, esatto: true },
      { href: '/my-sales', etichetta: 'Le mie vendite', Icona: Receipt },
    ],
    altre: [],
  },
  coach: { principali: [], altre: [] },
  editor: { principali: [], altre: [] },
  nutrizione: { principali: [], altre: [] },
  dev: { principali: [], altre: [] },
}

export function vociNav(ruolo: AppRole): NavRuolo {
  return NAV[ruolo]
}

export function isAttiva(pathname: string, voce: VoceNav): boolean {
  if (voce.esatto) return pathname === voce.href
  return pathname === voce.href || pathname.startsWith(`${voce.href}/`)
}
