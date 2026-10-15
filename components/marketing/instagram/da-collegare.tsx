'use client'

import { CircleCheck, EyeOff, Link2, Plus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import { annullaCollega, collegaPost, creaContenutoDaPost, escludiPost, rimettiPost } from '@/app/(app)/marketing/instagram/actions'
import { TOAST_NEL_PANNELLO, usePannello } from '@/components/marketing/contesto-pannello'
import { ApriSuInstagram, AZIONE_TOAST, CopertinaPost, Didascalia } from '@/components/marketing/instagram/copertina-post'
import { ParlatoDelPost } from '@/components/marketing/instagram/parlato-post'
import { ScegliContenuto } from '@/components/marketing/instagram/scegli-contenuto'
import type { ContenutoScelta, PostDaCollegare, PropostaPost } from '@/components/marketing/instagram/tipi'
import { useElencoPost } from '@/components/marketing/instagram/uso-elenco'
import { LinkContenuto } from '@/components/marketing/link-contenuto'
import { Button } from '@/components/ui/button'
import { ETICHETTA_STATUS } from '@/lib/marketing/etichette'
import { hrefContenuto } from '@/lib/marketing/pannello'
import { etichettaCollega, giornoPost, motiviInParole, rigaPost } from '@/lib/marketing/parole-post'
import { formatData } from '@/lib/format'

const CONNESSIONE = 'Connessione assente. Riprova.'

/**
 * «Da collegare» (1.33.0): the posts the run could not place by itself, the
 * most recent first. With proposals («Forse è:», up to three, each with the
 * reasons and «Collega»), or none («Nessun contenuto simile nel
 * calendario.»); always «Crea il contenuto», «Scegli un contenuto» and «Non va
 * nel calendario». A card leaves at the tap; the focus goes to the next card
 * or to the title; a toast with «Annulla».
 */
export function DaCollegare({ post, contenuti }: { post: readonly PostDaCollegare[]; contenuti: readonly ContenutoScelta[] }) {
  const router = useRouter()
  const pannello = usePannello()
  const { visibili, inCorso, annuncio, titolo, registra, esegui } = useElencoPost(post)

  function collega(p: PostDaCollegare, contenuto: Pick<PropostaPost, 'nome' | 'stato'> & { id: string }) {
    esegui(
      p,
      () => collegaPost({ shortcode: p.shortcode, contenuto_id: contenuto.id }),
      {
        fatto: () => `Post del ${giornoPost(p.giorno)} collegato a «${contenuto.nome}».`,
        nonFatto: `Post del ${giornoPost(p.giorno)} non collegato.`,
      },
      (esito) => {
        const annulla = {
          shortcode: p.shortcode,
          contenuto_id: contenuto.id,
          prima: esito.stato !== esito.prima.stato ? esito.prima.stato : undefined,
          post_date: esito.prima.postDateScritta ? esito.post_date : undefined,
        }
        toast.success(`Collegato a «${contenuto.nome}».`, {
          description: esito.stato !== esito.prima.stato ? 'Ora è «Posted».' : undefined,
          duration: 6000,
          action: {
            label: 'Annulla',
            onClick: () => {
              void annullaCollega(annulla).then(
                (r) => (r.ok ? toast.success('Collegamento annullato.') : toast.error(r.errore)),
                () => toast.error(CONNESSIONE),
              )
            },
          },
          classNames: { actionButton: AZIONE_TOAST },
        })
      },
    )
  }

  function crea(p: PostDaCollegare) {
    esegui(
      p,
      () => creaContenutoDaPost({ shortcode: p.shortcode }),
      {
        fatto: () => `Contenuto creato dal post del ${giornoPost(p.giorno)}.`,
        nonFatto: `Contenuto non creato dal post del ${giornoPost(p.giorno)}.`,
      },
      (esito) => {
        // the panel opens next: its toaster, never over the panel's X nor over the bottom bar
        toast.success('Contenuto creato dal post: completa Reel Type e Format.', pannello ? TOAST_NEL_PANNELLO : undefined)
        if (pannello) pannello.apri(esito.id)
        else router.push(hrefContenuto(esito.id))
      },
    )
  }

  function escludi(p: PostDaCollegare) {
    esegui(
      p,
      () => escludiPost({ shortcode: p.shortcode }),
      {
        fatto: () => `Post del ${giornoPost(p.giorno)} fuori dal calendario.`,
        nonFatto: `Post del ${giornoPost(p.giorno)} non spostato.`,
      },
      () => {
        toast.success('Fuori dal calendario: lo trovi in fondo alla pagina.', {
          duration: 6000,
          action: {
            label: 'Annulla',
            onClick: () => {
              void rimettiPost({ shortcode: p.shortcode }).then(
                (r) => (r.ok ? toast.success('Post di nuovo da collegare.') : toast.error(r.errore)),
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
    <section aria-labelledby="titolo-da-collegare" className="space-y-3">
      <h2 id="titolo-da-collegare" ref={titolo} tabIndex={-1} className="text-base font-semibold outline-none">
        Da collegare <span className="num">({visibili.length})</span>
      </h2>
      <p role="status" aria-live="polite" className="sr-only">
        {annuncio}
      </p>
      {visibili.length === 0 ? (
        <p className="flex items-center gap-2 rounded-xl border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
          <CircleCheck className="size-4 shrink-0 text-status-ok" aria-hidden="true" />
          Niente da collegare: ogni post ha il suo contenuto.
        </p>
      ) : (
        <ul className="space-y-3">
          {visibili.map((p) => (
            <li key={p.shortcode}>
              <SchedaPost
                post={p}
                contenuti={contenuti}
                inCorso={inCorso}
                titoloRef={registra(p.shortcode)}
                onCollega={(c) => collega(p, c)}
                onCrea={() => crea(p)}
                onEscludi={() => escludi(p)}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function SchedaPost({
  post,
  contenuti,
  inCorso,
  titoloRef,
  onCollega,
  onCrea,
  onEscludi,
}: {
  post: PostDaCollegare
  contenuti: readonly ContenutoScelta[]
  inCorso: boolean
  titoloRef: (el: HTMLElement | null) => void
  onCollega: (c: Pick<PropostaPost, 'nome' | 'stato'> & { id: string }) => void
  onCrea: () => void
  onEscludi: () => void
}) {
  const idTitolo = `post-${post.shortcode}`
  const giorno = giornoPost(post.giorno)
  const senzaProposte = post.proposte.length === 0

  return (
    <article aria-labelledby={idTitolo} className="space-y-3 rounded-xl bg-card p-3" data-post={post.shortcode}>
      <div className="flex min-w-0 gap-3">
        <CopertinaPost url={post.copertina_url} tipo={post.tipo} />
        <div className="min-w-0 flex-1 space-y-1">
          <h3 id={idTitolo} ref={titoloRef} tabIndex={-1} className="num text-sm font-medium outline-none">
            {rigaPost(post.giorno, post.tipo)}
          </h3>
          <Didascalia testo={post.didascalia} />
          <ApriSuInstagram href={post.permalink} className="-ml-2" />
          {post.tipo === 'reel' ? <ParlatoDelPost mediaId={post.media_id} className="-ml-2" /> : null}
        </div>
      </div>

      {senzaProposte ? (
        <p className="text-sm text-muted-foreground">Nessun contenuto simile nel calendario.</p>
      ) : (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Forse è:</p>
          <ul className="divide-y divide-border rounded-lg border border-border">
            {post.proposte.map((pr, i) => {
              const etichetta = etichettaCollega(pr.stato)
              const motivi = motiviInParole(pr.motivi)
              return (
                <li key={pr.contenuto_id} className="flex min-w-0 flex-col gap-2 p-2 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <LinkContenuto
                      id={pr.contenuto_id}
                      className="inline-flex min-h-11 items-center rounded-md text-sm font-medium break-words hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                    >
                      {pr.nome}
                    </LinkContenuto>
                    <p className="num text-xs text-muted-foreground">
                      {pr.post_date ? `Post Date ${formatData(pr.post_date)}` : 'Senza Post Date'} · {ETICHETTA_STATUS[pr.stato]}
                      {motivi ? ` · ${motivi}` : ''}
                    </p>
                  </div>
                  <Button
                    type="button"
                    // the best proposal stands out; the others stay quiet
                    variant={i === 0 ? 'default' : 'outline'}
                    className="h-11 shrink-0"
                    disabled={inCorso}
                    aria-label={`${etichetta} a «${pr.nome}»`}
                    onClick={() => onCollega({ id: pr.contenuto_id, nome: pr.nome, stato: pr.stato })}
                  >
                    <Link2 className="size-4" aria-hidden="true" />
                    {etichetta}
                  </Button>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Button
          type="button"
          variant={senzaProposte ? 'default' : 'outline'}
          className="h-11"
          disabled={inCorso}
          aria-label={`Crea il contenuto dal post del ${giorno}`}
          onClick={onCrea}
        >
          <Plus className="size-4" aria-hidden="true" />
          Crea il contenuto
        </Button>
        <ScegliContenuto
          post={post}
          contenuti={contenuti}
          disabilitato={inCorso}
          onCollega={(c) => onCollega({ id: c.id, nome: c.nome, stato: c.stato })}
        />
        <Button
          type="button"
          variant="ghost"
          className="h-11"
          disabled={inCorso}
          aria-label={`Non va nel calendario: il post del ${giorno}`}
          onClick={onEscludi}
        >
          <EyeOff className="size-4" aria-hidden="true" />
          Non va nel calendario
        </Button>
      </div>
    </article>
  )
}
