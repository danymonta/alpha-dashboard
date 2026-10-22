import { CircleCheck } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'

import { CAMPI_CALL_CLOSER, SchedaCall, type CallVista } from '@/app/(app)/calls/scheda-call'
import { aggiungiGiorni, oggiRoma } from '@/lib/date'
import { formato } from '@/lib/format'
import type { Lingua } from '@/lib/i18n/lingua'
import { CLOSER } from '@/lib/i18n/testi/closer'
import { createClient } from '@/lib/supabase/server'

/** The oldest calls without an outcome shown on top of the page; the heading counts them all. */
export const LIMITE_DA_REGISTRARE = 50

type Voce = { id: string; nome: string }

export type CallDaRegistrare = {
  /** Past calls still to be recorded (stato programmata), the oldest first. */
  daRegistrare: CallVista[]
  /** How many there are in all: the badge of the navigation counts the same. */
  totale: number
  /** Today's other calls, by time: the ones still to be held and those already recorded. */
  diOggi: CallVista[]
  prodotti: Voce[]
  oggi: string
  adesso: number
}

/**
 * The person's own calls to record (Dany, 07/10/2026: "devo ricordarmi di farlo
 * ogni giorno"): the past ones still without an outcome, the same rule as the
 * badge of the navigation (closer_id = himself, stato programmata, before now),
 * and today's. Always and only the calls of whoever opens the page, never
 * another closer's (RLS gives the admin every call: the filter says whose).
 * Kept out of the render: it reads the clock.
 */
export async function caricaCallDaRegistrare(profiloId: string): Promise<CallDaRegistrare> {
  const supabase = await createClient()
  const adesso = Date.now()
  const oggi = oggiRoma(new Date(adesso))

  const [aperte, giornata, catalogo] = await Promise.all([
    supabase
      .from('calls')
      .select(CAMPI_CALL_CLOSER, { count: 'exact' })
      .eq('closer_id', profiloId)
      .eq('stato', 'programmata')
      .lt('programmata_il', new Date(adesso).toISOString())
      .order('programmata_il', { ascending: true })
      .limit(LIMITE_DA_REGISTRARE),
    // Rome is UTC+1 or +2: this window holds the whole Italian day, the filter below cuts it
    supabase
      .from('calls')
      .select(CAMPI_CALL_CLOSER)
      .eq('closer_id', profiloId)
      .gte('programmata_il', `${aggiungiGiorni(oggi, -1)}T12:00:00Z`)
      .lt('programmata_il', `${aggiungiGiorni(oggi, 1)}T12:00:00Z`)
      .order('programmata_il', { ascending: true })
      .limit(200),
    supabase.from('products').select('id, nome').eq('attivo', true).order('nome'),
  ])
  if (aperte.error || giornata.error || catalogo.error) throw new Error('Impossibile caricare le call da registrare')

  const daRegistrare = aperte.data as unknown as CallVista[]
  const mostrate = new Set(daRegistrare.map((c) => c.id))
  return {
    daRegistrare,
    totale: aperte.count ?? daRegistrare.length,
    // a call of today already in the list above is not shown twice
    diOggi: (giornata.data as unknown as CallVista[]).filter(
      (c) => oggiRoma(new Date(c.programmata_il)) === oggi && !mostrate.has(c.id),
    ),
    prodotti: catalogo.data ?? [],
    oggi,
    adesso,
  }
}

function Titolo({ id, children, descrizione }: { id: string; children: ReactNode; descrizione?: string }) {
  return (
    <div className="px-1">
      <h2 id={id} className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {children}
      </h2>
      {descrizione ? <p className="text-sm text-muted-foreground">{descrizione}</p> : null}
    </div>
  )
}

type Props = CallDaRegistrare & {
  admin: boolean
  /** Who a call can be handed to: the admin's list; the closer keeps his calls. */
  closers: Voce[]
  /** "Compila la giornata" of today. */
  hrefGiornata: string
  /** Where the sale of a call closed here comes back: this page. */
  tornaA: string
  /** The page's language (1.53.0). */
  lingua?: Lingua
}

/**
 * On top of the closer's page, before the numbers of the period: the calls of
 * the person who opens it still to record, with the same cards and buttons as
 * "Le mie call" (Registra esito, Sposta…). The number of calls left is said
 * only to that person, as in the navigation (CLAUDE.md section 17).
 */
export function DaRegistrare({
  daRegistrare,
  totale,
  diOggi,
  prodotti,
  oggi,
  adesso,
  admin,
  closers,
  hrefGiornata,
  tornaA,
  lingua = 'it',
}: Props) {
  const t = CLOSER[lingua]
  const { formatNumero } = formato(lingua)
  const scheda = (c: CallVista, mostraGiorno: boolean) => (
    <SchedaCall
      key={c.id}
      call={c}
      closers={closers}
      prodotti={prodotti}
      oggi={oggi}
      adesso={adesso}
      vista="closer"
      admin={admin}
      mostraGiorno={mostraGiorno}
      eliminabile={admin}
      tornaA={tornaA}
      lingua={lingua}
    />
  )

  return (
    <div className="space-y-5" data-testid="esiti-closer">
      <section aria-labelledby="da-registrare" className="space-y-2" data-testid="da-registrare">
        {daRegistrare.length > 0 ? (
          <>
            <Titolo
              id="da-registrare"
              descrizione={
                totale > daRegistrare.length ? t.daRegistrare.piuVecchie(formatNumero(daRegistrare.length)) : t.daRegistrare.tutte
              }
            >
              {t.daRegistrare.titolo(formatNumero(totale))}
            </Titolo>
            <div className="space-y-2">{daRegistrare.map((c) => scheda(c, true))}</div>
          </>
        ) : (
          <>
            <h2 id="da-registrare" className="sr-only">
              {t.daRegistrare.titoloSr}
            </h2>
            <p className="flex flex-wrap items-center gap-x-3 rounded-xl border border-dashed border-border px-3 py-1 text-sm text-muted-foreground">
              <span className="inline-flex min-h-11 items-center gap-2">
                <CircleCheck className="size-4 shrink-0 text-status-ok" aria-hidden="true" />
                {t.daRegistrare.nessuno}
              </span>
              <Link
                href={hrefGiornata}
                className="inline-flex min-h-11 items-center rounded-sm text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                {t.compila}
              </Link>
            </p>
          </>
        )}
      </section>

      {diOggi.length > 0 ? (
        <section aria-labelledby="call-di-oggi" className="space-y-2" data-testid="call-di-oggi">
          <Titolo id="call-di-oggi">{t.daRegistrare.oggi(formatNumero(diOggi.length))}</Titolo>
          <div className="space-y-2">{diOggi.map((c) => scheda(c, false))}</div>
        </section>
      ) : null}
    </div>
  )
}
