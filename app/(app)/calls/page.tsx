import { CalendarPlus, PhoneOff } from 'lucide-react'

import { CAMPI_CALL_CLOSER, CAMPI_CALL_SETTER, SchedaCall, type CallVista } from '@/app/(app)/calls/scheda-call'
import { LinkBottone } from '@/components/link-bottone'
import { IntestazionePagina } from '@/components/pagina/intestazione'
import { StatoVuoto } from '@/components/stati/stato-vuoto'
import { requireRuolo } from '@/lib/auth/session'
import { oggiRoma } from '@/lib/date'
import { getLingua } from '@/lib/i18n/server'
import { CALL } from '@/lib/i18n/testi/call'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const GIORNO_MS = 24 * 60 * 60 * 1000

function Sezione({
  titolo,
  descrizione,
  children,
}: {
  titolo: string
  descrizione?: string
  children: React.ReactNode
}) {
  return (
    <section className="space-y-2">
      <div className="px-1">
        <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {titolo}
        </h2>
        {descrizione ? <p className="text-sm text-muted-foreground">{descrizione}</p> : null}
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  )
}

/** Data loading, kept out of the render: it reads the clock. */
async function caricaCall(vista: 'setter' | 'closer', profiloId: string, puoRiassegnare: boolean) {
  const supabase = await createClient()
  const adesso = Date.now()

  const query =
    vista === 'closer'
      ? supabase
          .from('calls')
          .select(CAMPI_CALL_CLOSER)
          .eq('closer_id', profiloId)
          // everything still open (one "In attesa di conferma" waits for its new day),
          // plus what was recorded in the last week
          .or(`stato.in.(programmata,riprogrammata),programmata_il.gte.${new Date(adesso - 7 * GIORNO_MS).toISOString()}`)
          .order('programmata_il', { ascending: true })
          .limit(200)
      : supabase
          .from('calls')
          .select(CAMPI_CALL_SETTER)
          .eq('setter_id', profiloId)
          .gte('programmata_il', new Date(adesso - 30 * GIORNO_MS).toISOString())
          .order('programmata_il', { ascending: true })
          .limit(200)

  const [{ data, error }, senzaVendita, persone, catalogo] = await Promise.all([
    query,
    // the net under "Chiusa" → sale (07/10/2026): every closed call of his still
    // without its sale, whenever it was held. Imported calls never ask
    // (calls.importata, chiedeVendita): their sales came from the Excel, without
    // the call; a mark, never the missing author, which elimina_persona empties
    // too. The sale is looked for whatever closer it carries
    // (public.call_ha_vendita): the closer reads only the sales he closed.
    vista === 'closer'
      ? supabase
          .from('calls')
          .select(CAMPI_CALL_CLOSER)
          .eq('closer_id', profiloId)
          .eq('esito', 'chiusa')
          .eq('importata', false)
          .eq('call_ha_vendita', false)
          .order('programmata_il', { ascending: false })
          .limit(50)
      : Promise.resolve({ data: [], error: null }),
    // who a call can be handed to: the closer keeps their own calls
    puoRiassegnare
      ? supabase.from('profiles').select('id, nome, ruolo').eq('attivo', true).in('ruolo', ['admin', 'closer']).order('created_at')
      : Promise.resolve({ data: [], error: null }),
    vista === 'closer'
      ? supabase.from('products').select('id, nome').eq('attivo', true).order('nome')
      : Promise.resolve({ data: [], error: null }),
  ])
  if (error || senzaVendita.error || persone.error || catalogo.error) throw new Error(CALL[await getLingua()].errore)

  return {
    calls: data as unknown as CallVista[],
    senzaVendita: (senzaVendita.data ?? []) as unknown as CallVista[],
    closers: (persone.data ?? []).map(({ id, nome }) => ({ id, nome })),
    prodotti: catalogo.data ?? [],
    adesso,
    oggi: oggiRoma(new Date(adesso)),
  }
}

