'use client'

import { CalendarCheck, Link2, LoaderCircle, TriangleAlert, Unlink } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useId, useLayoutEffect, useRef, useState, useTransition, type MouseEvent, type ReactNode, type Ref } from 'react'
import { toast } from 'sonner'

import { modificaCampoContenuto } from '@/app/(app)/marketing/contenuti/actions'
import { annullaCollega, annullaScollega, collegaPost, scollegaPost } from '@/app/(app)/marketing/instagram/actions'
import { useOpzioniToast, usePannello } from '@/components/marketing/contesto-pannello'
import {
  ApriSuInstagram,
  AZIONE_TOAST,
  CopertinaPost,
  Didascalia,
} from '@/components/marketing/instagram/copertina-post'
import { Button } from '@/components/ui/button'
import type { StatusContenuto } from '@/lib/marketing/etichette'
import { etichettaCollega, giornoPost, motiviInParole, quandoPubblicato, rigaPost } from '@/lib/marketing/parole-post'
import type { PostDelContenuto as DatiPost, PostInstagram } from '@/lib/marketing/post-del-contenuto'
import { formatData } from '@/lib/format'

const CONNESSIONE = 'Connessione assente. Riprova.'

/**
 * «Post su Instagram», under the properties of a content, in the panel and on
 * its own page (1.33.0, Dany: «volendo si può collegare e linkare il post da
 * instagram per fare comunicare le due parti»). Linked: the post, how it was
 * linked, «Usa la data di Instagram» when the Post Date differs, «Scollega».
 * Not linked with proposals: «Forse è questo post:» and «Collega». Nothing
 * otherwise (the URL field says it all). A read that failed says so and
 * leaves the rest of the panel as it is.
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
  stato,
  dati,
  puoModificare = true,
  onRiprova,
}: {
  contenutoId: string
  nome: string
  postDate: string | null
  /** the content's Status: «Collega e segna Posted» when not yet posted */
  stato?: StatusContenuto
  dati: DatiPost
  puoModificare?: boolean
  /** «Riprova» after a failed read; default: the page reads again */
  onRiprova?: () => void
}) {
  const router = useRouter()
  const pannello = usePannello()
  const opzioniToast = useOpzioniToast()
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
          Scollegato: non lo ripropongo per «{nome}».
        </p>
      </Riquadro>
    )
  }

  if (vista.stato === 'errore') {
    return (
      <Riquadro titoloId={titoloId} titoloRef={titolo}>
        <div role="alert" className="flex flex-wrap items-center gap-2 text-sm">
          <TriangleAlert className="size-4 shrink-0 text-status-critical" aria-hidden="true" />
          <span>Il post di Instagram non si è caricato.</span>
          <Button type="button" variant="outline" className="h-11" onClick={() => (onRiprova ? onRiprova() : router.refresh())}>
            Riprova
          </Button>
        </div>
      </Riquadro>
    )
  }

  function collega(post: PostInstagram) {
    const prima = vista
    setInVolo(post.shortcode)
    avvia(async () => {
      mostra({ stato: 'collegato', post, daSolo: false, motivi: [] })
      let esito: Awaited<ReturnType<typeof collegaPost>>
      try {
        esito = await collegaPost({ shortcode: post.shortcode, contenuto_id: contenutoId })
      } catch {
        esito = { ok: false, errore: CONNESSIONE }
      }
      if (!esito.ok) {
        setInVolo(null)
        mostra(prima)
        toast.error(esito.errore, opzioniToast)
        return
      }
      // the button leaves with this view: the focus goes to the title in the next commit
      fuocoAlTitolo.current = true
      setInVolo(null)
      pannello?.aggiornaCampo(contenutoId, 'url', esito.url, esito.versione)
      if (esito.stato !== esito.prima.stato) pannello?.aggiornaCampo(contenutoId, 'stato', esito.stato, esito.versione)
      if (esito.prima.postDateScritta) pannello?.aggiornaCampo(contenutoId, 'post_date', esito.post_date, esito.versione)
      const annulla = {
        shortcode: post.shortcode,
        contenuto_id: contenutoId,
        prima: esito.stato !== esito.prima.stato ? esito.prima.stato : undefined,
        post_date: esito.prima.postDateScritta ? esito.post_date : undefined,
      }
      toast.success(`Collegato a «${nome}».`, {
        ...opzioniToast,
        duration: 6000,
        action: {
          label: 'Annulla',
          onClick: () => {
            void annullaCollega(annulla).then(
              (r) => (r.ok ? toast.success('Collegamento annullato.', opzioniToast) : toast.error(r.errore, opzioniToast)),
              () => toast.error(CONNESSIONE, opzioniToast),
            )
          },
        },
        classNames: { actionButton: AZIONE_TOAST },
      })
    })
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
        esito = { ok: false, errore: CONNESSIONE }
      }
      if (!esito.ok) {
        setInVolo(null)
        setScollegatoDa(null)
        mostra(prima)
        toast.error(esito.errore, opzioniToast)
        return
      }
      fuocoAlTitolo.current = true
      setInVolo(null)
      if (esito.versione) pannello?.aggiornaCampo(contenutoId, 'url', null, esito.versione)
      toast.success(`Scollegato: non lo ripropongo per «${nome}».`, {
        ...opzioniToast,
        duration: 6000,
        action: {
          label: 'Annulla',
          onClick: () => {
            // the sign «Collegato da solo», if the run made the link, comes back by itself (database)
            void annullaScollega({ shortcode: post.shortcode, contenuto_id: contenutoId }).then(
              (r) => (r.ok ? toast.success('Post di nuovo collegato.', opzioniToast) : toast.error(r.errore, opzioniToast)),
              () => toast.error(CONNESSIONE, opzioniToast),
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
        esito = { ok: false, errore: CONNESSIONE }
      }
      if (!esito.ok) {
        setInVolo(null)
        if (esito.cambiato) pannello?.aggiornaCampo(contenutoId, 'post_date', esito.cambiato.valore, esito.cambiato.versione)
        toast.error(esito.errore, opzioniToast)
        return
      }
      // the row of the two dates leaves: the focus goes to the title
      fuocoAlTitolo.current = true
      setInVolo(null)
      pannello?.aggiornaCampo(contenutoId, 'post_date', esito.valore, esito.versione)
      toast.success(`Post Date: ${formatData(giorno)}`, opzioniToast)
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
              Pubblicato su Instagram <span className="num">{quandoPubblicato(post.pubblicato_il)}</span>
            </p>
            {post.eliminato ? (
              <p className="flex items-start gap-1.5 text-sm text-rosso-testo">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                Il post non è più su Instagram (eliminato o archiviato).
              </p>
            ) : null}
            <DidascaliaEspandibile testo={post.didascalia} />
            {vista.daSolo ? (
              <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
                <Link2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                {vista.motivi.length > 0
                  ? `Collegato da solo: ${motiviInParole(vista.motivi, 'e')}.`
                  : 'Collegato da solo.'}
              </p>
            ) : null}
          </div>
        </div>
        {dataDiversa ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-muted/50 px-3 py-2 text-sm">
            <span className="num">
              {postDate ? `Post Date ${formatData(postDate)}, ` : 'Senza Post Date, '}su Instagram {formatData(post.giorno)}
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
                Usa la data di Instagram
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
              aria-label={`Scollega il post da «${nome}»`}
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
              Scollega
            </Button>
          ) : null}
        </div>
      </Riquadro>
    )
  }

  return (
    <Riquadro titoloId={titoloId} titoloRef={titolo}>
      <p className="text-sm text-muted-foreground">Forse è questo post:</p>
      <ul className="space-y-3">
        {vista.proposte.map((post, i) => (
          <li key={post.shortcode} className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start">
            <div className="flex min-w-0 flex-1 gap-3">
              <CopertinaPost url={post.copertina_url} tipo={post.tipo} />
              <div className="min-w-0 flex-1 space-y-1">
                <p className="num text-sm font-medium">{rigaPost(post.giorno, post.tipo)}</p>
                <Didascalia testo={post.didascalia} />
                {post.motivi.length > 0 ? (
                  <p className="text-xs text-muted-foreground">{motiviInParole(post.motivi)}</p>
                ) : null}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 sm:flex-col sm:items-end">
              {puoModificare ? (
                <Button
                  type="button"
                  variant={i === 0 ? 'default' : 'outline'}
                  className="h-11 aria-disabled:opacity-70"
                  disabled={inCorso}
                  focusableWhenDisabled
                  aria-label={`${etichettaCollega(stato)}: il post del ${giornoPost(post.giorno)}`}
                  onClick={(e) => {
                    ricordaTocco(e)
                    collega(post)
                  }}
                >
                  {inVolo === post.shortcode ? (
                    <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Link2 className="size-4" aria-hidden="true" />
                  )}
                  {etichettaCollega(stato)}
                </Button>
              ) : null}
              <ApriSuInstagram href={post.permalink} />
            </div>
          </li>
        ))}
      </ul>
    </Riquadro>
  )
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
  return (
    <section aria-labelledby={titoloId} className="space-y-3 rounded-xl border border-border p-3">
      <h3 ref={titoloRef} id={titoloId} tabIndex={-1} className="text-sm font-medium outline-none">
        Post su Instagram
      </h3>
      {children}
    </section>
  )
}

/** The first three lines, and «Mostra tutto» for a longer caption. */
function DidascaliaEspandibile({ testo }: { testo: string | null }) {
  const [tutta, setTutta] = useState(false)
  const lunga = Boolean(testo && (testo.split('\n').length > 3 || testo.length > 180))
  return (
    <div>
      {tutta && testo ? (
        <p className="text-sm break-words whitespace-pre-line">{testo}</p>
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
          {tutta ? 'Mostra meno' : 'Mostra tutto'}
        </Button>
      ) : null}
    </div>
  )
}
