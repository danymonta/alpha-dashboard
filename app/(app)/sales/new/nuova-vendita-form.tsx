'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { History, LoaderCircle, TriangleAlert, UserCheck, UserX } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'

import { registraVendita, type RataAnteprima } from '@/app/(app)/sales/new/actions'
import { ErroreCampo } from '@/components/form/errore-campo'
import { LinkBottone } from '@/components/link-bottone'
import { SceltaRapida } from '@/components/form/scelta-rapida'
import {
  CampiPianoRate,
  CampiVendita,
  useReazioniVendita,
  type ProdottoVendita,
} from '@/components/vendite/campi-vendita'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useLingua } from '@/components/i18n/lingua-provider'
import { formato } from '@/lib/format'
import { traduciErrore } from '@/lib/i18n/testi/errori-economics'
import { ETICHETTE } from '@/lib/i18n/testi/etichette'
import { NUOVA_VENDITA } from '@/lib/i18n/testi/nuova-vendita'
import {
  TIPI_VENDITA,
  inizioPredefinito,
  nuovaVenditaSchema,
  type NuovaVendita,
  type NuovaVenditaInput,
  type TipoVendita,
} from '@/lib/validation/vendita'

type Prodotto = ProdottoVendita

/** Starting values of the sale itself (a renewal), all editable like a choice made by hand. */
export type IniziVendita = {
  data_inizio: string
  product_id: string | undefined
  valore_contratto: string
  piano: 'uguale' | 'personalizzato'
  rate: { scadenza: string; importo: string }[]
}

/** The period a renewal extends, shown above the form. */
export type PercorsoPrecedente = {
  prodotto: string
  data_inizio: string
  data_fine: string
  valore_contratto: number
  /**
   * Where the renewal starts: the day after the old path, or today when that day
   * is outside the form's window (over for more than a month, or more than a
   * year ahead).
   */
  partenza: 'giorno_dopo' | 'oggi_finito' | 'oggi_lontano'
}

type Props = {
  oggi: string
  /** The sale date the form opens with: today, or the day of the closed call. */
  dataVenditaIniziale?: string
  prodotti: Prodotto[]
  callId: string | null
  clienteEsistente: { id: string; nome: string } | null
  prefill: { nome: string; cognome: string; instagram_handle: string }
  tipoIniziale: TipoVendita
  iniziali?: IniziVendita | null
  anteprimaIniziale?: RataAnteprima[] | null
  percorsoPrecedente?: PercorsoPrecedente | null
  /** Where to go after saving; the new sale's page when absent. */
  ritorno?: string | null
}

function Sezione({ titolo, children }: { titolo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {titolo}
      </h2>
      {children}
    </section>
  )
}

