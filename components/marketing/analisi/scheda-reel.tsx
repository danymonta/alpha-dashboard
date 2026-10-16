'use client'

import { CalendarPlus, CircleCheck, Link2, LoaderCircle, RotateCw, TriangleAlert } from 'lucide-react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useRef, useState, type ReactNode, type Ref } from 'react'
import { toast } from 'sonner'

import { aggiungiIdeaAlCalendario, creaContenutoDaAnalisi } from '@/app/(app)/marketing/analisi/actions'
import { collegaPost, creaContenutoDaPost } from '@/app/(app)/marketing/instagram/actions'
import { AnalizzaReel } from '@/components/marketing/analisi/analizza-reel'
import { COLORE_FASCIA, ICONA_FASCIA } from '@/components/marketing/analisi/badge-punteggio'
import { BadgeVerdetto } from '@/components/marketing/analisi/badge-verdetto'
import { ChiudiPannello } from '@/components/marketing/analisi/chiudi-pannello'
import {
  AggiungiRifacimento,
  ComeRifarlo,
  CriteriDelPunteggio,
  numero,
  PenalitaDelPunteggio,
  ProblemiDaSistemare,
} from '@/components/marketing/analisi/sezione-punteggio'
import { useOpzioniToast } from '@/components/marketing/contesto-pannello'
import { ApriSuInstagram, CopertinaPost } from '@/components/marketing/instagram/copertina-post'
import { Button } from '@/components/ui/button'
import { SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatNumero } from '@/lib/format'
import { tipoDelPost } from '@/lib/marketing/abbinamento'
import { COSTO_STIMATO_PER_REEL_USD } from '@/lib/marketing/analisi/costi'
import { cosaFare, type StatoAnalisiCosaFare } from '@/lib/marketing/analisi/cosa-fare'
import type { AnalisiLetta, DettaglioReel, LetturaLetta } from '@/lib/marketing/analisi/dettaglio'
import type { RigaReel } from '@/lib/marketing/analisi/elenco'
import { fraseFonti } from '@/lib/marketing/analisi/frasi'
import {
  fraseStatoPost,
  formatDurata,
  formatQuota,
  formatRapporto,
  formatTasso,
  formatVisione,
  parolaLead,
  SENZA_STATISTICHE,
  viewsConConfronto,
} from '@/lib/marketing/analisi/parole'
import { eSchedaReel, PARAMETRO_SCHEDA, urlConScheda, type SchedaReel as NomeScheda } from '@/lib/marketing/analisi/pannello'
import type { AnalisiContenuto, SchedaVisiva } from '@/lib/marketing/analisi/tipi'
import { nomeDaDidascalia } from '@/lib/marketing/da-post'
import { ETICHETTA_FORMAT, ETICHETTA_REEL_TYPE, type FormatContenuto, type ReelType } from '@/lib/marketing/etichette'
import { etichettaCollega, motiviInParole, quandoPubblicato } from '@/lib/marketing/parole-post'
import { fasciaDaCodice, ETICHETTA_TIPO, intervalloFascia } from '@/lib/marketing/punteggio/tabelle'
import { cn } from '@/lib/utils'

const CONNESSIONE = 'Connessione assente. Riprova.'
const usd = (n: number) => `${n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`

export function titoloReel(r: Pick<RigaReel, 'nome' | 'didascalia_inizio' | 'giorno'>): string {
  return r.nome || nomeDaDidascalia(r.didascalia_inizio) || (r.giorno ? `Reel del ${r.giorno.slice(8, 10)}/${r.giorno.slice(5, 7)}/${r.giorno.slice(0, 4)}` : 'Reel')
}

/** A titled part of a tab. The tab says the big thing; the title says what this part is. */
function Sezione({ id, titolo, children, nota }: { id: string; titolo: string; children: ReactNode; nota?: ReactNode }) {
  return (
    <section aria-labelledby={id} className="space-y-2" data-testid={`reel-${id}`}>
      <h4 id={id} className="text-sm font-medium">
        {titolo}
      </h4>
      {nota ? <p className="text-sm text-muted-foreground">{nota}</p> : null}
      {children}
    </section>
  )
}

function Elenco({ voci }: { voci: readonly string[] }) {
  if (voci.length === 0) return null
  return (
    <ul className="list-disc space-y-1 pl-5 text-sm">
      {voci.map((v, i) => (
        <li key={i} className="break-words">
          {v}
        </li>
      ))}
    </ul>
  )
}

function Numero({ etichetta, valore, nota }: { etichetta: string; valore: string; nota?: string | null }) {
  return (
    <div className="min-w-0 rounded-lg bg-muted/40 p-3">
      <dt className="text-sm text-muted-foreground">{etichetta}</dt>
      <dd className="num text-base font-medium">{valore}</dd>
      {nota ? <dd className="text-sm text-muted-foreground">{nota}</dd> : null}
    </div>
  )
}

