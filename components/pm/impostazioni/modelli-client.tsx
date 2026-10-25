'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useId, useState, useTransition } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'

import {
  cambiaAttivoModello,
  eliminaModello,
  eliminaVoce,
  salvaModello,
  salvaVoce,
} from '@/app/(app)/settings/progetti/actions'
import { Elimina } from '@/components/form/elimina'
import { ErroreCampo } from '@/components/form/errore-campo'
import { useLingua, useTesti } from '@/components/i18n/lingua-provider'
import { BottoneSalva, CLASSE_SELECT, ErroreModulo, FoglioModifica, useSalvataggio } from '@/components/form/foglio-modifica'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { ETICHETTA_RUOLO, type AppRole } from '@/lib/auth/roles'
import { IMPOSTAZIONI_PROGETTI } from '@/lib/i18n/testi/impostazioni-progetti'
import { traduciErroreProgetti } from '@/lib/i18n/testi/progetti'
import { SHELL } from '@/lib/i18n/testi/shell'
import { cn } from '@/lib/utils'
import { modelloSchema, voceModelloSchema, type ModelloInput, type VoceModelloInput } from '@/lib/validation/progetti'

/** Who else does an activity of a client's path, besides the coach. */
const RUOLI_DI_UN_COMPITO: readonly AppRole[] = ['nutrizione']

type Reparto = { id: string; nome: string; progetti_con_cliente?: boolean }
type Modello = {
  id: string
  nome: string
  descrizione: string | null
  reparto_id: string | null
  per_nuovi_clienti?: boolean
}

/**
 * New template or edit one (name, description, department). A new template
 * opens its own page right away, to add its activities.
 */
