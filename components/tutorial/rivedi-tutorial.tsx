'use client'

import { GraduationCap } from 'lucide-react'

import { useTesti } from '@/components/i18n/lingua-provider'
import { useTutorial } from '@/components/tutorial/tutorial'
import { Button } from '@/components/ui/button'
import { ACCOUNT } from '@/lib/i18n/testi/account'

export function RivediTutorial() {
  const { avvia } = useTutorial()
  const t = useTesti(ACCOUNT)
  return (
    <Button type="button" variant="outline" className="h-11" onClick={() => avvia()}>
      <GraduationCap className="size-4" aria-hidden="true" />
      {t.rivediTutorial}
    </Button>
  )
}
