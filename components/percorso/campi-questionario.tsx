'use client'

import { Check, TriangleAlert } from 'lucide-react'
import { useState, type ReactNode } from 'react'

import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import type { Domanda } from '@/lib/percorso/questionario'
import { ETICHETTE_ESERCIZI } from '@/lib/percorso/questionario'
import { TESTI_QUESTIONARIO as T } from '@/lib/percorso/testi'
import {
  ALTEZZA,
  CATTIVE_ABITUDINI,
  ESERCIZI_MASSIMALI,
  NON_LO_SO,
  PESO,
  RIPETIZIONI,
  TESTO_MAX,
  dataValida,
  type Risposte,
} from '@/lib/validation/questionario'
import { cn } from '@/lib/utils'

/*
 * The fields of the questionnaire (release B1b), one per kind of question of Dany's form:
 * big targets (44 px at least, 48 for the inputs), the error under the field with an icon
 * and words, aria-invalid and aria-describedby. A field writes into the answers only a valid
 * value (or null): what is still being typed and does not hold stays in the field, with its
 * error on leaving it, so a save is never refused for it.
 */

export const idCampo = (chiave: string) => `campo-${chiave}`
export const idErrore = (chiave: string) => `errore-${chiave}`
const idAiuto = (chiave: string) => `aiuto-${chiave}`

/** The line under a field: the icon and the words, never the colour alone. */
export function ErroreCampo({ id, testo }: { id: string; testo: string | null }) {
  if (!testo) return null
  return (
    <p id={id} className="flex items-start gap-1.5 text-sm font-medium text-status-critical" data-errore>
      <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      {testo}
    </p>
  )
}

function descritto(chiave: string, aiuto: boolean, errore: boolean): string | undefined {
  const id = [aiuto ? idAiuto(chiave) : null, errore ? idErrore(chiave) : null].filter(Boolean).join(' ')
  return id || undefined
}

const CLASSE_INPUT = 'h-12 rounded-xl bg-background/60 px-3.5 text-base md:text-base'

/** «170» → 170; «61,5» → 61.5; null when it is not a number. */
function numeroDa(testo: string): number | null {
  const t = testo.trim().replace(',', '.')
  if (!/^\d+(\.\d+)?$/.test(t)) return null
  return Number(t)
}

function testoDa(n: number | null | undefined): string {
  return typeof n === 'number' ? String(n).replace('.', ',') : ''
}

type PropsCampo = {
  domanda: Domanda
  valore: unknown
  onCambia: (valore: unknown) => void
  /** The error the page set (a missing answer at the sending). */
  errore: string | null
  /** An error of the format the field found by itself (an email that does not hold, a height out of range). */
  onErroreFormato: (errore: string | null) => void
}

/** A whole question: the text, the line of help, the field, the error, and what goes with it. */
export function BloccoDomanda({
  domanda: d,
  numero,
  children,
  errore,
  extra,
}: {
  domanda: Domanda
  numero: number
  children: ReactNode
  errore: string | null
  extra?: ReactNode
}) {
  const gruppo = d.tipo === 'scelta' || d.tipo === 'massimali' || d.tipo === 'abitudini' || d.tipo === 'altezza_peso'
  const intestazione = (
    <>
      <span className="num mr-1.5 text-muted-foreground" aria-hidden="true">
        {numero}.
      </span>
      {d.testo}
      {d.facoltativa ? <span className="ml-1.5 text-sm font-normal text-muted-foreground">{T.facoltativa}</span> : null}
    </>
  )
  const testoAiuto = d.aiuto ? (
    <p id={idAiuto(d.chiave)} className="text-sm leading-relaxed text-muted-foreground">
      {d.aiuto}
    </p>
  ) : null

  return (
    <div className="space-y-3 scroll-mt-24" data-domanda={d.chiave} data-errore-domanda={errore ? true : undefined}>
      {gruppo ? (
        <fieldset
          className="space-y-3"
          aria-describedby={descritto(d.chiave, Boolean(d.aiuto), Boolean(errore))}
        >
          <legend className="mb-1 text-[1.05rem] leading-snug font-semibold">{intestazione}</legend>
          {testoAiuto}
          {children}
          <ErroreCampo id={idErrore(d.chiave)} testo={errore} />
        </fieldset>
      ) : (
        <>
          <label htmlFor={idCampo(d.chiave)} className="block text-[1.05rem] leading-snug font-semibold">
            {intestazione}
          </label>
          {testoAiuto}
          {children}
          <ErroreCampo id={idErrore(d.chiave)} testo={errore} />
        </>
      )}
      {extra}
    </div>
  )
}

