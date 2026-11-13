'use client'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import type { PersonaTeam } from '@/lib/percorso/letture'
import { TESTI_PERCORSO as T } from '@/lib/percorso/testi'

function iniziali(nome: string) {
  return nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
}

/**
 * The people who follow the client (release B1a): name, photo and role from
 * percorso_cliente().team, never an email. The photo is Google's or the app's own (the
 * area's policy allows both); without it, the initials.
 */
export function TeamCliente({ team }: { team: readonly PersonaTeam[] }) {
  if (team.length === 0) return null
  return (
    <ul aria-label={T.ilTuoTeam} className="grid gap-3 sm:grid-cols-[repeat(auto-fit,minmax(11rem,1fr))]" data-testid="team-cliente">
      {team.map((p) => (
        <li key={p.incarico} className="flex items-center gap-3 rounded-xl bg-muted/40 p-3 sm:flex-col sm:text-center">
          <Avatar className="size-12 sm:size-14">
            {p.fotoUrl ? <AvatarImage src={p.fotoUrl} alt="" referrerPolicy="no-referrer" /> : null}
            <AvatarFallback className="text-sm font-semibold">{iniziali(p.nome)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate font-medium">{p.nome}</p>
            <p className="text-sm text-muted-foreground">{p.ruolo || T.ruoli[p.incarico]}</p>
          </div>
        </li>
      ))}
    </ul>
  )
}
