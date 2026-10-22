'use client'

import { ArrowLeft, Check, Ellipsis, LoaderCircle, Plus, Trash2, TriangleAlert, X } from 'lucide-react'
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { toast } from 'sonner'
import type { Popover as PopoverPrimitive } from '@base-ui/react/popover'

import { creaOpzione, eliminaOpzione, modificaOpzione } from '@/app/(app)/marketing/contenuti/actions'
import { useCampoContenuto, type ValoreCampo } from '@/components/marketing/campo-contenuto'
import { CLASSE_BOTTONE_CELLA, CLASSE_CAMPO, CLASSE_CHIP, PiuVuoto } from '@/components/marketing/classi-cella'
import { useOpzioniToast } from '@/components/marketing/contesto-pannello'
import { useOpzioni } from '@/components/marketing/opzioni-contesto'
import { CampioneColore, Pillola } from '@/components/marketing/pillola'
import { useSolaLettura } from '@/components/shell/sola-lettura'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { CAMPI } from '@/lib/marketing/etichette'
import {
  COLORI_ETICHETTA,
  NOME_COLORE,
  NOME_OPZIONE_MAX,
  nomeConfrontabile,
  opzioneDaValore,
  type CampoOpzione,
  type ColoreEtichetta,
  type Opzione,
} from '@/lib/marketing/opzioni'
import { cn } from '@/lib/utils'
import { normalizzaNomeOpzione } from '@/lib/validation/opzione'

/**
 * - "cella": a table cell (the pill, "+" when empty);
 * - "chip": a card's chip on the phone (44 px, "+ Reel Type" when empty);
 * - "campo": a property of the panel and of the content's page.
 */
export type AspettoSelect = 'cella' | 'chip' | 'campo'

type Vista = { tipo: 'elenco' } | { tipo: 'opzione'; id: string }

const CLASSE_RIGA_ICONA =
  'inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-50'

/**
 * Reel Type and Format, like Notion's select (Dany, 21/10/2026): the pill in
 * the cell; a tap opens a menu with the chosen label on top (with its X), the
 * field to filter, the labels as coloured pills, «Crea «nome»» when what is
 * typed is not there (one tap creates it and chooses it), and for each label a
 * menu with «Rinomina», the ten colours and «Elimina». The write on the
 * content is the one of every property (useCampoContenuto → modificaCampoContenuto,
 * over the value the field showed); the labels themselves are written by
 * creaOpzione, modificaOpzione and eliminaOpzione, with the session of whoever
 * taps. A combobox: the arrows move, Enter chooses or creates, Esc closes.
 * Mounted at the first tap, like the other editors: 300 rows cost nothing to hydrate.
 */
/** The label with its menu; for a read-only account (useSolaLettura) the pill alone, or a dash. */
export function SelectOpzioni<C extends CampoOpzione>(props: Parameters<typeof SelectOpzioniModificabile<C>>[0]) {
  const solaLettura = useSolaLettura()
  const { opzioni } = useOpzioni()
  if (!solaLettura) return <SelectOpzioniModificabile {...props} />
  const scelta = opzioneDaValore(opzioni[props.campo], props.valore)
  return scelta ? (
    <Pillola nome={scelta.nome} colore={scelta.colore} />
  ) : (
    <span className="text-muted-foreground">–</span>
  )
}

