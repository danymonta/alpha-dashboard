import { CalendarPlus, ChevronLeft, ChevronRight, PhoneOff } from 'lucide-react'
import Link from 'next/link'

import { CAMPI_CALL_CLOSER, SchedaCall, type CallVista } from '@/app/(app)/calls/scheda-call'
import { SceltaGiorno } from '@/app/(app)/setting/closer/giorno/scelta-giorno'
import { LinkBottone } from '@/components/link-bottone'
import { LegendaSezione } from '@/components/metriche/legenda-sezione'
import { EtichettaConNota } from '@/components/metriche/nota'
import { IntestazionePagina } from '@/components/pagina/intestazione'
import { FiltroSelect } from '@/components/pm/filtri'
import { StatoVuoto } from '@/components/stati/stato-vuoto'
import { requireRuolo } from '@/lib/auth/session'
import { aggiungiGiorni, etichettaGiorno, isDataISO, oggiRoma } from '@/lib/date'
import { formatData, formatEuro, formatNumero, parseDataISO } from '@/lib/format'
import { LEGENDA_CLOSER, type VoceLegenda } from '@/lib/metriche/legenda'
import { isUuid } from '@/lib/progetti'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

const PERCORSO = '/setting/closer/giorno'

type Parametri = Record<string, string | string[] | undefined>

type Conti = {
  call: number
  qualificate: number
  no_show: number
  follow_up: number
  cancellate: number
  chiuse: number
  cash: number
  revenue: number
}

// The day's row of Dany's Excel, CLOSER half, in its order: counts, then the money
const COLONNE: readonly { campo: keyof Conti; voce: VoceLegenda; euro?: true }[] = [
  { campo: 'call', voce: LEGENDA_CLOSER.call },
  { campo: 'qualificate', voce: LEGENDA_CLOSER.qualificate },
  { campo: 'no_show', voce: LEGENDA_CLOSER.no_show },
  { campo: 'follow_up', voce: LEGENDA_CLOSER.follow_up },
  { campo: 'cancellate', voce: LEGENDA_CLOSER.cancellate },
  { campo: 'chiuse', voce: LEGENDA_CLOSER.chiuse },
  { campo: 'cash', voce: LEGENDA_CLOSER.cash, euro: true },
  { campo: 'revenue', voce: LEGENDA_CLOSER.revenue, euro: true },
]

const giornoSettimana = new Intl.DateTimeFormat('it-IT', { weekday: 'long' })

/** "Oggi", "Ieri", "Domani", or the weekday ("Giovedì"): the full date sits next to it. */
function nomeGiorno(data: string, oggi: string): string {
  const relativo = etichettaGiorno(data, oggi)
  if (['Oggi', 'Ieri', 'Domani'].includes(relativo)) return relativo
  const nome = giornoSettimana.format(parseDataISO(data))
  return nome.charAt(0).toUpperCase() + nome.slice(1)
}

function primo(valore: string | string[] | undefined): string | undefined {
  return Array.isArray(valore) ? valore[0] : valore
}

/** This page on another day; the closer filter stays, today leaves the URL. */
function hrefGiorno(data: string, oggi: string, closer: string | undefined): string {
  const parametri = new URLSearchParams()
  if (data !== oggi) parametri.set('data', data)
  if (closer) parametri.set('closer', closer)
  const testo = parametri.toString()
  return testo ? `${PERCORSO}?${testo}` : PERCORSO
}

