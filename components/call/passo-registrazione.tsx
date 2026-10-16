'use client'

import { CircleCheck, CircleX, ExternalLink, LoaderCircle, TriangleAlert, VideoOff } from 'lucide-react'
import { useId, useRef, useState } from 'react'

import { ErroreCampo } from '@/components/form/errore-campo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { REGISTRAZIONE } from '@/lib/call/registrazione'
import { formatOra, oggiRoma } from '@/lib/date'
import { normalizzaLink } from '@/lib/fathom/link'
import type { SceltaRegistrazioneInput } from '@/lib/validation/registrazione'

/**
 * «La registrazione della call» (1.37.0, CLAUDE.md section 31): the step of the outcome sheet
 * that asks the link of the recording on Fathom, for a held call that closed, went to
 * follow-up or was lost. Two ways out of the link: «Call non registrata» (one tap, no
 * reason) and, when Fathom does not answer, saving the link as it is. The link is checked
 * with POST /api/fathom/cerca (the recording is looked for in a window around the call);
 * the sheet shows what was found, the title only to be recognised. Nothing is saved here:
 * `onScelta` hands the choice to the sheet, which sends it with the outcome.
 */

type Risposta =
  | { esito: 'trovata'; link: string; titolo: string | null; inizio: string | null; durata_minuti: number | null }
  | { esito: 'non_trovata' | 'non_fathom'; link: string }
  | { esito: 'link_non_valido' | 'non_collegato' | 'errore'; errore: string }

type Fase = { fase: 'libera' } | { fase: 'cerco' } | { fase: 'risposta'; risposta: Risposta; link: string }

type Props = {
  callId: string
  disabilitato?: boolean
  /** The choice already made (the sheet came back to change it). */
  valore: SceltaRegistrazioneInput | null
  onScelta: (scelta: SceltaRegistrazioneInput) => void
  /** Whether the call's day is today or later is the sheet's; the words below only need the day to show «oggi». */
  oggi: string
}

