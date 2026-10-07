import { CalendarPlus, PhoneOff } from 'lucide-react'

import { CAMPI_CALL, CAMPI_CALL_CLOSER, SchedaCall, type CallVista } from '@/app/(app)/calls/scheda-call'
import { LinkBottone } from '@/components/link-bottone'
import { IntestazionePagina } from '@/components/pagina/intestazione'
import { StatoVuoto } from '@/components/stati/stato-vuoto'
import { requireRuolo } from '@/lib/auth/session'
import { VENDITA_DA_REGISTRARE } from '@/lib/call/follow-up'
import { SPOSTA } from '@/lib/call/spostamento'
import { oggiRoma } from '@/lib/date'
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
          .select(CAMPI_CALL)
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
  if (error || senzaVendita.error || persone.error || catalogo.error) throw new Error('Impossibile caricare le call')

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
      Nuova call
    </LinkBottone>
  )

  const intestazione =
    vista === 'closer' ? (
      <IntestazionePagina
        titolo="Le mie call"
        descrizione="Registra l’esito appena chiudi la call: bastano due o tre tocchi."
        azione={admin ? bottoneNuova : undefined}
      />
    ) : (
      <IntestazionePagina
        titolo="Le mie call"
        descrizione="Le call che hai fissato e le loro call di follow-up, con stato ed esito."
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
            titolo="Nessuna call negli ultimi 30 giorni"
            descrizione="Quando fissi una call dai DM, la trovi qui con stato ed esito."
            azione={
              <LinkBottone href="/calls/new">
                Fissa una call
              </LinkBottone>
            }
          />
        ) : (
          <StatoVuoto
            Icona={PhoneOff}
            titolo="Nessuna call in programma"
            descrizione={
              admin
                ? 'Le call che fissi tu o che il setter ti assegna compaiono qui, con l’esito da registrare.'
                : 'Le call che il setter ti assegna compaiono qui, con l’esito da registrare.'
            }
            azione={
              admin ? (
                <LinkBottone href="/calls/new">Fissa una call</LinkBottone>
              ) : (
                <LinkBottone href="/my-sales" variant="outline">
                  Vai alle mie vendite
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
    />
  )

  return (
    <div className="max-w-2xl space-y-6">
      {intestazione}

      {vista === 'closer' ? (
        <>
          {inAttesa.length > 0 ? (
            <Sezione titolo={`${SPOSTA.attesa.etichetta} (${inAttesa.length})`} descrizione={SPOSTA.attesa.descrizione}>
              {[...inAttesa].reverse().map((c) => scheda(c))}
            </Sezione>
          ) : null}

          {daRegistrare.length > 0 ? (
            <Sezione
              titolo={`Da registrare (${daRegistrare.length})`}
              descrizione="Call già passate senza esito: finché restano qui, i numeri del mese non tornano."
            >
              {[...daRegistrare].reverse().map((c) => scheda(c))}
            </Sezione>
          ) : null}

          {senzaVendita.length > 0 ? (
            <Sezione
              titolo={`${VENDITA_DA_REGISTRARE.sezione} (${senzaVendita.length})`}
              descrizione={VENDITA_DA_REGISTRARE.descrizioneSezione}
            >
              {senzaVendita.map((c) => scheda(c))}
            </Sezione>
          ) : null}

          <Sezione titolo="Oggi">
            {diOggi.length > 0 ? (
              diOggi.map((c) => scheda(c, false))
            ) : (
              <p className="rounded-xl border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
                Nessun’altra call oggi.
              </p>
            )}
          </Sezione>

          {prossime.length > 0 ? (
            <Sezione titolo="Prossime">{prossime.map((c) => scheda(c))}</Sezione>
          ) : null}

          {concluse.length > 0 ? (
            <Sezione
              titolo="Registrate negli ultimi 7 giorni"
              descrizione="Hai sbagliato un esito? Correggilo da qui."
            >
              {concluse.map((c) => scheda(c))}
            </Sezione>
          ) : null}
        </>
      ) : (
        <>
          <Sezione titolo="In programma">
            {future.length > 0 ? (
              future.map((c) => scheda(c))
            ) : (
              <p className="rounded-xl border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
                Nessuna call in programma.
              </p>
            )}
          </Sezione>

          {daRegistrare.length + inAttesa.length + concluse.length > 0 ? (
            <Sezione titolo="Ultimi 30 giorni">
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