export function NuovaVenditaForm({
  oggi,
  dataVenditaIniziale = oggi,
  prodotti,
  callId,
  clienteEsistente,
  prefill,
  tipoIniziale,
  iniziali = null,
  anteprimaIniziale = null,
  percorsoPrecedente = null,
  ritorno = null,
}: Props) {
  const router = useRouter()
  const lingua = useLingua()
  const t = NUOVA_VENDITA[lingua]
  const { formatData, formatEuro } = formato(lingua)
  const ETICHETTA_TIPO_VENDITA = ETICHETTE[lingua].tipoVendita
  const tr = (testo: string | undefined) => traduciErrore(testo, lingua)
  const [erroreServer, setErroreServer] = useState<string | null>(null)
  const [venditaEsistente, setVenditaEsistente] = useState<string | null>(null)
  const form = useForm<NuovaVenditaInput, unknown, NuovaVendita>({
    resolver: zodResolver(nuovaVenditaSchema),
    defaultValues: {
      call_id: callId,
      client_id: clienteEsistente?.id ?? null,
      nome: prefill.nome,
      cognome: prefill.cognome,
      email: '',
      telefono: '',
      instagram_handle: prefill.instagram_handle,
      tipo: tipoIniziale,
      product_id: iniziali?.product_id,
      valore_contratto: iniziali?.valore_contratto ?? '',
      numero_rate: 1,
      data_vendita: dataVenditaIniziale,
      // usually a week after the payment; a renewal starts the day after the previous path
      data_inizio: iniziali?.data_inizio ?? inizioPredefinito(dataVenditaIniziale),
      note: '',
      prodotto_personalizzato: '',
      data_fine: '',
      piano: iniziali?.piano ?? 'uguale',
      rate: iniziali?.rate ?? [],
    },
  })
  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors, isSubmitting },
  } = form

  const tipo = useWatch({ control, name: 'tipo' })
  // list price on product change, start date following the sale date, and the
  // instalment preview asked to the database (components/vendite/campi-vendita.tsx)
  const { anteprima, calcolo } = useReazioniVendita(form, { prodotti, oggi, dataVenditaIniziale, anteprimaIniziale })

  const invia = handleSubmit(async (valori) => {
    setErroreServer(null)
    setVenditaEsistente(null)

    let esito
    try {
      esito = await registraVendita(valori)
    } catch {
      setErroreServer(t.connessione)
      return
    }

    if (!esito.ok) {
      for (const [campo, messaggio] of Object.entries(esito.campi ?? {})) {
        setError(campo as keyof NuovaVenditaInput, { message: messaggio })
      }
      setErroreServer(esito.errore)
      setVenditaEsistente(esito.idEsistente ?? null)
      return
    }

    const numero = valori.piano === 'personalizzato' ? valori.rate.length : valori.numero_rate
    toast.success(t.registrata[valori.tipo], { description: t.daIncassare(numero) })
    router.push(ritorno ?? `/sales/${esito.idVendita}`)
  })

  return (
    <form onSubmit={invia} noValidate className="space-y-8">
      <Sezione titolo={t.cliente}>
        {clienteEsistente ? (
          <div className="space-y-2">
            <p className="flex min-h-11 items-center gap-2 rounded-xl bg-card px-3 text-sm">
              <UserCheck className="size-4 text-status-ok" aria-hidden="true" />
              <span>
                {clienteEsistente.nome}{' '}
                <span className="text-muted-foreground">{t.giaRegistrato}</span>
              </span>
            </p>
            {percorsoPrecedente ? (
              <div className="flex gap-2 rounded-xl bg-card px-3 py-2.5 text-sm" data-testid="percorso-precedente">
                <History className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <div className="space-y-0.5">
                  <p>
                    <span className="text-muted-foreground">{t.percorsoPrecedente}</span>
                    <span className="num">
                      {t.percorsoDal(
                        percorsoPrecedente.prodotto,
                        formatData(percorsoPrecedente.data_inizio),
                        formatData(percorsoPrecedente.data_fine),
                        formatEuro(percorsoPrecedente.valore_contratto),
                      )}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {percorsoPrecedente.partenza === 'oggi_finito'
                      ? t.oggiFinito
                      : percorsoPrecedente.partenza === 'oggi_lontano'
                        ? t.oggiLontano
                        : t.giornoDopo}
                  </p>
                </div>
              </div>
            ) : null}
            {/* without a call, renewals and upsells get no setter: the database leaves it empty */}
            {!callId && tipo !== 'nuovo' ? (
              <p className="flex items-center gap-2 px-1 text-sm" data-testid="setter-vendita">
                <UserX className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span>
                  {t.nessunSetter(ETICHETTA_TIPO_VENDITA[tipo])}{' '}
                  <span className="text-muted-foreground">{t.nessunaProvvigione}</span>
                </span>
              </p>
            ) : null}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="nome">{t.nome}</Label>
                <Input
                  id="nome"
                  autoCapitalize="words"
                  className="h-11"
                  aria-invalid={errors.nome ? true : undefined}
                  aria-describedby="nome-errore"
                  {...register('nome')}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cognome">{t.cognome}</Label>
                <Input
                  id="cognome"
                  autoCapitalize="words"
                  className="h-11"
                  {...register('cognome')}
                />
              </div>
            </div>
            <ErroreCampo id="nome-errore" messaggio={tr(errors.nome?.message)} />

            <div className="space-y-1.5">
              <Label htmlFor="email">
                {t.email} <span className="font-normal text-muted-foreground">{t.facoltativa}</span>
              </Label>
              <Input
                id="email"
                type="email"
                inputMode="email"
                autoCapitalize="none"
                className="h-11"
                aria-invalid={errors.email ? true : undefined}
                aria-describedby="email-errore"
                {...register('email')}
              />
              <ErroreCampo id="email-errore" messaggio={tr(errors.email?.message)} />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="telefono">
                  {t.telefono} <span className="font-normal text-muted-foreground">{t.facolt}</span>
                </Label>
                <Input
                  id="telefono"
                  type="tel"
                  inputMode="tel"
                  className="h-11"
                  aria-invalid={errors.telefono ? true : undefined}
                  {...register('telefono')}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="instagram_handle">{t.instagram}</Label>
                <Input
                  id="instagram_handle"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  className="h-11"
                  aria-invalid={errors.instagram_handle ? true : undefined}
                  {...register('instagram_handle')}
                />
              </div>
            </div>
            <ErroreCampo
              id="contatti-errore"
              messaggio={tr(errors.telefono?.message ?? errors.instagram_handle?.message)}
            />
          </div>
        )}
      </Sezione>

      <Sezione titolo={t.vendita}>
        <CampiVendita
          form={form}
          prodotti={prodotti}
          oggi={oggi}
          // a renewal says where it starts in the box above
          aiutoInizio={!percorsoPrecedente}
          prima={
            <SceltaRapida
              legenda={t.tipo}
              opzioni={TIPI_VENDITA.map((t) => ({
                valore: t,
                etichetta: ETICHETTA_TIPO_VENDITA[t],
                disabilitata: !clienteEsistente && t !== 'nuovo',
              }))}
              registrazione={register('tipo')}
              errore={tr(errors.tipo?.message)}
              aiuto={clienteEsistente ? undefined : t.tipoAiuto}
            />
          }
        />
      </Sezione>

      <Sezione titolo={t.pianoRate}>
        <CampiPianoRate form={form} oggi={oggi} anteprima={anteprima} calcolo={calcolo} />
      </Sezione>

      {erroreServer ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-status-critical/10 px-3 py-2.5 text-sm text-status-critical"
        >
          <span className="flex items-start gap-2">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {tr(erroreServer ?? undefined)}
          </span>
          {venditaEsistente ? (
            <LinkBottone href={`/sales/${venditaEsistente}`} variant="outline">
              {t.apriVendita}
            </LinkBottone>
          ) : null}
        </div>
      ) : null}

      <Button type="submit" className="h-11 w-full" disabled={isSubmitting}>
        {isSubmitting ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
        {t.registra}
      </Button>
    </form>
  )
}
