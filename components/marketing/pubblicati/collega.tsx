'use client'

import { Link2, LoaderCircle, Search } from 'lucide-react'
import { createContext, useContext, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { toast } from 'sonner'

import { annullaCollega, collegaPost } from '@/app/(app)/marketing/pubblicati/actions'
import { useOpzioniToast } from '@/components/marketing/contesto-pannello'
import { AZIONE_TOAST } from '@/components/marketing/instagram/copertina-post'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useFormato, useLingua } from '@/components/i18n/lingua-provider'
import { traduciErroreContenuto } from '@/lib/i18n/testi/contenuto'
import { POST_INSTAGRAM } from '@/lib/i18n/testi/post-instagram'
import { giorniTra, tipiCompatibili, type TipoPost } from '@/lib/marketing/abbinamento'
import { ETICHETTA_MODELLO, ETICHETTA_STATUS, type StatusContenuto, type TipoContenuto } from '@/lib/marketing/etichette'
import { etichettaCollega, giornoPost } from '@/lib/marketing/parole-post'

/** At most this many rows at once: the search finds the others. */
const MOSTRATI_MAX = 50

/** A content of the calendar still without a post, as «Collega» offers it. */
export type ContenutoLibero = {
  id: string
  nome: string
  tipo: TipoContenuto
  stato: StatusContenuto
  post_date: string | null
}

/** The post a «Collega» is for. */
export type PostPerCollegare = { shortcode: string; giorno: string; tipo: TipoPost }

type Valore = { contenuti: readonly ContenutoLibero[]; puoScrivere: boolean }
const Contesto = createContext<Valore>({ contenuti: [], puoScrivere: false })

/** The contents without a post, for the table's sheet and the reel panel's block (the page read them once). */
export function ProviderCollega({ contenuti, puoScrivere, children }: Valore & { children: ReactNode }) {
  const valore = useMemo(() => ({ contenuti, puoScrivere }), [contenuti, puoScrivere])
  return <Contesto.Provider value={valore}>{children}</Contesto.Provider>
}

export function useCollega(): Valore {
  return useContext(Contesto)
}

/** Lower case, no accents: «perché» finds «Perche». */
function normalizza(testo: string): string {
  return testo.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().trim()
}

/**
 * «Collega» (and its «Annulla»): the post's permalink goes in the content's URL with the same write as ever
 * (collegaPost, the permalink read on the server from instagram_contenuti, a content not yet Posted becomes Posted).
 * The toast says it and has «Annulla». `inVolo` is the shortcode being linked. The page redraws by itself: every
 * action revalidates the Marketing area.
 */
export function useCollegaPost() {
  const opzioniToast = useOpzioniToast()
  const lingua = useLingua()
  const t = POST_INSTAGRAM[lingua].collega
  const [inVolo, setInVolo] = useState<string | null>(null)

  async function collega(post: { shortcode: string }, contenuto: { id: string; nome: string }): Promise<boolean> {
    if (inVolo) return false
    setInVolo(post.shortcode)
    try {
      const esito = await collegaPost({ shortcode: post.shortcode, contenuto_id: contenuto.id })
      if (!esito.ok) {
        toast.error(traduciErroreContenuto(esito.errore, lingua), opzioniToast)
        return false
      }
      const annulla = {
        shortcode: post.shortcode,
        contenuto_id: contenuto.id,
        prima: esito.stato !== esito.prima.stato ? esito.prima.stato : undefined,
        post_date: esito.prima.postDateScritta ? esito.post_date : undefined,
      }
      toast.success(t.collegatoA(contenuto.nome), {
        ...opzioniToast,
        description: esito.stato !== esito.prima.stato ? t.oraPosted : undefined,
        duration: 6000,
        action: {
          label: t.annulla,
          onClick: () => {
            void annullaCollega(annulla).then(
              (r) => (r.ok ? toast.success(t.annullato, opzioniToast) : toast.error(traduciErroreContenuto(r.errore, lingua), opzioniToast)),
              () => toast.error(t.connessione, opzioniToast),
            )
          },
        },
        classNames: { actionButton: AZIONE_TOAST },
      })
      return true
    } catch {
      toast.error(t.connessione, opzioniToast)
      return false
    } finally {
      setInVolo(null)
    }
  }

  return { collega, inVolo }
}

/**
 * The search among the contents of the calendar still without a post, for one post: only the ones of a compatible
 * type (a Reel Topic for a reel, a Carousel Topic for a carousel or a photo), the closest to the day of the post first,
 * searched by Name; each with «Collega» (or «Collega e segna Posted» on a content not yet posted). No proposal, no
 * guess: the person picks.
 */
