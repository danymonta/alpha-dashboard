'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { Pencil } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'

import { eliminaCall, modificaCall } from '@/app/(app)/calls/actions'
import { Elimina } from '@/components/form/elimina'
import { ErroreCampo } from '@/components/form/errore-campo'
import {
  BottoneSalva,
  CLASSE_SELECT,
  ErroreModulo,
  FoglioModifica,
  useSalvataggio,
} from '@/components/form/foglio-modifica'
import { SceltaRapida } from '@/components/form/scelta-rapida'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { formatImportoInput } from '@/lib/format'
import { cn } from '@/lib/utils'
import {
  ESITO_DEL_CLOSER,
  MASSIMO_NOTE_CLOSER,
  MASSIMO_NOTE_SETTER,
  MOTIVO_NON_CHIUSURA,
  NOTE_CLOSER,
  NOTE_SETTER,
} from '@/lib/setting/commento'
import {
  ETICHETTA_PERFORMANCE,
  ETICHETTA_TIPO_CALL,
  PERFORMANCE,
  TIPI_CALL,
  modificaCallSchema,
  type ModificaCallInput,
  type Performance,
  type TipoCall,
} from '@/lib/validation/call'

const OPZIONI_TIPO = TIPI_CALL.map((t) => ({ valore: t, etichetta: ETICHETTA_TIPO_CALL[t] }))
const OPZIONI_PERFORMANCE = PERFORMANCE.map((p) => ({ valore: p, etichetta: ETICHETTA_PERFORMANCE[p] }))

export type CallModificabile = {
  id: string
  tipo: TipoCall
  /** Europe/Rome date and time of programmata_il, computed by the server. */
  data: string
  ora: string
  closer_id: string | null
  /** "Note del setter" (calls.note) */
  note: string | null
  /** "Note aggiuntive" of the closer (calls.note_closer) */
  note_closer: string | null
  /** "Motivo di non chiusura": the setter's sheet shows it read only, with the closer's notes. */
  obiezione_principale: string | null
  link_registrazione: string | null
  performance: Performance | null
  prodotto_proposto_id: string | null
  /** Only loaded for the closer and the admin: the setter never receives it. */
  importo_proposto: number | null
}

type Voce = { id: string; nome: string }

