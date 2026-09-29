import { ModificaCall } from '@/app/(app)/calls/modifica-call'
import { RegistraEsito } from '@/app/(app)/calls/registra-esito'
import { StatoCall } from '@/components/call/stato-call'
import { etichettaGiorno, etichettaGiornoBreve, formatOra, oggiRoma } from '@/lib/date'
import type { Database } from '@/lib/supabase/database.types'
import { ETICHETTA_TIPO_CALL } from '@/lib/validation/call'

type Enums = Database['public']['Enums']

/** The columns of a call card, as CallVista reads them. */
export const CAMPI_CALL =
  'id, programmata_il, tipo, stato, esito, qualificata, closer_id, note, link_registrazione, performance, prodotto_proposto_id, lead:leads(nome, instagram_handle), setter:profiles!calls_setter_id_fkey(nome), closer:profiles!calls_closer_id_fkey(nome)'

/** The amount pitched is read only where RLS lets it through: closer and admin. */
export const CAMPI_CALL_CLOSER = `${CAMPI_CALL}, pitch:call_pitch(importo_proposto)`

export type CallVista = {
  id: string
  programmata_il: string
  tipo: Enums['call_type']
  stato: Enums['call_status']
  esito: Enums['call_outcome'] | null
  qualificata: boolean | null
  closer_id: string | null
  note: string | null
  link_registrazione: string | null
  performance: Enums['call_performance'] | null
  prodotto_proposto_id: string | null
  /** Embedded only in the closer's query: RLS keeps it from the setter anyway. */
  pitch?: { importo_proposto: number } | null
  lead: { nome: string; instagram_handle: string | null } | null
  setter: { nome: string } | null
  closer: { nome: string } | null
}

type Voce = { id: string; nome: string }

type Props = {
  call: CallVista
  /** Lists for the edit sheet: closers to hand the call to, products to pitch. */
  closers: Voce[]
  prodotti: Voce[]
  oggi: string
  adesso: number
  /** closer: can record the outcome; setter: read only. */
  vista: 'closer' | 'setter'
  mostraGiorno?: boolean
  eliminabile?: boolean
  /** Where the sale of a closed call returns after saving (an internal path, e.g. the closer's day). */
  tornaA?: string | null
}

export function SchedaCall({
  call,
  closers,
  prodotti,
  oggi,
  adesso,
  vista,
  mostraGiorno = true,
  eliminabile = false,
  tornaA = null,
}: Props) {
  const giorno = oggiRoma(new Date(call.programmata_il))
  const ora = formatOra(call.programmata_il)
  const nome = call.lead?.nome ?? 'Lead senza nome'
  const passata = new Date(call.programmata_il).getTime() < adesso
  const idTitolo = `call-${call.id}`
  const stato = (
    <StatoCall stato={call.stato} esito={call.esito} qualificata={call.qualificata} passata={passata} />
  )

  const dettagli = [
    ETICHETTA_TIPO_CALL[call.tipo],
    call.lead?.instagram_handle,
    vista === 'closer'
      ? call.setter && `da ${call.setter.nome.split(' ')[0]}`
      : call.closer && `con ${call.closer.nome.split(' ')[0]}`,
  ].filter(Boolean)

  return (
    <article aria-labelledby={idTitolo} className="rounded-xl bg-card p-3">
      <div className="flex gap-3">
        <div className="w-14 shrink-0 pt-0.5 text-center">
          <p className="num text-base font-medium">{ora}</p>
          {mostraGiorno ? (
            // "gio 23/07" always on two lines, "oggi" on one: never a random wrap
            <p className="num text-xs leading-tight text-muted-foreground">
              {etichettaGiornoBreve(giorno, oggi)
                .split(' ')
                .map((parte) => (
                  <span key={parte} className="block">
                    {parte}
                  </span>
                ))}
            </p>
          ) : null}
        </div>
        <div className="min-w-0 flex-1">
          <h3 id={idTitolo} className="truncate text-sm font-medium">
            {nome}
          </h3>
          <p className="truncate text-sm text-muted-foreground">{dettagli.join(' · ')}</p>
          {/* setter: no outcome to record, no action row to reserve space for */}
          {vista === 'setter' ? <div className="mt-1">{stato}</div> : null}
        </div>
        <div className="-mt-1.5 -mr-1.5">
          <ModificaCall
            call={{
              id: call.id,
              tipo: call.tipo,
              data: giorno,
              ora,
              closer_id: call.closer_id,
              note: call.note,
              link_registrazione: call.link_registrazione,
              performance: call.performance,
              prodotto_proposto_id: call.prodotto_proposto_id,
              importo_proposto: call.pitch?.importo_proposto ?? null,
            }}
            nomeLead={nome}
            closers={closers}
            prodotti={prodotti}
            conDettagli={vista === 'closer'}
            eliminabile={eliminabile}
          />
        </div>
      </div>

      {vista === 'closer' ? (
        <div className="mt-2 flex min-h-11 items-center justify-between gap-2 pl-[4.25rem]">
          {stato}
          <RegistraEsito
            callId={call.id}
            nomeLead={nome}
            descrizione={`${ETICHETTA_TIPO_CALL[call.tipo]} · ${etichettaGiorno(giorno, oggi).toLowerCase()} alle ${ora}`}
            giaRegistrata={call.stato !== 'programmata'}
            futura={!passata}
            tornaA={tornaA}
          />
        </div>
      ) : null}
    </article>
  )
}
