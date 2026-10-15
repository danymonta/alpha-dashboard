'use client'

import { Link2, TriangleAlert, Unlink } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { annullaScollega, scollegaPost } from '@/app/(app)/marketing/instagram/actions'
import { ApriSuInstagram, AZIONE_TOAST, CopertinaPost } from '@/components/marketing/instagram/copertina-post'
import { ParlatoDelPost } from '@/components/marketing/instagram/parlato-post'
import type { PostCollegato } from '@/components/marketing/instagram/tipi'
import { useElencoPost } from '@/components/marketing/instagram/uso-elenco'
import { LinkContenuto } from '@/components/marketing/link-contenuto'
import { Button } from '@/components/ui/button'
import { giornoPost, rigaPost } from '@/lib/marketing/parole-post'

const CONNESSIONE = 'Connessione assente. Riprova.'
/** The most recent ones first; «Mostra tutti» the rest. */
const PRIMI = 30

/**
 * «Collegati» (1.33.0): every post with its content, the most recent first.
 * «Collegato da solo» when the run linked it; «Non più su Instagram» for a
 * post deleted or archived since. «Scollega» leaves a "no" the run never
 * redoes; the toast's «Annulla» puts the post back, with its «Collegato
 * da solo» when the run had made the link (the database kept it: the toast
 * sends only the pair).
 */
export function PostCollegati({ post }: { post: readonly PostCollegato[] }) {
  const [tutti, setTutti] = useState(false)
  const { visibili, inCorso, annuncio, titolo, registra, esegui } = useElencoPost(post)
  const mostrati = tutti ? visibili : visibili.slice(0, PRIMI)

  function scollega(p: PostCollegato) {
    esegui(
      p,
      () => scollegaPost({ shortcode: p.shortcode, contenuto_id: p.contenuto_id }),
      {
        fatto: () => `Post del ${giornoPost(p.giorno)} scollegato da «${p.contenuto_nome}».`,
        nonFatto: `Post del ${giornoPost(p.giorno)} non scollegato.`,
      },
      () => {
        toast.success(`Scollegato: non lo ripropongo per «${p.contenuto_nome}».`, {
          duration: 6000,
          action: {
            label: 'Annulla',
            onClick: () => {
              // the sign «Collegato da solo», if the run made the link, comes back by itself (database)
              const annulla = { shortcode: p.shortcode, contenuto_id: p.contenuto_id }
              void annullaScollega(annulla).then(
                (r) => (r.ok ? toast.success('Post di nuovo collegato.') : toast.error(r.errore)),
                () => toast.error(CONNESSIONE),
              )
            },
          },
          classNames: { actionButton: AZIONE_TOAST },
        })
      },
    )
  }

  return (
    <section aria-labelledby="titolo-collegati" className="space-y-3">
      <h2 id="titolo-collegati" ref={titolo} tabIndex={-1} className="text-base font-semibold outline-none">
        Collegati <span className="num">({visibili.length})</span>
      </h2>
      <p role="status" aria-live="polite" className="sr-only">
        {annuncio}
      </p>
      {visibili.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
          Ancora nessun post collegato a un contenuto.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-xl bg-card">
          {mostrati.map((p) => (
            <li key={p.shortcode} className="flex min-w-0 flex-col gap-2 p-3 sm:flex-row sm:items-center" data-post={p.shortcode}>
              <div className="flex min-w-0 flex-1 gap-3">
                <CopertinaPost url={p.copertina_url} tipo={p.tipo} />
                <div className="min-w-0 flex-1 space-y-0.5">
                  <h3 ref={registra(p.shortcode)} tabIndex={-1} className="num text-xs text-muted-foreground outline-none">
                    {rigaPost(p.giorno, p.tipo)}
                  </h3>
                  <LinkContenuto
                    id={p.contenuto_id}
                    className="inline-flex min-h-11 items-center rounded-md text-sm font-medium break-words hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                  >
                    {p.contenuto_nome}
                  </LinkContenuto>
                  {p.daSolo ? (
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Link2 className="size-3.5 shrink-0" aria-hidden="true" />
                      Collegato da solo
                    </p>
                  ) : null}
                  {p.eliminato ? (
                    <p className="flex items-center gap-1.5 text-xs text-rosso-testo">
                      <TriangleAlert className="size-3.5 shrink-0" aria-hidden="true" />
                      Non più su Instagram
                    </p>
                  ) : null}
                  {p.tipo === 'reel' ? <ParlatoDelPost mediaId={p.media_id} className="-ml-2" /> : null}
                </div>
              </div>
              <div className="flex flex-wrap gap-2 sm:justify-end">
                {p.eliminato ? null : <ApriSuInstagram href={p.permalink} />}
                <Button
                  type="button"
                  variant="ghost"
                  className="h-11"
                  disabled={inCorso}
                  aria-label={`Scollega il post da «${p.contenuto_nome}»`}
                  onClick={() => scollega(p)}
                >
                  <Unlink className="size-4" aria-hidden="true" />
                  Scollega
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {!tutti && visibili.length > PRIMI ? (
        <Button type="button" variant="outline" className="h-11" onClick={() => setTutti(true)}>
          Mostra tutti ({visibili.length})
        </Button>
      ) : null}
    </section>
  )
}
