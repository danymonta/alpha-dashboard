import { CalendarPlus, PhoneOff } from 'lucide-react'

import { SchedaCall, type CallVista } from '@/app/(app)/calls/scheda-call'
import { LinkBottone } from '@/components/link-bottone'
import { IntestazionePagina } from '@/components/pagina/intestazione'
import { StatoVuoto } from '@/components/stati/stato-vuoto'
import { requireRuolo } from '@/lib/auth/session'
import { oggiRoma } from '@/lib/date'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const GIORNO_MS = 24 * 60 * 60 * 1000

const CAMPI =
  'id, programmata_il, tipo, stato, esito, qualificata, lead:leads(nome, instagram_handle), setter:profiles!calls_setter_id_fkey(nome), closer:profiles!calls_closer_id_fkey(nome)'

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
async function caricaCall(vista: 'setter' | 'closer', profiloId: string) {
  const supabase = await createClient()
  const adesso = Date.now()

  const query =
    vista === 'closer'
      ? supabase
          .from('calls')
          .select(CAMPI)
          .eq('closer_id', profiloId)
          // everything still open, plus what was recorded in the last week
          .or(`stato.eq.programmata,programmata_il.gte.${new Date(adesso - 7 * GIORNO_MS).toISOString()}`)
          .order('programmata_il', { ascending: true })
          .limit(200)
      : supabase
          .from('calls')
          .select(CAMPI)
          .eq('setter_id', profiloId)
          .gte('programmata_il', new Date(adesso - 30 * GIORNO_MS).toISOString())
          .order('programmata_il', { ascending: true })
          .limit(200)

  const { data, error } = await query
  if (error) throw new Error('Impossibile caricare le call')

  return { calls: data as unknown as CallVista[], adesso, oggi: oggiRoma(new Date(adesso)) }
}

export default async function LeMieCallPage() {
  const profilo = await requireRuolo(['setter', 'closer', 'admin'])
  const vista = profilo.ruolo === 'setter' ? 'setter' : 'closer'
  const { calls, adesso, oggi } = await caricaCall(vista, profilo.id)

  const passata = (c: CallVista) => new Date(c.programmata_il).getTime() < adesso
  const giorno = (c: CallVista) => oggiRoma(new Date(c.programmata_il))

  const aperte = calls.filter((c) => c.stato === 'programmata')
  const daRegistrare = aperte.filter(passata)
  const future = aperte.filter((c) => !passata(c))
  const diOggi = future.filter((c) => giorno(c) === oggi)
  const prossime = future.filter((c) => giorno(c) !== oggi)
  const concluse = calls.filter((c) => c.stato !== 'programmata').reverse()

  const intestazione =
    vista === 'closer' ? (
      <IntestazionePagina
        titolo="Le mie call"
        descrizione="Registra l’esito appena chiudi la call: bastano due o tre tocchi."
      />
    ) : (
      <IntestazionePagina
        titolo="Le mie call"
        descrizione="Le call che hai fissato, con stato ed esito."
        azione={
          <LinkBottone href="/calls/new">
            <CalendarPlus className="size-4" aria-hidden="true" />
            Nuova call
          </LinkBottone>
        }
      />
    )

  if (calls.length === 0) {
    return (
      <div className="mx-auto max-w-2xl">
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
            descrizione="Le call che il setter ti assegna compaiono qui, con l’esito da registrare."
            azione={
              <LinkBottone href="/my-sales" variant="outline">
                Vai alle mie vendite
              </LinkBottone>
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
      oggi={oggi}
      adesso={adesso}
      vista={vista}
      mostraGiorno={mostraGiorno}
    />
  )

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {intestazione}

      {vista === 'closer' ? (
        <>
          {daRegistrare.length > 0 ? (
            <Sezione
              titolo={`Da registrare (${daRegistrare.length})`}
              descrizione="Call già passate senza esito: finché restano qui, i numeri del mese non tornano."
            >
              {[...daRegistrare].reverse().map((c) => scheda(c))}
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

          {daRegistrare.length + concluse.length > 0 ? (
            <Sezione titolo="Ultimi 30 giorni">
              {[...daRegistrare, ...concluse]
                .sort((a, b) => b.programmata_il.localeCompare(a.programmata_il))
                .map((c) => scheda(c))}
            </Sezione>
          ) : null}
        </>
      )}
    </div>
  )
}
