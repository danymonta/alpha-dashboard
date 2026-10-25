'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { Plus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, type ChangeEvent } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'

import { creaProgetto } from '@/app/(app)/progetti/actions'
import { ErroreCampo } from '@/components/form/errore-campo'
import { useLingua, useTesti } from '@/components/i18n/lingua-provider'
import { BottoneSalva, CLASSE_SELECT, ErroreModulo, FoglioModifica } from '@/components/form/foglio-modifica'
import { SceltaMultipla } from '@/components/form/scelta-multipla'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { traduciErroreProgetti } from '@/lib/i18n/testi/progetti'
import { FOGLI_PROGETTO } from '@/lib/i18n/testi/progetto-fogli'
import { nuovoProgettoSchema, type NuovoProgettoInput } from '@/lib/validation/progetti'

export type OpzioneReparto = { id: string; nome: string; progetti_con_cliente: boolean }
export type OpzioneModello = { id: string; nome: string; reparto_id: string | null; voci: number }
export type OpzionePersona = { id: string; nome: string }
export type OpzioneCliente = { id: string; etichetta: string }

/** Templates of a department first, then the ones valid for every department. */
function modelliPer(modelli: readonly OpzioneModello[], repartoId: string) {
  return [...modelli.filter((m) => m.reparto_id === repartoId), ...modelli.filter((m) => m.reparto_id === null)]
}

/** The first active template of the department, or none. */
function modelloPredefinito(modelli: readonly OpzioneModello[], repartoId: string) {
  return modelli.find((m) => m.reparto_id === repartoId)?.id ?? ''
}

/**
 * "Nuovo progetto". The department comes first: it decides the rest. In a
 * department that works on clients (Fitness Coaching) the project is the
 * client's path, so the client comes next and names the project; elsewhere
 * there is no client field at all. From a department the department comes
 * preselected, and so does its first template. Only the app admin links a client.
 *
 * Triggers: the page's primary button, a 44px "+" next to a department, or a
 * text link in an empty department.
 */
