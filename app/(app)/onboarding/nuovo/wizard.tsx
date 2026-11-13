'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import {
  ArrowRight,
  CalendarCheck,
  ChevronLeft,
  CircleAlert,
  LoaderCircle,
  Pencil,
  ReceiptText,
  Rocket,
  TriangleAlert,
  UserCheck,
} from 'lucide-react'
import Link from 'next/link'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { useForm } from 'react-hook-form'

import { avviaOnboarding, nuovoCliente, type EsitoAvvio } from '@/app/(app)/onboarding/actions'
import { IndicatorePassi, type PassoIndicatore } from '@/app/(app)/onboarding/nuovo/indicatore'
import { usePalco } from '@/app/(app)/onboarding/nuovo/palco'
import { ErroreCampo } from '@/components/form/errore-campo'
import { useLingua } from '@/components/i18n/lingua-provider'
import { LinkBottone } from '@/components/link-bottone'
import {
  CampiIncarichi,
  valoriIncarichi,
  type ErroriIncarichi,
  type ValoriIncarichi,
} from '@/components/onboarding/campi-incarichi'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  CampiPianoRate,
  CampiVendita,
  useReazioniVendita,
  type ProdottoVendita,
} from '@/components/vendite/campi-vendita'
import { fineDopoMesi } from '@/lib/date'
import { formato } from '@/lib/format'
import { ETICHETTE } from '@/lib/i18n/testi/etichette'
import { ONBOARDING, traduciErroreOnboarding } from '@/lib/i18n/testi/onboarding'
import { parseImporto } from '@/lib/importi'
import type { IngressoWizard } from '@/lib/onboarding/letture'
import { nomeDiBattesimo } from '@/lib/onboarding/link'
import { nomeCliente, type IncarichiProposti, type PersonaTeam } from '@/lib/onboarding/stati'
import {
  clienteOnboardingSchema,
  INCARICHI,
  teamOnboardingSchema,
  type CampiWizard,
  type ClienteOnboarding,
  type ClienteOnboardingInput,
  type Incarico,
  type VenditaWizardInput,
} from '@/lib/validation/onboarding'
import {
  PERSONALIZZATO,
  inizioPredefinito,
  nuovaVenditaSchema,
  type NuovaVendita,
  type NuovaVenditaInput,
} from '@/lib/validation/vendita'

type Schermata = 'cliente' | 'vendita' | 'team' | 'riepilogo'
type Direzione = 'avanti' | 'indietro'

/** The fields of the first screen that the sale's schema reads too (nuovaVenditaSchema). */
const CAMPI_CLIENTE_VENDITA = ['nome', 'cognome', 'email', 'telefono', 'instagram_handle'] as const

type Props = {
  ingresso: Exclude<IngressoWizard, { modo: 'impossibile' }>
  prodotti: ProdottoVendita[]
  /** The active people of the team, by name. */
  persone: PersonaTeam[]
  /** Who is using the wizard. */
  io: string
  /** The team proposed: Impostazioni › Onboarding, else the responsible is whoever uses the wizard. */
  proposti: IncarichiProposti
  conPredefiniti: boolean
  /** onboarding_impostazioni.aperto_ai_clienti. */
  aperto: boolean
  oggi: string
  /** The page the wizard was opened from (the closer's day, after «Chiusa»): the last screen leads back there. */
  ritorno?: string | null
}

/** A label with its «(facoltativo)», an input, the hint and the error under the field. */
function Campo({
  id,
  etichetta,
  facoltativo,
  aiuto,
  errore,
  children,
}: {
  id: string
  etichetta: string
  facoltativo?: string
  aiuto?: string
  errore?: string
  children: ReactNode
}) {
  return (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={id}>
        {etichetta}
        {facoltativo ? <span className="font-normal text-muted-foreground"> {facoltativo}</span> : null}
      </Label>
      {children}
      <ErroreCampo id={`${id}-errore`} messaggio={errore} />
      {aiuto ? (
        <p id={`${id}-aiuto`} className="text-xs text-muted-foreground">
          {aiuto}
        </p>
      ) : null}
    </div>
  )
}

