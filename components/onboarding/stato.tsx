import {
  Ban,
  CircleCheck,
  CircleDashed,
  CirclePause,
  Flag,
  Footprints,
  Hourglass,
  ShieldAlert,
  TimerOff,
  UserRoundPlus,
  type LucideIcon,
} from 'lucide-react'

import type { Lingua } from '@/lib/i18n/lingua'
import { TONO_STATO, etichettaStato, type StatoOnboarding, type TonoStato } from '@/lib/onboarding/stati'
import { cn } from '@/lib/utils'

/** One icon per state: the words say it, the icon and the colour only reinforce (never colour alone). */
const ICONA: Record<StatoOnboarding, LucideIcon> = {
  in_attesa_pagamento: Hourglass,
  in_attesa_consenso: ShieldAlert,
  pronto: CircleCheck,
  in_attesa_registrazione: UserRoundPlus,
  in_corso: Footprints,
  scaduto: TimerOff,
  revocato: Ban,
  sospeso: CirclePause,
  completato: Flag,
  senza_link: CircleDashed,
}

/** The tone of a state as a token of the theme (lib/onboarding/stati.ts decides the tone). */
export const CLASSE_TONO: Record<TonoStato, string> = {
  attesa: 'text-muted-foreground',
  ok: 'text-status-ok',
  avviso: 'text-status-warning',
  critico: 'text-status-critical',
  neutro: 'text-muted-foreground',
}

/** The state of a client's onboarding: icon and words. */
export function StatoOnboardingBadge({
  stato,
  lingua = 'it',
  className,
}: {
  stato: StatoOnboarding
  lingua?: Lingua
  className?: string
}) {
  const Icona = ICONA[stato]
  return (
    <span
      className={cn('inline-flex items-center gap-1.5 text-sm', CLASSE_TONO[TONO_STATO[stato]], className)}
      data-testid="stato-onboarding"
      data-stato={stato}
    >
      <Icona className="size-4 shrink-0" aria-hidden="true" />
      {etichettaStato(stato, lingua)}
    </span>
  )
}
