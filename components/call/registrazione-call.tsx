'use client'

import { CircleAlert, ExternalLink, LoaderCircle, Video, VideoOff } from 'lucide-react'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import { collegaRegistrazione, scollegaRegistrazione } from '@/app/(app)/calls/actions'
import { rivalidaTutto } from '@/app/actions/rivalida'
import { PassoRegistrazione } from '@/components/call/passo-registrazione'
import { BottoneTesto, RiassuntoFathom, TrascrizioneFathom } from '@/components/call/testo-fathom'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useLingua } from '@/components/i18n/lingua-provider'
import { REGISTRAZIONE } from '@/lib/call/registrazione'
import { CALL } from '@/lib/i18n/testi/call'
import type { RegistrazioneVista } from '@/lib/call/analisi/vista'
import { normalizzaLink } from '@/lib/fathom/link'
import type { SceltaRegistrazioneInput } from '@/lib/validation/registrazione'

/**
 * The recording on the call's card (1.37.0, CLAUDE.md section 31), for the admin and the call's
 * closer only (the setter's page does not even receive the link). Says what the app knows:
 * the link found on Fathom (with its length), a link Fathom does not have yet, a call not
 * recorded, nothing yet. The transcript and Fathom's summary open in a sheet and are read from
 * Fathom at that moment. No start time, no delay: the app does not time a person's work.
 */
type Props = {
  callId: string
  nomeLead: string
  link: string | null
  registrazione: RegistrazioneVista | null
  /** A held call: with no link yet it says «Registrazione da aggiungere». */
  svolta: boolean
  oggi: string
}

export function RegistrazioneCall({ callId, nomeLead, link, registrazione, svolta, oggi }: Props) {
  const [testo, setTesto] = useState<'trascrizione' | 'riassunto' | null>(null)
  const [foglio, setFoglio] = useState(false)
  const [inCorso, avvia] = useTransition()
  const [cerca, setCerca] = useState(false)
  const [conferma, setConferma] = useState(false)
  // the line that is read follows the page's language; the sheet that writes stays Italian (1.53.0)
  const t = CALL[useLingua()].registrazione

  const nonRegistrata = registrazione?.stato === 'non_registrata'
  const trovata = Boolean(link && registrazione?.recording_id && registrazione.link_verificato === link)
  const fathom = link ? (() => { const n = normalizzaLink(link); return n.ok && n.fathom })() : false
  const minuti = registrazione?.durata_secondi ? Math.round(registrazione.durata_secondi / 60) : null

  if (!link && !nonRegistrata && !svolta) return null

  function salva(scelta: SceltaRegistrazioneInput) {
    avvia(async () => {
      const esito = await collegaRegistrazione({ call_id: callId, scelta }).catch(() => null)
      if (!esito) return void toast.error('Connessione assente. Riprova.')
      if (!esito.ok) return void toast.error(esito.errore)
      setFoglio(false)
      toast.success(scelta.tipo === 'link' ? REGISTRAZIONE.toastCollegata : REGISTRAZIONE.toastNonRegistrata)
    })
  }

  function scollega() {
    if (!conferma) {
      setConferma(true)
      return
    }
    setConferma(false)
    avvia(async () => {
      const esito = await scollegaRegistrazione({ call_id: callId }).catch(() => null)
      if (!esito) return void toast.error('Connessione assente. Riprova.')
      if (!esito.ok) return void toast.error(esito.errore)
      toast.success('Registrazione scollegata.')
    })
  }

  async function cercaSuFathom() {
    if (!link) return
    setCerca(true)
    try {
      const r = await fetch('/api/fathom/cerca', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ call_id: callId, url: link }),
      })
      const corpo = (await r.json().catch(() => ({}))) as { esito?: string; errore?: string }
      if (corpo.esito === 'trovata') {
        toast.success(REGISTRAZIONE.scheda.verificaFatta)
        // a write outside a server action: the whole app is redrawn by the server action (CLAUDE.md section 10)
        await rivalidaTutto()
      } else {
        toast.warning(corpo.errore ?? REGISTRAZIONE.nonTrovata)
      }
    } catch {
      toast.warning(REGISTRAZIONE.erroreFathom)
    } finally {
      setCerca(false)
    }
  }

  return (
    <div className="mt-1 space-y-1 pl-[4.25rem]" data-testid="registrazione-call">
      <p className="flex min-h-9 items-center gap-1.5 text-sm" data-testid="registrazione-riga">
        {nonRegistrata ? (
          <>
            <VideoOff className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            {t.nonRegistrata}
          </>
        ) : link ? (
          <>
            <Video className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            {trovata ? t.suFathom(minuti) : fathom ? t.nonVerificata : t.link}
          </>
        ) : (
          <>
            <CircleAlert className="size-4 shrink-0 text-status-warning" aria-hidden="true" />
            <span className="text-status-warning">{t.daAggiungere}</span>
          </>
        )}
      </p>
      <div className="flex flex-wrap gap-2">
        {link ? (
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-border px-3 text-sm hover:bg-muted"
          >
            <ExternalLink className="size-4" aria-hidden="true" />
            {t.apri}
            <span className="sr-only"> ({nomeLead})</span>
          </a>
        ) : null}
        {trovata ? (
          <>
            <BottoneTesto etichetta={REGISTRAZIONE.scheda.trascrizione} onClick={() => setTesto('trascrizione')} />
            <BottoneTesto etichetta={REGISTRAZIONE.scheda.riassunto} onClick={() => setTesto('riassunto')} />
          </>
        ) : link && fathom ? (
          <Button type="button" variant="outline" className="h-11" disabled={cerca} onClick={() => void cercaSuFathom()}>
            {cerca ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
            {REGISTRAZIONE.scheda.verificaDiNuovo}
          </Button>
        ) : null}
        <Button type="button" variant="ghost" className="h-11" disabled={inCorso} onClick={() => setFoglio(true)}>
          {link || nonRegistrata ? REGISTRAZIONE.scheda.cambia : REGISTRAZIONE.scheda.aggiungi}
        </Button>
        {link || nonRegistrata ? (
          <Button type="button" variant="ghost" className="h-11 text-muted-foreground" disabled={inCorso} onClick={scollega} onBlur={() => setConferma(false)}>
            {conferma ? 'Tocca ancora per scollegare' : REGISTRAZIONE.scheda.scollega}
          </Button>
        ) : null}
      </div>

      <TrascrizioneFathom callId={callId} aperto={testo === 'trascrizione'} onChiudi={() => setTesto(null)} />
      <RiassuntoFathom callId={callId} aperto={testo === 'riassunto'} onChiudi={() => setTesto(null)} />

      <Sheet open={foglio} onOpenChange={setFoglio}>
        <SheetContent side="bottom" className="mx-auto max-h-[calc(100dvh-1rem)] w-full max-w-lg overflow-y-auto rounded-t-xl pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
          <SheetHeader>
            <SheetTitle>{REGISTRAZIONE.titolo}</SheetTitle>
            <SheetDescription>{nomeLead}</SheetDescription>
          </SheetHeader>
          <div className="px-4">
            <PassoRegistrazione
              callId={callId}
              disabilitato={inCorso}
              valore={link ? { tipo: 'link', url: link } : null}
              oggi={oggi}
              onScelta={salva}
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
