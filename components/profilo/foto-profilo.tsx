'use client'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'

export function iniziali(nome: string): string {
  const parti = nome.trim().split(/\s+/).filter(Boolean)
  const lettere = parti.length > 1 ? parti[0][0] + parti[parti.length - 1][0] : (parti[0] ?? '?').slice(0, 2)
  return lettere.toUpperCase()
}

/** The person's photo (Google or uploaded), initials while it loads or when there is none. */
export function FotoProfilo({
  nome,
  foto,
  className,
}: {
  nome: string
  foto: string | null
  className?: string
}) {
  return (
    <Avatar className={cn('size-9', className)}>
      {foto ? (
        // Google photos refuse requests that carry a referrer
        <AvatarImage src={foto} alt="" referrerPolicy="no-referrer" />
      ) : null}
      <AvatarFallback className="bg-secondary text-xs font-medium text-foreground">{iniziali(nome)}</AvatarFallback>
    </Avatar>
  )
}
