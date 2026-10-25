'use client'

import { GraduationCap } from 'lucide-react'

import { useTesti } from '@/components/i18n/lingua-provider'
import { useTutorial } from '@/components/tutorial/tutorial'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { TUTTI_I_RUOLI } from '@/lib/auth/roles'
import { TUTORIAL } from '@/lib/i18n/testi/tutorial'
import { PERCORSI } from '@/lib/tutorial/percorsi'
import { cn } from '@/lib/utils'

/**
 * Admin only: the tour of any role, as a preview (it does not mark anything as
 * seen). Desktop: top right. Phone: in the profile, next to "Rivedi il tutorial".
 */
export function TestaTutorial({
  conEtichetta = false,
  variant = 'ghost',
  className,
}: {
  conEtichetta?: boolean
  variant?: 'ghost' | 'outline'
  className?: string
}) {
  const { avvia } = useTutorial()
  const t = useTesti(TUTORIAL)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant={variant}
            aria-label={t.testa}
            data-tour="testa-tutorial"
            className={cn('h-11 gap-2', conEtichetta ? 'px-3' : 'w-11 px-0', className)}
          />
        }
      >
        <GraduationCap className="size-5 text-muted-foreground" aria-hidden="true" />
        {conEtichetta ? <span className="text-sm font-medium">{t.testa}</span> : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t.tutorialDi}</DropdownMenuLabel>
          {/* a role without a tour (the business coach, 1.58.0) is not offered */}
          {TUTTI_I_RUOLI.filter((ruolo) => PERCORSI[ruolo].length > 0).map((ruolo) => (
            <DropdownMenuItem key={ruolo} className="min-h-11 px-3" onClick={() => avvia(ruolo)}>
              {t.funzioni[ruolo]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