export function ModelloForm({ modello, reparti }: { modello?: Modello; reparti: readonly Reparto[] }) {
  const t = useTesti(IMPOSTAZIONI_PROGETTI)
  const lingua = useLingua()
  const tradotto = (messaggio: string | undefined) => traduciErroreProgetti(messaggio, lingua)
  const router = useRouter()
  const [aperto, setAperto] = useState(false)
  const { errore, setErrore } = useSalvataggio()
  const iniziali: ModelloInput = {
    id: modello?.id ?? null,
    nome: modello?.nome ?? '',
    descrizione: modello?.descrizione ?? '',
    reparto_id: modello?.reparto_id ?? '',
    per_nuovi_clienti: modello?.per_nuovi_clienti ?? false,
  }
  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors, isSubmitting },
  } = useForm<ModelloInput>({ resolver: zodResolver(modelloSchema), defaultValues: iniziali })
  const repartoScelto = useWatch({ control, name: 'reparto_id' })
  // only a department that works on clients holds the template for new clients
  const perClienti = reparti.some((r) => r.id === repartoScelto && r.progetti_con_cliente)

  const invia = handleSubmit(async (valori) => {
    setErrore(null)
    let esito
    try {
      esito = await salvaModello({ ...valori, per_nuovi_clienti: perClienti && valori.per_nuovi_clienti })
    } catch {
      setErrore(tradotto('Connessione assente. Riprova.') ?? null)
      return
    }
    if (!esito.ok) {
      setErrore(tradotto(esito.errore) ?? null)
      return
    }
    toast.success(modello ? t.modelloSalvato : t.modelloCreato)
    setAperto(false)
    if (!modello) router.push(`/settings/progetti/modelli/${esito.id}`)
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
      trigger={<Button type="button" variant="outline" className="h-11" />}
      contenutoTrigger={
        modello ? (
          <>
            <Pencil className="size-4" aria-hidden="true" />
            {t.modificaBottone}
          </>
        ) : (
          <>
            <Plus className="size-4" aria-hidden="true" />
            {t.nuovoModello}
          </>
        )
      }
      titolo={modello ? t.modificaModello : t.nuovoModello}
      descrizione={t.modelloDescrizione}
    >
      <form onSubmit={invia} noValidate className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="m-nome">{t.nome}</Label>
          <Input id="m-nome" className="h-11" placeholder={t.nomeModelloSegnaposto} {...register('nome')} />
          <ErroreCampo id="m-nome-errore" messaggio={tradotto(errors.nome?.message)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="m-reparto">{t.reparto}</Label>
          <select id="m-reparto" className={CLASSE_SELECT} {...register('reparto_id')}>
            <option value="">{t.tuttiReparti}</option>
            {reparti.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nome}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">{t.primoScelto}</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="m-descrizione">{t.descrizioneCampo}</Label>
          <Textarea id="m-descrizione" rows={3} {...register('descrizione')} />
          <ErroreCampo id="m-descrizione-errore" messaggio={tradotto(errors.descrizione?.message)} />
        </div>
        {perClienti ? (
          <Controller
            control={control}
            name="per_nuovi_clienti"
            render={({ field }) => (
              <label className="flex min-h-11 cursor-pointer items-start justify-between gap-4 rounded-lg border border-border p-3">
                <span className="space-y-0.5">
                  <span className="block text-sm font-medium">{t.perNuoviClienti}</span>
                  <span className="block text-xs text-muted-foreground">{t.perNuoviClientiAiuto}</span>
                </span>
                <Switch checked={field.value ?? false} onCheckedChange={field.onChange} aria-label={t.perNuoviClienti} />
              </label>
            )}
          />
        ) : null}
        <ErroreModulo testo={tradotto(errore ?? undefined) ?? null} />
        <BottoneSalva inCorso={isSubmitting}>{modello ? t.salvaModello : t.creaModello}</BottoneSalva>
        {modello ? (
          <div className="border-t border-border pt-4">
            <Elimina
              etichetta={t.eliminaModello}
              cosa={t.ilModello(modello.nome)}
              fatto={t.eliminato(modello.nome)}
              conseguenze={[t.restanoAperti, ...(modello.per_nuovi_clienti ? [t.eModelloClienti] : [])]}
              dopo="/settings/progetti"
              azione={async () => {
                const esito = await eliminaModello({ id: modello.id })
                return esito.ok ? esito : { ...esito, errore: tradotto(esito.errore) ?? esito.errore }
              }}
            />
          </div>
        ) : null}
      </form>
    </FoglioModifica>
  )
}

/**
 * The template for new clients stays on (the database refuses to switch it
 * off): switched off, every new client's project would open without tasks.
 */
export function AttivoModello({
  id,
  nome,
  attivo,
  perNuoviClienti = false,
}: {
  id: string
  nome: string
  attivo: boolean
  perNuoviClienti?: boolean
}) {
  const t = useTesti(IMPOSTAZIONI_PROGETTI)
  const lingua = useLingua()
  const [inCorso, avvia] = useTransition()
  const bloccato = perNuoviClienti && attivo
  return (
    <label
      className={cn(
        'flex min-h-11 items-center gap-2 text-sm text-muted-foreground',
        bloccato ? 'cursor-default' : 'cursor-pointer',
      )}
      title={bloccato ? t.restaAttivo : undefined}
    >
      <Switch
        checked={attivo}
        disabled={inCorso || bloccato}
        aria-label={bloccato ? t.attivoNuoviClienti(nome) : t.attivoAria(nome)}
        onCheckedChange={(valore) =>
          avvia(async () => {
            const esito = await cambiaAttivoModello({ id, attivo: valore })
            if (esito.ok) toast.success(valore ? t.disponibile(nome) : t.nonProposto(nome))
            else toast.error(traduciErroreProgetti(esito.errore, lingua))
          })
        }
      />
      {attivo ? t.attivo : t.disattivato}
    </label>
  )
}

type Voce = {
  id: string
  tasklist: string | null
  titolo: string
  descrizione: string | null
  ordine: number
  inizio_giorni: number | null
  durata_giorni: number | null
  per_ruolo: AppRole | null
}

/**
 * One activity of a template: its list (or none), its title, when it starts
 * and how long it lasts (or no dates: open for the whole project), and in a
 * client's template who does it when it is not the coach.
 */
export function VoceForm({
  modelloId,
  voce,
  liste,
  ordineSuccessivo,
  conDatePredefinite = true,
  perClienti = false,
}: {
  modelloId: string
  voce?: Voce
  /** Lists already in the template, offered as suggestions. */
  liste: readonly string[]
  ordineSuccessivo: number
  /** A new activity starts dated like the others of its template. */
  conDatePredefinite?: boolean
  /** A template of a department that works on clients: "Chi la fa" is asked. */
  perClienti?: boolean
}) {
  const t = useTesti(IMPOSTAZIONI_PROGETTI)
  const lingua = useLingua()
  const tradotto = (messaggio: string | undefined) => traduciErroreProgetti(messaggio, lingua)
  const ruoli = lingua === 'it' ? ETICHETTA_RUOLO : SHELL[lingua].ruoli
  const [aperto, setAperto] = useState(false)
  const { errore, setErrore, salva } = useSalvataggio()
  const id = useId()
  const datata = voce ? voce.inizio_giorni !== null : conDatePredefinite
  const iniziali: VoceModelloInput = {
    id: voce?.id ?? null,
    modello_id: modelloId,
    tasklist: voce ? (voce.tasklist ?? '') : (liste[0] ?? ''),
    titolo: voce?.titolo ?? '',
    descrizione: voce?.descrizione ?? '',
    ordine: voce?.ordine ?? ordineSuccessivo,
    inizio_giorni: datata ? (voce?.inizio_giorni ?? 0) : '',
    durata_giorni: datata ? (voce?.durata_giorni ?? 7) : '',
    per_ruolo: voce?.per_ruolo ?? '',
  }
  const [conDate, setConDate] = useState(datata)
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<VoceModelloInput>({ resolver: zodResolver(voceModelloSchema), defaultValues: iniziali })

  function cambiaDate(attive: boolean) {
    setConDate(attive)
    setValue('inizio_giorni', attive ? 0 : '')
    setValue('durata_giorni', attive ? 7 : '')
  }

  const invia = handleSubmit(async (valori) => {
    if (await salva(() => salvaVoce(valori), voce ? t.attivitaSalvata : t.attivitaAggiunta)) {
      setAperto(false)
      if (!voce) {
        reset({ ...iniziali, ordine: Number(valori.ordine) + 1 })
        setConDate(datata)
      }
    }
  })

  return (
    <FoglioModifica
      aperto={aperto}
      onApertoChange={(v) => {
        setAperto(v)
        if (!v) {
          setErrore(null)
          reset(iniziali)
          setConDate(datata)
        }
      }}
      trigger={
        voce ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-11 shrink-0 text-muted-foreground"
            aria-label={t.modifica(voce.titolo)}
          />
        ) : (
          <Button type="button" className="h-11" />
        )
      }
      contenutoTrigger={
        voce ? (
          <Pencil className="size-4" aria-hidden="true" />
        ) : (
          <>
            <Plus className="size-4" aria-hidden="true" />
            {t.nuovaAttivita}
          </>
        )
      }
      titolo={voce ? t.modificaAttivita : t.nuovaAttivita}
      descrizione={t.attivitaDescrizione}
    >
      <form onSubmit={invia} noValidate className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-lista`}>
            {t.lista} <span className="font-normal text-muted-foreground">{t.facoltativa}</span>
          </Label>
          <Input
            id={`${id}-lista`}
            className="h-11"
            list={`${id}-liste`}
            placeholder={t.nessunaLista}
            {...register('tasklist')}
          />
          <datalist id={`${id}-liste`}>
            {liste.map((l) => (
              <option key={l} value={l} />
            ))}
          </datalist>
          <ErroreCampo id={`${id}-lista-errore`} messaggio={tradotto(errors.tasklist?.message)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-titolo`}>{t.titoloCampo}</Label>
          <Input id={`${id}-titolo`} className="h-11" placeholder={t.titoloSegnaposto} {...register('titolo')} />
          <ErroreCampo id={`${id}-titolo-errore`} messaggio={tradotto(errors.titolo?.message)} />
        </div>
        <label className="flex min-h-11 cursor-pointer items-center justify-between gap-4 rounded-lg border border-border px-3 py-2">
          <span className="space-y-0.5">
            <span className="block text-sm font-medium">{t.conLeDate}</span>
            <span className="block text-xs text-muted-foreground">{conDate ? t.conDateSi : t.conDateNo}</span>
          </span>
          <Switch checked={conDate} onCheckedChange={cambiaDate} aria-label={t.conLeDate} />
        </label>
        <div className="grid grid-cols-3 gap-2">
          {conDate ? (
            <>
              <div className="space-y-1.5">
                <Label htmlFor={`${id}-inizio`}>{t.dalGiornoCampo}</Label>
                <Input id={`${id}-inizio`} inputMode="numeric" className="num h-11 text-right" {...register('inizio_giorni')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${id}-durata`}>{t.giorniCampo}</Label>
                <Input id={`${id}-durata`} inputMode="numeric" className="num h-11 text-right" {...register('durata_giorni')} />
              </div>
            </>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-ordine`}>{t.ordine}</Label>
            <Input id={`${id}-ordine`} inputMode="numeric" className="num h-11 text-right" {...register('ordine')} />
          </div>
        </div>
        <ErroreCampo
          id={`${id}-numeri-errore`}
          messaggio={tradotto(errors.inizio_giorni?.message ?? errors.durata_giorni?.message ?? errors.ordine?.message)}
        />
        {perClienti || voce?.per_ruolo ? (
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-ruolo`}>{t.chiLaFa}</Label>
            <select id={`${id}-ruolo`} className={CLASSE_SELECT} {...register('per_ruolo')}>
              <option value="">{t.ilCoach}</option>
              {RUOLI_DI_UN_COMPITO.map((r) => (
                <option key={r} value={r}>
                  {ruoli[r]}
                </option>
              ))}
              {voce?.per_ruolo && !RUOLI_DI_UN_COMPITO.includes(voce.per_ruolo) ? (
                <option value={voce.per_ruolo}>{ruoli[voce.per_ruolo]}</option>
              ) : null}
            </select>
            <p className="text-xs text-muted-foreground">{t.chiLaFaAiuto}</p>
          </div>
        ) : null}
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-descrizione`}>{t.descrizioneCampo}</Label>
          <Textarea id={`${id}-descrizione`} rows={3} {...register('descrizione')} />
          <ErroreCampo id={`${id}-descrizione-errore`} messaggio={tradotto(errors.descrizione?.message)} />
        </div>
        <ErroreModulo testo={tradotto(errore ?? undefined) ?? null} />
        <BottoneSalva inCorso={isSubmitting}>{voce ? t.salvaAttivita : t.aggiungiAttivita}</BottoneSalva>
      </form>
    </FoglioModifica>
  )
}

/** Two taps on purpose: the first arms, the second deletes. Projects already created keep their tasks. */
export function EliminaVoce({ id, titolo }: { id: string; titolo: string }) {
  const t = useTesti(IMPOSTAZIONI_PROGETTI)
  const lingua = useLingua()
  const [pronto, setPronto] = useState(false)
  const [inCorso, avvia] = useTransition()

  if (!pronto) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-11 shrink-0 text-muted-foreground"
        aria-label={t.elimina(titolo)}
        onClick={() => setPronto(true)}
      >
        <Trash2 className="size-4" aria-hidden="true" />
      </Button>
    )
  }

  return (
    <Button
      type="button"
      variant="destructive"
      className="h-11"
      disabled={inCorso}
      onBlur={() => setPronto(false)}
      autoFocus
      onClick={() =>
        avvia(async () => {
          const esito = await eliminaVoce({ id })
          if (esito.ok) toast.success(t.attivitaEliminata)
          else toast.error(traduciErroreProgetti(esito.errore, lingua))
          setPronto(false)
        })
      }
    >
      {t.conferma}
    </Button>
  )
}
