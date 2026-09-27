'use client'

import { GraduationCap } from 'lucide-react'

import { useTutorial } from '@/components/tutorial/tutorial'
import { Button } from '@/components/ui/button'

export function RivediTutorial() {
  const { avvia } = useTutorial()
  return (
    <Button type="button" variant="outline" className="h-11" onClick={() => avvia()}>
      <GraduationCap className="size-4" aria-hidden="true" />
      Rivedi il tutorial
    </Button>
  )
}