/** Data loading, kept out of the render: it reads the clock. */
async function caricaGiornata(data: string, closerId: string, admin: boolean) {
  const supabase = await createClient()

  // Rome is UTC+1 or +2: this window holds the whole Italian day, the filter below cuts it
  const [conti, chiamate, catalogo] = await Promise.all([
    supabase.rpc('giornate_closer', { p_da: data, p_a: data, p_closer: closerId }),
    supabase
      .from('calls')
      .select(CAMPI_CALL_CLOSER)
      .eq('closer_id', closerId)
      .gte('programmata_il', `${aggiungiGiorni(data, -1)}T12:00:00Z`)
      .lt('programmata_il', `${aggiungiGiorni(data, 1)}T12:00:00Z`)
      .order('programmata_il', { ascending: true })
      .limit(200),
    supabase.from('products').select('id, nome').eq('attivo', true).order('nome'),
  ])
  if (conti.error || chiamate.error || catalogo.error) throw new Error('Impossibile caricare la giornata')

  // the day's numbers from SQL: the total row (data null) of a one-day period;
  // on a day where nothing happened its sums are null, read as zero
  const riga = (conti.data ?? []).find((r) => r.data === null)
  const adesso = Date.now()

  return {
    conti: Object.fromEntries(COLONNE.map(({ campo }) => [campo, Number(riga?.[campo] ?? 0)])) as Conti,
    calls: (chiamate.data as unknown as CallVista[]).filter((c) => oggiRoma(new Date(c.programmata_il)) === data),
    prodotti: catalogo.data ?? [],
    adesso,
    // the closer keeps his calls; the admin can hand one to another closer
    puoRiassegnare: admin,
  }
}

