'use client'

import { CalendarCheck, Link2, LoaderCircle, TriangleAlert, Unlink } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useId, useLayoutEffect, useRef, useState, useTransition, type MouseEvent, type ReactNode, type Ref } from 'react'
import { toast } from 'sonner'

import { modificaCampoContenuto } from '@/app/(app)/marketing/contenuti/actions'
import { annullaScollega, scollegaPost } from '@/app/(app)/marketing/pubblicati/actions'
import { useOpzioniToast, usePannello } from '@/components/marketing/contesto-pannello'
import {
  ApriSuInstagram,
  AZIONE_TOAST,
  CopertinaPost,
  Didascalia,
} from '@/components/marketing/instagram/copertina-post'
import { ParlatoDelPost } from '@/components/marketing/instagram/parlato-post'
import { PunteggioDelPost } from '@/components/marketing/instagram/punteggio-del-post'
import { Button } from '@/components/ui/button'
import { useFormato, useLingua } from '@/components/i18n/lingua-provider'
import { traduciErroreContenuto } from '@/lib/i18n/testi/contenuto'
import { POST_INSTAGRAM } from '@/lib/i18n/testi/post-instagram'
import { motiviInParole, quandoPubblicato } from '@/lib/marketing/parole-post'
import type { PostDelContenuto as DatiPost, PostInstagram } from '@/lib/marketing/post-del-contenuto'

/**
 * «Post su Instagram», under the properties of a content, in the panel and on
 * its own page (1.33.0, Dany: «volendo si può collegare e linkare il post da
 * instagram per fare comunicare le due parti»). Linked: the post, how it was
 * linked, «Usa la data di Instagram» when the Post Date differs, «Scollega».
 * Nothing otherwise (the URL field says it all: pasting the post's link links
 * it; the proposals of the run are not shown any more, 25/10/2026). A read
 * that failed says so and leaves the rest of the panel as it is.
 *
 * Every tap shows its result at once and goes back on failure (toast).
 * Inside the panel, the panel's copy of the content follows each write.
 * The tapped button stays focusable while busy, and once the action is done
 * the focus goes to the block's title in the same commit that swaps the view
 * (the button is gone after «Collega», «Usa la data di Instagram» and
 * «Scollega»): never <body>, which inside the panel's dialog would leave a
 * keyboard or screen reader user nowhere. A failure leaves it on the button.
 */