/** A box of the summary: what was written on a screen, with the way back to it. */
function Riquadro({
  titolo,
  modifica,
  onModifica,
  children,
}: {
  titolo: string
  /** «Modifica Cliente»: absent when the screen cannot be changed (a sale that exists). */
  modifica?: string
  onModifica?: () => void
  children: ReactNode
}) {
  const id = useId()
  return (
    <section aria-labelledby={id} className="rounded-xl bg-card p-3">
      <div className="flex min-h-11 items-center justify-between gap-2">
        <h3 id={id} className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {titolo}
        </h3>
        {onModifica ? (
          <Button type="button" variant="ghost" className="-mr-1.5 size-11" onClick={onModifica} aria-label={modifica}>
            <Pencil className="size-4" aria-hidden="true" />
          </Button>
        ) : null}
      </div>
      <dl className="divide-y divide-border">{children}</dl>
    </section>
  )
}

function Riga({ etichetta, children }: { etichetta: string; children: ReactNode }) {
  return (
    <div className="flex min-h-10 items-baseline justify-between gap-3 py-2">
      <dt className="shrink-0 text-sm text-muted-foreground">{etichetta}</dt>
      <dd className="min-w-0 text-right text-sm break-words">{children}</dd>
    </div>
  )
}

/**
 * The wizard «Nuovo cliente» (1.77.0): Cliente, Vendita, Team, then the summary and the
 * confirmation. One screen at a time, each with one primary action; the three steps stay
 * in view; a screen takes the place of the one before with a short slide (CSS only) and
 * the focus goes to its title. Nothing is written before the confirmation, which does
 * everything in one transaction (public.nuovo_cliente, or avvia_onboarding on a sale that
 * exists): an error leaves the wizard as it was, on the screen of the field to fix.
 *
 * The sale lives in the same form as «Nuova vendita» (nuovaVenditaSchema and the shared
 * fields of components/vendite/campi-vendita.tsx): the rules can never drift apart.
 */
