'use client'

import { CalendarPlus, CircleCheck, LoaderCircle } from 'lucide-react'
import Link from 'next/link'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import { aggiungiIdeaSpuntiAlCalendario } from '@/app/(app)/marketing/spunti/actions'
import { Button } from '@/components/ui/button'
import { ETICHETTA_FORMAT, ETICHETTA_REEL_TYPE } from '@/lib/marketing/etichette'
import type { IdeaSpunto } from '@/lib/marketing/spunti/tipi'

const FASE = { attrazione: 'Attrazione', consapevolezza: 'Consapevolezza', vendita: 'Vendita' } as const

/** An idea of the brief, ready for the calendar: «Aggiungi al calendario» once, then a link to the content. */
export function IdeaSpuntiCard({
  spuntiId,
  indice,
  idea,
  giaNelCalendario,
}: {
  spuntiId: string
  indice: number
  idea: IdeaSpunto
  giaNelCalendario: { id: string; nome: string } | null
}) {
  const [aggiunta, setAggiunta] = useState<{ id: string; nome: string } | null>(giaNelCalendario)
  const [inCorso, avvia] = useTransition()

  function aggiungi() {
    avvia(async () => {
      const r = await aggiungiIdeaSpuntiAlCalendario({ spunti_id: spuntiId, indice }).catch(() => null)
      if (!r) return void toast.error('Connessione assente. Riprova.')
      if (!r.ok) return void toast.error(r.errore)
      setAggiunta({ id: r.id, nome: r.nome })
      toast.success('Aggiunta al calendario', { description: r.nome })
    })
  }

  return (
    <li className="space-y-2 rounded-xl bg-card p-4" data-testid="idea-spunti">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <span>{idea.modello === 'carousel' ? 'Carousel Topic' : 'Reel Topic'}</span>·<span>{FASE[idea.fase]}</span>·
        <span>{ETICHETTA_REEL_TYPE[idea.reel_type]}</span>
        {idea.format ? <><span>·</span><span>{ETICHETTA_FORMAT[idea.format]}</span></> : null}
      </div>
      <h3 className="text-sm font-medium break-words">{idea.name}</h3>
      <p className="text-sm break-words">
        <span className="text-muted-foreground">Gancio:</span> {idea.gancio}
      </p>
      {idea.messaggio ? <p className="text-sm break-words text-muted-foreground">{idea.messaggio}</p> : null}
      <details>
        <summary className="min-h-11 cursor-pointer py-2.5 text-sm text-muted-foreground">Script e perché</summary>
        <div className="space-y-1 pb-1 text-sm break-words">
          <p>Hook: {idea.script.hook}</p>
          {idea.script.righe.map((r, i) => (
            <p key={i}>{idea.modello === 'carousel' ? `Slide ${i + 2}` : 'Line'}: {r}</p>
          ))}
          {idea.script.cta ? <p>CTA: {idea.script.cta}</p> : null}
          {idea.perche ? <p className="text-muted-foreground">Perché: {idea.perche}</p> : null}
        </div>
      </details>
      {aggiunta ? (
        <p className="flex min-h-11 flex-wrap items-center gap-2 text-sm" data-testid="idea-aggiunta">
          <CircleCheck className="size-4 shrink-0 text-status-ok" aria-hidden="true" />
          Nel calendario
          <Link href={`/marketing/contenuti?contenuto=${aggiunta.id}`} className="underline underline-offset-4">
            Apri il contenuto
          </Link>
        </p>
      ) : (
        <Button type="button" variant="outline" className="h-11" disabled={inCorso} onClick={aggiungi}>
          {inCorso ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <CalendarPlus className="size-4" aria-hidden="true" />}
          Aggiungi al calendario
        </Button>
      )}
    </li>
  )
}