export function NuovoProgetto({
  reparti,
  repartoId = null,
  modelli,
  persone,
  clienti,
  oggi,
  variante = 'primario',
}: {
  reparti: readonly OpzioneReparto[]
  /** null: the department is chosen in the sheet. */
  repartoId?: string | null
  modelli: readonly OpzioneModello[]
  persone: readonly OpzionePersona[]
  /** null: the client field is not offered (only the app admin links a client). */
  clienti: readonly OpzioneCliente[] | null
  oggi: string
  variante?: 'primario' | 'icona' | 'link'
}) {
  const t = useTesti(FOGLI_PROGETTO)
  const lingua = useLingua()
  const tradotto = (messaggio: string | undefined) => traduciErroreProgetti(messaggio, lingua)
  const router = useRouter()
  const [aperto, setAperto] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)
  const nomeReparto = reparti.find((r) => r.id === repartoId)?.nome ?? ''
  // ids of the fields: one sheet per trigger, never two open together
  const chiave = repartoId ?? 'scelta'
  const iniziali: NuovoProgettoInput = {
    reparto_id: repartoId ?? '',
    nome: '',
    descrizione: '',
    modello_id: repartoId ? modelloPredefinito(modelli, repartoId) : '',
    client_id: '',
    data_inizio: oggi,
    data_fine: '',
    membri: [],
  }
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    getValues,
    control,
    formState: { errors, isSubmitting },
  } = useForm<NuovoProgettoInput>({ resolver: zodResolver(nuovoProgettoSchema), defaultValues: iniziali })
  const reparto = useWatch({ control, name: 'reparto_id' })
  const modelloScelto = useWatch({ control, name: 'modello_id' })
  const perClienti = reparti.find((r) => r.id === reparto)?.progetti_con_cliente ?? false
  // the name the client gave the project: replaced when the client changes, never a name typed by hand
  const [nomeDalCliente, setNomeDalCliente] = useState('')
  const opzioniModello = modelliPer(modelli, reparto)
  const voci = modelli.find((m) => m.id === modelloScelto)?.voci ?? 0

  const invia = handleSubmit(async (valori) => {
    setErrore(null)
    let esito
    try {
      esito = await creaProgetto(valori)
    } catch {
      setErrore(tradotto('Connessione assente. Riprova.') ?? null)
      return
    }
    if (!esito.ok) {
      setErrore(tradotto(esito.errore) ?? null)
      return
    }
    toast.success(t.progettoCreato)
    setAperto(false)
    reset(iniziali)
    // a new project is set up in its activities: lists and tasks come first
    router.push(`/progetti/${esito.id}/attivita`)
  })

  return (
    <FoglioModifica
      aperto={aperto}
      onApertoChange={(v) => {
        setAperto(v)
        if (!v) {
          setErrore(null)
          reset(iniziali)
        }
      }}
      trigger={
        variante === 'icona' ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-11 text-muted-foreground"
            aria-label={t.nuovoIn(nomeReparto)}
          />
        ) : variante === 'link' ? (
          <button
            type="button"
            className="inline-flex min-h-11 items-center rounded-sm px-1 text-sm font-medium text-foreground underline underline-offset-4 hover:no-underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          />
        ) : (
          <Button type="button" className="h-11" />
        )
      }
      contenutoTrigger={
        variante === 'icona' ? (
          <Plus className="size-5" aria-hidden="true" />
        ) : variante === 'link' ? (
          <>
            {t.creaIlPrimo}
            <span className="sr-only">{t.creaIlPrimoSr(nomeReparto)}</span>
          </>
        ) : (
          <>
            <Plus className="size-4" aria-hidden="true" />
            {t.nuovoProgetto}
          </>
        )
      }
      titolo={t.nuovoProgetto}
      descrizione={t.nuovoDescrizione}
    >
      <form onSubmit={invia} noValidate className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor={`np-reparto-${chiave}`}>{t.reparto}</Label>
          <select
            id={`np-reparto-${chiave}`}
            className={CLASSE_SELECT}
            aria-describedby={errors.reparto_id ? `np-reparto-errore-${chiave}` : undefined}
            {...register('reparto_id', {
              onChange: (e: ChangeEvent<HTMLSelectElement>) => {
                setValue('modello_id', modelloPredefinito(modelli, e.target.value))
                if (!reparti.find((r) => r.id === e.target.value)?.progetti_con_cliente) setValue('client_id', '')
              },
            })}
          >
            {repartoId ? null : (
              <option value="" disabled>
                {t.scegliReparto}
              </option>
            )}
            {reparti.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nome}
              </option>
            ))}
          </select>
          <ErroreCampo id={`np-reparto-errore-${chiave}`} messaggio={tradotto(errors.reparto_id?.message)} />
        </div>

        {clienti && perClienti ? (
          <div className="space-y-1.5">
            <Label htmlFor={`np-cliente-${chiave}`}>{t.cliente}</Label>
            <select
              id={`np-cliente-${chiave}`}
              className={CLASSE_SELECT}
              {...register('client_id', {
                onChange: (e: ChangeEvent<HTMLSelectElement>) => {
                  const scelto = clienti.find((c) => c.id === e.target.value)
                  const nome = getValues('nome')?.trim() ?? ''
                  if (scelto && (!nome || nome === nomeDalCliente)) {
                    setValue('nome', scelto.etichetta)
                    setNomeDalCliente(scelto.etichetta)
                  }
                },
              })}
            >
              <option value="">{t.nessunCliente}</option>
              {clienti.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.etichetta}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">{t.clienteAiuto}</p>
          </div>
        ) : null}

        <div className="space-y-1.5">
          <Label htmlFor={`np-nome-${chiave}`}>{t.nome}</Label>
          <Input
            id={`np-nome-${chiave}`}
            className="h-11"
            placeholder={perClienti ? t.nomeCliente : t.nomeEsempio}
            aria-describedby={errors.nome ? `np-nome-errore-${chiave}` : undefined}
            {...register('nome')}
          />
          <ErroreCampo id={`np-nome-errore-${chiave}`} messaggio={tradotto(errors.nome?.message)} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`np-modello-${chiave}`}>{t.modello}</Label>
          {/* keyed on the department: its options change, and a fresh select shows the chosen template */}
          <select key={reparto} id={`np-modello-${chiave}`} className={CLASSE_SELECT} {...register('modello_id')}>
            <option value="">{t.nessunModello}</option>
            {opzioniModello.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nome}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            {modelloScelto ? t.conModello(voci) : t.senzaModello}
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`np-descrizione-${chiave}`}>{t.descrizione}</Label>
          <Textarea id={`np-descrizione-${chiave}`} rows={3} {...register('descrizione')} />
          <ErroreCampo id={`np-descrizione-errore-${chiave}`} messaggio={tradotto(errors.descrizione?.message)} />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label htmlFor={`np-inizio-${chiave}`}>{t.inizio}</Label>
            <Input id={`np-inizio-${chiave}`} type="date" className="num h-11" {...register('data_inizio')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`np-fine-${chiave}`}>{t.fine}</Label>
            <Input id={`np-fine-${chiave}`} type="date" className="num h-11" {...register('data_fine')} />
          </div>
        </div>
        <ErroreCampo id={`np-date-errore-${chiave}`} messaggio={tradotto(errors.data_inizio?.message ?? errors.data_fine?.message)} />

        {persone.length > 0 ? (
          <SceltaMultipla
            legenda={t.membriOltre}
            opzioni={persone.map((p) => ({ valore: p.id, etichetta: p.nome }))}
            registrazione={register('membri')}
            errore={tradotto(errors.membri?.message)}
            colonne={2}
          />
        ) : null}

        <ErroreModulo testo={errore} />
        <BottoneSalva inCorso={isSubmitting}>{t.creaProgetto}</BottoneSalva>
      </form>
    </FoglioModifica>
  )
}
