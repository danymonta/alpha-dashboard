'use client'

import { CalendarPlus, CircleCheck, Link2, LoaderCircle, RotateCw, TriangleAlert, Unlink } from 'lucide-react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useRef, useState, type ReactNode, type Ref } from 'react'
import { toast } from 'sonner'

import { annullaScollega, scollegaPost } from '@/app/(app)/marketing/pubblicati/actions'
import { aggiungiIdeaAlCalendario } from '@/app/(app)/marketing/pubblicati/azioni-analisi'
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
import { ApriSuInstagram, AZIONE_TOAST, CopertinaPost } from '@/components/marketing/instagram/copertina-post'
import { useOpzioni } from '@/components/marketing/opzioni-contesto'
import { Pillola } from '@/components/marketing/pillola'
import { ElencoPerCollegare } from '@/components/marketing/pubblicati/collega'
import { Button } from '@/components/ui/button'
import { SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useFormato, useLingua } from '@/components/i18n/lingua-provider'
import { formato } from '@/lib/format'
import type { Lingua } from '@/lib/i18n/lingua'
import { ANALISI_REEL, traduciErroreReel, usdIn } from '@/lib/i18n/testi/analisi-reel'
import { PUBBLICATI } from '@/lib/i18n/testi/pubblicati'
import { COSTO_STIMATO_PER_REEL_USD } from '@/lib/marketing/analisi/costi'
import { cosaFare, type StatoAnalisiCosaFare } from '@/lib/marketing/analisi/cosa-fare'
import type { AnalisiLetta, DettaglioReel, LetturaLetta } from '@/lib/marketing/analisi/dettaglio'
import type { RigaReel } from '@/lib/marketing/analisi/elenco'
import { fraseFonti, fraseFontiEn } from '@/lib/marketing/analisi/frasi'
import {
  fraseStatoPost,
  fraseStatoPostEn,
  formatDurata,
  formatQuota,
  formatRapporto,
  formatTasso,
  formatVisione,
  parolaLead,
  parolaLeadEn,
  viewsConConfronto,
} from '@/lib/marketing/analisi/parole'
import { eSchedaReel, PARAMETRO_SCHEDA, urlConScheda, type SchedaReel as NomeScheda } from '@/lib/marketing/analisi/pannello'
import type { AnalisiContenuto, SchedaVisiva } from '@/lib/marketing/analisi/tipi'
import { nomeDaDidascalia } from '@/lib/marketing/da-post'
import { nomeDaValore, opzioneDaValore } from '@/lib/marketing/opzioni'
import { quandoPubblicato } from '@/lib/marketing/parole-post'
import { eReel, tipoDellaRiga } from '@/lib/marketing/pubblicati/parole'
import { fasciaDaCodice, intervalloFascia } from '@/lib/marketing/punteggio/tabelle'
import { cn } from '@/lib/utils'

export function titoloReel(r: Pick<RigaReel, 'nome' | 'didascalia_inizio' | 'giorno' | 'media_type' | 'reel'>, lingua: Lingua = 'it'): string {
  if (lingua === 'en') {
    const t = PUBBLICATI.en
    const tipo = t.tipoPost[eReel(r) ? 'reel' : tipoDellaRiga(r) === 'carousel' ? 'carousel' : 'foto']
    return r.nome || nomeDaDidascalia(r.didascalia_inizio) || (r.giorno ? t.titoloPost(tipo, formato('en').formatData(r.giorno)) : tipo)
  }
  const cosa = eReel(r) ? 'Reel' : tipoDellaRiga(r) === 'carousel' ? 'Carosello' : 'Foto'
  return r.nome || nomeDaDidascalia(r.didascalia_inizio) || (r.giorno ? `${cosa} del ${r.giorno.slice(8, 10)}/${r.giorno.slice(5, 7)}/${r.giorno.slice(0, 4)}` : cosa)
}

/** The verdict an analysis had then: its slug in Italian as always, its word in English. */
function verdettoIn(verdetto: string, lingua: Lingua): string {
  if (lingua === 'it') return verdetto
  const parole: Record<string, string> = PUBBLICATI.en.verdetto
  return parole[verdetto] ?? verdetto
}