export function ElencoPerCollegare({
  post,
  onFatto,
  autoFocus = false,
}: {
  post: PostPerCollegare
  /** after a link that went through */
  onFatto?: () => void
  autoFocus?: boolean
}) {
  const { contenuti } = useCollega()
  const { collega, inVolo } = useCollegaPost()
  const lingua = useLingua()
  const t = POST_INSTAGRAM[lingua].collega
  const { formatData } = useFormato()
  const [cerca, setCerca] = useState('')
  const idCerca = useId()
  const campo = useRef<HTMLInputElement>(null)

  const ordinati = useMemo(() => {
    const distanza = (c: ContenutoLibero) => (c.post_date ? giorniTra(post.giorno, c.post_date) : Number.POSITIVE_INFINITY)
    return contenuti
      .filter((c) => tipiCompatibili(post.tipo, c.tipo))
      .sort((a, b) => distanza(a) - distanza(b) || a.nome.localeCompare(b.nome, 'it'))
  }, [contenuti, post.giorno, post.tipo])

  const parole = normalizza(cerca)
  const trovati = parole ? ordinati.filter((c) => normalizza(c.nome).includes(parole)) : ordinati
  const mostrati = trovati.slice(0, MOSTRATI_MAX)
  const modello = post.tipo === 'reel' ? 'Reel Topic' : 'Carousel Topic'

  return (
    <div className="space-y-3" data-testid="elenco-per-collegare">
      <div className="space-y-1.5">
        <label htmlFor={idCerca} className="text-sm font-medium">
          {t.cerca}
        </label>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            ref={campo}
            id={idCerca}
            type="search"
            value={cerca}
            onChange={(e) => setCerca(e.currentTarget.value)}
            autoComplete="off"
            autoFocus={autoFocus}
            className="h-11 pl-9"
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground" role="status">
        {ordinati.length === 0
          ? t.nessunModello(modello)
          : trovati.length === 0
            ? t.nessunNome
            : trovati.length > MOSTRATI_MAX
              ? t.parziali(MOSTRATI_MAX, trovati.length)
              : trovati.length === 1
                ? t.uno
                : t.molti(trovati.length)}
      </p>
      {mostrati.length > 0 ? (
        <ul className="divide-y divide-border rounded-xl bg-card">
          {mostrati.map((c) => {
            const etichetta = etichettaCollega(c.stato, lingua)
            return (
              <li key={c.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center" data-contenuto-libero={c.id}>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium break-words" lang="it">
                    {c.nome}
                  </p>
                  <p className="num text-xs text-muted-foreground">
                    {ETICHETTA_MODELLO[c.tipo]} · {c.post_date ? t.postDate(formatData(c.post_date)) : t.senzaPostDate} ·{' '}
                    {ETICHETTA_STATUS[c.stato]}
                  </p>
                </div>
                <Button
                  type="button"
                  className="h-11 shrink-0"
                  disabled={inVolo !== null}
                  aria-busy={inVolo === post.shortcode || undefined}
                  aria-label={t.collegaA(etichetta, c.nome)}
                  onClick={() => {
                    void collega(post, c).then((riuscito) => {
                      if (riuscito) onFatto?.()
                    })
                  }}
                >
                  {inVolo === post.shortcode ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Link2 className="size-4" aria-hidden="true" />}
                  {etichetta}
                </Button>
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}

/**
 * The sheet of «Collega» in the table: one for the whole page, opened by the row's button. It closes when the post
 * is linked (the toast has «Annulla», the table redraws with the link).
 */
export function FoglioCollega({ post, onChiudi }: { post: PostPerCollegare | null; onChiudi: () => void }) {
  const lingua = useLingua()
  const t = POST_INSTAGRAM[lingua].collega
  return (
    <Sheet open={post !== null} onOpenChange={(aperto) => !aperto && onChiudi()}>
      <SheetContent side="right" className="overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-md" data-testid="foglio-collega">
        <SheetHeader>
          <SheetTitle>{t.titolo}</SheetTitle>
          <SheetDescription>
            {post ? t.perIlPost(giornoPost(post.giorno, lingua)) : ''}
          </SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-6">{post ? <ElencoPerCollegare key={post.shortcode} post={post} onFatto={onChiudi} /> : null}</div>
      </SheetContent>
    </Sheet>
  )
}
