'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { LoaderCircle, TriangleAlert, UserCheck } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'

import {
  anteprimaPianoRate,
  registraVendita,
  type RataAnteprima,
} from '@/app/(app)/sales/new/actions'
import { ErroreCampo } from '@/components/form/errore-campo'
import { LinkBottone } from '@/components/link-bottone'
import { SceltaRapida } from '@/components/form/scelta-rapida'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { formatData, formatEuro, formatImportoInput } from '@/lib/format'
import { parseImporto } from '@/lib/importi'
import {
  ETICHETTA_TIPO_VENDITA,
  OPZIONI_RATE,
  TIPI_VENDITA,
  nuovaVenditaSchema,
  type NuovaVendita,
  type NuovaVenditaInput,
  type TipoVendita,
} from '@/lib/validation/vendita'

type Prodotto = { id: string; nome: string; durata_mesi: number; prezzo_listino: number }

type Props = {
  oggi: string
  prodotti: Prodotto[]
  callId: string | null
  clienteEsistente: { id: string; nome: string } | null
  prefill: { nome: string; cognome: string; instagram_handle: string }
  tipoIniziale: TipoVendita
}

const RITARDO_ANTEPRIMA_MS = 350

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
  prodotti,
  callId,
  clienteEsistente,
  prefill,
  tipoIniziale,
}: Props) {
  const router = useRouter()
  const [erroreServer, setErroreServer] = useState<string | null>(null)
  const [venditaEsistente, setVenditaEsistente] = useState<string | null>(null)
  const [anteprima, setAnteprima] = useState<RataAnteprima[] | null>(null)
  const [calcolo, setCalcolo] = useState(false)
  const richiesta = useRef(0)

  const {
    register,
    handleSubmit,
    setValue,
    setError,
    subscribe,
    getFieldState,
    formState: { errors, isSubmitting },
  } = useForm<NuovaVenditaInput, unknown, NuovaVendita>({
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
      product_id: undefined,
      valore_contratto: '',
      numero_rate: 1,
      data_vendita: oggi,
      data_inizio: oggi,
      note: '',
    },
  })

  // Reactions to the form: list price on product change, start date following
  // the sale date, and the instalment preview asked to the database.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null

    const annulla = subscribe({
      formState: { values: true },
      callback: ({ values: valori, name }) => {
        if (name === 'product_id' && !getFieldState('valore_contratto').isDirty) {
          const prodotto = prodotti.find((p) => p.id === valori.product_id)
          if (prodotto) {
            setValue('valore_contratto', formatImportoInput(prodotto.prezzo_listino), {
              shouldValidate: true,
            })
          }
        }

        if (name === 'data_vendita' && !getFieldState('data_inizio').isDirty && valori.data_vendita) {
          setValue('data_inizio', valori.data_vendita)
        }

        if (!['valore_contratto', 'numero_rate', 'data_vendita', 'product_id'].includes(name ?? '')) {
          return
        }

        if (timer) clearTimeout(timer)
        timer = setTimeout(async () => {
          const valore =
            typeof valori.valore_contratto === 'number'
              ? valori.valore_contratto
              : parseImporto(valori.valore_contratto)
          const numero = Number(valori.numero_rate)
          const id = ++richiesta.current

          if (!valore || !numero || !valori.data_vendita) {
            setAnteprima(null)
            return
          }

          setCalcolo(true)
          const piano = await anteprimaPianoRate({
            valore,
            numero_rate: numero,
            data_vendita: valori.data_vendita,
          })
          // a slower, older answer must not overwrite a newer one
          if (id === richiesta.current) {
            setAnteprima(piano)
            setCalcolo(false)
          }
        }, RITARDO_ANTEPRIMA_MS)
      },
    })

    return () => {
      annulla()
      if (timer) clearTimeout(timer)
    }
  }, [subscribe, setValue, getFieldState, prodotti])

  const invia = handleSubmit(async (valori) => {
    setErroreServer(null)
    setVenditaEsistente(null)

    let esito
    try {
      esito = await registraVendita(valori)
    } catch {
      setErroreServer('Connessione assente. Controlla la rete e riprova.')
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

    toast.success('Vendita registrata', {
      description: `${valori.numero_rate === 1 ? 'Pagamento unico' : `${valori.numero_rate} rate`} da incassare.`,
    })
    router.push(`/sales/${esito.idVendita}`)
  })

  return (
    <form onSubmit={invia} noValidate className="space-y-8">
      <Sezione titolo="Cliente">
        {clienteEsistente ? (
          <p className="flex min-h-11 items-center gap-2 rounded-xl bg-card px-3 text-sm">
            <UserCheck className="size-4 text-status-ok" aria-hidden="true" />
            <span>
              {clienteEsistente.nome}{' '}
              <span className="text-muted-foreground">· cliente già registrato</span>
            </span>
          </p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="nome">Nome</Label>
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
                <Label htmlFor="cognome">Cognome</Label>
                <Input
                  id="cognome"
                  autoCapitalize="words"
                  className="h-11"
                  {...register('cognome')}
                />
              </div>
            </div>
            <ErroreCampo id="nome-errore" messaggio={errors.nome?.message} />

            <div className="space-y-1.5">
              <Label htmlFor="email">
                Email <span className="font-normal text-muted-foreground">(facoltativa)</span>
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
              <ErroreCampo id="email-errore" messaggio={errors.email?.message} />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="telefono">
                  Telefono <span className="font-normal text-muted-foreground">(facolt.)</span>
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
                <Label htmlFor="instagram_handle">Instagram</Label>
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
              messaggio={errors.telefono?.message ?? errors.instagram_handle?.message}
            />
          </div>
        )}
      </Sezione>

      <Sezione titolo="Vendita">
        <SceltaRapida
          legenda="Tipo"
          opzioni={TIPI_VENDITA.map((t) => ({
            valore: t,
            etichetta: ETICHETTA_TIPO_VENDITA[t],
            disabilitata: !clienteEsistente && t !== 'nuovo',
          }))}
          registrazione={register('tipo')}
          errore={errors.tipo?.message}
          aiuto={
            clienteEsistente ? undefined : 'Rinnovo e upsell si registrano su un cliente esistente.'
          }
        />

        <SceltaRapida
          legenda="Prodotto"
          opzioni={prodotti.map((p) => ({
            valore: p.id,
            etichetta: (
              <>
                <span>{p.nome}</span>
                <span className="num text-xs opacity-80">
                  {formatEuro(p.prezzo_listino, { compatto: true })}
                </span>
              </>
            ),
          }))}
          registrazione={register('product_id')}
          errore={errors.product_id?.message}
          colonne={prodotti.length <= 3 ? 3 : 2}
        />

        <div className="space-y-1.5">
          <Label htmlFor="valore_contratto">Valore del contratto</Label>
          <div className="relative">
            <Input
              id="valore_contratto"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0,00"
              className="num h-11 pr-8 text-right"
              aria-invalid={errors.valore_contratto ? true : undefined}
              aria-describedby="valore-errore"
              {...register('valore_contratto')}
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-muted-foreground"
            >
              €
            </span>
          </div>
          <ErroreCampo id="valore-errore" messaggio={errors.valore_contratto?.message} />
        </div>

        <SceltaRapida
          legenda="Numero di rate"
          opzioni={OPZIONI_RATE.map((n) => ({ valore: String(n), etichetta: String(n) }))}
          registrazione={register('numero_rate')}
          errore={errors.numero_rate?.message}
          colonne={6}
        />

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="data_vendita">Data vendita</Label>
            <Input
              id="data_vendita"
              type="date"
              max={oggi}
              className="num h-11"
              aria-invalid={errors.data_vendita ? true : undefined}
              {...register('data_vendita')}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="data_inizio">Inizio percorso</Label>
            <Input
              id="data_inizio"
              type="date"
              className="num h-11"
              aria-invalid={errors.data_inizio ? true : undefined}
              {...register('data_inizio')}
            />
          </div>
        </div>
        <ErroreCampo
          id="date-errore"
          messaggio={errors.data_vendita?.message ?? errors.data_inizio?.message}
        />

        <div className="space-y-1.5">
          <Label htmlFor="note">
            Note <span className="font-normal text-muted-foreground">(facoltative)</span>
          </Label>
          <Textarea id="note" rows={2} maxLength={1000} {...register('note')} />
        </div>
      </Sezione>

      <Sezione titolo="Piano rate">
        {anteprima && anteprima.length > 0 ? (
          <div aria-live="polite" className={calcolo ? 'opacity-60' : undefined}>
            <table className="w-full text-sm" data-testid="anteprima-rate">
              <caption className="sr-only">Anteprima del piano rate</caption>
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="px-3 py-2 text-left font-normal">Rata</th>
                  <th scope="col" className="px-3 py-2 text-left font-normal">Scadenza</th>
                  <th scope="col" className="px-3 py-2 text-right font-normal">Importo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border rounded-xl bg-card">
                {anteprima.map((r) => (
                  <tr key={r.numero_rata}>
                    <td className="px-3 py-2.5">{r.numero_rata}ª</td>
                    <td className="px-3 py-2.5">{formatData(r.scadenza)}</td>
                    <td className="px-3 py-2.5 text-right">{formatEuro(r.importo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 px-1 text-xs text-muted-foreground">
              Rate mensili, l’ultima assorbe l’arrotondamento. Dopo la registrazione ogni rata si
              può modificare.
            </p>
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
            {calcolo
              ? 'Calcolo del piano…'
              : 'Scegli prodotto, valore e numero di rate: il piano compare qui.'}
          </p>
        )}
      </Sezione>

      {erroreServer ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-status-critical/10 px-3 py-2.5 text-sm text-status-critical"
        >
          <span className="flex items-start gap-2">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {erroreServer}
          </span>
          {venditaEsistente ? (
            <LinkBottone href={`/sales/${venditaEsistente}`} variant="outline">
              Apri la vendita
            </LinkBottone>
          ) : null}
        </div>
      ) : null}

      <Button type="submit" className="h-11 w-full" disabled={isSubmitting}>
        {isSubmitting ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
        Registra vendita
      </Button>
    </form>
  )
}