export function ModificaCall({
  call,
  nomeLead,
  closers,
  prodotti,
  conDettagli,
  sceltaTipo = conDettagli,
  noteSetterModificabili = true,
  quandoBloccato = null,
  eliminabile = false,
}: {
  call: CallModificabile
  nomeLead: string
  /** Who the call can be handed to. Empty: the closer, who cannot reassign it. */
  closers: Voce[]
  prodotti: Voce[]
  /** Closer and admin: link, performance, product and amount pitched, the closer's notes. */
  conDettagli: boolean
  /**
   * Closer and admin: discovery or strategy (the history has strategy calls).
   * The setter books discovery calls only (Dany, 29/09/2026): no choice for
   * him, the call keeps its type and the form sends it back unchanged.
   */
  sceltaTipo?: boolean
  /**
   * The setter's note: the setter and the admin write it; the closer reads it
   * here and never changes it (Dany, 30/09/2026).
   */
  noteSetterModificabili?: boolean
  /**
   * Why date and time are read only here (lib/call/spostamento.ts,
   * motivoNonSpostabile): the setter never moves a call with an outcome, or
   * marked "Riprogrammata"; the database refuses it too. Null: they can change.
   */
  quandoBloccato?: string | null
  /** Admin only. */
  eliminabile?: boolean
}) {
  const [aperto, setAperto] = useState(false)
  const { errore, setErrore, salva } = useSalvataggio()
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ModificaCallInput>({
    resolver: zodResolver(modificaCallSchema),
    defaultValues: valoriDa(call, noteSetterModificabili, conDettagli),
  })

  const invia = handleSubmit(async (valori) => {
    if (await salva(() => modificaCall(valori), 'Call aggiornata')) setAperto(false)
  })

  return (
    <FoglioModifica
      aperto={aperto}
      onApertoChange={(v) => {
        setAperto(v)
        setErrore(null)
        // every opening starts from what is saved now: react-hook-form keeps the
        // first defaultValues, and the outcome sheet may have changed the notes since
        reset(valoriDa(call, noteSetterModificabili, conDettagli))
      }}
      trigger={
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Modifica la call con ${nomeLead}`}
          className="size-11 shrink-0 text-muted-foreground"
        />
      }
      contenutoTrigger={<Pencil className="size-4" aria-hidden="true" />}
      titolo={`Call con ${nomeLead}`}
      descrizione={
        conDettagli
          ? `${sceltaTipo ? 'Tipo e note' : 'Le note'} si correggono quando vuoi, data e ora se sono sbagliate: per spostare la call usa «Sposta». L’esito si registra dalla scheda.`
          : quandoBloccato
            ? `Le tue note si correggono quando vuoi. ${ESITO_DEL_CLOSER}`
            : `Le tue note si correggono quando vuoi, data e ora se sono sbagliate: per spostare la call usa «Sposta». ${ESITO_DEL_CLOSER}`
      }
    >
      <form onSubmit={invia} noValidate className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label htmlFor={`mc-data-${call.id}`}>Data</Label>
            <Input
              id={`mc-data-${call.id}`}
              type="date"
              readOnly={Boolean(quandoBloccato)}
              aria-describedby={quandoBloccato ? `mc-quando-bloccato-${call.id}` : undefined}
              className={cn('num h-11', quandoBloccato && 'bg-muted text-muted-foreground')}
              {...register('data')}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`mc-ora-${call.id}`}>Ora</Label>
            <Input
              id={`mc-ora-${call.id}`}
              type="time"
              step={300}
              readOnly={Boolean(quandoBloccato)}
              aria-describedby={quandoBloccato ? `mc-quando-bloccato-${call.id}` : undefined}
              className={cn('num h-11', quandoBloccato && 'bg-muted text-muted-foreground')}
              {...register('ora')}
            />
          </div>
        </div>
        {quandoBloccato ? (
          <p id={`mc-quando-bloccato-${call.id}`} className="text-xs text-muted-foreground" data-testid="quando-bloccato">
            {quandoBloccato}
          </p>
        ) : null}
        <ErroreCampo id={`mc-quando-errore-${call.id}`} messaggio={errors.data?.message ?? errors.ora?.message} />

        {sceltaTipo ? (
          <SceltaRapida legenda="Tipo di call" opzioni={OPZIONI_TIPO} registrazione={register('tipo')} colonne={2} />
        ) : null}

        {closers.length > 0 ? (
          <div className="space-y-1.5">
            <Label htmlFor={`mc-closer-${call.id}`}>Closer</Label>
            <select id={`mc-closer-${call.id}`} className={CLASSE_SELECT} {...register('closer_id')}>
              {closers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
            <ErroreCampo id={`mc-closer-errore-${call.id}`} messaggio={errors.closer_id?.message} />
          </div>
        ) : null}

        {noteSetterModificabili ? (
          <div className="space-y-1.5">
            <Label htmlFor={`mc-note-${call.id}`}>{NOTE_SETTER.titolo}</Label>
            <Textarea
              id={`mc-note-${call.id}`}
              rows={2}
              maxLength={MASSIMO_NOTE_SETTER}
              placeholder={NOTE_SETTER.placeholder}
              className="max-h-40"
              aria-invalid={errors.note ? true : undefined}
              aria-describedby={errors.note ? `mc-note-errore-${call.id}` : undefined}
              {...register('note')}
            />
            <ErroreCampo id={`mc-note-errore-${call.id}`} messaggio={errors.note?.message} />
          </div>
        ) : (
          // the closer reads what the setter wrote, never changes it
          <SolaLettura
            titolo={NOTE_SETTER.titolo}
            testo={call.note}
            spiegazione={NOTE_SETTER.soloLettura}
            testId="note-setter-sola-lettura"
          />
        )}

        {/* the setter reads, in full, what the closer wrote; he never changes it (Dany, 30/09/2026) */}
        {conDettagli ? null : (
          <>
            <SolaLettura titolo={MOTIVO_NON_CHIUSURA.titolo} testo={call.obiezione_principale} testId="motivo-sola-lettura" />
            <SolaLettura titolo={NOTE_CLOSER.diChi} testo={call.note_closer} testId="note-closer-sola-lettura" />
          </>
        )}

        {conDettagli ? (
          <fieldset className="space-y-4 border-t border-border pt-4">
            <legend className="sr-only">Com’è andata la call</legend>
            <p className="text-sm font-medium">Com’è andata</p>
            <SceltaRapida
              legenda="Performance"
              opzioni={OPZIONI_PERFORMANCE}
              registrazione={register('dettagli.performance')}
            />
            <div className="space-y-1.5">
              <Label htmlFor={`mc-link-${call.id}`}>Link alla registrazione</Label>
              <Input
                id={`mc-link-${call.id}`}
                type="url"
                inputMode="url"
                autoCapitalize="none"
                placeholder="https://"
                className="h-11"
                {...register('dettagli.link_registrazione')}
              />
              <ErroreCampo
                id={`mc-link-errore-${call.id}`}
                messaggio={errors.dettagli?.link_registrazione?.message}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor={`mc-prodotto-${call.id}`}>Prodotto proposto</Label>
                <select id={`mc-prodotto-${call.id}`} className={CLASSE_SELECT} {...register('dettagli.prodotto_proposto_id')}>
                  <option value="">Nessuno</option>
                  {prodotti.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`mc-importo-${call.id}`}>Importo proposto</Label>
                <Input
                  id={`mc-importo-${call.id}`}
                  inputMode="decimal"
                  placeholder="1.500"
                  className="num h-11 text-right"
                  {...register('dettagli.importo_proposto')}
                />
              </div>
            </div>
            <ErroreCampo
              id={`mc-importo-errore-${call.id}`}
              messaggio={errors.dettagli?.importo_proposto?.message}
            />
            <div className="space-y-1.5">
              <Label htmlFor={`mc-note-closer-${call.id}`}>
                {NOTE_CLOSER.titolo}{' '}
                <span className="font-normal text-muted-foreground">({NOTE_CLOSER.facoltative})</span>
              </Label>
              <Textarea
                id={`mc-note-closer-${call.id}`}
                rows={2}
                maxLength={MASSIMO_NOTE_CLOSER}
                placeholder={NOTE_CLOSER.placeholder}
                className="max-h-40"
                aria-invalid={errors.dettagli?.note_closer ? true : undefined}
                aria-describedby={errors.dettagli?.note_closer ? `mc-note-closer-errore-${call.id}` : undefined}
                {...register('dettagli.note_closer')}
              />
              <ErroreCampo
                id={`mc-note-closer-errore-${call.id}`}
                messaggio={errors.dettagli?.note_closer?.message}
              />
            </div>
          </fieldset>
        ) : null}

        <ErroreModulo testo={errore} />
        <BottoneSalva inCorso={isSubmitting}>Salva la call</BottoneSalva>
        {eliminabile ? (
          <div className="border-t border-border pt-4">
            <Elimina
              etichetta="Elimina la call"
              cosa={`la call con ${nomeLead}`}
              fatto="Call eliminata"
              conseguenze={[
                'Il lead resta nella pipeline.',
                'Se da questa call è nata una vendita, la vendita resta, senza la call collegata.',
              ]}
              azione={() => eliminaCall({ id: call.id })}
            />
          </div>
        ) : null}
      </form>
    </FoglioModifica>
  )
}

/**
 * The form's values from the call as the page has it now. dettagli_call
 * replaces every detail, the closer's notes included: the sheet must open on
 * the saved ones, or saving just a link would wipe them.
 */
function valoriDa(call: CallModificabile, noteSetterModificabili: boolean, conDettagli: boolean): ModificaCallInput {
  return {
    call_id: call.id,
    tipo: call.tipo,
    data: call.data,
    ora: call.ora,
    closer_id: call.closer_id ?? '',
    // the closer's sheet never sends the setter's note
    note: noteSetterModificabili ? (call.note ?? '') : undefined,
    dettagli: conDettagli
      ? {
          link_registrazione: call.link_registrazione ?? '',
          performance: call.performance,
          prodotto_proposto_id: call.prodotto_proposto_id ?? '',
          importo_proposto: formatImportoInput(call.importo_proposto),
          note_closer: call.note_closer ?? '',
        }
      : null,
  }
}

/** A text of the other side of the call, in full: read here, written elsewhere. */
function SolaLettura({
  titolo,
  testo,
  spiegazione,
  testId,
}: {
  titolo: string
  testo: string | null
  spiegazione?: string
  testId: string
}) {
  if (!testo?.trim()) return null
  return (
    <div className="space-y-1" data-testid={testId}>
      <p className="text-sm font-medium">{titolo}</p>
      {/* a quote, not a field: nothing to type here */}
      <blockquote className="border-l-2 border-border py-0.5 pl-3 text-sm break-words whitespace-pre-line">{testo}</blockquote>
      {spiegazione ? <p className="text-xs text-muted-foreground">{spiegazione}</p> : null}
    </div>
  )
}