export default async function CompilaGiornataPage({ searchParams }: { searchParams: Promise<Parametri> }) {
  const profilo = await requireRuolo(['admin', 'closer'])
  const admin = profilo.ruolo === 'admin'
  const oggi = oggiRoma()
  const parametri = await searchParams

  const richiesta = primo(parametri.data)
  const data = isDataISO(richiesta) ? richiesta : oggi

  // Who closes: the closers, and the admin who closes too (Dany is the default closer)
  let closers: { id: string; nome: string }[] = []
  if (admin) {
    const supabase = await createClient()
    const { data: persone, error } = await supabase
      .from('profiles')
      .select('id, nome, ruolo')
      .eq('attivo', true)
      .in('ruolo', ['admin', 'closer'])
      .order('created_at')
    if (error) throw new Error('Impossibile caricare i closer')
    // admins first (Dany), then closers: the same order as "Nuova call"
    closers = [...persone.filter((p) => p.ruolo === 'admin'), ...persone.filter((p) => p.ruolo === 'closer')].map(
      ({ id, nome }) => ({ id, nome }),
    )
  }
  const richiesto = primo(parametri.closer)
  // a closer always gets his own day; the admin his own unless he picks another closer
  const altroCloser =
    admin && isUuid(richiesto) && richiesto !== profilo.id && closers.some((c) => c.id === richiesto) ? richiesto : undefined
  const closerId = altroCloser ?? profilo.id

  const { conti, calls, prodotti, adesso, puoRiassegnare } = await caricaGiornata(data, closerId, admin)

  const precedente = aggiungiGiorni(data, -1)
  const successivo = aggiungiGiorni(data, 1)
  // "Aggiungi una call" comes back here, on this very day
  const qui = `${PERCORSO}?${new URLSearchParams({ data, ...(altroCloser ? { closer: altroCloser } : {}) }).toString()}`
  const nuovaCall = `/calls/new?${new URLSearchParams({
    data,
    ...(altroCloser ? { closer: altroCloser } : {}),
    da: qui,
  }).toString()}`

  const aggiungi = admin ? (
    <LinkBottone href={nuovaCall}>
      <CalendarPlus className="size-4" aria-hidden="true" />
      Aggiungi una call
    </LinkBottone>
  ) : null

  return (
    <div className="max-w-3xl space-y-5">
      <IntestazionePagina
        titolo="Compila la giornata"
        indietro={{ href: '/setting/closer', etichetta: admin ? 'Closer' : 'I miei numeri' }}
        descrizione="Registra l’esito di ogni call del giorno: la riga del closer si compila da sola."
        azione={aggiungi}
      />

      <nav className="flex items-center justify-between gap-2" aria-label="Cambia giorno">
        <NavGiorno href={hrefGiorno(precedente, oggi, altroCloser)} etichetta="Giorno precedente">
          <ChevronLeft className="size-5" aria-hidden="true" />
        </NavGiorno>
        <div className="min-w-0 text-center">
          <h2 className="font-heading text-lg font-semibold" data-testid="giorno">
            {nomeGiorno(data, oggi)}
            <span className="num ml-2 text-sm font-normal text-muted-foreground">{formatData(data)}</span>
          </h2>
          <SceltaGiorno data={data} percorso={PERCORSO} closer={altroCloser} />
        </div>
        <NavGiorno href={hrefGiorno(successivo, oggi, altroCloser)} etichetta="Giorno successivo">
          <ChevronRight className="size-5" aria-hidden="true" />
        </NavGiorno>
      </nav>

      {closers.length > 1 ? (
        <FiltroSelect
          id="filtro-closer"
          etichetta="Closer"
          nome="closer"
          valore={closerId}
          predefinito={profilo.id}
          opzioni={closers.map((c) => ({ valore: c.id, etichetta: c.id === profilo.id ? `${c.nome} (tu)` : c.nome }))}
          parametri={{ data: data === oggi ? undefined : data, closer: altroCloser }}
        />
      ) : null}

      <section aria-labelledby="riga-del-giorno" className="space-y-2">
        <h2 id="riga-del-giorno" className="px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          La riga del giorno
        </h2>
        {/* 390px: counts three by three, the money two by two; wider, four by four, the money last */}
        <dl className="grid grid-cols-6 gap-x-3 gap-y-4 rounded-xl bg-card p-4 md:grid-cols-4" data-testid="riga-giorno">
          {COLONNE.map((c) => (
            <div
              key={c.campo}
              className={cn('min-w-0 md:col-span-1', c.euro ? 'col-span-3' : 'col-span-2')}
              data-testid={`conto-${c.campo}`}
            >
              <dt className="text-xs text-muted-foreground">
                <EtichettaConNota voce={c.voce} />
              </dt>
              <dd
                className={cn(
                  'num text-xl font-semibold',
                  c.euro && 'text-base md:text-xl',
                  Number(conti[c.campo]) === 0 && 'text-muted-foreground',
                )}
              >
                {c.euro ? formatEuro(conti[c.campo]) : formatNumero(conti[c.campo])}
              </dd>
            </div>
          ))}
        </dl>
        <p className="px-1 text-xs text-muted-foreground">
          I numeri vengono dagli esiti registrati su ogni call qui sotto; cash e revenue dalla vendita che registri
          quando una call è chiusa.
        </p>
      </section>

      <section aria-labelledby="call-del-giorno" className="space-y-2">
        <h2 id="call-del-giorno" className="px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Le call del giorno ({calls.length})
        </h2>
        {calls.length === 0 ? (
          <StatoVuoto
            Icona={PhoneOff}
            titolo="Nessuna call in questo giorno"
            descrizione={
              admin
                ? 'Una call fatta che qui non c’è? Aggiungila: poi ne registri l’esito da qui.'
                : 'Le call che ti assegnano compaiono qui, con l’esito da registrare.'
            }
            azione={
              aggiungi ?? (
                <LinkBottone href="/calls" variant="outline">
                  Vai alle mie call
                </LinkBottone>
              )
            }
          />
        ) : (
          <div className="space-y-2" data-testid="call-del-giorno">
            {calls.map((c) => (
              <SchedaCall
                key={c.id}
                call={c}
                closers={puoRiassegnare ? closers : []}
                prodotti={prodotti}
                oggi={oggi}
                adesso={adesso}
                vista="closer"
                admin={admin}
                mostraGiorno={false}
                eliminabile={admin}
                // a call closed here: the sale is dated on this day and comes back here
                tornaA={qui}
              />
            ))}
          </div>
        )}
      </section>

      <LegendaSezione voci={COLONNE.map((c) => c.voce)} />
    </div>
  )
}

function NavGiorno({ href, etichetta, children }: { href: string; etichetta: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-label={etichetta}
      className="flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      {children}
    </Link>
  )
}