function SelectOpzioniModificabile<C extends CampoOpzione>({
  id,
  nome,
  campo,
  valore,
  aspetto = 'cella',
  className,
}: {
  id: string
  /** The content's Name, for the button's accessible name and the focus that follows a row out of the list. */
  nome: string
  campo: C
  valore: ValoreCampo<C>
  aspetto?: AspettoSelect
  className?: string
}) {
  const { mostrato, inCorso, salva } = useCampoContenuto({ id, nome, campo, valore })
  const { opzioni } = useOpzioni()
  const elenco = opzioni[campo]
  const [montato, setMontato] = useState(false)
  const [aperto, setAperto] = useState(false)
  const [vista, setVista] = useState<Vista>({ tipo: 'elenco' })
  const etichetta = CAMPI[campo]
  const scelta = opzioneDaValore(elenco, mostrato)

  const propsBottone = {
    type: 'button' as const,
    'data-cella': campo,
    'data-etichetta': etichetta,
    'aria-label': scelta
      ? `${scelta.nome}: cambia ${etichetta} di «${nome}»`
      : `Vuoto: scegli ${etichetta} di «${nome}»`,
    'aria-busy': inCorso || undefined,
    'aria-haspopup': 'dialog' as const,
    className: cn(
      aspetto === 'chip' ? CLASSE_CHIP : aspetto === 'campo' ? CLASSE_CAMPO : CLASSE_BOTTONE_CELLA,
      className,
    ),
  }
  const contenuto = scelta ? (
    <Pillola nome={scelta.nome} colore={scelta.colore} />
  ) : aspetto === 'chip' ? (
    <span className="inline-flex items-center gap-1 text-muted-foreground">
      <Plus className="size-4" aria-hidden="true" />
      {etichetta}
    </span>
  ) : aspetto === 'campo' ? (
    <span className="text-muted-foreground">Vuoto</span>
  ) : (
    <PiuVuoto />
  )

  // until the first tap, a plain button: nothing of the popover is mounted
  if (!montato) {
    return (
      <button
        {...propsBottone}
        aria-expanded={false}
        onClick={() => {
          // a save in flight: the field waits for it, the new value stays shown
          if (inCorso) return
          setMontato(true)
          setAperto(true)
        }}
      >
        {contenuto}
      </button>
    )
  }

  function cambiaAperto(ora: boolean, dettagli: PopoverPrimitive.Root.ChangeEventDetails) {
    if (ora && inCorso) {
      dettagli.cancel()
      return
    }
    // Esc inside the menu of a label goes back to the list; a second Esc closes
    if (!ora && dettagli.reason === 'escape-key' && vista.tipo !== 'elenco') {
      dettagli.cancel()
      setVista({ tipo: 'elenco' })
      return
    }
    if (!ora) setVista({ tipo: 'elenco' })
    setAperto(ora)
  }

  const opzioneAperta = vista.tipo === 'opzione' ? elenco.find((o) => o.id === vista.id) : undefined

  return (
    <Popover open={aperto} onOpenChange={cambiaAperto}>
      <PopoverTrigger render={<button {...propsBottone} aria-expanded={aperto} />}>{contenuto}</PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-72 max-w-[calc(100vw-2rem)] gap-0 p-0"
        // each view puts the focus in its own field (the filter, the name)
        initialFocus={false}
      >
        {opzioneAperta ? (
          <MenuOpzione
            opzione={opzioneAperta}
            onIndietro={() => setVista({ tipo: 'elenco' })}
            onEliminata={() => {
              setVista({ tipo: 'elenco' })
              setAperto(false)
            }}
          />
        ) : (
          <ElencoOpzioni
            campo={campo}
            mostrato={mostrato}
            salva={salva}
            onChiudi={() => setAperto(false)}
            onApriOpzione={(o) => setVista({ tipo: 'opzione', id: o.id })}
          />
        )}
      </PopoverContent>
    </Popover>
  )
}

// ── the list: the chosen label, the filter, the labels, «Crea» ──────────────