/** A day of the analysis or of the score: «16/10/2026» as always in Italian, «16 Oct 2026» in English. */
function giornoDi(istante: string, lingua: Lingua): string {
  return lingua === 'it' ? new Date(istante).toLocaleDateString('it-IT') : formato(lingua).formatData(new Date(istante))
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
    <ul className="list-disc space-y-1 pl-5 text-sm" lang="it">
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
  const lingua = useLingua()
  const { formatNumero } = useFormato()
  const t = ANALISI_REEL[lingua].numeri
  const stato = lingua === 'it' ? fraseStatoPost(r.metriche_stato, r.metriche_il, r.numeri_parziali) : fraseStatoPostEn(r.metriche_stato, r.numeri_parziali)
  if (r.metriche_stato !== 'lette') {
    return (
      <div className="space-y-1" data-testid="reel-senza-statistiche">
        <p className="text-sm font-medium">{t.senzaStatistiche}</p>
        {stato ? <p className="text-sm text-muted-foreground">{stato}</p> : null}
        {r.like_count !== null || r.comments_count !== null ? (
          <p className="num text-sm text-muted-foreground">
            {t.miPiaceCommenti(formatNumero(r.like_count ?? 0), formatNumero(r.comments_count ?? 0))}
          </p>
        ) : null}
      </div>
    )
  }
  const v = viewsConConfronto(r.views, r.views_rapporto, r.confronto, r.eta_confronto, lingua)
  const salvataggi = formatRapporto(r.salvataggi_rapporto, lingua)
  return (
    <div className="space-y-2">
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Numero etichetta={t.views} valore={v.numero ?? t.nd} nota={v.confronto} />
        <Numero etichetta={t.reach} valore={r.reach === null ? t.nd : formatNumero(r.reach)} />
        <Numero
          etichetta={t.salvataggi}
          valore={r.saved === null ? t.nd : formatNumero(r.saved)}
          nota={[formatTasso(r.tasso_salvataggi, lingua), salvataggi ? t.dellaMediana(salvataggi) : null].filter(Boolean).join(' · ') || null}
        />
        <Numero
          etichetta={t.condivisioni}
          valore={r.shares === null ? t.nd : formatNumero(r.shares)}
          nota={formatTasso(r.tasso_condivisioni, lingua)}
        />
        <Numero
          etichetta={t.visione}
          valore={formatVisione(r.avg_watch_ms, r.quota_vista, lingua)}
          nota={r.skip_rate !== null ? t.loSalta(formatQuota(r.skip_rate) ?? '') : null}
        />
        <Numero etichetta={t.miPiace} valore={`${formatNumero(r.likes ?? r.like_count ?? 0)} · ${formatNumero(r.comments ?? r.comments_count ?? 0)}`} />
      </dl>
      {stato ? <p className="text-sm text-muted-foreground">{stato}</p> : null}
    </div>
  )
}

function Verdetto({ r }: { r: RigaReel }) {
  const lingua = useLingua()
  const t = ANALISI_REEL[lingua].verdetto
  const fasce: Record<string, string> = t.fasce
  if (!r.verdetto_oggi) {
    return <p className="text-sm text-muted-foreground">{r.eta_ore !== null && r.eta_ore < 72 ? t.presto : t.senzaConfronto}</p>
  }
  return (
    <div className="space-y-1.5">
      <BadgeVerdetto verdetto={r.verdetto_oggi} lingua={lingua} />
      <p className="text-sm text-muted-foreground">
        {t.riga(
          r.fascia_pubblico ? (fasce[r.fascia_pubblico] ?? r.fascia_pubblico) : t.nd,
          r.fascia_lead ? (fasce[r.fascia_lead] ?? r.fascia_lead) : t.nonContati,
        )}
      </p>
    </div>
  )
}

