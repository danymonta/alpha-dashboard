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
import { useLingua } from '@/components/i18n/lingua-provider'
import { formatImportoInput } from '@/lib/format'
import { traduciErrore, tradotto } from '@/lib/i18n/testi/errori-economics'
import { MODIFICA_CALL, NOTE_CALL } from '@/lib/i18n/testi/esito'
import { ETICHETTE } from '@/lib/i18n/testi/etichette'
import { cn } from '@/lib/utils'
import { MASSIMO_NOTE_CLOSER, MASSIMO_NOTE_SETTER } from '@/lib/setting/commento'
import {
  PERFORMANCE,
  TIPI_CALL,
  modificaCallSchema,
  type ModificaCallInput,
  type Performance,
  type TipoCall,
} from '@/lib/validation/call'


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
  conSposta = false,
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
   * motivoQuandoBloccato): the setter never moves a call with an outcome, or
   * "In attesa di conferma"; the database refuses it too. Closer and admin
   * correct the date of every call, a held call and a no-show included
   * (Dany, 03/10/2026): a typo is not a move. Null: they can change.
   */
  quandoBloccato?: string | null
  /** The card has "Sposta": only then the description points to it. */
  conSposta?: boolean
  /** Admin only. */
  eliminabile?: boolean
}) {
  const [aperto, setAperto] = useState(false)
  const lingua = useLingua()
  const t = MODIFICA_CALL[lingua]
  const {
    motivo: MOTIVO_NON_CHIUSURA,
    noteCloser: NOTE_CLOSER,
    noteSetter: NOTE_SETTER,
    esitoDelCloser: ESITO_DEL_CLOSER,
  } = NOTE_CALL[lingua]
  const OPZIONI_TIPO = TIPI_CALL.map((v) => ({ valore: v, etichetta: ETICHETTE[lingua].tipoCall[v] }))
  const OPZIONI_PERFORMANCE = PERFORMANCE.map((p) => ({ valore: p, etichetta: ETICHETTE[lingua].performance[p] }))
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
    if (await salva(() => modificaCall(valori), t.aggiornata)) setAperto(false)
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
          aria-label={t.nome(nomeLead)}
          className="size-11 shrink-0 text-muted-foreground"
        />
      }
      contenutoTrigger={<Pencil className="size-4" aria-hidden="true" />}
      titolo={t.titolo(nomeLead)}
      descrizione={`${conDettagli ? (sceltaTipo ? t.tipoENote : t.leNote) : t.leTueNote}${t.siCorreggono}${
        // read only: the reason sits under them; «Sposta» only where the card has it
        quandoBloccato ? '' : `${t.dataEOra}${conSposta ? t.perSpostare : ''}`
      }. ${conDettagli ? t.esitoDallaScheda : ESITO_DEL_CLOSER}`}
    >
      <form onSubmit={invia} noValidate className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label htmlFor={`mc-data-${call.id}`}>{t.data}</Label>
            <Input
              id={`mc-data-${call.id}`}
              type="date"
              readOnly={Boolean(quandoBloccato)}
              // read only: out of the tab order, so the sheet never opens with focus on it as if it could change
              tabIndex={quandoBloccato ? -1 : undefined}
              aria-describedby={quandoBloccato ? `mc-quando-bloccato-${call.id}` : undefined}
              className={cn('num h-11', quandoBloccato && 'bg-muted text-muted-foreground')}
              {...register('data')}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`mc-ora-${call.id}`}>{t.ora}</Label>
            <Input
              id={`mc-ora-${call.id}`}
              type="time"
              step={300}
              readOnly={Boolean(quandoBloccato)}
              // read only: out of the tab order, so the sheet never opens with focus on it as if it could change
              tabIndex={quandoBloccato ? -1 : undefined}
              aria-describedby={quandoBloccato ? `mc-quando-bloccato-${call.id}` : undefined}
              className={cn('num h-11', quandoBloccato && 'bg-muted text-muted-foreground')}
              {...register('ora')}
            />
          </div>
        </div>
        {quandoBloccato ? (
          <p id={`mc-quando-bloccato-${call.id}`} className="text-xs text-muted-foreground" data-testid="quando-bloccato">
            {traduciErrore(quandoBloccato, lingua)}
          </p>
        ) : null}
        <ErroreCampo id={`mc-quando-errore-${call.id}`} messaggio={traduciErrore(errors.data?.message ?? errors.ora?.message, lingua)} />

        {sceltaTipo ? (
          <SceltaRapida legenda={t.tipoCall} opzioni={OPZIONI_TIPO} registrazione={register('tipo')} colonne={2} />
        ) : null}

        {closers.length > 0 ? (
          <div className="space-y-1.5">
            <Label htmlFor={`mc-closer-${call.id}`}>{t.closer}</Label>
            <select id={`mc-closer-${call.id}`} className={CLASSE_SELECT} {...register('closer_id')}>
              {closers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
            <ErroreCampo id={`mc-closer-errore-${call.id}`} messaggio={traduciErrore(errors.closer_id?.message, lingua)} />
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
            <ErroreCampo id={`mc-note-errore-${call.id}`} messaggio={traduciErrore(errors.note?.message, lingua)} />
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
            <legend className="sr-only">{t.comEAndataLegenda}</legend>
            <p className="text-sm font-medium">{t.comEAndata}</p>
            <SceltaRapida
              legenda={t.performance}
              opzioni={OPZIONI_PERFORMANCE}
              registrazione={register('dettagli.performance')}
            />
            <div className="space-y-1.5">
              <Label htmlFor={`mc-link-${call.id}`}>{t.link}</Label>
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
                messaggio={traduciErrore(errors.dettagli?.link_registrazione?.message, lingua)}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor={`mc-prodotto-${call.id}`}>{t.prodotto}</Label>
                <select id={`mc-prodotto-${call.id}`} className={CLASSE_SELECT} {...register('dettagli.prodotto_proposto_id')}>
                  <option value="">{t.nessuno}</option>
                  {prodotti.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`mc-importo-${call.id}`}>{t.importo}</Label>
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
              messaggio={traduciErrore(errors.dettagli?.importo_proposto?.message, lingua)}
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
                messaggio={traduciErrore(errors.dettagli?.note_closer?.message, lingua)}
              />
            </div>
          </fieldset>
        ) : null}

        <ErroreModulo testo={traduciErrore(errore, lingua) ?? null} />
        <BottoneSalva inCorso={isSubmitting}>{t.salva}</BottoneSalva>
        {eliminabile ? (
          <div className="border-t border-border pt-4">
            <Elimina
              etichetta={t.elimina}
              cosa={t.cosa(nomeLead)}
              fatto={t.eliminata}
              // the Italian words written here as Alfire reads them (lib/alfire/conseguenze.ts, tests/alfire-scritture.test.ts)
              conseguenze={
                lingua === 'it'
                  ? [
                      'Il lead resta nella pipeline.',
                      'Se da questa call è nata una vendita, la vendita resta, senza la call collegata.',
                    ]
                  : [...t.conseguenze]
              }
              azione={async () => tradotto(await eliminaCall({ id: call.id }), lingua)}
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
      <blockquote lang="it" className="border-l-2 border-border py-0.5 pl-3 text-sm break-words whitespace-pre-line">{testo}</blockquote>
      {spiegazione ? <p className="text-xs text-muted-foreground">{spiegazione}</p> : null}
    </div>
  )
}