function ElencoOpzioni({
  campo,
  mostrato,
  salva,
  onChiudi,
  onApriOpzione,
}: {
  campo: CampoOpzione
  mostrato: string | null
  salva: (bozza: unknown) => string | null
  onChiudi: () => void
  onApriOpzione: (opzione: Opzione) => void
}) {
  const { opzioni, aggiungi } = useOpzioni()
  const opzioniToast = useOpzioniToast()
  const elenco = opzioni[campo]
  const idBase = useId()
  const input = useRef<HTMLInputElement>(null)
  const [testo, setTesto] = useState('')
  const [attivo, setAttivo] = useState(-1)
  const [creando, setCreando] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)

  const scelta = opzioneDaValore(elenco, mostrato)
  const cerca = nomeConfrontabile(testo)
  const filtrate = cerca === '' ? elenco : elenco.filter((o) => nomeConfrontabile(o.nome).includes(cerca))
  const nomeNuovo = normalizzaNomeOpzione(testo)
  // «Crea» only for a name that is not there yet (the database compares without case, so does this)
  const puoCreare = nomeNuovo !== '' && !elenco.some((o) => nomeConfrontabile(o.nome) === nomeConfrontabile(nomeNuovo))
  const voci = puoCreare ? filtrate.length + 1 : filtrate.length
  const idVoce = (i: number) => `${idBase}-voce-${i}`

  // the field has the focus as soon as the menu opens
  useEffect(() => {
    const t = window.setTimeout(() => input.current?.focus(), 0)
    return () => window.clearTimeout(t)
  }, [])

  function scegli(o: Opzione | null) {
    onChiudi()
    if ((o?.valore ?? null) === mostrato) return
    salva(o ? o.valore : null)
  }

  async function crea() {
    if (creando || !puoCreare) return
    setCreando(true)
    setErrore(null)
    let esito: Awaited<ReturnType<typeof creaOpzione>>
    try {
      esito = await creaOpzione({ campo, nome: nomeNuovo })
    } catch {
      setCreando(false)
      setErrore('Connessione assente. Riprova.')
      return
    }
    setCreando(false)
    if (!esito.ok) {
      setErrore(esito.errore)
      return
    }
    // shown at once, chosen on this content, and the redraw brings the database's own list
    aggiungi(esito.opzione)
    onChiudi()
    salva(esito.opzione.valore)
    toast.success(`Etichetta «${esito.opzione.nome}» creata`, opzioniToast)
  }

  function tasti(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (voci > 0) setAttivo((a) => (a + 1) % voci)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (voci > 0) setAttivo((a) => (a <= 0 ? voci - 1 : a - 1))
    } else if (e.key === 'Home' && voci > 0 && testo === '') {
      e.preventDefault()
      setAttivo(0)
    } else if (e.key === 'End' && voci > 0 && testo === '') {
      e.preventDefault()
      setAttivo(voci - 1)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      // typed text with nothing highlighted: the first match, or «Crea»
      const i = attivo >= 0 ? attivo : testo !== '' ? 0 : -1
      if (i < 0) return
      if (i < filtrate.length) scegli(filtrate[i])
      else void crea()
    }
  }

  return (
    <div className="flex flex-col">
      <div className="space-y-2 border-b border-border p-2">
        <div className="flex min-h-11 flex-wrap items-center gap-1 rounded-lg border border-input bg-input/30 px-2 py-1 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
          {scelta ? (
            <Pillola nome={scelta.nome} colore={scelta.colore} className="pr-1">
              <button
                type="button"
                aria-label={`Togli «${scelta.nome}»`}
                title="Togli"
                onClick={() => scegli(null)}
                className="-mr-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-sm hover:bg-foreground/15 focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            </Pillola>
          ) : null}
          <input
            ref={input}
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls={`${idBase}-elenco`}
            aria-autocomplete="list"
            aria-activedescendant={attivo >= 0 && attivo < voci ? idVoce(attivo) : undefined}
            aria-label={`Cerca o crea un’etichetta di ${CAMPI[campo]}`}
            value={testo}
            maxLength={NOME_OPZIONE_MAX + 20}
            autoComplete="off"
            autoCapitalize="none"
            enterKeyHint="done"
            placeholder={scelta ? '' : 'Cerca o crea'}
            onChange={(e) => {
              setTesto(e.currentTarget.value)
              setErrore(null)
              setAttivo(e.currentTarget.value.trim() === '' ? -1 : 0)
            }}
            onKeyDown={tasti}
            className="h-9 min-w-24 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground md:text-sm"
          />
        </div>
        <p className="px-1 text-xs text-muted-foreground">Scegli un’etichetta o creane una</p>
      </div>

      <div
        id={`${idBase}-elenco`}
        role="listbox"
        aria-label={CAMPI[campo]}
        className="max-h-64 overflow-y-auto p-1"
      >
        {filtrate.map((o, i) => (
          <div key={o.id} role="presentation" className="group/opzione flex items-center rounded-lg" data-opzione={o.valore}>
            <div
              id={idVoce(i)}
              role="option"
              aria-selected={o.valore === mostrato}
              tabIndex={-1}
              onMouseEnter={() => setAttivo(i)}
              onClick={() => scegli(o)}
              className={cn(
                'flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-lg px-2',
                attivo === i ? 'bg-accent' : 'hover:bg-accent/60',
              )}
            >
              <Pillola nome={o.nome} colore={o.colore} />
              {o.valore === mostrato ? <Check className="ml-auto size-4 shrink-0 text-muted-foreground" aria-hidden="true" /> : null}
            </div>
            <button
              type="button"
              aria-label={`Modifica l’etichetta «${o.nome}»`}
              title="Rinomina, colore, elimina"
              data-opzione-menu={o.valore}
              onClick={() => onApriOpzione(o)}
              className={CLASSE_RIGA_ICONA}
            >
              <Ellipsis className="size-4" aria-hidden="true" />
            </button>
          </div>
        ))}
        {puoCreare ? (
          <div
            id={idVoce(filtrate.length)}
            role="option"
            aria-selected={false}
            tabIndex={-1}
            aria-busy={creando || undefined}
            onMouseEnter={() => setAttivo(filtrate.length)}
            onClick={() => void crea()}
            className={cn(
              'flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-2 text-sm',
              attivo === filtrate.length ? 'bg-accent' : 'hover:bg-accent/60',
              creando && 'opacity-70',
            )}
          >
            {creando ? (
              <LoaderCircle className="size-4 shrink-0 animate-spin text-muted-foreground" aria-hidden="true" />
            ) : (
              <Plus className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            )}
            <span className="min-w-0 truncate">
              Crea <span className="font-medium">«{nomeNuovo}»</span>
            </span>
          </div>
        ) : null}
        {filtrate.length === 0 && !puoCreare ? (
          <p className="px-2 py-3 text-sm text-muted-foreground">
            {elenco.length === 0 ? 'Nessuna etichetta: scrivi un nome per crearla.' : 'Nessuna etichetta con questo nome.'}
          </p>
        ) : null}
      </div>

      {errore ? (
        <p role="alert" className="flex items-start gap-2 border-t border-border px-3 py-2 text-sm text-status-critical">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {errore}
        </p>
      ) : null}
    </div>
  )
}