export function WizardNuovoCliente({
  ingresso,
  prodotti,
  persone,
  io,
  proposti,
  conPredefiniti,
  aperto,
  oggi,
  ritorno = null,
}: Props) {
  const lingua = useLingua()
  const t = ONBOARDING[lingua]
  const w = t.wizard
  const { formatData, formatEuro } = formato(lingua)
  const tr = (testo: string | undefined) => traduciErroreOnboarding(testo, lingua)
  const palco = usePalco()
  const id = useId()

  const avvia = ingresso.modo === 'avvia'
  const ordine: Schermata[] = avvia ? ['cliente', 'team', 'riepilogo'] : ['cliente', 'vendita', 'team', 'riepilogo']
  const [schermata, setSchermata] = useState<Schermata>('cliente')
  const [direzione, setDirezione] = useState<Direzione>('avanti')
  const [team, setTeam] = useState<ValoriIncarichi>(() => valoriIncarichi(proposti))
  const [erroriTeam, setErroriTeam] = useState<ErroriIncarichi>({})
  const [teamToccato, setTeamToccato] = useState(false)
  const [erroreServer, setErroreServer] = useState<string | null>(null)
  const [venditaEsistente, setVenditaEsistente] = useState<string | null>(null)
  const [inviando, setInviando] = useState(false)
  const titolo = useRef<HTMLHeadingElement>(null)
  const cima = useRef<HTMLDivElement>(null)
  const primaVolta = useRef(true)

  const formCliente = useForm<ClienteOnboardingInput, unknown, ClienteOnboarding>({
    resolver: zodResolver(clienteOnboardingSchema),
    // the client reaches the wizard already sold: no minor's consent gate here
    defaultValues: { ...ingresso.cliente, minorenne: false },
  })
  const dataVenditaIniziale = ingresso.modo === 'nuovo' ? ingresso.dataVendita : oggi
  const formVendita = useForm<NuovaVenditaInput, unknown, NuovaVendita>({
    resolver: zodResolver(nuovaVenditaSchema),
    defaultValues: {
      call_id: ingresso.callId,
      client_id: ingresso.clienteId,
      nome: ingresso.cliente.nome,
      cognome: ingresso.cliente.cognome,
      email: ingresso.cliente.email,
      telefono: ingresso.cliente.telefono,
      instagram_handle: ingresso.cliente.instagram_handle,
      // the wizard starts new clients only: a renewal or an upsell is «Nuova vendita»
      tipo: 'nuovo',
      product_id: undefined,
      valore_contratto: '',
      numero_rate: 1,
      data_vendita: dataVenditaIniziale,
      // usually a week after the payment, as «Nuova vendita» proposes
      data_inizio: inizioPredefinito(dataVenditaIniziale),
      note: '',
      prodotto_personalizzato: '',
      data_fine: '',
      piano: 'uguale',
      rate: [],
    },
  })
  // the same reactions as «Nuova vendita»: list price, usual plan, start a week after, preview of the instalments
  const { anteprima, calcolo } = useReazioniVendita(formVendita, { prodotti, oggi, dataVenditaIniziale })

  const erroriCliente = formCliente.formState.errors
  const sporco = formCliente.formState.isDirty || formVendita.formState.isDirty || teamToccato

  // a screen takes the place of the one before: the steps come back into view (never under the top bar),
  // then the focus goes to its title without scrolling again (never on the first paint)
  useEffect(() => {
    if (primaVolta.current) {
      primaVolta.current = false
      return
    }
    if (cima.current && cima.current.getBoundingClientRect().top < 80) cima.current.scrollIntoView({ block: 'start' })
    titolo.current?.focus({ preventScroll: true })
  }, [schermata])

  // a reload or a closed tab with something written asks first; the browser says it in its own words
  useEffect(() => {
    if (!sporco) return
    const chiedi = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', chiedi)
    return () => window.removeEventListener('beforeunload', chiedi)
  }, [sporco])

  function vai(a: Schermata) {
    setDirezione(ordine.indexOf(a) >= ordine.indexOf(schermata) ? 'avanti' : 'indietro')
    setSchermata(a)
  }

  /** The sale's schema wants the client of the first screen (the name, when he is new). */
  function portaClienteNellaVendita() {
    const c = formCliente.getValues()
    for (const campo of CAMPI_CLIENTE_VENDITA) formVendita.setValue(campo, c[campo] ?? '')
  }

  /*
   * A screen is checked as a submit of its form (handleSubmit, never trigger): the first
   * wrong field takes the focus, and from then on each field is checked again as it
   * changes, so an error goes away the moment it is fixed.
   */
  function clienteValido(): Promise<boolean> {
    return new Promise((risolvi) => {
      void formCliente.handleSubmit(
        () => risolvi(true),
        () => risolvi(false),
      )()
    })
  }

  function venditaValida(): Promise<boolean> {
    return new Promise((risolvi) => {
      void formVendita.handleSubmit(
        () => risolvi(true),
        () => risolvi(false),
      )()
    })
  }

  async function avanti() {
    if (inviando) return
    setErroreServer(null)
    setVenditaEsistente(null)

    if (schermata === 'cliente') {
      if (!(await clienteValido())) return
      portaClienteNellaVendita()
      vai(ordine[1])
      return
    }

    if (schermata === 'vendita') {
      portaClienteNellaVendita()
      if (await venditaValida()) {
        vai('team')
        return
      }
      // a problem the sale's schema finds on the client (never expected: same rules) is fixed on his screen
      const errori = formVendita.formState.errors
      const delCliente = CAMPI_CLIENTE_VENDITA.filter((campo) => errori[campo]?.message)
      if (delCliente.length > 0 && Object.keys(errori).every((k) => (CAMPI_CLIENTE_VENDITA as readonly string[]).includes(k))) {
        for (const campo of delCliente) formCliente.setError(campo, { message: errori[campo]?.message })
        vai('cliente')
      }
      return
    }

    if (schermata === 'team') {
      const esito = teamOnboardingSchema.safeParse(team)
      if (!esito.success) {
        const errori: ErroriIncarichi = {}
        for (const issue of esito.error.issues) {
          const campo = issue.path[0] as Incarico
          errori[campo] ??= issue.message
        }
        setErroriTeam(errori)
        // as the other screens: the focus on the first wrong field
        const primo = INCARICHI.find((i) => errori[i])
        if (primo) requestAnimationFrame(() => document.getElementById(`${id}-team-${primo}`)?.focus())
        return
      }
      setErroriTeam({})
      vai('riepilogo')
      return
    }

    await conferma()
  }

  function indietro() {
    const i = ordine.indexOf(schermata)
    if (i > 0 && !inviando) vai(ordine[i - 1])
  }

  /** The screen «Vendita» as the core wants it: without the type and the client, which the wizard adds. */
  function venditaDaInviare(): VenditaWizardInput {
    const v = formVendita.getValues()
    return {
      call_id: v.call_id,
      client_id: v.client_id,
      product_id: v.product_id,
      prodotto_personalizzato: v.prodotto_personalizzato,
      data_fine: v.data_fine,
      piano: v.piano,
      rate: v.rate,
      valore_contratto: v.valore_contratto,
      numero_rate: v.numero_rate,
      data_vendita: v.data_vendita,
      data_inizio: v.data_inizio,
      note: v.note,
    }
  }

  /** What the server found: each message under its field, and the wizard on the first screen to fix. */
  function mostraCampi(campi: CampiWizard) {
    for (const [campo, messaggio] of Object.entries(campi.cliente ?? {})) {
      formCliente.setError(campo as keyof ClienteOnboardingInput, { message: messaggio })
    }
    for (const [campo, messaggio] of Object.entries(campi.vendita ?? {})) {
      formVendita.setError(campo as keyof NuovaVenditaInput, { message: messaggio })
    }
    if (campi.team) setErroriTeam(campi.team)
    const dove = ordine.find((s) => s !== 'riepilogo' && Object.keys(campi[s] ?? {}).length > 0)
    if (dove) vai(dove)
  }

  async function conferma() {
    const cliente = formCliente.getValues()
    setInviando(true)
    palco.inizia()

    let esito: EsitoAvvio
    try {
      esito =
        ingresso.modo === 'avvia'
          ? await avviaOnboarding({ sale_id: ingresso.vendita.saleId, cliente, team })
          : await nuovoCliente({ cliente, vendita: venditaDaInviare(), team })
    } catch {
      palco.fallita()
      setInviando(false)
      setErroreServer(t.connessione)
      return
    }

    if (!esito.ok) {
      palco.fallita()
      setInviando(false)
      setErroreServer(esito.errore)
      setVenditaEsistente(esito.idEsistente ?? null)
      if (esito.campi) mostraCampi(esito.campi)
      return
    }

    // the last screen takes the stage: this wizard is done, whatever the page under it says now
    palco.mostra({
      idCliente: esito.idCliente,
      idInvito: esito.idInvito,
      idVendita: esito.idVendita,
      stato: esito.stato,
      nome: nomeCliente({ nome: cliente.nome, cognome: cliente.cognome ?? null }, lingua),
      nomeDiBattesimo: nomeDiBattesimo(cliente.nome),
      aperto,
      ritorno,
      passi: passiIndicatore.map(({ chiave, titolo }) => ({ chiave, titolo })),
    })
  }

  // -------------------------------------------------------------------------
  // The three steps, always in view
  // -------------------------------------------------------------------------
  const indice = ordine.indexOf(schermata)
  const stato = (s: Exclude<Schermata, 'riepilogo'>): PassoIndicatore['stato'] => {
    // a sale that exists is a step already done
    if (s === 'vendita' && avvia) return 'fatto'
    const i = ordine.indexOf(s)
    return i < indice ? 'fatto' : i === indice ? 'corrente' : 'futuro'
  }
  const passiIndicatore: PassoIndicatore[] = (['cliente', 'vendita', 'team'] as const).map((s) => {
    const st = stato(s)
    return {
      chiave: s,
      titolo: w.passi[s],
      stato: st,
      // a finished step is one tap away; the sale of «Avvia onboarding» is not the wizard's to change
      onVai: st === 'fatto' && ordine.includes(s) && !inviando ? () => vai(s) : undefined,
    }
  })

  const scritto = formCliente.getValues()
  const nomeScritto = nomeCliente({ nome: scritto.nome, cognome: scritto.cognome ?? null }, lingua)
  const primaria =
    schermata === 'riepilogo' ? w.conferma : ordine[indice + 1] === 'riepilogo' ? w.vaiAlRiepilogo : w.avanti
  const nomePersona = (idPersona: string) => {
    const p = persone.find((x) => x.id === idPersona)
    return p ? (p.id === io ? t.incarichi.io(p.nome) : p.nome) : t.incarichi.nessuno
  }

  // -------------------------------------------------------------------------
  // The screens
  // -------------------------------------------------------------------------
  function schermataCliente() {
    const c = w.cliente
    const reg = formCliente.register
    return (
      <div className="space-y-4">
        {ingresso.modo === 'nuovo' && ingresso.origine === 'call' ? (
          <p className="flex items-start gap-2 rounded-xl bg-card px-3 py-2.5 text-sm text-muted-foreground" data-testid="dalla-call">
            <CalendarCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {c.dallaCall}
          </p>
        ) : null}
        {ingresso.clienteId ? (
          <p className="flex items-start gap-2 rounded-xl bg-card px-3 py-2.5 text-sm" data-testid="cliente-esistente">
            <UserCheck className="mt-0.5 size-4 shrink-0 text-status-ok" aria-hidden="true" />
            {c.esistente(nomeCliente(ingresso.cliente, lingua))}
          </p>
        ) : null}

        <div className="grid grid-cols-2 gap-2">
          <Campo id={`${id}-nome`} etichetta={c.nome} errore={tr(erroriCliente.nome?.message)}>
            <Input
              id={`${id}-nome`}
              autoCapitalize="words"
              autoComplete="off"
              className="h-11"
              aria-required="true"
              aria-invalid={erroriCliente.nome ? true : undefined}
              aria-describedby={erroriCliente.nome ? `${id}-nome-errore` : undefined}
              {...reg('nome')}
            />
          </Campo>
          <Campo id={`${id}-cognome`} etichetta={c.cognome} errore={tr(erroriCliente.cognome?.message)}>
            <Input
              id={`${id}-cognome`}
              autoCapitalize="words"
              autoComplete="off"
              className="h-11"
              aria-invalid={erroriCliente.cognome ? true : undefined}
              aria-describedby={erroriCliente.cognome ? `${id}-cognome-errore` : undefined}
              {...reg('cognome')}
            />
          </Campo>
        </div>

        <Campo
          id={`${id}-email`}
          etichetta={c.email}
          facoltativo={c.facoltativo}
          aiuto={c.emailAiuto}
          errore={tr(erroriCliente.email?.message)}
        >
          <Input
            id={`${id}-email`}
            type="email"
            inputMode="email"
            autoCapitalize="none"
            autoComplete="off"
            className="h-11"
            aria-invalid={erroriCliente.email ? true : undefined}
            aria-describedby={erroriCliente.email ? `${id}-email-errore` : `${id}-email-aiuto`}
            {...reg('email')}
          />
        </Campo>

        <div className="grid grid-cols-1 gap-4 min-[26rem]:grid-cols-2 min-[26rem]:gap-2">
          <Campo
            id={`${id}-telefono`}
            etichetta={c.telefono}
            facoltativo={c.facoltativo}
            errore={tr(erroriCliente.telefono?.message)}
          >
            <Input
              id={`${id}-telefono`}
              type="tel"
              inputMode="tel"
              autoComplete="off"
              className="h-11"
              aria-invalid={erroriCliente.telefono ? true : undefined}
              aria-describedby={erroriCliente.telefono ? `${id}-telefono-errore` : undefined}
              {...reg('telefono')}
            />
          </Campo>
          <Campo
            id={`${id}-instagram`}
            etichetta={c.instagram}
            facoltativo={c.facoltativo}
            errore={tr(erroriCliente.instagram_handle?.message)}
          >
            <Input
              id={`${id}-instagram`}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoComplete="off"
              className="h-11"
              aria-invalid={erroriCliente.instagram_handle ? true : undefined}
              aria-describedby={erroriCliente.instagram_handle ? `${id}-instagram-errore` : undefined}
              {...reg('instagram_handle')}
            />
          </Campo>
        </div>

        <Campo
          id={`${id}-telegram`}
          etichetta={c.telegram}
          facoltativo={c.facoltativo}
          aiuto={c.telegramAiuto}
          errore={tr(erroriCliente.telegram?.message)}
        >
          <Input
            id={`${id}-telegram`}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoComplete="off"
            className="h-11"
            aria-invalid={erroriCliente.telegram ? true : undefined}
            aria-describedby={erroriCliente.telegram ? `${id}-telegram-errore` : `${id}-telegram-aiuto`}
            {...reg('telegram')}
          />
        </Campo>
      </div>
    )
  }

  function schermataVendita() {
    if (ingresso.modo !== 'nuovo') return null
    const v = w.vendita
    const tipoVendita = ETICHETTE[lingua].tipoVendita
    return (
      <div className="space-y-6">
        {ingresso.call ? (
          <p className="flex items-start gap-2 rounded-xl bg-card px-3 py-2.5 text-sm text-muted-foreground" data-testid="vendita-dalla-call">
            <CalendarCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {v.dallaCall(formatData(ingresso.call.giorno))}
          </p>
        ) : null}

        {ingresso.simili.length > 0 ? (
          <section
            aria-labelledby={`${id}-simili`}
            className="space-y-3 rounded-xl border border-status-warning/40 bg-card p-3"
            data-testid="vendita-simile"
          >
            <h3 id={`${id}-simili`} className="flex items-center gap-1.5 text-sm font-medium text-status-warning">
              <CircleAlert className="size-4 shrink-0" aria-hidden="true" />
              {v.simileTitolo}
            </h3>
            <p className="text-sm text-muted-foreground">{v.simileTesto}</p>
            <ul className="space-y-2">
              {ingresso.simili.map((s) => (
                <li key={s.sale_id} className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{s.cliente}</p>
                    <p className="text-sm text-muted-foreground">{v.simileRiga(tipoVendita[s.tipo], formatData(s.data_vendita))}</p>
                  </div>
                  {s.tipo === 'nuovo' ? (
                    <LinkBottone
                      href={`/onboarding/nuovo?vendita=${s.sale_id}`}
                      variant="outline"
                      className="px-3"
                      aria-label={v.simileNomeAvvia(s.cliente, formatData(s.data_vendita))}
                    >
                      {v.simileAvvia}
                    </LinkBottone>
                  ) : (
                    <LinkBottone href={`/sales/${s.sale_id}`} variant="outline" className="px-3">
                      {t.apriVendita}
                    </LinkBottone>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <div className="space-y-4">
          <CampiVendita form={formVendita} prodotti={prodotti} oggi={oggi} />
        </div>

        <section className="space-y-4" aria-labelledby={`${id}-piano`}>
          <h3 id={`${id}-piano`} className="px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {v.pianoRate}
          </h3>
          <CampiPianoRate form={formVendita} oggi={oggi} anteprima={anteprima} calcolo={calcolo} />
        </section>
      </div>
    )
  }

  function schermataTeam() {
    return (
      <div className="space-y-4">
        {conPredefiniti ? <p className="px-1 text-xs text-muted-foreground">{w.team.predefiniti}</p> : null}
        <CampiIncarichi
          valori={team}
          onChange={(incarico, valore) => {
            setTeam((prima) => ({ ...prima, [incarico]: valore }))
            setTeamToccato(true)
            setErroriTeam((prima) => ({ ...prima, [incarico]: undefined }))
          }}
          persone={persone}
          io={io}
          errori={erroriTeam}
          idBase={`${id}-team`}
        />
        <p className="rounded-xl bg-card px-3 py-2.5 text-sm text-muted-foreground">{t.incarichi.nota}</p>
      </div>
    )
  }

  function schermataRiepilogo() {
    const r = w.riepilogo
    const c = formCliente.getValues()
    const vuoto = <span className="text-muted-foreground">{r.nonIndicato}</span>
    const nessuno = <span className="text-muted-foreground">{t.incarichi.nessuno}</span>
    const testo = (valore: string | null | undefined) => (valore?.trim() ? valore.trim() : vuoto)

    let vendita: ReactNode
    if (ingresso.modo === 'avvia') {
      const e = ingresso.vendita
      vendita = (
        <Riquadro titolo={r.vendita}>
          <Riga etichetta={r.prodotto}>{e.prodotto ?? t.senzaOnboarding.senzaProdotto}</Riga>
          <Riga etichetta={r.dataVendita}>
            <span className="num">{formatData(e.data_vendita)}</span>
          </Riga>
          <Riga etichetta={r.inizio}>
            <span className="num">{formatData(e.data_inizio)}</span>
          </Riga>
          <Riga etichetta={r.fine}>
            <span className="num">{formatData(e.data_fine)}</span>
          </Riga>
        </Riquadro>
      )
    } else {
      const v = formVendita.getValues()
      const personalizzato = v.product_id === PERSONALIZZATO
      const prodotto = prodotti.find((p) => p.id === v.product_id)
      const fine = personalizzato ? v.data_fine : prodotto && v.data_inizio ? fineDopoMesi(v.data_inizio, prodotto.durata_mesi) : null
      const valore = typeof v.valore_contratto === 'number' ? v.valore_contratto : parseImporto(v.valore_contratto ?? '')
      const numeroRate = v.piano === 'personalizzato' ? (v.rate ?? []).length : Number(v.numero_rate)
      vendita = (
        <Riquadro titolo={r.vendita} modifica={r.modifica(w.passi.vendita)} onModifica={() => vai('vendita')}>
          <Riga etichetta={r.prodotto}>{personalizzato ? testo(v.prodotto_personalizzato) : (prodotto?.nome ?? vuoto)}</Riga>
          <Riga etichetta={r.contratto}>
            {/* the one gold element of the summary: what the client signs */}
            <span className="num text-base font-semibold text-gold">{formatEuro(valore)}</span>
          </Riga>
          <Riga etichetta={r.pagamento}>
            {v.piano === 'personalizzato' ? r.pianoAMano(numeroRate) : r.rate(numeroRate)}
          </Riga>
          <Riga etichetta={r.dataVendita}>
            <span className="num">{formatData(v.data_vendita)}</span>
          </Riga>
          <Riga etichetta={r.inizio}>
            <span className="num">{formatData(v.data_inizio)}</span>
          </Riga>
          <Riga etichetta={r.fine}>{fine ? <span className="num">{formatData(fine)}</span> : vuoto}</Riga>
        </Riquadro>
      )
    }

    return (
      <div className="space-y-3" data-testid="riepilogo">
        <Riquadro titolo={r.cliente} modifica={r.modifica(w.passi.cliente)} onModifica={() => vai('cliente')}>
          <Riga etichetta={w.cliente.nome}>
            <span className="font-medium">{nomeScritto}</span>
          </Riga>
          <Riga etichetta={w.cliente.email}>{testo(c.email)}</Riga>
          <Riga etichetta={w.cliente.telefono}>{testo(c.telefono)}</Riga>
          <Riga etichetta={w.cliente.telegram}>{testo(c.telegram)}</Riga>
          <Riga etichetta={w.cliente.instagram}>{testo(c.instagram_handle)}</Riga>
        </Riquadro>

        {vendita}

        <Riquadro titolo={r.team} modifica={r.modifica(w.passi.team)} onModifica={() => vai('team')}>
          {/* nobody in charge reads «Nessuno», as in the select and on the card */}
          <Riga etichetta={t.incarichi.coach}>{team.coach ? nomePersona(team.coach) : nessuno}</Riga>
          <Riga etichetta={t.incarichi.revisore}>{team.revisore ? nomePersona(team.revisore) : nessuno}</Riga>
          <Riga etichetta={t.incarichi.responsabile}>{nomePersona(team.responsabile)}</Riga>
        </Riquadro>

        <section aria-labelledby={`${id}-effetti`} className="rounded-xl border border-dashed border-border p-3">
          <h3 id={`${id}-effetti`} className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {r.cosaSuccede}
          </h3>
          <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
            {(avvia ? r.effettiAvvia : r.effetti).map((effetto) => (
              <li key={effetto} className="flex items-start gap-2">
                <span aria-hidden="true" className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground" />
                {effetto}
              </li>
            ))}
          </ul>
        </section>
      </div>
    )
  }

  const titoli: Record<Schermata, { titolo: string; descrizione: string }> = {
    cliente: w.cliente,
    vendita: w.vendita,
    team: w.team,
    riepilogo: w.riepilogo,
  }

  return (
    <div className="max-w-xl space-y-6" data-testid="wizard" data-schermata={schermata}>
      <div className="space-y-1">
        <Link
          href="/onboarding"
          onClick={(e) => {
            if (sporco && !window.confirm(w.abbandona)) e.preventDefault()
          }}
          className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-lg pr-3 pl-1 text-sm text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          {t.titolo}
        </Link>
        <h1 className="font-heading text-xl font-semibold break-words md:text-2xl">{avvia ? w.titoloAvvia : w.titolo}</h1>
        <p className="text-sm text-muted-foreground">{avvia ? w.descrizioneAvvia : w.descrizione}</p>
      </div>

      {/* scroll-mt: below the top bar of the phone, when a new screen brings it back into view */}
      <div ref={cima} className="scroll-mt-20">
        <IndicatorePassi passi={passiIndicatore} completo={schermata === 'riepilogo'} />
      </div>

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          void avanti()
        }}
        className="space-y-6"
      >
        {/* the key makes the screen a new element: the slide plays again at every step */}
        <section
          key={schermata}
          aria-labelledby={`${id}-titolo`}
          className={direzione === 'avanti' ? 'wizard-avanti space-y-5' : 'wizard-indietro space-y-5'}
        >
          <div className="space-y-1">
            <h2
              id={`${id}-titolo`}
              ref={titolo}
              tabIndex={-1}
              className="scroll-mt-24 font-heading text-lg font-semibold outline-none"
            >
              {titoli[schermata].titolo}
            </h2>
            <p className="text-sm text-muted-foreground">{titoli[schermata].descrizione}</p>
          </div>

          {schermata === 'cliente'
            ? schermataCliente()
            : schermata === 'vendita'
              ? schermataVendita()
              : schermata === 'team'
                ? schermataTeam()
                : schermataRiepilogo()}
        </section>

        {erroreServer ? (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-status-critical/10 px-3 py-2.5 text-sm text-status-critical"
            data-testid="wizard-errore"
          >
            <span className="flex items-start gap-2">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {tr(erroreServer)}
            </span>
            {venditaEsistente ? (
              // the call already has its sale: the onboarding starts from that one, never a second sale
              <LinkBottone href={`/onboarding/nuovo?vendita=${venditaEsistente}`} variant="outline">
                {t.avviaOnboarding}
              </LinkBottone>
            ) : null}
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-2">
          {indice > 0 ? (
            <Button type="button" variant="outline" className="h-11" onClick={indietro} disabled={inviando}>
              <ChevronLeft className="size-4" aria-hidden="true" />
              {w.indietro}
            </Button>
          ) : (
            <span />
          )}
          <Button type="submit" className="glow-primario h-11 min-w-32" disabled={inviando} data-testid="wizard-avanti">
            {schermata === 'riepilogo' ? (
              inviando ? (
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Rocket className="size-4" aria-hidden="true" />
              )
            ) : null}
            {inviando ? w.inCorso : primaria}
            {schermata === 'riepilogo' ? null : <ArrowRight className="size-4" aria-hidden="true" />}
          </Button>
        </div>

        {/* the way out for a renewal or an upsell closed in a call: the sale alone, as before */}
        {schermata === 'cliente' && ingresso.modo === 'nuovo' && ingresso.callId ? (
          <p className="text-center">
            <Link
              href={`/sales/new?${new URLSearchParams({ call: ingresso.callId, ...(ritorno ? { da: ritorno } : {}) }).toString()}`}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              data-testid="solo-vendita"
            >
              <ReceiptText className="size-4" aria-hidden="true" />
              {t.agganci.soloVendita}
            </Link>
          </p>
        ) : null}
      </form>
    </div>
  )
}
