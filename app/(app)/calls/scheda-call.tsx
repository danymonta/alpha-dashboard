import { CalendarClock } from 'lucide-react'

import { ModificaCall } from '@/app/(app)/calls/modifica-call'
import { RegistraEsito } from '@/app/(app)/calls/registra-esito'
import { SpostaCall } from '@/app/(app)/calls/sposta-call'
import { StatoCall } from '@/components/call/stato-call'
import { motivoNonSpostabile, tracciaSpostamento } from '@/lib/call/spostamento'
import { etichettaGiorno, etichettaGiornoBreve, formatOra, oggiRoma } from '@/lib/date'
import { MOTIVO_NON_CHIUSURA, NOTE_CLOSER, NOTE_SETTER } from '@/lib/setting/commento'
import type { Database } from '@/lib/supabase/database.types'
import { ETICHETTA_TIPO_CALL } from '@/lib/validation/call'
import { chiedeMotivo } from '@/lib/validation/esito'

type Enums = Database['public']['Enums']

/** The columns of a call card, as CallVista reads them. */
export const CAMPI_CALL =
  'id, programmata_il, tipo, stato, esito, qualificata, closer_id, note, note_closer, obiezione_principale, link_registrazione, performance, prodotto_proposto_id, spostata_dal, volte_spostata, lead:leads(nome, instagram_handle), setter:profiles!calls_setter_id_fkey(nome), closer:profiles!calls_closer_id_fkey(nome)'

/**
 * The amount pitched is read only where RLS lets it through: closer and admin.
 * The outcome, the reason for not closing and the closer's notes are written
 * by the closer (his outcome sheet opens on them) and read by the setter who
 * booked the call (Dany, 30/09/2026): he learns why his leads did not close;
 * the database keeps him from changing them. The setter's note goes the other
 * way: he writes it, the closer reads it.
 */
export const CAMPI_CALL_CLOSER = `${CAMPI_CALL}, pitch:call_pitch(importo_proposto)`

export type CallVista = {
  id: string
  programmata_il: string
  tipo: Enums['call_type']
  stato: Enums['call_status']
  esito: Enums['call_outcome'] | null
  qualificata: boolean | null
  closer_id: string | null
  /** "Note del setter": the setter writes them, the closer reads them. */
  note: string | null
  /** "Note aggiuntive" of the closer: the closer writes them, the setter reads them. */
  note_closer: string | null
  link_registrazione: string | null
  performance: Enums['call_performance'] | null
  prodotto_proposto_id: string | null
  /** Where the call was before its last move ("Spostata dal …"), and how many moves. */
  spostata_dal: string | null
  volte_spostata: number
  /** "Motivo di non chiusura": the closer writes it, the setter reads it. */
  obiezione_principale?: string | null
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
  /** closer: records the outcome and moves the call; setter: moves the calls still to be held. */
  vista: 'closer' | 'setter'
  /** The admin also writes the setter's note; the closer only reads it. */
  admin?: boolean
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
  admin = false,
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
  const descrizione = `${ETICHETTA_TIPO_CALL[call.tipo]} · ${etichettaGiorno(giorno, oggi).toLowerCase()} alle ${ora}`
  const traccia = tracciaSpostamento(call, oggi)
  // "Sposta" (Dany, 02/10/2026): a call still to be held, or one marked
  // "Riprogrammata" before the move existed. The setter moves only the first:
  // an outcome is the closer's, and moving a call clears it.
  const spostabile = call.stato === 'programmata' || (vista === 'closer' && call.stato === 'riprogrammata')
  const sposta = spostabile ? (
    <SpostaCall
      callId={call.id}
      nomeLead={nome}
      descrizione={descrizione}
      giorno={giorno}
      ora={ora}
      oggi={oggi}
      admin={admin}
      inEvidenza={call.stato === 'riprogrammata'}
    />
  ) : null

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
          {traccia ? (
            <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground" data-testid="spostata">
              <CalendarClock className="size-3.5 shrink-0" aria-hidden="true" />
              {traccia}
            </p>
          ) : null}
          {/* setter: no outcome to record; a call he can move has the action row below */}
          {vista === 'setter' && !sposta ? <div className="mt-1">{stato}</div> : null}
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
              note_closer: call.note_closer,
              obiezione_principale: call.obiezione_principale ?? null,
              link_registrazione: call.link_registrazione,
              performance: call.performance,
              prodotto_proposto_id: call.prodotto_proposto_id,
              importo_proposto: call.pitch?.importo_proposto ?? null,
            }}
            nomeLead={nome}
            closers={closers}
            prodotti={prodotti}
            conDettagli={vista === 'closer'}
            noteSetterModificabili={vista === 'setter' || admin}
            quandoBloccato={vista === 'setter' ? motivoNonSpostabile(call.stato, 'setter') : null}
            eliminabile={eliminabile}
          />
        </div>
      </div>

      {/* 390px: the state on one line, the buttons on the next when they do not fit beside it */}
      {vista === 'closer' || sposta ? (
        <div className="mt-2 flex min-h-11 flex-wrap items-center justify-between gap-x-2 gap-y-1 pl-[4.25rem]">
          {stato}
          <div className="ml-auto flex items-center gap-2">
            {sposta}
            {vista === 'closer' ? (
              <RegistraEsito
                callId={call.id}
                nomeLead={nome}
                descrizione={descrizione}
                giaRegistrata={call.stato !== 'programmata'}
                futura={!passata}
                svolta={call.stato === 'svolta'}
                tornaA={tornaA}
                motivo={call.obiezione_principale ?? null}
                noteCloser={call.note_closer}
                giorno={giorno}
                ora={ora}
                oggi={oggi}
                admin={admin}
              />
            ) : null}
          </div>
        </div>
      ) : null}

      {/* the closer reads what the setter wrote with the call's pencil */}
      {vista === 'closer' ? <TestoCall etichetta={NOTE_SETTER.titolo} testo={call.note} testId="note-setter" /> : null}

      {/* both sides see it: the closer wrote it, the setter learns from it */}
      {chiedeMotivo(call.esito) ? (
        <TestoCall etichetta={MOTIVO_NON_CHIUSURA.titolo} testo={call.obiezione_principale} testId="motivo-non-chiusura" />
      ) : null}

      {/* the setter reads the closer's notes, never writes them */}
      {vista === 'setter' ? <TestoCall etichetta={NOTE_CLOSER.diChi} testo={call.note_closer} testId="note-closer" /> : null}
    </article>
  )
}

/** A text of the call, under the card: two lines at most, in full in the edit sheet. */
function TestoCall({ etichetta, testo, testId }: { etichetta: string; testo: string | null | undefined; testId: string }) {
  if (!testo?.trim()) return null
  return (
    <p className="mt-1 line-clamp-2 pl-[4.25rem] text-sm break-words" data-testid={testId}>
      <span className="text-muted-foreground">{etichetta}:</span> {testo}
    </p>
  )
}