// ── the menu of one label: Rinomina, the ten colours, Elimina ───────────────

function MenuOpzione({
  opzione,
  onIndietro,
  onEliminata,
}: {
  opzione: Opzione
  onIndietro: () => void
  onEliminata: () => void
}) {
  const { conteggi, puoEliminare, sostituisci, togli } = useOpzioni()
  const opzioniToast = useOpzioniToast()
  const idCampo = useId()
  const input = useRef<HTMLInputElement>(null)
  const [nome, setNome] = useState(opzione.nome)
  const [vistoNome, setVistoNome] = useState(opzione.nome)
  const [inCorso, setInCorso] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)
  const [conferma, setConferma] = useState(false)

  // a name saved elsewhere (another person, the redraw) is the truth, unless the person is typing over it
  if (vistoNome !== opzione.nome) {
    setVistoNome(opzione.nome)
    if (nome === vistoNome) setNome(opzione.nome)
  }

  useEffect(() => {
    const t = window.setTimeout(() => {
      input.current?.focus()
      input.current?.select()
    }, 0)
    return () => window.clearTimeout(t)
  }, [])

  const usi = conteggi[opzione.campo][opzione.valore] ?? 0

  /** The field's blur and the back button both save: the second waits for the first. */
  const volo = useRef<Promise<boolean> | null>(null)
  function rinomina(): Promise<boolean> {
    if (volo.current) return volo.current
    const p = eseguiRinomina().finally(() => {
      volo.current = null
    })
    volo.current = p
    return p
  }

  async function eseguiRinomina(): Promise<boolean> {
    const nuovo = normalizzaNomeOpzione(nome)
    if (nuovo === opzione.nome) {
      setNome(opzione.nome)
      setErrore(null)
      return true
    }
    setInCorso(true)
    setErrore(null)
    try {
      const esito = await modificaOpzione({ id: opzione.id, nome: nuovo })
      if (!esito.ok) {
        setErrore(esito.errore)
        return false
      }
      sostituisci(esito.opzione)
      setNome(esito.opzione.nome)
      toast.success(`Etichetta rinominata in «${esito.opzione.nome}»`, opzioniToast)
      return true
    } catch {
      setErrore('Connessione assente. Riprova.')
      return false
    } finally {
      setInCorso(false)
    }
  }

  async function coloraIn(colore: ColoreEtichetta) {
    if (colore === opzione.colore || inCorso) return
    setInCorso(true)
    setErrore(null)
    const prima = opzione
    sostituisci({ ...opzione, colore })
    try {
      const esito = await modificaOpzione({ id: opzione.id, colore })
      if (!esito.ok) {
        sostituisci(prima)
        setErrore(esito.errore)
        return
      }
      sostituisci(esito.opzione)
      toast.success(`Colore: ${NOME_COLORE[colore]}`, opzioniToast)
    } catch {
      sostituisci(prima)
      setErrore('Connessione assente. Riprova.')
    } finally {
      setInCorso(false)
    }
  }

  async function elimina() {
    setInCorso(true)
    setErrore(null)
    try {
      const esito = await eliminaOpzione({ id: opzione.id })
      if (!esito.ok) {
        setErrore(esito.errore)
        return
      }
      togli(opzione)
      toast.success(`Etichetta «${opzione.nome}» eliminata`, opzioniToast)
      onEliminata()
    } catch {
      setErrore('Connessione assente. Riprova.')
    } finally {
      setInCorso(false)
    }
  }

  return (
    <div className="flex flex-col gap-2 p-2" data-menu-opzione={opzione.valore}>
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label="Torna all’elenco delle etichette"
          title="Indietro"
          onClick={async () => {
            if (await rinomina()) onIndietro()
          }}
          className={CLASSE_RIGA_ICONA}
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
        </button>
        <Pillola nome={nome.trim() === '' ? opzione.nome : normalizzaNomeOpzione(nome)} colore={opzione.colore} />
      </div>

      <div className="space-y-1">
        <label htmlFor={idCampo} className="block px-1 text-xs text-muted-foreground">
          Nome
        </label>
        <input
          ref={input}
          id={idCampo}
          value={nome}
          maxLength={NOME_OPZIONE_MAX + 20}
          autoComplete="off"
          aria-invalid={errore ? true : undefined}
          onChange={(e) => {
            setNome(e.currentTarget.value)
            setErrore(null)
          }}
          onBlur={() => {
            // leaving the field saves a valid, different name; the back button and Enter do too
            if (normalizzaNomeOpzione(nome) !== opzione.nome && normalizzaNomeOpzione(nome) !== '') void rinomina()
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void rinomina()
            }
          }}
          className="h-11 w-full rounded-lg border border-input bg-input/30 px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive md:text-sm"
        />
      </div>

      <div role="radiogroup" aria-label="Colore" className="space-y-0.5">
        <p className="px-1 text-xs text-muted-foreground">Colore</p>
        {COLORI_ETICHETTA.map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={opzione.colore === c}
            data-colore-opzione={c}
            disabled={inCorso}
            onClick={() => void coloraIn(c)}
            className="flex min-h-11 w-full items-center gap-2 rounded-lg px-2 text-left text-sm hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-60"
          >
            <CampioneColore colore={c} />
            <span>{NOME_COLORE[c]}</span>
            {opzione.colore === c ? <Check className="ml-auto size-4 text-muted-foreground" aria-hidden="true" /> : null}
          </button>
        ))}
      </div>

      {errore ? (
        <p role="alert" className="flex items-start gap-2 px-1 text-sm text-status-critical">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {errore}
        </p>
      ) : null}

      {puoEliminare ? (
        conferma ? (
          <div role="group" aria-label="Conferma l’eliminazione" className="space-y-2 rounded-lg border border-border p-2">
            <p className="text-sm">
              {usi === 0
                ? `Nessun contenuto usa «${opzione.nome}»: si elimina l’etichetta.`
                : usi === 1
                  ? `1 contenuto usa «${opzione.nome}»: perde questa proprietà, il resto resta.`
                  : `${usi} contenuti usano «${opzione.nome}»: perdono questa proprietà, il resto resta.`}
            </p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="h-11 flex-1" disabled={inCorso} onClick={() => setConferma(false)}>
                Annulla
              </Button>
              <Button type="button" variant="destructive" className="h-11 flex-1" disabled={inCorso} onClick={() => void elimina()}>
                {inCorso ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
                Elimina
              </Button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            data-elimina-opzione=""
            onClick={() => setConferma(true)}
            className="flex min-h-11 w-full items-center gap-2 rounded-lg px-2 text-left text-sm text-status-critical hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <Trash2 className="size-4" aria-hidden="true" />
            Elimina l’etichetta
          </button>
        )
      ) : null}
    </div>
  )
}
