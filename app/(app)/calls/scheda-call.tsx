import { RegistraEsito } from '@/app/(app)/calls/registra-esito'
import { StatoCall } from '@/components/call/stato-call'
import { etichettaGiorno, etichettaGiornoBreve, formatOra, oggiRoma } from '@/lib/date'
import type { Database } from '@/lib/supabase/database.types'
import { ETICHETTA_TIPO_CALL } from '@/lib/validation/call'

type Enums = Database['public']['Enums']

export type CallVista = {
  id: string
  programmata_il: string
  tipo: Enums['call_type']
  stato: Enums['call_status']
  esito: Enums['call_outcome'] | null
  qualificata: boolean | null
  lead: { nome: string; instagram_handle: string | null } | null
  setter: { nome: string } | null
  closer: { nome: string } | null
}

type Props = {
  call: CallVista
  oggi: string
  adesso: number
  /** closer: can record the outcome; setter: read only. */
  vista: 'closer' | 'setter'
  mostraGiorno?: boolean
}

export function SchedaCall({ call, oggi, adesso, vista, mostraGiorno = true }: Props) {
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
          {/* setter: read only, no action row to reserve space for */}
          {vista === 'setter' ? <div className="mt-1">{stato}</div> : null}
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
          />
        </div>
      ) : null}
    </article>
  )
}