/** The numbers of the reel as the view gives them: the ratios and the verdict are SQL's, only said here. */
function NumeriReel({ r }: { r: RigaReel }) {
  const stato = fraseStatoPost(r.metriche_stato, r.metriche_il, r.numeri_parziali)
  if (r.metriche_stato !== 'lette') {
    return (
      <div className="space-y-1" data-testid="reel-senza-statistiche">
        <p className="text-sm font-medium">{SENZA_STATISTICHE}</p>
        {stato ? <p className="text-sm text-muted-foreground">{stato}</p> : null}
        {r.like_count !== null || r.comments_count !== null ? (
          <p className="num text-sm text-muted-foreground">
            {formatNumero(r.like_count ?? 0)} mi piace · {formatNumero(r.comments_count ?? 0)} commenti
          </p>
        ) : null}
      </div>
    )
  }
  const v = viewsConConfronto(r.views, r.views_rapporto, r.confronto, r.eta_confronto)
  const salvataggi = formatRapporto(r.salvataggi_rapporto)
  return (
    <div className="space-y-2">
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Numero etichetta="Views" valore={v.numero ?? 'n/d'} nota={v.confronto} />
        <Numero etichetta="Copertura" valore={r.reach === null ? 'n/d' : formatNumero(r.reach)} />
        <Numero
          etichetta="Salvataggi"
          valore={r.saved === null ? 'n/d' : formatNumero(r.saved)}
          nota={[formatTasso(r.tasso_salvataggi), salvataggi ? `${salvataggi} della mediana` : null].filter(Boolean).join(' · ') || null}
        />
        <Numero
          etichetta="Condivisioni"
          valore={r.shares === null ? 'n/d' : formatNumero(r.shares)}
          nota={formatTasso(r.tasso_condivisioni)}
        />
        <Numero etichetta="Visione media" valore={formatVisione(r.avg_watch_ms, r.quota_vista)} nota={r.skip_rate !== null ? `${formatQuota(r.skip_rate)} lo salta` : null} />
        <Numero etichetta="Mi piace · commenti" valore={`${formatNumero(r.likes ?? r.like_count ?? 0)} · ${formatNumero(r.comments ?? r.comments_count ?? 0)}`} />
      </dl>
      {stato ? <p className="text-sm text-muted-foreground">{stato}</p> : null}
    </div>
  )
}

const PAROLE_FASCIA: Record<string, string> = { sopra: 'sopra la mediana', nella_media: 'nella media', sotto: 'sotto la mediana' }

function Verdetto({ r }: { r: RigaReel }) {
  if (!r.verdetto_oggi) {
    return (
      <p className="text-sm text-muted-foreground">
        {r.eta_ore !== null && r.eta_ore < 72
          ? 'Il verdetto arriva dopo 3 giorni dalla pubblicazione: prima i numeri sono troppo pochi.'
          : 'Senza numeri o senza reel di confronto abbastanza (ne servono 8 dei 90 giorni prima) Claude non dà un verdetto.'}
      </p>
    )
  }
  return (
    <div className="space-y-1.5">
      <BadgeVerdetto verdetto={r.verdetto_oggi} />
      <p className="text-sm text-muted-foreground">
        Pubblico: {r.fascia_pubblico ? (PAROLE_FASCIA[r.fascia_pubblico] ?? r.fascia_pubblico) : 'n/d'}. Lead dai DM:{' '}
        {r.fascia_lead ? (PAROLE_FASCIA[r.fascia_lead] ?? r.fascia_lead) : 'non ancora contati'}. Il verdetto lo decide il
        gestionale dai numeri; Claude dice perché.
      </p>
    </div>
  )
}

function SchedaVisivaVista({ s }: { s: SchedaVisiva }) {
  return (
    <div className="space-y-3 text-sm">
      <p className="break-words">{s.sintesi_visiva}</p>
      <div>
        <p className="font-medium">Gancio: {s.gancio.livello}</p>
        <p className="break-words text-muted-foreground">
          {s.gancio.cosa_si_vede}
          {s.gancio.parole ? ` «${s.gancio.parole}»` : ''}
          {s.gancio.testo_a_schermo ? ` Testo: ${s.gancio.testo_a_schermo}.` : ''} {s.gancio.perche}
        </p>
        <p className="break-words">Alternativa: {s.gancio.alternativa}</p>
      </div>
      {s.sequenza.length > 0 ? (
        <div>
          <p className="font-medium">Sequenza</p>
          <ol className="space-y-1">
            {s.sequenza.map((t, i) => (
              <li key={i} className="break-words">
                <span className="num text-muted-foreground">
                  {formatDurata(t.da)}–{formatDurata(t.a)}
                </span>{' '}
                {t.cosa_si_vede}
                {t.testo_a_schermo ? ` («${t.testo_a_schermo}»)` : ''}
              </li>
            ))}
          </ol>
        </div>
      ) : null}
      <p className="break-words">
        <span className="font-medium">Ritmo:</span> {s.ritmo.livello}. {s.ritmo.osservazione}
        {s.ritmo.calo ? ` Cala${s.ritmo.calo.secondo !== null ? ` a ${formatDurata(s.ritmo.calo.secondo)}` : ''}: ${s.ritmo.calo.cosa}` : ''}
      </p>
      <p className="break-words">
        <span className="font-medium">Testo a schermo:</span> {s.testo_a_schermo.osservazione}
      </p>
      <p className="break-words">
        <span className="font-medium">CTA:</span> {s.cta.presente ? `${s.cta.testo ?? 'presente'}. ` : 'assente. '}
        {s.cta.osservazione} Proposta: {s.cta.proposta}
      </p>
      <p className="break-words">
        <span className="font-medium">Produzione:</span> luce {s.produzione.luce}, audio {s.produzione.audio}.{' '}
        {s.produzione.inquadratura} {s.produzione.osservazione}
      </p>
      <p className="break-words">
        <span className="font-medium">Per il cliente ideale:</span> aderenza {s.icp.aderenza}.
        {s.icp.leve_usate.length ? ` Usa: ${s.icp.leve_usate.join(', ')}.` : ''}
        {s.icp.leve_mancanti.length ? ` Manca: ${s.icp.leve_mancanti.join(', ')}.` : ''}
        {s.icp.frase_del_cliente ? ` Frase da usare: «${s.icp.frase_del_cliente}».` : ''}
        {s.icp.rischio ? ` Attenzione: ${s.icp.rischio}` : ''}
      </p>
      {s.script ? (
        <p className="break-words">
          <span className="font-medium">Lo script del calendario:</span> {s.script.segue === 'si' ? 'seguito' : s.script.segue === 'no' ? 'non seguito' : 'seguito in parte'}. {s.script.differenze}
        </p>
      ) : null}
    </div>
  )
}

