'use client'

import {
  ChevronLeft,
  CircleCheck,
  FolderKanban,
  Hourglass,
  Lock,
  Receipt,
  Rocket,
  ShieldAlert,
  UserRoundPlus,
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

import { IndicatorePassi } from '@/app/(app)/onboarding/nuovo/indicatore'
import { useLingua } from '@/components/i18n/lingua-provider'
import { LinkBottone } from '@/components/link-bottone'
import { ConfermaPagamento } from '@/components/onboarding/conferma-pagamento'
import { Copia } from '@/components/onboarding/copia'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { VetroLiquido } from '@/components/vetro/vetro-liquido'
import { ONBOARDING } from '@/lib/i18n/testi/onboarding'
import { linkJoin, messaggioPronto } from '@/lib/onboarding/link'
import { createClient } from '@/lib/supabase/client'
import type { StatoInvito } from '@/lib/validation/onboarding'

/** What the wizard hands over when the onboarding is started. */
export type DatiFine = {
  idCliente: string
  idInvito: string
  idVendita: string
  /** The state the link was born in: waiting for the payment, or active already. */
  stato: StatoInvito
  /** «Mario Rossi», as the title says it. */
  nome: string
  /** The first name alone, for the ready message. */
  nomeDiBattesimo: string
  /** A minor: the link waits for a parent's consent, whatever the payment. */
  minorenne: boolean
  /** onboarding_impostazioni.aperto_ai_clienti: «Copia link» and the ready message only with it. */
  aperto: boolean
  /** The titles of the wizard's steps, for the indicator (all done). */
  passi: readonly { chiave: string; titolo: string }[]
}

/** What the last screen reads by itself, with the browser's session (RLS: the admin). */
type Lette = {
  progettoId: string | null
  link: { indirizzo: string; messaggio: string } | null
}

/**
 * The last screen of the wizard: «Onboarding avviato per …», the state of the link and
 * the ways on. «Conferma pagamento» is the one primary action while the link waits for
 * the payment; then it is «Apri la scheda». «Copia link» and the ready message appear
 * only with the client area open; otherwise one line says why. The project and the link
 * are read here, from the browser (never from a server action: CLAUDE.md, «Fluidità»).
 */
export function SchermataFine({ dati, onAltroCliente }: { dati: DatiFine; onAltroCliente: () => void }) {
  const router = useRouter()
  const lingua = useLingua()
  const t = ONBOARDING[lingua]
  const f = t.wizard.fine
  const [stato, setStato] = useState<StatoInvito>(dati.stato)
  const [confermato, setConfermato] = useState(false)
  const [lette, setLette] = useState<Lette | null>(null)
  const titolo = useRef<HTMLHeadingElement>(null)

  // the screen takes the place of the wizard: the focus goes to its title
  useEffect(() => {
    titolo.current?.focus()
  }, [])

  // the project of the client and, with the client area open, his link: once, and again when the link turns active
  useEffect(() => {
    let vivo = true
    async function leggi() {
      const supabase = createClient()
      const { data: riga } = await supabase
        .from('v_onboarding')
        .select('progetto_id, slug, invito_stato')
        .eq('client_id', dati.idCliente)
        .maybeSingle()
      let link: Lette['link'] = null
      if (dati.aperto && riga?.slug && riga.invito_stato === 'attivo') {
        const { data: token } = await supabase
          .from('onboarding_inviti_token')
          .select('token')
          .eq('invito_id', dati.idInvito)
          .maybeSingle()
        const indirizzo = token ? linkJoin(riga.slug, token.token) : null
        if (indirizzo) link = { indirizzo, messaggio: messaggioPronto(dati.nomeDiBattesimo, indirizzo) }
      }
      if (vivo) setLette({ progettoId: riga?.progetto_id ?? null, link })
    }
    leggi().catch(() => {
      // a read that fails hides «Apri il progetto» and the link: the card has them both
      if (vivo) setLette({ progettoId: null, link: null })
    })
    return () => {
      vivo = false
    }
  }, [dati.idCliente, dati.idInvito, dati.aperto, dati.nomeDiBattesimo, stato])

  const attivo = stato === 'attivo'
  const inAttesa = stato === 'in_attesa_pagamento'
  const attendeConsenso = inAttesa && dati.minorenne
  // the payment can still be confirmed: once for a minor, whose link stays on hold after it
  const daConfermare = inAttesa && !confermato

  return (
    <div className="max-w-xl space-y-6" data-testid="onboarding-avviato">
      <Link
        href="/onboarding"
        className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-lg pr-3 pl-1 text-sm text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
        {t.titolo}
      </Link>

      <IndicatorePassi passi={dati.passi.map((p) => ({ ...p, stato: 'fatto' as const }))} completo />

      <VetroLiquido raggio={16} sfocatura={12} piega={0.3} className="wizard-avanti rounded-2xl px-5 py-8 text-center">
        {/* the one gold element of the screen: the mark of a started onboarding, with its two rings */}
        <div className="relative mx-auto mb-5 size-16" aria-hidden="true">
          <span className="wizard-anello absolute inset-0 rounded-full border border-gold" />
          <span className="wizard-anello wizard-anello-secondo absolute inset-0 rounded-full border border-gold" />
          <span className="wizard-spunta relative flex size-16 items-center justify-center rounded-full border border-gold/60 text-gold">
            <Rocket className="size-7" />
          </span>
        </div>
        <h1
          ref={titolo}
          tabIndex={-1}
          className="scroll-mt-24 font-heading text-xl font-semibold break-words outline-none md:text-2xl"
        >
          {f.titolo(dati.nome)}
        </h1>
        <p
          className={`mt-3 inline-flex items-start justify-center gap-1.5 text-sm ${
            attivo ? 'text-status-ok' : attendeConsenso ? 'text-status-warning' : 'text-muted-foreground'
          }`}
          role="status"
          data-testid="stato-link"
          data-stato={attivo ? 'attivo' : attendeConsenso ? 'in_attesa_consenso' : 'in_attesa_pagamento'}
        >
          {attivo ? (
            <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          ) : attendeConsenso ? (
            <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          ) : (
            <Hourglass className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          )}
          {attivo ? f.attivo : attendeConsenso ? f.inAttesaConsenso : f.inAttesa}
        </p>
      </VetroLiquido>

      <div className="wizard-sale space-y-3">
        {daConfermare ? (
          <div className="flex flex-wrap items-center gap-2 rounded-xl bg-card p-3" data-testid="fine-pagamento">
            <ConfermaPagamento
              invitoId={dati.idInvito}
              cliente={dati.nome}
              attendeConsenso={attendeConsenso}
              aperto={dati.aperto}
              onFatto={(nuovo) => {
                setStato(nuovo)
                setConfermato(true)
              }}
            />
            <LinkBottone href={`/sales/${dati.idVendita}`} variant="outline">
              <Receipt className="size-4" aria-hidden="true" />
              {f.registraIncasso}
            </LinkBottone>
          </div>
        ) : null}

        {dati.aperto ? (
          lette?.link ? (
            <div className="space-y-3 rounded-xl bg-card p-3" data-testid="fine-link">
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">{t.link.indirizzo}</p>
                <p className="num rounded-lg border border-border px-2.5 py-2 text-sm break-all select-all">
                  {lette.link.indirizzo}
                </p>
                <Copia
                  testo={lette.link.indirizzo}
                  etichetta={t.link.copiaLink}
                  fatto={t.link.linkCopiato}
                  testId="copia-link"
                />
              </div>
              <div className="space-y-1.5 border-t border-border pt-3">
                <p className="text-xs text-muted-foreground">{t.messaggio.titolo}</p>
                {/* the message goes to the client: Italian in both languages */}
                <p lang="it" className="text-sm whitespace-pre-line break-words">
                  {lette.link.messaggio}
                </p>
                <Copia
                  testo={lette.link.messaggio}
                  etichetta={t.link.copiaMessaggio}
                  fatto={t.link.messaggioCopiato}
                  testId="copia-messaggio"
                />
                <p className="text-xs text-muted-foreground">{f.mandaLink}</p>
              </div>
            </div>
          ) : null
        ) : (
          <p className="flex items-start gap-2 rounded-xl bg-card p-3 text-sm text-muted-foreground" data-testid="area-non-aperta">
            <Lock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {f.nonAperto}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <LinkBottone href={`/onboarding/${dati.idCliente}`} variant={daConfermare ? 'outline' : 'default'}>
            {t.apriScheda}
          </LinkBottone>
          {lette === null ? (
            <Skeleton className="h-11 w-40 rounded-lg" />
          ) : lette.progettoId ? (
            <LinkBottone href={`/progetti/${lette.progettoId}`} variant="outline" data-testid="apri-progetto">
              <FolderKanban className="size-4" aria-hidden="true" />
              {t.apriProgetto}
            </LinkBottone>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            className="h-11"
            onClick={() => {
              onAltroCliente()
              router.push('/onboarding/nuovo')
            }}
          >
            <UserRoundPlus className="size-4" aria-hidden="true" />
            {f.altroCliente}
          </Button>
        </div>
      </div>
    </div>
  )
}