export function PostDelContenuto({
  contenutoId,
  nome,
  postDate,
  dati,
  puoModificare = true,
  onRiprova,
}: {
  contenutoId: string
  nome: string
  postDate: string | null
  dati: DatiPost
  puoModificare?: boolean
  /** «Riprova» after a failed read; default: the page reads again */
  onRiprova?: () => void
}) {
  const router = useRouter()
  const pannello = usePannello()
  const opzioniToast = useOpzioniToast()
  const lingua = useLingua()
  const t = POST_INSTAGRAM[lingua].post
  const { formatData } = useFormato()
  const titoloId = useId()
  const titolo = useRef<HTMLHeadingElement>(null)
  /** The button of the last tap, and whether the focus should leave it for the title. */
  const toccato = useRef<HTMLElement | null>(null)
  const fuocoAlTitolo = useRef(false)
  const [inCorso, avvia] = useTransition()
  const [inVolo, setInVolo] = useState<string | null>(null)
  // what the person's own taps made of the server's block, until the server says it again
  const [locale, setLocale] = useState<{ da: DatiPost; vista: DatiPost } | null>(null)
  const vista = locale && locale.da === dati ? locale.vista : dati
  const mostra = (nuova: DatiPost) => setLocale({ da: dati, vista: nuova })
  /** Unlinked from here: the block stays with a line, so the focus has a place to go. */
  const [scollegatoDa, setScollegatoDa] = useState<string | null>(null)
  if (scollegatoDa !== null && scollegatoDa !== contenutoId) setScollegatoDa(null)

  useLayoutEffect(() => {
    if (!fuocoAlTitolo.current || !titolo.current) return
    fuocoAlTitolo.current = false
    const attivo = document.activeElement
    // the person moved on to another field meanwhile: the focus stays there
    if (attivo && attivo !== document.body && attivo.isConnected && attivo !== toccato.current) return
    titolo.current.focus()
  })

  function ricordaTocco(e: MouseEvent<HTMLElement>) {
    toccato.current = e.currentTarget
  }

  if (vista.stato === 'nessuno' && scollegatoDa !== contenutoId) return null

  if (vista.stato === 'nessuno') {
    return (
      <Riquadro titoloId={titoloId} titoloRef={titolo}>
        <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
          <Unlink className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {t.scollegato(nome)}
        </p>
      </Riquadro>
    )
  }

  if (vista.stato === 'errore') {
    return (
      <Riquadro titoloId={titoloId} titoloRef={titolo}>
        <div role="alert" className="flex flex-wrap items-center gap-2 text-sm">
          <TriangleAlert className="size-4 shrink-0 text-status-critical" aria-hidden="true" />
          <span>{t.nonCaricato}</span>
          <Button type="button" variant="outline" className="h-11" onClick={() => (onRiprova ? onRiprova() : router.refresh())}>
            {t.riprova}
          </Button>
        </div>
      </Riquadro>
    )
  }

  function scollega(post: PostInstagram) {
    const prima = vista
    setInVolo(post.shortcode)
    setScollegatoDa(contenutoId)
    avvia(async () => {
      mostra({ stato: 'nessuno' })
      let esito: Awaited<ReturnType<typeof scollegaPost>>
      try {
        esito = await scollegaPost({ shortcode: post.shortcode, contenuto_id: contenutoId })
      } catch {
        esito = { ok: false, errore: t.connessione }
      }
      if (!esito.ok) {
        setInVolo(null)
        setScollegatoDa(null)
        mostra(prima)
        toast.error(traduciErroreContenuto(esito.errore, lingua), opzioniToast)
        return
      }
      fuocoAlTitolo.current = true
      setInVolo(null)
      if (esito.versione) pannello?.aggiornaCampo(contenutoId, 'url', null, esito.versione)
      toast.success(t.scollegato(nome), {
        ...opzioniToast,
        duration: 6000,
        action: {
          label: t.annulla,
          onClick: () => {
            // the sign «Collegato da solo», if the run made the link, comes back by itself (database)
            void annullaScollega({ shortcode: post.shortcode, contenuto_id: contenutoId }).then(
              (r) =>
                r.ok ? toast.success(t.diNuovo, opzioniToast) : toast.error(traduciErroreContenuto(r.errore, lingua), opzioniToast),
              () => toast.error(t.connessione, opzioniToast),
            )
          },
        },
        classNames: { actionButton: AZIONE_TOAST },
      })
    })
  }

  function usaData(giorno: string) {
    setInVolo('data')
    avvia(async () => {
      let esito: Awaited<ReturnType<typeof modificaCampoContenuto>>
      try {
        esito = await modificaCampoContenuto({ id: contenutoId, campo: 'post_date', valore: giorno, prima: postDate })
      } catch {
        esito = { ok: false, errore: t.connessione }
      }
      if (!esito.ok) {
        setInVolo(null)
        if (esito.cambiato) pannello?.aggiornaCampo(contenutoId, 'post_date', esito.cambiato.valore, esito.cambiato.versione)
        toast.error(traduciErroreContenuto(esito.errore, lingua), opzioniToast)
        return
      }
      // the row of the two dates leaves: the focus goes to the title
      fuocoAlTitolo.current = true
      setInVolo(null)
      pannello?.aggiornaCampo(contenutoId, 'post_date', esito.valore, esito.versione)
      toast.success(t.postDate(formatData(giorno)), opzioniToast)
    })
  }

  if (vista.stato === 'collegato') {
    const { post } = vista
    const dataDiversa = post.giorno !== postDate
    return (
      <Riquadro titoloId={titoloId} titoloRef={titolo}>
        <div className="flex min-w-0 gap-3">
          <CopertinaPost url={post.copertina_url} tipo={post.tipo} />
          <div className="min-w-0 flex-1 space-y-1.5">
            <p className="text-sm">
              {t.pubblicato} <span className="num">{quandoPubblicato(post.pubblicato_il, lingua)}</span>
            </p>
            {post.eliminato ? (
              <p className="flex items-start gap-1.5 text-sm text-rosso-testo">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                {t.eliminato}
              </p>
            ) : null}
            <DidascaliaEspandibile testo={post.didascalia} />
            <PunteggioDelPost tipo={post.tipo} mediaId={post.media_id} punteggio={vista.punteggio} lingua={lingua} />
            {post.tipo === 'reel' ? <ParlatoDelPost mediaId={post.media_id} className="-ml-2" /> : null}
            {vista.daSolo ? (
              <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
                <Link2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                {vista.motivi.length > 0 ? t.daSolo(motiviInParole(vista.motivi, 'e', lingua)) : t.daSoloSemplice}
              </p>
            ) : null}
          </div>
        </div>
        {dataDiversa ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-muted/50 px-3 py-2 text-sm">
            <span className="num">
              {postDate ? t.dueDate(formatData(postDate), formatData(post.giorno)) : t.senzaPostDate(formatData(post.giorno))}
            </span>
            {puoModificare ? (
              <Button
                type="button"
                variant="outline"
                className="h-11 aria-disabled:opacity-70"
                disabled={inCorso}
                focusableWhenDisabled
                onClick={(e) => {
                  ricordaTocco(e)
                  usaData(post.giorno)
                }}
              >
                {inVolo === 'data' ? (
                  <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <CalendarCheck className="size-4" aria-hidden="true" />
                )}
                {t.usaData}
              </Button>
            ) : null}
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <ApriSuInstagram href={post.permalink} />
          {puoModificare ? (
            <Button
              type="button"
              variant="ghost"
              className="h-11 aria-disabled:opacity-70"
              disabled={inCorso}
              focusableWhenDisabled
              aria-label={t.scollegaDa(nome)}
              onClick={(e) => {
                ricordaTocco(e)
                scollega(post)
              }}
            >
              {inVolo === post.shortcode ? (
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Unlink className="size-4" aria-hidden="true" />
              )}
              {t.scollega}
            </Button>
          ) : null}
        </div>
      </Riquadro>
    )
  }

  return null
}

function Riquadro({
  titoloId,
  titoloRef,
  children,
}: {
  titoloId: string
  /** Where the focus goes after a tap that takes its button away. */
  titoloRef: Ref<HTMLHeadingElement>
  children: ReactNode
}) {
  const t = POST_INSTAGRAM[useLingua()].post
  return (
    <section aria-labelledby={titoloId} className="space-y-3 rounded-xl border border-border p-3">
      <h3 ref={titoloRef} id={titoloId} tabIndex={-1} className="text-sm font-medium outline-none">
        {t.titolo}
      </h3>
      {children}
    </section>
  )
}

/** The first three lines, and «Mostra tutto» for a longer caption. */
function DidascaliaEspandibile({ testo }: { testo: string | null }) {
  const [tutta, setTutta] = useState(false)
  const t = POST_INSTAGRAM[useLingua()].post
  const lunga = Boolean(testo && (testo.split('\n').length > 3 || testo.length > 180))
  return (
    <div>
      {tutta && testo ? (
        <p className="text-sm break-words whitespace-pre-line" lang="it">
          {testo}
        </p>
      ) : (
        <Didascalia testo={testo} righe={3} />
      )}
      {lunga ? (
        <Button
          type="button"
          variant="link"
          className="h-11 px-0"
          aria-expanded={tutta}
          onClick={() => setTutta((v) => !v)}
        >
          {tutta ? t.mostraMeno : t.mostraTutto}
        </Button>
      ) : null}
    </div>
  )
}
