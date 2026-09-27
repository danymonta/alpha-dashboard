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
  note: string | null
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
  eliminabile = false,
}: {
  call: CallModificabile
  nomeLead: string
  /** Who the call can be handed to. Empty: the closer, who cannot reassign it. */
  closers: Voce[]
  prodotti: Voce[]
  /** Closer and admin: link, performance, product and amount pitched. */
  conDettagli: boolean
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
    defaultValues: {
      call_id: call.id,
      tipo: call.tipo,
      data: call.data,
      ora: call.ora,
      closer_id: call.closer_id ?? '',
      note: call.note ?? '',
      dettagli: conDettagli
        ? {
            link_registrazione: call.link_registrazione ?? '',
            performance: call.performance,
            prodotto_proposto_id: call.prodotto_proposto_id ?? '',
            importo_proposto: formatImportoInput(call.importo_proposto),
          }
        : null,
    },
  })

  const invia = handleSubmit(async (valori) => {
    if (await salva(() => modificaCall(valori), 'Call aggiornata')) setAperto(false)
  })

  return (
    <FoglioModifica
      aperto={aperto}
      onApertoChange={(v) => {
        setAperto(v)
        if (!v) {
          setErrore(null)
          reset()
        }
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
      descrizione="Data, ora, tipo e note si correggono quando vuoi. L’esito si registra dalla scheda."
    >
      <form onSubmit={invia} noValidate className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label htmlFor={`mc-data-${call.id}`}>Data</Label>
            <Input id={`mc-data-${call.id}`} type="date" className="num h-11" {...register('data')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`mc-ora-${call.id}`}>Ora</Label>
            <Input id={`mc-ora-${call.id}`} type="time" step={300} className="num h-11" {...register('ora')} />
          </div>
        </div>
        <ErroreCampo id={`mc-quando-errore-${call.id}`} messaggio={errors.data?.message ?? errors.ora?.message} />

        <SceltaRapida legenda="Tipo di call" opzioni={OPZIONI_TIPO} registrazione={register('tipo')} colonne={2} />

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

        <div className="space-y-1.5">
          <Label htmlFor={`mc-note-${call.id}`}>Note</Label>
          <Textarea id={`mc-note-${call.id}`} rows={2} {...register('note')} />
        </div>

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
