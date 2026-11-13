'use client'

import { useState } from 'react'

import { Timeline } from '@/components/percorso/timeline'
import { frazioneNodo } from '@/lib/percorso/animazioni'
import { nodiDaPassi } from '@/lib/percorso/campo-base'
import type { PassoPercorso } from '@/lib/percorso/letture'

/**
 * The timeline of the client's onboarding for his team (1.83.0): the same animated `Timeline` the
 * client sees, read only (a stage tapped is only highlighted), from the steps of
 * onboarding_scheda_incaricato.
 */
export function TimelineTeam({
  passi,
}: {
  passi: readonly { chiave: string; titolo: string | null; nodo: string | null; attore: string | null; stato: string; completato_il: string | null }[]
}) {
  const nodi = nodiDaPassi(passi)
  const comePassi: PassoPercorso[] = passi.map((p) => ({
    chiave: p.chiave,
    titolo: p.titolo ?? p.chiave,
    nodo: p.nodo ?? '',
    attore: p.attore === 'team' ? 'team' : 'cliente',
    stato: p.stato as PassoPercorso['stato'],
    completatoIl: p.completato_il,
    blocchi: null,
  }))
  const attuale = nodi.find((n) => n.stato === 'attuale')?.chiave ?? null
  const [scelto, setScelto] = useState<string | null>(attuale)
  return (
    <Timeline
      nodi={nodi}
      frazioni={nodi.map((n) => frazioneNodo(n, comePassi))}
      selezionato={scelto}
      onSeleziona={setScelto}
    />
  )
}