export function CampoTesto({ domanda: d, valore, onCambia, errore }: PropsCampo) {
  if (d.tipo !== 'testo') return null
  const testo = typeof valore === 'string' ? valore : ''
  const comune = {
    id: idCampo(d.chiave),
    value: testo,
    maxLength: TESTO_MAX,
    'aria-invalid': errore ? true : undefined,
    'aria-describedby': descritto(d.chiave, Boolean(d.aiuto), Boolean(errore)),
  }
  const vicinoAlLimite = testo.length > TESTO_MAX - 200
  return (
    <div className="space-y-1">
      {d.lungo ? (
        <Textarea
          {...comune}
          rows={3}
          className="min-h-28 rounded-xl bg-background/60 px-3.5 py-3 text-base leading-relaxed md:text-base"
          onChange={(e) => onCambia(e.target.value === '' ? null : e.target.value)}
        />
      ) : (
        <Input
          {...comune}
          type={d.inputMode === 'tel' ? 'tel' : 'text'}
          inputMode={d.inputMode}
          autoComplete={d.autocomplete ?? 'off'}
          className={CLASSE_INPUT}
          onChange={(e) => onCambia(e.target.value === '' ? null : e.target.value)}
        />
      )}
      {vicinoAlLimite ? (
        <p className="num text-right text-xs text-muted-foreground">
          {testo.length}/{TESTO_MAX}
        </p>
      ) : null}
    </div>
  )
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export function CampoEmail({ domanda: d, valore, onCambia, errore, onErroreFormato }: PropsCampo) {
  const [testo, setTesto] = useState(typeof valore === 'string' ? valore : '')
  return (
    <Input
      id={idCampo(d.chiave)}
      type="email"
      inputMode="email"
      autoComplete="email"
      value={testo}
      maxLength={320}
      className={CLASSE_INPUT}
      aria-invalid={errore ? true : undefined}
      aria-describedby={descritto(d.chiave, Boolean(d.aiuto), Boolean(errore))}
      onChange={(e) => {
        const t = e.target.value
        setTesto(t)
        const pulito = t.trim()
        // a value still being typed never replaces the last valid one: leaving the page halfway
        // through a correction keeps the email the questionnaire had (the error says it on leaving)
        if (pulito === '') onCambia(null)
        else if (EMAIL.test(pulito)) {
          onCambia(pulito)
          onErroreFormato(null)
        }
      }}
      onBlur={() => {
        const pulito = testo.trim()
        onErroreFormato(pulito !== '' && !EMAIL.test(pulito) ? T.errori.emailNonValida : null)
      }}
    />
  )
}

export function CampoData({ domanda: d, valore, onCambia, errore, onErroreFormato }: PropsCampo) {
  return (
    <Input
      id={idCampo(d.chiave)}
      type="date"
      autoComplete="bday"
      value={typeof valore === 'string' ? valore : ''}
      min="1900-01-01"
      className={cn(CLASSE_INPUT, 'w-full max-w-64')}
      aria-invalid={errore ? true : undefined}
      aria-describedby={descritto(d.chiave, Boolean(d.aiuto), Boolean(errore))}
      onChange={(e) => {
        const v = e.target.value
        if (v === '') {
          onCambia(null)
          onErroreFormato(null)
        } else if (dataValida(v)) {
          onCambia(v)
          onErroreFormato(null)
        } else onErroreFormato(T.errori.dataNonValida)
      }}
    />
  )
}

/** A number with its unit at the end, inside the field. */
function NumeroConUnita({
  id,
  etichetta,
  unita,
  testo,
  onTesto,
  onBlur,
  invalido,
  decimale,
  descrizione,
  disabilitato,
}: {
  id: string
  etichetta: string
  unita: string
  testo: string
  onTesto: (t: string) => void
  onBlur?: () => void
  invalido: boolean
  decimale?: boolean
  descrizione?: string
  disabilitato?: boolean
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-muted-foreground">
        {etichetta}
      </label>
      <div className="relative">
        <Input
          id={id}
          type="text"
          inputMode={decimale ? 'decimal' : 'numeric'}
          autoComplete="off"
          value={testo}
          disabled={disabilitato}
          maxLength={6}
          className={cn(CLASSE_INPUT, 'num pr-12')}
          aria-invalid={invalido ? true : undefined}
          aria-describedby={descrizione}
          placeholder={disabilitato ? '–' : undefined}
          onChange={(e) => onTesto(e.target.value)}
          onBlur={onBlur}
        />
        {disabilitato ? null : (
          <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-sm text-muted-foreground" aria-hidden="true">
            {unita}
          </span>
        )}
      </div>
    </div>
  )
}

export function CampoAltezzaPeso({ domanda: d, valore, onCambia, errore, onErroreFormato }: PropsCampo) {
  const o = (valore ?? {}) as { altezza?: number | null; peso?: number | null }
  const [altezza, setAltezza] = useState(testoDa(o.altezza))
  const [peso, setPeso] = useState(testoDa(o.peso))

  const altezzaValida = (t: string) => {
    const n = numeroDa(t)
    return n !== null && Number.isInteger(n) && n >= ALTEZZA.min && n <= ALTEZZA.max ? n : null
  }
  const pesoValido = (t: string) => {
    const n = numeroDa(t)
    return n !== null && Math.abs(Math.round(n * 10) - n * 10) < 1e-9 && n >= PESO.min && n <= PESO.max ? n : null
  }

  function scrivi(a: string, p: string) {
    const va = altezzaValida(a)
    const vp = pesoValido(p)
    onCambia(va === null && vp === null ? null : { altezza: va, peso: vp })
  }

  function controlla(a: string, p: string) {
    if (a.trim() !== '' && altezzaValida(a) === null) onErroreFormato(T.errori.altezza)
    else if (p.trim() !== '' && pesoValido(p) === null) onErroreFormato(T.errori.peso)
    else onErroreFormato(null)
  }

  const descrizione = errore ? idErrore(d.chiave) : undefined
  return (
    <div className="grid max-w-md grid-cols-2 gap-3">
      <NumeroConUnita
        id={idCampo(d.chiave)}
        etichetta={T.altezza}
        unita={T.cm}
        testo={altezza}
        invalido={Boolean(errore) && altezzaValida(altezza) === null}
        descrizione={descrizione}
        onTesto={(t) => {
          setAltezza(t)
          scrivi(t, peso)
          if (altezzaValida(t) !== null) controlla(t, peso)
        }}
        onBlur={() => controlla(altezza, peso)}
      />
      <NumeroConUnita
        id={`${idCampo(d.chiave)}-peso`}
        etichetta={T.peso}
        unita={T.kg}
        decimale
        testo={peso}
        invalido={Boolean(errore) && pesoValido(peso) === null}
        descrizione={descrizione}
        onTesto={(t) => {
          setPeso(t)
          scrivi(altezza, t)
          if (pesoValido(t) !== null) controlla(altezza, t)
        }}
        onBlur={() => controlla(altezza, peso)}
      />
    </div>
  )
}

/** One choice of a list, as a big card: a native radio or checkbox inside, so the keyboard and the readers know it. */
function Scelta({
  tipo,
  nome,
  valore,
  scelta,
  onScegli,
  etichetta,
  dettaglio,
  id,
  compatta,
}: {
  tipo: 'radio' | 'checkbox'
  nome: string
  valore: string
  scelta: boolean
  onScegli: (scelta: boolean) => void
  etichetta: string
  dettaglio?: string
  id?: string
  compatta?: boolean
}) {
  return (
    <label
      className={cn(
        'relative flex min-h-12 cursor-pointer gap-3 rounded-xl border px-4 py-3 transition-colors motion-reduce:transition-none',
        dettaglio ? 'items-start' : 'items-center',
        'has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50',
        scelta
          ? compatta
            ? 'border-primary bg-primary text-primary-foreground glow-primario'
            : 'border-primary bg-primary/12 glow-primario'
          : 'border-border bg-background/50 hover:bg-accent/60',
        compatta && 'min-w-11 justify-center px-0',
      )}
    >
      <input
        id={id}
        type={tipo}
        name={nome}
        value={valore}
        checked={scelta}
        onChange={(e) => onScegli(e.target.checked)}
        className="peer sr-only"
      />
      {!compatta ? (
        <span
          className={cn(
            'flex size-5 shrink-0 items-center justify-center border-2 transition-colors motion-reduce:transition-none',
            tipo === 'radio' ? 'rounded-full' : 'rounded-md',
            dettaglio && 'mt-0.5',
            scelta ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/60',
          )}
          aria-hidden="true"
        >
          {scelta ? <Check className="size-3.5" strokeWidth={3} /> : null}
        </span>
      ) : scelta ? (
        // the compact choice says it is the chosen one with a check too, never with the colour alone
        <Check className="absolute top-1 right-1 size-3" strokeWidth={3} aria-hidden="true" />
      ) : null}
      <span className={cn('min-w-0', compatta && 'num text-base font-semibold', compatta && scelta && 'font-bold')}>
        <span className={cn('block', !compatta && 'font-medium')}>{etichetta}</span>
        {dettaglio ? <span className="mt-0.5 block text-sm leading-snug text-muted-foreground">{dettaglio}</span> : null}
      </span>
    </label>
  )
}

export function CampoScelta({ domanda: d, valore, onCambia }: PropsCampo) {
  if (d.tipo !== 'scelta') return null
  const attuale = valore === null || valore === undefined ? null : String(valore)
  const compatta = d.numerica === true
  return (
    <div
      className={cn(
        compatta ? 'grid max-w-md grid-cols-4 gap-2 sm:grid-cols-7' : 'grid gap-2.5',
        !compatta && d.opzioni.length <= 2 && 'sm:grid-cols-2 sm:max-w-md',
      )}
    >
      {d.opzioni.map((o, i) => (
        <Scelta
          key={o.valore}
          id={i === 0 ? idCampo(d.chiave) : undefined}
          tipo="radio"
          nome={d.chiave}
          valore={o.valore}
          scelta={attuale === o.valore}
          compatta={compatta}
          etichetta={o.etichetta}
          dettaglio={o.dettaglio}
          onScegli={(s) => {
            if (s) onCambia(compatta ? Number(o.valore) : o.valore)
          }}
        />
      ))}
    </div>
  )
}

type Massimali = Partial<Record<(typeof ESERCIZI_MASSIMALI)[number], number | typeof NON_LO_SO | null>>

export function CampoMassimali({ domanda: d, valore, onCambia, errore, onErroreFormato }: PropsCampo) {
  const iniziale = (valore ?? {}) as Massimali
  const [testi, setTesti] = useState<Record<string, string>>(() =>
    Object.fromEntries(ESERCIZI_MASSIMALI.map((e) => [e, typeof iniziale[e] === 'number' ? String(iniziale[e]) : ''])),
  )
  const [nonLoSo, setNonLoSo] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(ESERCIZI_MASSIMALI.map((e) => [e, iniziale[e] === NON_LO_SO])),
  )

  const valido = (t: string) => {
    const n = numeroDa(t)
    return n !== null && Number.isInteger(n) && n >= RIPETIZIONI.min && n <= RIPETIZIONI.max ? n : null
  }

  function scrivi(t: Record<string, string>, nls: Record<string, boolean>) {
    const v: Massimali = {}
    let qualcosa = false
    for (const e of ESERCIZI_MASSIMALI) {
      const n = nls[e] ? NON_LO_SO : valido(t[e] ?? '')
      v[e] = n
      if (n !== null) qualcosa = true
    }
    onCambia(qualcosa ? v : null)
  }

  function controlla(t: Record<string, string>, nls: Record<string, boolean>) {
    const sbagliato = ESERCIZI_MASSIMALI.some((e) => !nls[e] && (t[e] ?? '').trim() !== '' && valido(t[e] ?? '') === null)
    onErroreFormato(sbagliato ? T.errori.ripetizioni : null)
  }

  return (
    <div className="space-y-2.5">
      {ESERCIZI_MASSIMALI.map((e, i) => {
        const id = i === 0 ? idCampo(d.chiave) : `${idCampo(d.chiave)}-${e}`
        const premuto = nonLoSo[e] === true
        return (
          <div key={e} className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2.5 sm:max-w-md">
            <NumeroConUnita
              id={id}
              etichetta={ETICHETTE_ESERCIZI[e]}
              unita={T.ripetizioni}
              testo={premuto ? '' : (testi[e] ?? '')}
              disabilitato={premuto}
              invalido={Boolean(errore) && !premuto && valido(testi[e] ?? '') === null}
              descrizione={errore ? idErrore(d.chiave) : undefined}
              onTesto={(t) => {
                const prossimi = { ...testi, [e]: t }
                setTesti(prossimi)
                scrivi(prossimi, nonLoSo)
                if (valido(t) !== null || t.trim() === '') controlla(prossimi, nonLoSo)
              }}
              onBlur={() => controlla(testi, nonLoSo)}
            />
            <button
              type="button"
              aria-pressed={premuto}
              aria-label={`${T.nonLoSo}: ${ETICHETTE_ESERCIZI[e]}`}
              onClick={() => {
                const prossimi = { ...nonLoSo, [e]: !premuto }
                setNonLoSo(prossimi)
                scrivi(testi, prossimi)
                controlla(testi, prossimi)
              }}
              className={cn(
                'flex h-12 w-34 items-center justify-center gap-1.5 rounded-xl border px-3 text-sm font-medium whitespace-nowrap transition-colors motion-reduce:transition-none',
                'focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
                premuto ? 'border-primary bg-primary/12 glow-primario' : 'border-border bg-background/50 hover:bg-accent/60',
              )}
            >
              <Check className={cn('size-4 shrink-0', !premuto && 'invisible')} aria-hidden="true" />
              {T.nonLoSo}
            </button>
          </div>
        )
      })}
    </div>
  )
}