export function PassoRegistrazione({ callId, disabilitato = false, valore, onScelta, oggi }: Props) {
  const id = useId()
  const [link, setLink] = useState(valore?.tipo === 'link' ? valore.url : '')
  const [fase, setFase] = useState<Fase>({ fase: 'libera' })
  const [errore, setErrore] = useState<string | null>(null)
  const campo = useRef<HTMLInputElement>(null)

  async function verifica() {
    const n = normalizzaLink(link)
    if (!n.ok) {
      setErrore(n.errore)
      campo.current?.focus()
      return
    }
    setErrore(null)
    setFase({ fase: 'cerco' })
    let risposta: Risposta
    try {
      const r = await fetch('/api/fathom/cerca', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ call_id: callId, url: link }),
      })
      risposta = (await r.json()) as Risposta
      if (!r.ok) risposta = { esito: 'errore', errore: REGISTRAZIONE.erroreFathom }
    } catch {
      risposta = { esito: 'errore', errore: REGISTRAZIONE.erroreFathom }
    }
    setFase({ fase: 'risposta', risposta, link: n.canonico })
  }

  const cerco = fase.fase === 'cerco'
  const r = fase.fase === 'risposta' ? fase.risposta : null
  const canonico = fase.fase === 'risposta' ? fase.link : null

  return (
    <div className="space-y-4" data-testid="passo-registrazione">
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-link`}>{REGISTRAZIONE.campo}</Label>
        <p id={`${id}-aiuto`} className="text-xs text-muted-foreground">
          {REGISTRAZIONE.aiuto}
        </p>
        <Input
          ref={campo}
          id={`${id}-link`}
          type="url"
          inputMode="url"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          value={link}
          onChange={(e) => {
            setLink(e.currentTarget.value)
            setErrore(null)
            if (fase.fase === 'risposta') setFase({ fase: 'libera' })
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              if (!cerco && link.trim() !== '') void verifica()
            }
          }}
          aria-invalid={errore ? true : undefined}
          aria-describedby={`${id}-aiuto${errore ? ` ${id}-errore` : ''}`}
          placeholder="https://fathom.video/share/…"
          className="h-11 wrap-anywhere"
          disabled={disabilitato}
        />
        <ErroreCampo id={`${id}-errore`} messaggio={errore ?? undefined} />
      </div>

      {r === null ? (
        <Button
          type="button"
          className="h-11 w-full"
          disabled={disabilitato || cerco || link.trim() === ''}
          aria-busy={cerco}
          onClick={() => void verifica()}
        >
          {cerco ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <ExternalLink className="size-4" aria-hidden="true" />}
          {cerco ? REGISTRAZIONE.verificando : REGISTRAZIONE.verifica}
        </Button>
      ) : (
        <div className="space-y-2" role="status" data-testid="registrazione-risposta">
          {r.esito === 'trovata' ? (
            <p className="flex items-start gap-2 text-sm">
              <CircleCheck className="mt-0.5 size-4 shrink-0 text-status-ok" aria-hidden="true" />
              {REGISTRAZIONE.trovata(r.titolo, quandoDa(r.inizio, oggi), r.durata_minuti)}
            </p>
          ) : (
            <p className="flex items-start gap-2 text-sm">
              {r.esito === 'non_fathom' || r.esito === 'non_trovata' ? (
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-status-warning" aria-hidden="true" />
              ) : (
                <CircleX className="mt-0.5 size-4 shrink-0 text-status-critical" aria-hidden="true" />
              )}
              {fraseNegativa(r)}
            </p>
          )}
          {r.esito === 'link_non_valido' ? (
            <Button type="button" variant="outline" className="h-11 w-full" onClick={() => setFase({ fase: 'libera' })}>
              {REGISTRAZIONE.correggi}
            </Button>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                className="h-11 whitespace-normal"
                disabled={disabilitato}
                onClick={() => onScelta({ tipo: 'link', url: canonico ?? link })}
              >
                {r.esito === 'trovata' ? REGISTRAZIONE.usa : r.esito === 'non_fathom' ? REGISTRAZIONE.salvaLink : REGISTRAZIONE.salvaCosi}
              </Button>
              <Button type="button" variant="outline" className="h-11" onClick={() => { setFase({ fase: 'libera' }); campo.current?.focus() }}>
                {REGISTRAZIONE.correggi}
              </Button>
            </div>
          )}
        </div>
      )}

      <div className="space-y-1">
        <Button
          type="button"
          variant="outline"
          className="h-11 w-full justify-start gap-2"
          disabled={disabilitato || cerco}
          aria-describedby={`${id}-non-registrata`}
          onClick={() => onScelta({ tipo: 'non_registrata' })}
        >
          <VideoOff className="size-4" aria-hidden="true" />
          {REGISTRAZIONE.nonRegistrata}
        </Button>
        <p id={`${id}-non-registrata`} className="text-xs text-muted-foreground">
          {REGISTRAZIONE.nonRegistrataAiuto}
        </p>
      </div>

      <p className="text-xs text-muted-foreground" data-testid="registrazione-analisi">
        {REGISTRAZIONE.analisi}
      </p>
    </div>
  )
}

function fraseNegativa(r: Exclude<Risposta, { esito: 'trovata' }>): string {
  switch (r.esito) {
    case 'non_fathom':
      return REGISTRAZIONE.nonFathom
    case 'non_trovata':
      return REGISTRAZIONE.nonTrovata
    case 'non_collegato':
      return REGISTRAZIONE.nonCollegato
    case 'errore':
      return REGISTRAZIONE.erroreFathom
    default:
      return r.errore
  }
}

/** «oggi alle 18:03» / «14/10 alle 18:03» for the start of a recording. */
function quandoDa(inizio: string | null, oggi: string): string {
  if (!inizio) return 'senza orario'
  const giorno = oggiRoma(new Date(inizio))
  const ora = formatOra(inizio)
  if (giorno === oggi) return `oggi alle ${ora}`
  const [, m, d] = giorno.split('-')
  return `${d}/${m} alle ${ora}`
}