export default async function LeMieCallPage() {
  const profilo = await requireRuolo(['setter', 'closer', 'admin'])
  const lingua = await getLingua()
  const t = CALL[lingua]
  const vista = profilo.ruolo === 'setter' ? 'setter' : 'closer'
  const { calls, senzaVendita, closers, prodotti, adesso, oggi } = await caricaCall(
    vista,
    profilo.id,
    profilo.ruolo !== 'closer',
  )

  const passata = (c: CallVista) => new Date(c.programmata_il).getTime() < adesso
  const giorno = (c: CallVista) => oggiRoma(new Date(c.programmata_il))

  const aperte = calls.filter((c) => c.stato === 'programmata')
  const daRegistrare = aperte.filter(passata)
  const future = aperte.filter((c) => !passata(c))
  const diOggi = future.filter((c) => giorno(c) === oggi)
  const prossime = future.filter((c) => giorno(c) !== oggi)
  // "In attesa di conferma" (stato riprogrammata, 04/10/2026): the lead still has to confirm a new day
  const inAttesa = calls.filter((c) => c.stato === 'riprogrammata')
  // a closed call without its sale stays on top until the sale is there; never twice
  const daVendere = new Set(senzaVendita.map((c) => c.id))
  const concluse = calls
    .filter((c) => c.stato !== 'programmata' && c.stato !== 'riprogrammata' && !daVendere.has(c.id))
    .reverse()

  // the admin books too (Dany, 29/09/2026): for himself, for a setter, or a call already done
  const admin = profilo.ruolo === 'admin'
  const bottoneNuova = (
    <LinkBottone href="/calls/new">
      <CalendarPlus className="size-4" aria-hidden="true" />
      {t.nuova}
    </LinkBottone>
  )

  const intestazione =
    vista === 'closer' ? (
      <IntestazionePagina
        titolo={t.titolo}
        descrizione={t.descrizioneCloser}
        azione={admin ? bottoneNuova : undefined}
      />
    ) : (
      <IntestazionePagina
        titolo={t.titolo}
        descrizione={t.descrizioneSetter}
        azione={bottoneNuova}
      />
    )

  if (calls.length === 0 && senzaVendita.length === 0) {
    return (
      <div className="max-w-2xl">
        {intestazione}
        {vista === 'setter' ? (
          <StatoVuoto
            Icona={CalendarPlus}
            titolo={t.vuotoSetter}
            descrizione={t.vuotoSetterDescrizione}
            azione={<LinkBottone href="/calls/new">{t.fissa}</LinkBottone>}
          />
        ) : (
          <StatoVuoto
            Icona={PhoneOff}
            titolo={t.vuotoCloser}
            descrizione={admin ? t.vuotoAdmin : t.vuotoCloserDescrizione}
            azione={
              admin ? (
                <LinkBottone href="/calls/new">{t.fissa}</LinkBottone>
              ) : (
                <LinkBottone href="/my-sales" variant="outline">
                  {t.vaiVendite}
                </LinkBottone>
              )
            }
          />
        )}
      </div>
    )
  }

  const scheda = (c: CallVista, mostraGiorno = true) => (
    <SchedaCall
      key={c.id}
      call={c}
      closers={closers}
      prodotti={prodotti}
      oggi={oggi}
      adesso={adesso}
      vista={vista}
      admin={admin}
      mostraGiorno={mostraGiorno}
      eliminabile={admin}
      lingua={lingua}
    />
  )

  return (
    <div className="max-w-2xl space-y-6">
      {intestazione}

      {vista === 'closer' ? (
        <>
          {inAttesa.length > 0 ? (
            <Sezione titolo={`${t.attesa} (${inAttesa.length})`} descrizione={t.attesaDescrizione}>
              {[...inAttesa].reverse().map((c) => scheda(c))}
            </Sezione>
          ) : null}

          {daRegistrare.length > 0 ? (
            <Sezione
              titolo={t.daRegistrare(daRegistrare.length)}
              descrizione={t.daRegistrareDescrizione}
            >
              {[...daRegistrare].reverse().map((c) => scheda(c))}
            </Sezione>
          ) : null}

          {senzaVendita.length > 0 ? (
            <Sezione
              titolo={`${t.venditaSezione} (${senzaVendita.length})`}
              descrizione={t.venditaSezioneDescrizione}
            >
              {senzaVendita.map((c) => scheda(c))}
            </Sezione>
          ) : null}

          <Sezione titolo={t.oggi}>
            {diOggi.length > 0 ? (
              diOggi.map((c) => scheda(c, false))
            ) : (
              <p className="rounded-xl border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
                {t.nessunaOggi}
              </p>
            )}
          </Sezione>

          {prossime.length > 0 ? (
            <Sezione titolo={t.prossime}>{prossime.map((c) => scheda(c))}</Sezione>
          ) : null}

          {concluse.length > 0 ? (
            <Sezione
              titolo={t.ultimi7}
              descrizione={t.ultimi7Descrizione}
            >
              {concluse.map((c) => scheda(c))}
            </Sezione>
          ) : null}
        </>
      ) : (
        <>
          <Sezione titolo={t.inProgramma}>
            {future.length > 0 ? (
              future.map((c) => scheda(c))
            ) : (
              <p className="rounded-xl border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
                {t.nessunaInProgramma}
              </p>
            )}
          </Sezione>

          {daRegistrare.length + inAttesa.length + concluse.length > 0 ? (
            <Sezione titolo={t.ultimi30}>
              {[...daRegistrare, ...inAttesa, ...concluse]
                .sort((a, b) => b.programmata_il.localeCompare(a.programmata_il))
                .map((c) => scheda(c))}
            </Sezione>
          ) : null}
        </>
      )}
    </div>
  )
}
