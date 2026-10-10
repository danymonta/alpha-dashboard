'use client'

import { ChevronRight, Undo2 } from 'lucide-react'
import { toast } from 'sonner'

import { rimettiPost } from '@/app/(app)/marketing/instagram/actions'
import { ApriSuInstagram, CopertinaPost, Didascalia } from '@/components/marketing/instagram/copertina-post'
import { useElencoPost } from '@/components/marketing/instagram/uso-elenco'
import { Button } from '@/components/ui/button'
import type { PostInstagram } from '@/lib/marketing/post-del-contenuto'
import { giornoPost, rigaPost } from '@/lib/marketing/parole-post'

/**
 * «Fuori dal calendario» (1.33.0), closed by default: the posts left out on
 * purpose (a repost, a personal post), each with «Rimetti», which makes it
 * work again and redoes its proposals.
 */
export function PostEsclusi({ post }: { post: readonly PostInstagram[] }) {
  const { visibili, inCorso, annuncio, titolo, registra, esegui } = useElencoPost(post)

  function rimetti(p: PostInstagram) {
    esegui(
      p,
      () => rimettiPost({ shortcode: p.shortcode }),
      {
        fatto: () => `Post del ${giornoPost(p.giorno)} di nuovo da collegare.`,
        nonFatto: `Post del ${giornoPost(p.giorno)} non rimesso.`,
      },
      () => toast.success('Rimesso: lo trovi in «Da collegare».'),
    )
  }

  if (post.length === 0) return null

  return (
    <section aria-labelledby="titolo-esclusi">
      <details className="group rounded-xl bg-card">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-xl px-3 text-base font-semibold focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none [&::-webkit-details-marker]:hidden">
          <ChevronRight className="size-4 shrink-0 transition-transform group-open:rotate-90" aria-hidden="true" />
          <h2 id="titolo-esclusi" ref={titolo} tabIndex={-1} className="outline-none">
            Fuori dal calendario <span className="num">({visibili.length})</span>
          </h2>
        </summary>
        <p role="status" aria-live="polite" className="sr-only">
          {annuncio}
        </p>
        {visibili.length === 0 ? (
          <p className="px-3 pb-3 text-sm text-muted-foreground">Nessun post fuori dal calendario.</p>
        ) : (
          <ul className="divide-y divide-border border-t border-border">
            {visibili.map((p) => (
              <li key={p.shortcode} className="flex min-w-0 flex-col gap-2 p-3 sm:flex-row sm:items-center" data-post={p.shortcode}>
                <div className="flex min-w-0 flex-1 gap-3">
                  <CopertinaPost url={p.copertina_url} tipo={p.tipo} />
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <h3 ref={registra(p.shortcode)} tabIndex={-1} className="num text-sm font-medium outline-none">
                      {rigaPost(p.giorno, p.tipo)}
                    </h3>
                    <Didascalia testo={p.didascalia} />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 sm:justify-end">
                  <ApriSuInstagram href={p.permalink} />
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11"
                    disabled={inCorso}
                    aria-label={`Rimetti il post del ${giornoPost(p.giorno)}`}
                    onClick={() => rimetti(p)}
                  >
                    <Undo2 className="size-4" aria-hidden="true" />
                    Rimetti
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </details>
    </section>
  )
}