function SchedaVisivaVista({ s }: { s: SchedaVisiva }) {
  const t = ANALISI_REEL[useLingua()].vista
  return (
    <div className="space-y-3 text-sm">
      <p className="break-words" lang="it">
        {s.sintesi_visiva}
      </p>
      <div>
        <p className="font-medium">
          {t.gancio} {s.gancio.livello}
        </p>
        <p className="break-words text-muted-foreground">
          {s.gancio.cosa_si_vede}
          {s.gancio.parole ? ` «${s.gancio.parole}»` : ''}
          {s.gancio.testo_a_schermo ? ` ${t.testo} ${s.gancio.testo_a_schermo}.` : ''} {s.gancio.perche}
        </p>
        <p className="break-words">
          {t.alternativa} {s.gancio.alternativa}
        </p>
      </div>
      {s.sequenza.length > 0 ? (
        <div>
          <p className="font-medium">{t.sequenza}</p>
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
        <span className="font-medium">{t.ritmo}</span> {s.ritmo.livello}. {s.ritmo.osservazione}
        {s.ritmo.calo ? ` ${t.cala}${s.ritmo.calo.secondo !== null ? ` ${t.a} ${formatDurata(s.ritmo.calo.secondo)}` : ''}: ${s.ritmo.calo.cosa}` : ''}
      </p>
      <p className="break-words">
        <span className="font-medium">{t.testoASchermo}</span> {s.testo_a_schermo.osservazione}
      </p>
      <p className="break-words">
        <span className="font-medium">{t.cta}</span> {s.cta.presente ? `${s.cta.testo ?? t.presente}. ` : `${t.assente} `}
        {s.cta.osservazione} {t.proposta} {s.cta.proposta}
      </p>
      <p className="break-words">
        <span className="font-medium">{t.produzione}</span> {t.luce} {s.produzione.luce}, {t.audio} {s.produzione.audio}.{' '}
        {s.produzione.inquadratura} {s.produzione.osservazione}
      </p>
      <p className="break-words">
        <span className="font-medium">{t.clienteIdeale}</span> {t.aderenza} {s.icp.aderenza}.
        {s.icp.leve_usate.length ? ` ${t.usa} ${s.icp.leve_usate.join(', ')}.` : ''}
        {s.icp.leve_mancanti.length ? ` ${t.manca} ${s.icp.leve_mancanti.join(', ')}.` : ''}
        {s.icp.frase_del_cliente ? ` ${t.frase} «${s.icp.frase_del_cliente}».` : ''}
        {s.icp.rischio ? ` ${t.attenzione} ${s.icp.rischio}` : ''}
      </p>
      {s.script ? (
        <p className="break-words">
          <span className="font-medium">{t.script}</span> {s.script.segue === 'si' ? t.seguito : s.script.segue === 'no' ? t.nonSeguito : t.inParte}. {s.script.differenze}
        </p>
      ) : null}
    </div>
  )
}

function ParlatoVisto({ l }: { l: LetturaLetta | null }) {
  const t = ANALISI_REEL[useLingua()].parlato
  const esito = l?.trascrizione_esito ?? null
  if (esito === 'pronta' && (l?.segmenti?.length || l?.trascrizione)) {
    return l.segmenti?.length ? (
      <ol className="space-y-1.5 text-sm" data-testid="reel-parlato" lang="it">
        {l.segmenti.map((s, i) => (
          <li key={i} className="flex gap-2">
            <span className="num w-10 shrink-0 text-muted-foreground">{formatDurata(s.da)}</span>
            <span className="min-w-0 break-words">{s.testo}</span>
          </li>
        ))}
      </ol>
    ) : (
      <p className="text-sm break-words whitespace-pre-line" data-testid="reel-parlato" lang="it">
        {l.trascrizione}
      </p>
    )
  }
  const frase =
    esito === 'senza_parlato' || esito === 'senza_audio'
      ? t.senzaParlato
      : esito === 'senza_video'
        ? t.senzaVideo
        : esito === 'spenta'
          ? t.spenta
          : esito === 'fallita'
            ? t.fallita
            : t.nonLetto
  return (
    <p className="text-sm text-muted-foreground" data-testid="reel-parlato-vuoto">
      {frase}
    </p>
  )
}

/**
 * «Nel Piano editoriale» (25/10/2026): the content of the plan this post is linked to, with its pills, a link to its
 * page and «Scollega» (with «Annulla»); or, when the post is not in the plan, one «Collega» that opens the search
 * among the contents still without a post. No proposal, no «Crea il contenuto»: a post is linked by choice, and
 * nobody has to. A post published before the plan is a normal post.
 */
function NelPiano({ d, puoScrivere, onFatto }: { d: DettaglioReel; puoScrivere: boolean; onFatto: () => void }) {
  const opzioniToast = useOpzioniToast()
  const { opzioni } = useOpzioni()
  const lingua = useLingua()
  const t = ANALISI_REEL[lingua].piano
  const connessione = ANALISI_REEL[lingua].scheda.connessione
  const r = d.reel
  const [inVolo, setInVolo] = useState(false)
  const [cerca, setCerca] = useState(false)

  async function scollega(contenuto: { id: string; nome: string }) {
    if (inVolo || !r.shortcode) return
    setInVolo(true)
    try {
      const esito = await scollegaPost({ shortcode: r.shortcode, contenuto_id: contenuto.id })
      if (!esito.ok) {
        toast.error(traduciErroreReel(esito.errore, lingua), opzioniToast)
        return
      }
      toast.success(t.scollegato(contenuto.nome), {
        ...opzioniToast,
        duration: 6000,
        action: {
          label: t.annulla,
          onClick: () => {
            // the sign «Collegato da solo», if the run made the link, comes back by itself (database)
            const coppia = { shortcode: r.shortcode as string, contenuto_id: contenuto.id }
            void annullaScollega(coppia).then(
              (x) => {
                if (x.ok) {
                  toast.success(t.diNuovo, opzioniToast)
                  onFatto()
                } else toast.error(traduciErroreReel(x.errore, lingua), opzioniToast)
              },
              () => toast.error(connessione, opzioniToast),
            )
          },
        },
        classNames: { actionButton: AZIONE_TOAST },
      })
      onFatto()
    } catch {
      toast.error(connessione, opzioniToast)
    } finally {
      setInVolo(false)
    }
  }

  if (d.contenuto) {
    const c = d.contenuto
    const tipo = opzioneDaValore(opzioni.reel_type, c.reel_type)
    const formato = opzioneDaValore(opzioni.formato, c.formato)
    return (
      <div className="space-y-2" data-testid="nel-piano">
        <p className="text-sm break-words">
          {t.collegatoA}{' '}
          <Link href={`/marketing/contenuti/${c.id}`} className="underline underline-offset-4">
            {c.nome}
          </Link>
        </p>
        {tipo || formato ? (
          <div className="flex flex-wrap gap-1">
            {tipo ? <Pillola nome={tipo.nome} colore={tipo.colore} /> : null}
            {formato ? <Pillola nome={formato.nome} colore={formato.colore} /> : null}
          </div>
        ) : null}
        {puoScrivere ? (
          <Button
            type="button"
            variant="ghost"
            className="-ml-2 h-11"
            focusableWhenDisabled
            disabled={inVolo}
            aria-busy={inVolo || undefined}
            aria-label={t.scollegaDa(c.nome)}
            onClick={() => void scollega({ id: c.id, nome: c.nome })}
          >
            {inVolo ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Unlink className="size-4" aria-hidden="true" />}
            {t.scollega}
          </Button>
        ) : null}
      </div>
    )
  }
  if (r.eliminato) return <p className="text-sm text-muted-foreground">{t.nonPiu}</p>
  if (!r.shortcode || !r.giorno) return null
  const post = { shortcode: r.shortcode, giorno: r.giorno, tipo: tipoDellaRiga(r) }
  return (
    <div className="space-y-2" data-testid="nel-piano">
      <p className="text-sm text-muted-foreground">
        {t.nonNelPiano}
      </p>
      {puoScrivere ? (
        cerca ? (
          <div className="space-y-2">
            <ElencoPerCollegare post={post} onFatto={onFatto} autoFocus />
            <Button type="button" variant="ghost" className="-ml-2 h-11" onClick={() => setCerca(false)}>
              {t.chiudiRicerca}
            </Button>
          </div>
        ) : (
          <Button type="button" variant="outline" className="h-11" onClick={() => setCerca(true)} data-testid="collega-dal-pannello">
            <Link2 className="size-4" aria-hidden="true" />
            {t.collegaA}
          </Button>
        )
      ) : null}
    </div>
  )
}

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
  const { opzioni } = useOpzioni()
  const lingua = useLingua()
  const t = ANALISI_REEL[lingua].idee
  const [inVolo, setInVolo] = useState<number | null>(null)
  const [aggiunte, setAggiunte] = useState<Record<number, { id: string; nome: string }>>({})

  async function aggiungi(indice: number) {
    if (inVolo !== null) return
    setInVolo(indice)
    try {
      const esito = await aggiungiIdeaAlCalendario({ analisi_id: idAnalisi, indice })
      if (!esito.ok) {
        toast.error(traduciErroreReel(esito.errore, lingua), opzioniToast)
        return
      }
      setAggiunte((prima) => ({ ...prima, [indice]: { id: esito.id, nome: esito.nome } }))
      toast.success(t.nelCalendario(esito.nome), opzioniToast)
      onFatto()
    } catch {
      toast.error(ANALISI_REEL[lingua].scheda.connessione, opzioniToast)
    } finally {
      setInVolo(null)
    }
  }

  if (idee.length === 0) return null
  return (
    <section className="space-y-2" aria-labelledby="idee-titolo" data-testid="reel-idee">
      <h4 id="idee-titolo" className="text-sm font-medium">
        {conRifacimento ? t.altre : t.perIlCalendario}
      </h4>
      <p className="text-sm text-muted-foreground">{conRifacimento ? t.altreNota : t.nota}</p>
      <ul className="space-y-3">
        {idee.map((idea, i) => {
          const fatta = aggiunte[i] ?? fatte.find((x) => x.indice === i)
          const faId = fatta ? ('contenuto_id' in fatta ? fatta.contenuto_id : fatta.id) : null
          return (
            <li key={i} className="space-y-1.5 rounded-lg bg-muted/40 p-3 text-sm" data-testid="reel-idea">
              <p className="font-medium break-words" lang="it">
                {idea.name}
              </p>
              <p className="text-muted-foreground">
                {nomeDaValore(opzioni.reel_type, idea.reel_type)}
                {idea.format ? ` · ${nomeDaValore(opzioni.formato, idea.format)}` : ''}
              </p>
              <p className="break-words">
                <span className="font-medium">{t.gancio}</span> <span lang="it">{idea.gancio}</span>
              </p>
              <p className="break-words" lang="it">
                {idea.messaggio}
              </p>
              <p className="break-words text-muted-foreground">
                Hook: {idea.script.hook} {idea.script.righe.length ? `· ${idea.script.righe.join(' · ')}` : ''} · CTA: {idea.script.cta}
              </p>
              <p className="break-words text-muted-foreground">
                {t.perche} <span lang="it">{idea.perche}</span>
              </p>
              {faId ? (
                <Link href={`/marketing/contenuti/${faId}`} className="inline-flex min-h-11 items-center gap-1.5 text-sm underline underline-offset-4">
                  <CircleCheck className="size-4 text-status-ok" aria-hidden="true" />
                  {t.giaNel}
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
                  {t.aggiungi}
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
  const lingua = useLingua()
  const t = ANALISI_REEL[lingua].perche
  const ti = ANALISI_REEL[lingua].idee
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
            {analisi?.finita_il ? t.analisiDel(giornoDi(analisi.finita_il, lingua)) : t.analisi}
            {analisi?.eta_ore !== null && analisi?.eta_ore !== undefined ? t.aGiorni(Math.round(analisi.eta_ore / 24)) : ''}
            {analisi?.verdetto ? t.verdettoAllora(verdettoIn(analisi.verdetto, lingua)) : ''}
          </p>
          <p className="text-sm break-words" lang="it">
            {c.sintesi}
          </p>
          <p className="text-sm break-words text-muted-foreground" lang="it">
            {c.perche_verdetto}
          </p>
        </div>
      ) : null}
      {forza.length > 0 ? (
        <div className="space-y-1.5">
          <h4 className="text-sm font-medium">{t.funzionato}</h4>
          <Elenco voci={forza} />
        </div>
      ) : null}
      {c && c.da_migliorare.length > 0 ? (
        <div className="space-y-1.5">
          <h4 className="text-sm font-medium">{t.migliorare}</h4>
          <ul className="space-y-1.5 text-sm">
            {c.da_migliorare.map((m, i) => (
              <li key={i} className="break-words">
                <span className="text-muted-foreground">{ti.priorita[m.priorita]}.</span> <span lang="it">{m.cosa}</span>{' '}
                <span className="text-muted-foreground">
                  {t.come} <span lang="it">{m.come}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {c?.dai_lead ? (
        <div className="space-y-1.5">
          <h4 className="text-sm font-medium">{t.lead}</h4>
          <p className="text-sm break-words" lang="it">
            {c.dai_lead}
          </p>
        </div>
      ) : null}
      {p ? (
        <>
          <PenalitaDelPunteggio p={p} />
          <CriteriDelPunteggio p={p} />
          <p className="num text-sm text-muted-foreground">
            {t.valutatoCome(t.tipi[p.tipo])}
            {p.tipo_origine === 'dichiarato' ? t.dichiarato : t.dedotto}
            {p.motivo_classificazione ? `: ${p.motivo_classificazione}` : ''}
            {d.punteggio?.finita_il ? t.fattoIl(giornoDi(d.punteggio.finita_il, lingua)) : ''}
            {d.punteggio?.eta_ore !== null && d.punteggio?.eta_ore !== undefined ? t.aGiorni(Math.round(d.punteggio.eta_ore / 24)) : ''}
            {t.somma(numero(p.totale_grezzo, lingua))}
            {p.penalita_totali !== 0 ? t.penalita(p.penalita_totali) : ''}
            {p.limiti_applicati.length > 0 ? `. ${p.limiti_applicati.join('. ')}` : ''}.
            {fascia && intervallo ? t.fascia(fascia.etichetta, intervallo.da, intervallo.a) : ''}
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
  const lingua = useLingua()
  const t = ANALISI_REEL[lingua].schedaNumeri
  return (
    <div className="space-y-5" data-testid="reel-tab-numeri">
      <Sezione id="numeri" titolo={t.andato}>
        <NumeriReel r={r} />
      </Sezione>
      {eReel(r) ? (
        <Sezione id="verdetto" titolo={t.verdetto}>
          <Verdetto r={r} />
        </Sezione>
      ) : null}
      <Sezione id="lead" titolo={t.lead} nota={t.leadNota}>
        <p className="num text-sm" data-testid="reel-lead-valore">
          {lingua === 'it' ? parolaLead(r) : parolaLeadEn(r)}
        </p>
      </Sezione>
      {d ? (
        <Sezione id="calendario" titolo={t.piano}>
          <NelPiano d={d} puoScrivere={puoScrivere} onFatto={onFatto} />
        </Sezione>
      ) : null}
      {lettura?.scheda ? (
        <details className="rounded-lg border border-border p-3" data-testid="reel-scheda-visiva">
          <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium">{t.visto}</summary>
          <div className="pt-2">
            <SchedaVisivaVista s={lettura.scheda} />
          </div>
        </details>
      ) : null}
      {d ? (
        <details className="rounded-lg border border-border p-3" data-testid="reel-parlato-blocco">
          <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium">{t.parlato}</summary>
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
  const lingua = useLingua()
  const t = ANALISI_REEL[lingua].cosaFare
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
  }, lingua)
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
        {t.titolo}
      </h3>
      <div className="flex items-start gap-4">
        {fascia && totale !== null && totale !== undefined ? (
          <div className="shrink-0 text-center" data-testid="punteggio-pronto">
            <p className="num text-5xl leading-none font-semibold text-gold" data-testid="punteggio-totale">
              {totale}
            </p>
            <p className="num mt-1 text-xs text-muted-foreground">{t.su100}</p>
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
            {ultima?.stato === 'in_coda' ? t.inCoda : r.lettura_stato === 'in_coda' || r.lettura_stato === 'in_corso' ? t.guardando : t.facendo}{' '}
            {t.pochiMinuti}
          </span>
        </p>
      ) : null}
      {ultima?.stato === 'fallita' ? (
        <p className="flex items-start gap-2 text-sm text-status-critical" role="alert" data-testid="reel-fallita">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {ultima.errore ? traduciErroreReel(ultima.errore, lingua) : t.fallita}
        </p>
      ) : null}

      {p ? <ProblemiDaSistemare p={p} /> : null}

      {dettaglio === null ? (
        <p className="text-sm text-muted-foreground">{t.caricoResto}</p>
      ) : p && punteggio ? (
        <>
          {cf.azione === 'aggiungi_rifacimento' && p.rifacimento.script_riscritto && puoScrivere ? (
            <AggiungiRifacimento analisiId={punteggio.analisi_id} nato={punteggio.rifacimento_nel_calendario} onFatto={onRileggi} />
          ) : null}
          {cf.azione === 'vedi_rifacimento' ? (
            <Button type="button" className="h-11 w-full sm:w-auto" onClick={onVediRifacimento} data-testid="vedi-rifacimento">
              {t.vediRitocco}
            </Button>
          ) : null}
        </>
      ) : !p && !r.eliminato && !inLavoro ? (
        <div className="space-y-2" data-testid="punteggio-vuoto">
          {nonRiuscito ? (
            <p className="flex items-start gap-2 text-sm text-status-warning" role="status" data-testid="punteggio-non-riuscito">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {t.punteggioNonRiuscito}
            </p>
          ) : analisi ? (
            <p className="text-sm text-muted-foreground">{t.primaDelPunteggio}</p>
          ) : null}
          {puoAnalizzare ? (
            <>
              <p className="text-sm text-muted-foreground" data-testid="reel-senza-analisi">
                {analisi ? t.premendoPunteggio : t.premendoAnalizza} {t.costo(usdIn(COSTO_STIMATO_PER_REEL_USD, lingua))}
              </p>
              <AnalizzaReel mediaId={r.media_id as string} etichetta={etichettaAnalizza} onFatto={onRileggi} variante="default" />
            </>
          ) : (
            <p className="text-sm text-muted-foreground" data-testid="reel-senza-permesso">
              {t.senzaPermesso}
            </p>
          )}
        </div>
      ) : null}

      {p && pubblicabile && r.media_id ? (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-border pt-3">
          <p className="text-xs text-muted-foreground">{t.rifa(usdIn(COSTO_STIMATO_PER_REEL_USD, lingua))}</p>
          <AnalizzaReel mediaId={r.media_id} etichetta="Analizza di nuovo" onFatto={onRileggi} variante="ghost" />
        </div>
      ) : null}
      {p && !puoAnalizzare ? (
        <p className="border-t border-border pt-3 text-xs text-muted-foreground">{t.tuLeLeggi}</p>
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
  const lingua = useLingua()
  const t = ANALISI_REEL[lingua].scheda
  const r = dettaglio?.reel ?? riga
  const tipo = tipoDellaRiga(r)
  // a carousel or a photo has numbers and a place in the plan, but no verdict, score or analysis (the guide scores reels)
  const reel = eReel(r)
  const analisi: AnalisiLetta | null = dettaglio?.analisi ?? null
  const ultima = dettaglio?.ultima ?? null
  const lettura = dettaglio?.lettura ?? null
  const inCorso = ultima?.stato === 'in_coda' || ultima?.stato === 'in_corso'
  const leggendo = r.lettura_stato === 'in_coda' || r.lettura_stato === 'in_corso'
  const inLavoro = inCorso || leggendo
  const frasiFonti = lingua === 'it' ? fraseFonti : fraseFontiEn
  const fonti = lettura
    ? frasiFonti({ fotogrammi: lettura.fotogrammi, video: (lettura.video as never) ?? null, trascrizione_esito: lettura.trascrizione_esito as never, fonte_visione: lettura.fonte_visione as never })
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
              {titoloReel(r, lingua)}
            </SheetTitle>
            <SheetDescription className="num">
              {r.pubblicato_il ? quandoPubblicato(r.pubblicato_il, lingua) : ''}
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
            <span>{t.nonCaricato}</span>
            <Button type="button" variant="outline" className="h-11" onClick={onRileggi}>
              <RotateCw className="size-4" aria-hidden="true" />
              {t.riprova}
            </Button>
          </div>
        ) : null}

        {reel ? (
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
        ) : null}

        {dettaglio === null && !errore ? (
          <p className="text-sm text-muted-foreground" aria-busy="true">
            {t.carico}
          </p>
        ) : null}

        {dettaglio !== null || errore ? (
          <div ref={schedeRef} className="scroll-mt-24">
            {schede.length > 1 ? (
              <Tabs value={attiva} onValueChange={(v) => eSchedaReel(v) && vaiA(v)}>
                <TabsList variant="line" aria-label={t.dettagli} className="group-data-horizontal/tabs:h-11 w-full gap-0 rounded-none border-b border-border p-0">
                  {schede.map((s) => (
                    <TabsTrigger key={s} value={s} className="h-11 flex-1 rounded-none text-sm" data-testid={`scheda-${s}`}>
                      {s === 'rifare' ? t.rifare : s === 'perche' ? t.perche : t.numeri}
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