function ParlatoVisto({ l }: { l: LetturaLetta | null }) {
  const esito = l?.trascrizione_esito ?? null
  if (esito === 'pronta' && (l?.segmenti?.length || l?.trascrizione)) {
    return l.segmenti?.length ? (
      <ol className="space-y-1.5 text-sm" data-testid="reel-parlato">
        {l.segmenti.map((s, i) => (
          <li key={i} className="flex gap-2">
            <span className="num w-10 shrink-0 text-muted-foreground">{formatDurata(s.da)}</span>
            <span className="min-w-0 break-words">{s.testo}</span>
          </li>
        ))}
      </ol>
    ) : (
      <p className="text-sm break-words whitespace-pre-line" data-testid="reel-parlato">
        {l.trascrizione}
      </p>
    )
  }
  const frase =
    esito === 'senza_parlato' || esito === 'senza_audio'
      ? 'Nessun parlato: solo musica, rumore o silenzio.'
      : esito === 'senza_video'
        ? 'Instagram non dà il video di questo reel (di solito per la musica protetta): niente parlato.'
        : esito === 'spenta'
          ? 'La trascrizione è spenta: manca la chiave su Vercel.'
          : esito === 'fallita'
            ? 'La trascrizione non è riuscita.'
            : 'Non ancora letto: parte con «Analizza».'
  return (
    <p className="text-sm text-muted-foreground" data-testid="reel-parlato-vuoto">
      {frase}
    </p>
  )
}

