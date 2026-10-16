'use client'

import { CalendarPlus, CircleCheck, Link2, LoaderCircle, RotateCw, TriangleAlert } from 'lucide-react'
import Link from 'next/link'
import { useState, type ReactNode, type Ref } from 'react'
import { toast } from 'sonner'

import { aggiungiIdeaAlCalendario, creaContenutoDaAnalisi } from '@/app/(app)/marketing/analisi/actions'
import { collegaPost, creaContenutoDaPost } from '@/app/(app)/marketing/instagram/actions'
import { ChiudiPannello } from '@/components/marketing/analisi/chiudi-pannello'
import { AnalizzaReel } from '@/components/marketing/analisi/analizza-reel'
import { BadgeVerdetto } from '@/components/marketing/analisi/badge-verdetto'
import { SezionePunteggio } from '@/components/marketing/analisi/sezione-punteggio'
import { useOpzioniToast } from '@/components/marketing/contesto-pannello'
import { ApriSuInstagram, CopertinaPost } from '@/components/marketing/instagram/copertina-post'
import { Button } from '@/components/ui/button'
import { SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { formatNumero } from '@/lib/format'
import { tipoDelPost } from '@/lib/marketing/abbinamento'
import type { DettaglioReel, LetturaLetta } from '@/lib/marketing/analisi/dettaglio'
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
import type { AnalisiContenuto, SchedaVisiva } from '@/lib/marketing/analisi/tipi'
import { nomeDaDidascalia } from '@/lib/marketing/da-post'
import { ETICHETTA_FORMAT, ETICHETTA_REEL_TYPE, type FormatContenuto, type ReelType } from '@/lib/marketing/etichette'
import { etichettaCollega, motiviInParole, quandoPubblicato } from '@/lib/marketing/parole-post'

const CONNESSIONE = 'Connessione assente. Riprova.'

export function titoloReel(r: Pick<RigaReel, 'nome' | 'didascalia_inizio' | 'giorno'>): string {
  return r.nome || nomeDaDidascalia(r.didascalia_inizio) || (r.giorno ? `Reel del ${r.giorno.slice(8, 10)}/${r.giorno.slice(5, 7)}/${r.giorno.slice(0, 4)}` : 'Reel')
}

function Sezione({ id, titolo, children, nota }: { id: string; titolo: string; children: ReactNode; nota?: ReactNode }) {
  return (
    <section aria-labelledby={id} className="space-y-2" data-testid={`reel-${id}`}>
      <h3 id={id} className="text-sm font-medium">
        {titolo}
      </h3>
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
      <dl className="grid grid-cols-2 gap-2">
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

const ETICHETTA_PRIORITA = { alta: 'Alta', media: 'Media', bassa: 'Bassa' } as const

function AnalisiPronta({
  idAnalisi,
  c,
  idee,
  puoScrivere,
  onFatto,
}: {
  idAnalisi: string
  c: AnalisiContenuto
  idee: DettaglioReel['idee']
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

  return (
    <div className="space-y-4" data-testid="reel-analisi-pronta">
      <p className="text-sm break-words">{c.sintesi}</p>
      <p className="text-sm break-words text-muted-foreground">{c.perche_verdetto}</p>
      {c.cosa_ha_funzionato.length ? (
        <div className="space-y-1">
          <p className="text-sm font-medium">Cosa ha funzionato</p>
          <Elenco voci={c.cosa_ha_funzionato} />
        </div>
      ) : null}
      {c.da_migliorare.length ? (
        <div className="space-y-1">
          <p className="text-sm font-medium">Da migliorare</p>
          <ul className="space-y-1.5 text-sm">
            {c.da_migliorare.map((m, i) => (
              <li key={i} className="break-words">
                <span className="text-muted-foreground">{ETICHETTA_PRIORITA[m.priorita]}.</span> {m.cosa} <span className="text-muted-foreground">Come: {m.come}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {c.dai_lead ? (
        <div className="space-y-1">
          <p className="text-sm font-medium">Dai lead</p>
          <p className="text-sm break-words">{c.dai_lead}</p>
        </div>
      ) : null}
      {c.idee.length ? (
        <div className="space-y-2">
          <p className="text-sm font-medium">Idee per il calendario</p>
          <ul className="space-y-3">
            {c.idee.map((idea, i) => {
              const fatta = aggiunte[i] ?? idee.find((x) => x.indice === i)
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
                    <Link
                      href={`/marketing/contenuti/${faId}`}
                      className="inline-flex min-h-11 items-center gap-1.5 text-sm underline underline-offset-4"
                    >
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
                      {inVolo === i ? (
                        <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                      ) : (
                        <CalendarPlus className="size-4" aria-hidden="true" />
                      )}
                      Aggiungi al calendario
                      <span className="sr-only">: {idea.name}</span>
                    </Button>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}
    </div>
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

/**
 * The sheet of a reel (1.36.0): header, the numbers against the account's
 * medians, the verdict, Claude's analysis with its ideas, the calendar, the
 * visual card and what is said in the reel. Every figure and the verdict are
 * SQL's; the sentences are Claude's, already checked on the server (names,
 * amounts, copied notes out). `dettaglio` null: only the row is known and
 * the rest is loading (or `errore`).
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
  const analisi = dettaglio?.analisi ?? null
  const ultima = dettaglio?.ultima ?? null
  const lettura = dettaglio?.lettura ?? null
  const inCorso = ultima?.stato === 'in_coda' || ultima?.stato === 'in_corso'
  const leggendo = r.lettura_stato === 'in_coda' || r.lettura_stato === 'in_corso'
  const fonti = lettura
    ? fraseFonti({ fotogrammi: lettura.fotogrammi, video: (lettura.video as never) ?? null, trascrizione_esito: lettura.trascrizione_esito as never, fonte_visione: lettura.fonte_visione as never })
    : null

  return (
    <>
      <SheetHeader className="sticky top-0 z-10 border-b border-border bg-popover">
        <ChiudiPannello />
        <div className="flex items-start gap-3">
          <CopertinaPost url={r.copertina_url} tipo={tipo} className="h-20 w-[3.75rem]" />
          <div className="min-w-0 space-y-1">
            <SheetTitle ref={titoloRef} tabIndex={-1} className="text-base break-words outline-none">
              {titoloReel(r)}
            </SheetTitle>
            <SheetDescription className="num">
              {r.pubblicato_il ? quandoPubblicato(r.pubblicato_il) : ''}
              {r.durata_ms ? ` · ${formatDurata(r.durata_ms / 1000)}` : ''}
            </SheetDescription>
            <BadgeVerdetto verdetto={r.verdetto_oggi} />
          </div>
        </div>
      </SheetHeader>

      <div className="space-y-6 px-4 pt-4 pb-10">
        <div className="flex flex-wrap items-start gap-2">
          {r.permalink ? <ApriSuInstagram href={r.permalink} /> : null}
          {r.media_id && puoAnalizzare && !r.eliminato && !inCorso && !leggendo ? (
            <AnalizzaReel
              mediaId={r.media_id}
              etichetta={dettaglio?.punteggio || ultima?.stato === 'fallita' ? 'Analizza di nuovo' : analisi ? 'Dai il punteggio' : 'Analizza'}
              onFatto={onRileggi}
              variante={dettaglio?.punteggio ? 'outline' : 'default'}
            />
          ) : null}
        </div>
        {!puoAnalizzare ? (
          <p className="text-sm text-muted-foreground">Le analisi le chiedono l’admin e il marketing; le leggi qui quando sono pronte.</p>
        ) : null}

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

        <Sezione id="punteggio" titolo="Punteggio">
          <SezionePunteggio
            punteggio={dettaglio?.punteggio ?? null}
            analisi={analisi}
            caricato={dettaglio !== null}
            inLavoro={inCorso || leggendo}
            puoAnalizzare={puoAnalizzare}
            puoScrivere={puoScrivere}
            onFatto={onRileggi}
          />
        </Sezione>

        <Sezione id="numeri" titolo="Come è andato">
          <NumeriReel r={r} />
        </Sezione>

        <Sezione id="verdetto" titolo="Verdetto">
          <Verdetto r={r} />
        </Sezione>

        <Sezione id="lead" titolo="Lead dai DM" nota="Chi ha scritto in DM dopo questo reel: i primi 14 giorni, contati dall’Insight.">
          <p className="num text-sm" data-testid="reel-lead-valore">
            {parolaLead(r)}
          </p>
        </Sezione>

        <Sezione id="analisi" titolo="L’analisi di Claude">
          {!dettaglio && !errore ? (
            <p className="text-sm text-muted-foreground" aria-busy="true">
              Carico l’analisi…
            </p>
          ) : null}
          {inCorso ? (
            <p className="flex items-start gap-2 text-sm" role="status" data-testid="reel-in-corso">
              <LoaderCircle className="mt-0.5 size-4 shrink-0 animate-spin" aria-hidden="true" />
              {ultima?.stato === 'in_coda' ? 'In coda: parte a breve.' : 'Claude la sta facendo…'} Di solito servono pochi minuti; la pagina si aggiorna da sola.
            </p>
          ) : null}
          {!inCorso && leggendo && !analisi ? (
            <p className="flex items-start gap-2 text-sm" role="status">
              <LoaderCircle className="mt-0.5 size-4 shrink-0 animate-spin" aria-hidden="true" />
              Claude sta guardando il reel…
            </p>
          ) : null}
          {ultima?.stato === 'fallita' ? (
            <p className="flex items-start gap-2 text-sm text-status-critical" role="alert" data-testid="reel-fallita">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {ultima.errore ?? 'L’analisi non è riuscita.'}
            </p>
          ) : null}
          {analisi?.contenuto ? (
            <>
              <p className="num text-sm text-muted-foreground">
                {analisi.finita_il ? `Fatta il ${new Date(analisi.finita_il).toLocaleDateString('it-IT')}` : 'Fatta'}
                {analisi.eta_ore !== null ? `, a ${Math.round(analisi.eta_ore / 24)} giorni dalla pubblicazione` : ''}
                {analisi.verdetto ? ` · verdetto di allora: ${analisi.verdetto}` : ''}
              </p>
              <AnalisiPronta idAnalisi={analisi.id} c={analisi.contenuto} idee={dettaglio?.idee ?? []} puoScrivere={puoScrivere} onFatto={onRileggi} />
            </>
          ) : dettaglio && !inCorso && !leggendo && ultima?.stato !== 'fallita' ? (
            <p className="text-sm text-muted-foreground" data-testid="reel-senza-analisi">
              {r.eta_ore !== null && r.eta_ore < 72
                ? 'Questo reel ha meno di 3 giorni: i numeri sono ancora pochi per un verdetto, ma puoi chiedere subito l’analisi e il punteggio.'
                : 'Ancora nessuna analisi di Claude per questo reel: parte solo da «Analizza».'}
            </p>
          ) : null}
        </Sezione>

        {dettaglio ? (
          <Sezione id="calendario" titolo="Nel calendario">
            <Calendario d={dettaglio} puoScrivere={puoScrivere} onFatto={onRileggi} />
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

        {dettaglio ? (
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
    </>
  )
}