export function CampoAbitudini({ domanda: d, valore, onCambia }: PropsCampo) {
  if (d.tipo !== 'abitudini') return null
  const o = (valore ?? {}) as NonNullable<Risposte['cattive_abitudini']>
  const scelte = new Set<string>(o.scelte ?? [])
  const altro = o.altro ?? ''

  function scrivi(nuove: Set<string>, testoAltro: string) {
    const ordinate = CATTIVE_ABITUDINI.filter((a) => nuove.has(a))
    onCambia(ordinate.length === 0 && testoAltro === '' ? null : { scelte: ordinate, altro: testoAltro })
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-2.5">
        {d.opzioni.map((op, i) => (
          <Scelta
            key={op.valore}
            id={i === 0 ? idCampo(d.chiave) : undefined}
            tipo="checkbox"
            nome={d.chiave}
            valore={op.valore}
            scelta={scelte.has(op.valore)}
            etichetta={op.etichetta}
            onScegli={(s) => {
              const nuove = new Set(scelte)
              if (s) nuove.add(op.valore)
              else nuove.delete(op.valore)
              scrivi(nuove, altro)
            }}
          />
        ))}
      </div>
      <div className="space-y-1.5">
        <label htmlFor={`${idCampo(d.chiave)}-altro`} className="block text-sm font-medium text-muted-foreground">
          {d.altro}
        </label>
        <Textarea
          id={`${idCampo(d.chiave)}-altro`}
          value={altro}
          maxLength={TESTO_MAX}
          rows={2}
          className="min-h-20 rounded-xl bg-background/60 px-3.5 py-3 text-base leading-relaxed md:text-base"
          onChange={(e) => scrivi(scelte, e.target.value)}
        />
      </div>
    </div>
  )
}

/** The field of a question, by its kind. */
export function CampoDomanda(props: PropsCampo) {
  switch (props.domanda.tipo) {
    case 'testo':
      return <CampoTesto {...props} />
    case 'email':
      return <CampoEmail {...props} />
    case 'data':
      return <CampoData {...props} />
    case 'altezza_peso':
      return <CampoAltezzaPeso {...props} />
    case 'scelta':
      return <CampoScelta {...props} />
    case 'massimali':
      return <CampoMassimali {...props} />
    case 'abitudini':
      return <CampoAbitudini {...props} />
  }
}