function Calendario({
  d,
  puoScrivere,
  onFatto,
}: {
  d: DettaglioReel
  puoScrivere: boolean
  onFatto: () => void
}) {
  const opzioniToast = useOpzioniToast()
  const r = d.reel
  const [inVolo, setInVolo] = useState<string | null>(null)

  async function esegui(chiave: string, fai: () => Promise<{ ok: true } | { ok: false; errore: string }>, ok: string) {
    if (inVolo) return
    setInVolo(chiave)
    try {
      const esito = await fai()
      if (!esito.ok) toast.error(esito.errore, opzioniToast)
      else {
        toast.success(ok, opzioniToast)
        onFatto()
      }
    } catch {
      toast.error(CONNESSIONE, opzioniToast)
    } finally {
      setInVolo(null)
    }
  }

  if (d.contenuto) {
    return (
      <p className="text-sm break-words" data-testid="reel-calendario">
        Collegato a{' '}
        <Link href={`/marketing/contenuti/${d.contenuto.id}`} className="underline underline-offset-4">
          {d.contenuto.nome}
        </Link>
        {d.contenuto.reel_type ? ` · ${ETICHETTA_REEL_TYPE[d.contenuto.reel_type as ReelType]}` : ''}
        {d.contenuto.formato ? ` · ${ETICHETTA_FORMAT[d.contenuto.formato as FormatContenuto]}` : ''}
      </p>
    )
  }
  if (r.eliminato) return <p className="text-sm text-muted-foreground">Non più su Instagram: nessun collegamento da fare.</p>
  if (r.stato_collegamento === 'escluso') {
    return (
      <p className="text-sm text-muted-foreground">
        Fuori dal calendario. Lo rimetti da{' '}
        <Link href="/marketing/instagram" className="underline underline-offset-4">
          Post di Instagram
        </Link>
        .
      </p>
    )
  }
  const shortcode = r.shortcode
  if (!shortcode) return null
  const proposte = [
    ...(d.propostaClaude
      ? [
          {
            contenuto_id: d.propostaClaude.contenuto.id,
            nome: d.propostaClaude.contenuto.nome,
            stato: d.propostaClaude.contenuto.stato,
            perche: `Claude pensa che sia questo (sicurezza ${d.propostaClaude.sicurezza}): ${d.propostaClaude.perche}`,
          },
        ]
      : []),
    ...d.proposte
      .filter((p) => p.contenuto_id !== d.propostaClaude?.contenuto.id)
      .map((p) => ({ contenuto_id: p.contenuto_id, nome: p.nome, stato: undefined as string | undefined, perche: motiviInParole(p.motivi, 'e') })),
  ]
  return (
    <div className="space-y-2" data-testid="reel-calendario">
      <p className="text-sm text-muted-foreground">Questo reel non è ancora collegato a un contenuto del calendario.</p>
      {proposte.length > 0 ? (
        <ul className="space-y-2">
          {proposte.map((p) => (
            <li key={p.contenuto_id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/40 p-3 text-sm">
              <span className="min-w-0 flex-1 break-words">
                <span className="font-medium">{p.nome}</span>
                {p.perche ? <span className="block text-muted-foreground">{p.perche}</span> : null}
              </span>
              {puoScrivere ? (
                <Button
                  type="button"
                  variant="outline"
                  className="h-11"
                  focusableWhenDisabled
                  disabled={inVolo !== null}
                  aria-busy={inVolo === `c-${p.contenuto_id}`}
                  onClick={() =>
                    void esegui(`c-${p.contenuto_id}`, () => collegaPost({ shortcode, contenuto_id: p.contenuto_id }), `Collegato a «${p.nome}».`)
                  }
                >
                  <Link2 className="size-4" aria-hidden="true" />
                  {etichettaCollega(p.stato)}
                  <span className="sr-only">: {p.nome}</span>
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {puoScrivere ? (
        <Button
          type="button"
          variant="outline"
          className="h-11"
          focusableWhenDisabled
          disabled={inVolo !== null}
          aria-busy={inVolo === 'crea'}
          onClick={() =>
            void esegui(
              'crea',
              () => (d.analisi ? creaContenutoDaAnalisi({ analisi_id: d.analisi.id }) : creaContenutoDaPost({ shortcode })),
              'Contenuto creato dal reel.',
            )
          }
        >
          <CalendarPlus className="size-4" aria-hidden="true" />
          Crea il contenuto
        </Button>
      ) : null}
    </div>
  )
}

const ETICHETTA_PRIORITA = { alta: 'Alta', media: 'Media', bassa: 'Bassa' } as const

/**
 * The ideas of Claude's analysis (a new reel on the same subject, with its script), each with «Aggiungi al calendario».
 * With a score, the rewrite of THIS reel is in «Come rifarlo» above them: the title says these are others.
 */
function IdeeDellAnalisi({
  idAnalisi,
  idee,
  fatte,
  conRifacimento,
  puoScrivere,
  onFatto,
}: {
  idAnalisi: string
  idee: AnalisiContenuto['idee']
  fatte: DettaglioReel['idee']
  conRifacimento: boolean
  puoScrivere: boolean
  onFatto: () => void
}) {
  const opzioniToast = useOpzioniToast()
  const [inVolo, setInVolo] = useState<number | null>(null)
  const [aggiunte, setAggiunte] = useState<Record<number, { id: string; nome: string }>>({})

  async function aggiungi(indice: number) {
    if (inVolo !== null) return
    setInVolo(indice)
    try {
      const esito = await aggiungiIdeaAlCalendario({ analisi_id: idAnalisi, indice })
      if (!esito.ok) {
        toast.error(esito.errore, opzioniToast)
        return
      }
      setAggiunte((prima) => ({ ...prima, [indice]: { id: esito.id, nome: esito.nome } }))
      toast.success(`«${esito.nome}» è nel calendario, da girare.`, opzioniToast)
      onFatto()
    } catch {
      toast.error(CONNESSIONE, opzioniToast)
    } finally {
      setInVolo(null)
    }
  }

  if (idee.length === 0) return null
  return (
    <section className="space-y-2" aria-labelledby="idee-titolo" data-testid="reel-idee">
      <h4 id="idee-titolo" className="text-sm font-medium">
        {conRifacimento ? 'Altre idee dallo stesso tema' : 'Idee per il calendario'}
      </h4>
      <p className="text-sm text-muted-foreground">
        {conRifacimento
          ? 'Reel nuovi che Claude propone sullo stesso tema: non sono il rifacimento di questo reel.'
          : 'Reel nuovi che Claude propone a partire da questo.'}
      </p>
      <ul className="space-y-3">
        {idee.map((idea, i) => {
          const fatta = aggiunte[i] ?? fatte.find((x) => x.indice === i)
          const faId = fatta ? ('contenuto_id' in fatta ? fatta.contenuto_id : fatta.id) : null
          return (
            <li key={i} className="space-y-1.5 rounded-lg bg-muted/40 p-3 text-sm" data-testid="reel-idea">
              <p className="font-medium break-words">{idea.name}</p>
              <p className="text-muted-foreground">
                {ETICHETTA_REEL_TYPE[idea.reel_type] ?? idea.reel_type}
                {idea.format ? ` · ${ETICHETTA_FORMAT[idea.format] ?? idea.format}` : ''}
              </p>
              <p className="break-words">
                <span className="font-medium">Gancio:</span> {idea.gancio}
              </p>
              <p className="break-words">{idea.messaggio}</p>
              <p className="break-words text-muted-foreground">
                Hook: {idea.script.hook} {idea.script.righe.length ? `· ${idea.script.righe.join(' · ')}` : ''} · CTA: {idea.script.cta}
              </p>
              <p className="break-words text-muted-foreground">Perché: {idea.perche}</p>
              {faId ? (
                <Link href={`/marketing/contenuti/${faId}`} className="inline-flex min-h-11 items-center gap-1.5 text-sm underline underline-offset-4">
                  <CircleCheck className="size-4 text-status-ok" aria-hidden="true" />
                  Già nel calendario
                </Link>
              ) : puoScrivere ? (
                <Button
                  type="button"
                  variant="outline"
                  className="h-11"
                  focusableWhenDisabled
                  disabled={inVolo !== null}
                  aria-busy={inVolo === i}
                  onClick={() => void aggiungi(i)}
                  data-testid="aggiungi-idea"
                >
                  {inVolo === i ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <CalendarPlus className="size-4" aria-hidden="true" />}
                  Aggiungi al calendario
                  <span className="sr-only">: {idea.name}</span>
                </Button>
              ) : null}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** «Perché»: the reasons, in the order they are read: Claude's summary, what worked, what to improve, the penalties, the criteria. */
function Perche({ d }: { d: DettaglioReel }) {
  const analisi = d.analisi
  const c = analisi?.contenuto ?? null
  const p = d.punteggio?.punteggio ?? null
  const forza = [...new Set([...(p?.punti_di_forza ?? []), ...(c?.cosa_ha_funzionato ?? [])])]
  const fascia = p ? fasciaDaCodice(p.fascia) : null
  const intervallo = fascia ? intervalloFascia(fascia.codice) : null
  return (
    <div className="space-y-5" data-testid="reel-perche">
      {c ? (
        <div className="space-y-2" data-testid="reel-analisi-pronta">
          <p className="num text-sm text-muted-foreground">
            {analisi?.finita_il ? `Analisi del ${new Date(analisi.finita_il).toLocaleDateString('it-IT')}` : 'Analisi'}
            {analisi?.eta_ore !== null && analisi?.eta_ore !== undefined ? `, a ${Math.round(analisi.eta_ore / 24)} giorni dalla pubblicazione` : ''}
            {analisi?.verdetto ? ` · verdetto di allora: ${analisi.verdetto}` : ''}
          </p>
          <p className="text-sm break-words">{c.sintesi}</p>
          <p className="text-sm break-words text-muted-foreground">{c.perche_verdetto}</p>
        </div>
      ) : null}
      {forza.length > 0 ? (
        <div className="space-y-1.5">
          <h4 className="text-sm font-medium">Cosa ha funzionato</h4>
          <Elenco voci={forza} />
        </div>
      ) : null}
      {c && c.da_migliorare.length > 0 ? (
        <div className="space-y-1.5">
          <h4 className="text-sm font-medium">Da migliorare</h4>
          <ul className="space-y-1.5 text-sm">
            {c.da_migliorare.map((m, i) => (
              <li key={i} className="break-words">
                <span className="text-muted-foreground">{ETICHETTA_PRIORITA[m.priorita]}.</span> {m.cosa} <span className="text-muted-foreground">Come: {m.come}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {c?.dai_lead ? (
        <div className="space-y-1.5">
          <h4 className="text-sm font-medium">Cosa dicono i lead</h4>
          <p className="text-sm break-words">{c.dai_lead}</p>
        </div>
      ) : null}
      {p ? (
        <>
          <PenalitaDelPunteggio p={p} />
          <CriteriDelPunteggio p={p} />
          <p className="num text-sm text-muted-foreground">
            Valutato come {ETICHETTA_TIPO[p.tipo]}, {p.tipo_origine === 'dichiarato' ? 'dal Reel Type del calendario' : 'dedotto da Claude'}
            {p.motivo_classificazione ? `: ${p.motivo_classificazione}` : ''}
            {d.punteggio?.finita_il ? ` · fatto il ${new Date(d.punteggio.finita_il).toLocaleDateString('it-IT')}` : ''}
            {d.punteggio?.eta_ore !== null && d.punteggio?.eta_ore !== undefined ? `, a ${Math.round(d.punteggio.eta_ore / 24)} giorni dalla pubblicazione` : ''}. Somma dei
            criteri {numero(p.totale_grezzo)}
            {p.penalita_totali !== 0 ? `, penalità ${p.penalita_totali}` : ''}
            {p.limiti_applicati.length > 0 ? `. ${p.limiti_applicati.join('. ')}` : ''}.
            {fascia && intervallo ? ` Fascia della guida: ${fascia.etichetta} (${intervallo.da}-${intervallo.a}).` : ''}
          </p>
        </>
      ) : null}
    </div>
  )
}

/** «Numeri»: how it went, the verdict of the numbers, the leads, the calendar, what Claude saw and what is said in the reel. */
function NumeriTab({
  d,
  r,
  lettura,
  fonti,
  puoScrivere,
  onFatto,
}: {
  d: DettaglioReel | null
  r: RigaReel
  lettura: LetturaLetta | null
  fonti: string | null
  puoScrivere: boolean
  onFatto: () => void
}) {
  return (
    <div className="space-y-5" data-testid="reel-tab-numeri">
      <Sezione id="numeri" titolo="Come è andato">
        <NumeriReel r={r} />
      </Sezione>
      <Sezione id="verdetto" titolo="Verdetto dei numeri">
        <Verdetto r={r} />
      </Sezione>
      <Sezione id="lead" titolo="Lead dai DM" nota="Chi ha scritto in DM dopo questo reel: i primi 14 giorni, contati dall’Insight.">
        <p className="num text-sm" data-testid="reel-lead-valore">
          {parolaLead(r)}
        </p>
      </Sezione>
      {d ? (
        <Sezione id="calendario" titolo="Nel calendario">
          <Calendario d={d} puoScrivere={puoScrivere} onFatto={onFatto} />
        </Sezione>
      ) : null}
      {lettura?.scheda ? (
        <details className="rounded-lg border border-border p-3" data-testid="reel-scheda-visiva">
          <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium">Cosa ha visto Claude</summary>
          <div className="pt-2">
            <SchedaVisivaVista s={lettura.scheda} />
          </div>
        </details>
      ) : null}
      {d ? (
        <details className="rounded-lg border border-border p-3" data-testid="reel-parlato-blocco">
          <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium">Parlato</summary>
          <div className="pt-2">
            <ParlatoVisto l={lettura} />
          </div>
        </details>
      ) : null}
      {fonti ? (
        <p className="text-sm text-muted-foreground" data-testid="reel-fonti">
          {fonti}
        </p>
      ) : null}
    </div>
  )
}

/**
 * The block at the top of the panel (1.39.1): the one answer. «Cosa fare con questo reel», in one sentence that joins
 * what the score says about the content and what the numbers say about the audience (lib/marketing/analisi/cosa-fare.ts),
 * the score, the first things to fix and ONE primary action: put the rewrite in the calendar for the bands that ask to
 * redo, look at how to touch it up for the touch-ups, «Analizza» when there is no score. «Analizza di nuovo» is
 * secondary, at the bottom. It paints from the list's row at once; the rest comes with the detail.
 */
function BloccoCosaFare({
  r,
  dettaglio,
  statoAnalisi,
  inLavoro,
  puoAnalizzare,
  puoScrivere,
  onRileggi,
  onVediRifacimento,
}: {
  r: RigaReel
  dettaglio: DettaglioReel | null
  statoAnalisi: StatoAnalisiCosaFare | null
  inLavoro: boolean
  puoAnalizzare: boolean
  puoScrivere: boolean
  onRileggi: () => void
  onVediRifacimento: () => void
}) {
  const punteggio = dettaglio?.punteggio ?? null
  const p = punteggio?.punteggio ?? null
  const totale = p?.totale ?? r.punteggio_totale
  const fasciaCodice = p?.fascia ?? r.punteggio_fascia
  const fascia = totale !== null && totale !== undefined ? fasciaDaCodice(fasciaCodice) : null
  const cf = cosaFare({
    fascia: fascia?.codice ?? null,
    verdetto: r.verdetto_oggi,
    giovane: r.eta_ore !== null && r.eta_ore < 72,
    criteriSotto7: p ? p.criteri.filter((c) => c.voto < 7).length : null,
    statoAnalisi,
    eliminato: r.eliminato === true,
  })
  const Icona = fascia ? ICONA_FASCIA[fascia.codice] : null
  const colore = fascia ? COLORE_FASCIA[fascia.codice] : cf.tono === 'critico' ? 'text-status-critical' : 'text-foreground'
  const analisi = dettaglio?.analisi ?? null
  const ultima = dettaglio?.ultima ?? null
  const nonRiuscito = analisi?.fonti?.punteggio === 'non_riuscito'
  const pubblicabile = !r.eliminato && r.media_id && puoAnalizzare && !inLavoro
  const etichettaAnalizza: 'Analizza' | 'Dai il punteggio' | 'Analizza di nuovo' = p
    ? 'Analizza di nuovo'
    : ultima?.stato === 'fallita'
      ? 'Analizza di nuovo'
      : analisi
        ? 'Dai il punteggio'
        : 'Analizza'

  return (
    <section
      aria-labelledby="cosa-fare-titolo"
      className="space-y-4 rounded-xl border border-border bg-card p-4"
      data-testid="reel-cosa-fare"
      data-cosa-fare={cf.chiave}
      aria-busy={dettaglio === null}
    >
      <h3 id="cosa-fare-titolo" className="text-sm font-medium text-muted-foreground">
        Cosa fare con questo reel
      </h3>
      <div className="flex items-start gap-4">
        {fascia && totale !== null && totale !== undefined ? (
          <div className="shrink-0 text-center" data-testid="punteggio-pronto">
            <p className="num text-5xl leading-none font-semibold text-gold" data-testid="punteggio-totale">
              {totale}
            </p>
            <p className="num mt-1 text-xs text-muted-foreground">su 100</p>
          </div>
        ) : null}
        <div className="min-w-0 space-y-1.5">
          <p className={cn('flex items-start gap-2 text-lg leading-6 font-semibold', colore)} data-testid="cosa-fare-titolo-breve" data-punteggio={fascia?.codice ?? 'vuoto'}>
            {Icona ? <Icona className="mt-0.5 size-5 shrink-0" aria-hidden="true" /> : null}
            <span className="min-w-0 wrap-break-word">{cf.breve}</span>
          </p>
          <p className="text-sm break-words" data-testid="cosa-fare-frase">
            {cf.spiegazione}
          </p>
        </div>
      </div>

      {inLavoro ? (
        <p className="flex items-start gap-2 text-sm" role="status" data-testid="reel-in-corso">
          <LoaderCircle className="mt-0.5 size-4 shrink-0 animate-spin" aria-hidden="true" />
          <span>
            {ultima?.stato === 'in_coda' ? 'In coda: parte a breve.' : r.lettura_stato === 'in_coda' || r.lettura_stato === 'in_corso' ? 'Claude sta guardando il reel…' : 'Claude la sta facendo…'}{' '}
            Di solito servono pochi minuti; la pagina si aggiorna da sola.
          </span>
        </p>
      ) : null}
      {ultima?.stato === 'fallita' ? (
        <p className="flex items-start gap-2 text-sm text-status-critical" role="alert" data-testid="reel-fallita">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {ultima.errore ?? 'L’analisi non è riuscita.'}
        </p>
      ) : null}

      {p ? <ProblemiDaSistemare p={p} /> : null}

      {dettaglio === null ? (
        <p className="text-sm text-muted-foreground">Carico il resto…</p>
      ) : p && punteggio ? (
        <>
          {cf.azione === 'aggiungi_rifacimento' && p.rifacimento.script_riscritto && puoScrivere ? (
            <AggiungiRifacimento analisiId={punteggio.analisi_id} nato={punteggio.rifacimento_nel_calendario} onFatto={onRileggi} />
          ) : null}
          {cf.azione === 'vedi_rifacimento' ? (
            <Button type="button" className="h-11 w-full sm:w-auto" onClick={onVediRifacimento} data-testid="vedi-rifacimento">
              Vedi come ritoccarlo
            </Button>
          ) : null}
        </>
      ) : !p && !r.eliminato && !inLavoro ? (
        <div className="space-y-2" data-testid="punteggio-vuoto">
          {nonRiuscito ? (
            <p className="flex items-start gap-2 text-sm text-status-warning" role="status" data-testid="punteggio-non-riuscito">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              Il punteggio dell’ultima analisi non è riuscito. L’analisi c’è: la leggi in «Perché».
            </p>
          ) : analisi ? (
            <p className="text-sm text-muted-foreground">Questo reel è stato analizzato prima del punteggio.</p>
          ) : null}
          {puoAnalizzare ? (
            <>
              <p className="text-sm text-muted-foreground" data-testid="reel-senza-analisi">
                {analisi
                  ? 'Premendo «Dai il punteggio» Claude rifà l’analisi e dà il punteggio.'
                  : 'Premendo «Analizza» Claude guarda il video, ascolta il parlato, scrive l’analisi e dà il punteggio.'}{' '}
                Servono pochi minuti; costo stimato circa {usd(COSTO_STIMATO_PER_REEL_USD)}.
              </p>
              <AnalizzaReel mediaId={r.media_id as string} etichetta={etichettaAnalizza} onFatto={onRileggi} variante="default" />
            </>
          ) : (
            <p className="text-sm text-muted-foreground" data-testid="reel-senza-permesso">
              Le analisi le chiedono l’admin e il marketing: appena è pronta la leggi qui.
            </p>
          )}
        </div>
      ) : null}

      {p && pubblicabile && r.media_id ? (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-border pt-3">
          <p className="text-xs text-muted-foreground">Rifà lettura, analisi e punteggio: circa {usd(COSTO_STIMATO_PER_REEL_USD)}.</p>
          <AnalizzaReel mediaId={r.media_id} etichetta="Analizza di nuovo" onFatto={onRileggi} variante="ghost" />
        </div>
      ) : null}
      {p && !puoAnalizzare ? (
        <p className="border-t border-border pt-3 text-xs text-muted-foreground">Le analisi le chiedono l’admin e il marketing: tu le leggi qui.</p>
      ) : null}
    </section>
  )
}

/**
 * The sheet of a reel (1.36.0, redesigned in 1.39.1): a header that stays in view (cover, the reel in two lines, the
 * day and the length, «Apri su Instagram» as a quiet link), the block «Cosa fare con questo reel» with the one answer
 * and the one action, and below three tabs in the order they are used: «Come rifarlo», «Perché», «Numeri». A tab that
 * has nothing to say for this reel is not drawn (a reel without a score has only «Numeri», and then no tabs at all).
 * Every figure and the verdict are SQL's; the sentences are Claude's, already checked on the server (names,
 * amounts, copied notes out). `dettaglio` null: only the row is known and the rest is loading (or `errore`).
 */
export function SchedaReel({
  riga,
  dettaglio,
  errore,
  puoAnalizzare,
  puoScrivere,
  titoloRef,
  onRileggi,
}: {
  riga: RigaReel
  dettaglio: DettaglioReel | null
  errore: boolean
  puoAnalizzare: boolean
  puoScrivere: boolean
  titoloRef: Ref<HTMLHeadingElement>
  onRileggi: () => void
}) {
  const r = dettaglio?.reel ?? riga
  const tipo = tipoDelPost({ media_type: r.media_type ?? 'VIDEO', reel: true })
  const analisi: AnalisiLetta | null = dettaglio?.analisi ?? null
  const ultima = dettaglio?.ultima ?? null
  const lettura = dettaglio?.lettura ?? null
  const inCorso = ultima?.stato === 'in_coda' || ultima?.stato === 'in_corso'
  const leggendo = r.lettura_stato === 'in_coda' || r.lettura_stato === 'in_corso'
  const inLavoro = inCorso || leggendo
  const fonti = lettura
    ? fraseFonti({ fotogrammi: lettura.fotogrammi, video: (lettura.video as never) ?? null, trascrizione_esito: lettura.trascrizione_esito as never, fonte_visione: lettura.fonte_visione as never })
    : null
  const statoAnalisi: StatoAnalisiCosaFare | null = inLavoro
    ? 'in_corso'
    : ultima?.stato === 'fallita'
      ? 'fallita'
      : r.analisi_stato === 'pronta' || r.analisi_stato === 'fallita' || r.analisi_stato === 'in_coda' || r.analisi_stato === 'in_corso'
        ? r.analisi_stato
        : null

  // the tabs that have something to say, in the order of use
  const punteggio = dettaglio?.punteggio ?? null
  const idee = analisi?.contenuto?.idee ?? []
  const schede: NomeScheda[] = dettaglio
    ? [...(punteggio || idee.length > 0 ? (['rifare'] as const) : []), ...(punteggio || analisi?.contenuto ? (['perche'] as const) : []), 'numeri']
    : []
  const daIndirizzo = useSearchParams().get(PARAMETRO_SCHEDA)
  const [scelta, setScelta] = useState<NomeScheda | null>(eSchedaReel(daIndirizzo) ? daIndirizzo : null)
  const attiva: NomeScheda = scelta && schede.includes(scelta) ? scelta : (schede[0] ?? 'numeri')
  const schedeRef = useRef<HTMLDivElement>(null)

  function vaiA(s: NomeScheda, scorri = false) {
    setScelta(s)
    const { pathname, search } = window.location
    window.history.replaceState(null, '', urlConScheda(pathname, search, s))
    if (scorri) schedeRef.current?.scrollIntoView({ block: 'start' })
  }

  const conAggiungiNelTab = !!punteggio && cosaFare({ fascia: punteggio.punteggio.fascia, verdetto: null }).azione !== 'aggiungi_rifacimento'

  return (
    <>
      <SheetHeader className="sticky top-0 z-10 border-b border-border bg-popover">
        <ChiudiPannello />
        <div className="flex items-start gap-3">
          <CopertinaPost url={r.copertina_url} tipo={tipo} className="h-14 w-[2.625rem]" />
          <div className="min-w-0 space-y-0.5">
            <SheetTitle ref={titoloRef} tabIndex={-1} className="line-clamp-2 text-base break-words outline-none">
              {titoloReel(r)}
            </SheetTitle>
            <SheetDescription className="num">
              {r.pubblicato_il ? quandoPubblicato(r.pubblicato_il) : ''}
              {r.durata_ms ? ` · ${formatDurata(r.durata_ms / 1000)}` : ''}
            </SheetDescription>
            {r.permalink ? <ApriSuInstagram href={r.permalink} className="-ml-2" /> : null}
          </div>
        </div>
      </SheetHeader>

      <div className="space-y-5 px-4 pt-4 pb-10">
        {errore ? (
          <div role="alert" className="flex flex-wrap items-center gap-2 text-sm" data-testid="reel-errore">
            <TriangleAlert className="size-4 shrink-0 text-status-critical" aria-hidden="true" />
            <span>Il dettaglio del reel non si è caricato.</span>
            <Button type="button" variant="outline" className="h-11" onClick={onRileggi}>
              <RotateCw className="size-4" aria-hidden="true" />
              Riprova
            </Button>
          </div>
        ) : null}

        <BloccoCosaFare
          r={r}
          dettaglio={dettaglio}
          statoAnalisi={statoAnalisi}
          inLavoro={inLavoro}
          puoAnalizzare={puoAnalizzare}
          puoScrivere={puoScrivere}
          onRileggi={onRileggi}
          onVediRifacimento={() => vaiA('rifare', true)}
        />

        {dettaglio === null && !errore ? (
          <p className="text-sm text-muted-foreground" aria-busy="true">
            Carico i numeri e l’analisi…
          </p>
        ) : null}

        {dettaglio !== null || errore ? (
          <div ref={schedeRef} className="scroll-mt-24">
            {schede.length > 1 ? (
              <Tabs value={attiva} onValueChange={(v) => eSchedaReel(v) && vaiA(v)}>
                <TabsList variant="line" aria-label="Dettagli del reel" className="group-data-horizontal/tabs:h-11 w-full gap-0 rounded-none border-b border-border p-0">
                  {schede.map((s) => (
                    <TabsTrigger key={s} value={s} className="h-11 flex-1 rounded-none text-sm" data-testid={`scheda-${s}`}>
                      {s === 'rifare' ? 'Come rifarlo' : s === 'perche' ? 'Perché' : 'Numeri'}
                    </TabsTrigger>
                  ))}
                </TabsList>
                {schede.includes('rifare') ? (
                  <TabsContent value="rifare" className="space-y-6 pt-4">
                    {dettaglio && punteggio ? (
                      <ComeRifarlo p={punteggio.punteggio} analisiId={punteggio.analisi_id} nato={punteggio.rifacimento_nel_calendario} conAggiungi={conAggiungiNelTab} onFatto={onRileggi} />
                    ) : null}
                    {dettaglio && analisi ? (
                      <IdeeDellAnalisi idAnalisi={analisi.id} idee={idee} fatte={dettaglio.idee} conRifacimento={!!punteggio} puoScrivere={puoScrivere} onFatto={onRileggi} />
                    ) : null}
                  </TabsContent>
                ) : null}
                {schede.includes('perche') && dettaglio ? (
                  <TabsContent value="perche" className="pt-4">
                    <Perche d={dettaglio} />
                  </TabsContent>
                ) : null}
                <TabsContent value="numeri" className="pt-4">
                  <NumeriTab d={dettaglio} r={r} lettura={lettura} fonti={fonti} puoScrivere={puoScrivere} onFatto={onRileggi} />
                </TabsContent>
              </Tabs>
            ) : (
              <NumeriTab d={dettaglio} r={r} lettura={lettura} fonti={fonti} puoScrivere={puoScrivere} onFatto={onRileggi} />
            )}
          </div>
        ) : null}
      </div>
    </>
  )
}
