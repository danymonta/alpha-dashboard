'use client'

import { ChevronDown, ChevronUp, Ellipsis, ExternalLink, Link2, Maximize2, RotateCw, TriangleAlert, XIcon } from 'lucide-react'
import Link from 'next/link'
import type { Ref } from 'react'
import { toast, type ExternalToast } from 'sonner'

import { eliminaContenuto } from '@/app/(app)/marketing/contenuti/actions'
import { Elimina } from '@/components/form/elimina'
import { EditorCella } from '@/components/marketing/cella-contenuto'
import { NelPannello, useOpzioniToast } from '@/components/marketing/contesto-pannello'
import { PostDelContenuto } from '@/components/marketing/instagram/post-del-contenuto'
import { MenuStatus } from '@/components/marketing/menu-status'
import { ProprietaContenuto } from '@/components/marketing/proprieta-contenuto'
import { SezioneContenuto } from '@/components/marketing/sezione-contenuto'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import type { ContenutoElenco } from '@/lib/marketing/elenco'
import { SEZIONI, sezioniVisibili, type SezioneContenuto as Sezione } from '@/lib/marketing/etichette'
import { hrefContenuto, linkCondivisibile, type Vicini } from '@/lib/marketing/pannello'
import type { PostDelContenuto as DatiPost } from '@/lib/marketing/post-del-contenuto'
import { cn } from '@/lib/utils'

export type ContenutoScheda = ContenutoElenco & { notion_page_id?: string | null }

/** The four sections: read with the detail, or still on their way, or not read. */
export type StatoSezioni =
  | { stato: 'caricamento' }
  | { stato: 'pronto'; testi: Record<Sezione, string | null>; impronte: Record<Sezione, string> }
  | { stato: 'errore'; riprova: () => void }

/** Notion's page link from the page id: the dashes go. */
function linkNotion(id: string): string {
  return `https://www.notion.so/${id.replace(/-/g, '')}`
}

/** «Copia il link»: the list with this content open, without filters, so anyone of the area lands on it. */
async function copiaLink(id: string, opzioni: ExternalToast) {
  const link = linkCondivisibile(window.location.origin, id)
  try {
    await navigator.clipboard.writeText(link)
    toast.success('Link copiato', opzioni)
  } catch {
    // no clipboard (permissions, an old browser): the link in words, to copy by hand
    toast('Copia il link a mano', { ...opzioni, description: link })
  }
}

const CLASSE_ICONA =
  'inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40 aria-disabled:cursor-default aria-disabled:opacity-40 aria-disabled:hover:bg-transparent aria-disabled:hover:text-muted-foreground'

/**
 * «Altre azioni»: the whole page (from the panel), the link to share,
 * Notion's page. A 44 px button, like the others in the header.
 */
function AltreAzioni({ contenuto, dove }: { contenuto: ContenutoScheda; dove: 'pannello' | 'pagina' }) {
  const opzioniToast = useOpzioniToast()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<button type="button" aria-label={`Altre azioni su «${contenuto.nome}»`} title="Altre azioni" className={CLASSE_ICONA} />}
      >
        <Ellipsis className="size-4" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {dove === 'pannello' ? (
          <DropdownMenuItem className="min-h-11 px-3" render={<Link href={hrefContenuto(contenuto.id)} />}>
            <Maximize2 className="size-4" aria-hidden="true" />
            Apri a tutta pagina
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem className="min-h-11 px-3" onClick={() => void copiaLink(contenuto.id, opzioniToast)}>
          <Link2 className="size-4" aria-hidden="true" />
          Copia il link
        </DropdownMenuItem>
        {contenuto.notion_page_id ? (
          <DropdownMenuItem
            className="min-h-11 px-3"
            render={<a href={linkNotion(contenuto.notion_page_id)} target="_blank" rel="noopener noreferrer" />}
          >
            <ExternalLink className="size-4" aria-hidden="true" />
            Apri in Notion
            <span className="sr-only">(si apre in una nuova scheda)</span>
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** The content's own page: the pencil «Rinomina» and «Altre azioni», next to the page's title. */
export function AzioniContenuto({ contenuto }: { contenuto: ContenutoScheda }) {
  return (
    <div className="flex items-center gap-1">
      <EditorCella id={contenuto.id} nome={contenuto.nome} campo="nome" valore={contenuto.nome} aspetto="matita" />
      <AltreAzioni contenuto={contenuto} dove="pagina" />
    </div>
  )
}

function ScheletroSezioni() {
  return (
    <div className="space-y-3" aria-busy="true">
      <Skeleton className="h-28 rounded-xl" />
      <Skeleton className="h-40 rounded-xl" />
      <Skeleton className="h-12 rounded-xl" />
      <Skeleton className="h-12 rounded-xl" />
      <span className="sr-only">Caricamento dei testi del contenuto</span>
    </div>
  )
}

export type NavigazionePannello = Vicini & { vai: (id: string) => void }

/**
 * A content as a Notion page (1.33.0), the same in the panel and on its own
 * page, so the two never differ: the Name with the pencil «Rinomina», the
 * Status with one tap, «Ogni modifica si salva da sola.» (why there is no
 * Save), the properties each saved by itself, the sections of its template
 * written in place, and at the bottom «Elimina» (admin and marketing) or, for
 * the video editor, how to take it out of the work.
 */
export function SchedaContenuto({
  dove,
  contenuto,
  sezioni,
  instagram,
  puoEliminare,
  titoloRef,
  navigazione,
  onChiudi,
  onEliminato,
  onRileggi,
}: {
  dove: 'pannello' | 'pagina'
  contenuto: ContenutoScheda
  sezioni: StatoSezioni
  /** The block «Post su Instagram», read with the detail; null while the panel reads it. */
  instagram: DatiPost | null
  puoEliminare: boolean
  /** The panel: the title takes the focus when it opens. */
  titoloRef?: Ref<HTMLHeadingElement>
  /** The panel: «Contenuto precedente» and «successivo» in the list's order. */
  navigazione?: NavigazionePannello | null
  onChiudi?: () => void
  /** The panel: deleted, it closes and the list hands the focus on. */
  onEliminato?: () => void
  /** The panel: «Riprova» of the Instagram block reads the content again (the page refreshes by itself). */
  onRileggi?: () => void
}) {
  const { id, nome } = contenuto
  const titoli = SEZIONI[contenuto.tipo]

  const intestazione =
    dove === 'pannello' ? (
      // sticky: the Name, the Status and the way out stay in view while the sections scroll
      <div className="sticky top-0 z-20 border-b border-border bg-popover px-4 pt-[max(env(safe-area-inset-top),0.5rem)] pb-2">
        <div className="flex items-start gap-1">
          <div className="flex min-w-0 flex-1 items-start gap-0.5">
            <SheetTitle
              ref={titoloRef}
              tabIndex={-1}
              // the focus lands here when the panel opens (screen readers read the Name): no ring, it is not a control
              className="min-w-0 pt-2.5 text-lg font-semibold wrap-anywhere outline-none"
            >
              {nome}
            </SheetTitle>
            <EditorCella id={id} nome={nome} campo="nome" valore={nome} aspetto="matita" />
          </div>
          <AltreAzioni contenuto={contenuto} dove="pannello" />
          <button type="button" onClick={onChiudi} aria-label="Chiudi il contenuto" title="Chiudi" className={CLASSE_ICONA}>
            <XIcon className="size-4" aria-hidden="true" />
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <MenuStatus id={id} nome={nome} stato={contenuto.stato} grande />
          {navigazione && navigazione.totale > 1 && navigazione.posizione !== null ? (
            <div className="ml-auto flex items-center">
              <span className="num mr-1 text-xs text-muted-foreground">
                {navigazione.posizione} di {navigazione.totale}
              </span>
              {/* aria-disabled, never disabled: on the first and the last content the arrow just
                  pressed keeps the focus, which a disabled button would drop on <body> */}
              <button
                type="button"
                aria-label="Contenuto precedente"
                title="Contenuto precedente"
                aria-disabled={!navigazione.precedente || undefined}
                onClick={() => navigazione.precedente && navigazione.vai(navigazione.precedente)}
                className={CLASSE_ICONA}
              >
                <ChevronUp className="size-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label="Contenuto successivo"
                title="Contenuto successivo"
                aria-disabled={!navigazione.successivo || undefined}
                onClick={() => navigazione.successivo && navigazione.vai(navigazione.successivo)}
                className={CLASSE_ICONA}
              >
                <ChevronDown className="size-4" aria-hidden="true" />
              </button>
            </div>
          ) : null}
        </div>
        <SheetDescription className="mt-0.5 text-xs">Ogni modifica si salva da sola.</SheetDescription>
      </div>
    ) : (
      <div className="-mt-3 space-y-1">
        <MenuStatus id={id} nome={nome} stato={contenuto.stato} grande />
        <p className="text-xs text-muted-foreground">Ogni modifica si salva da sola.</p>
      </div>
    )

  return (
    // in the panel its toasts go to the bottom, never over the sticky header
    <NelPannello value={dove === 'pannello'}>
      {intestazione}
      <div
        className={cn(
          'space-y-5',
          dove === 'pannello' && 'px-4 pt-4 pb-[calc(env(safe-area-inset-bottom)+1.5rem)]',
        )}
      >
        <ProprietaContenuto riga={contenuto} />

        {instagram ? (
          <PostDelContenuto
            contenutoId={id}
            nome={nome}
            postDate={contenuto.post_date}
            stato={contenuto.stato}
            dati={instagram}
            onRiprova={onRileggi}
          />
        ) : null}

        {sezioni.stato === 'caricamento' ? (
          <ScheletroSezioni />
        ) : sezioni.stato === 'errore' ? (
          <div role="alert" className="space-y-3 rounded-xl bg-card p-4">
            <p className="flex items-start gap-2 text-sm">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-status-critical" aria-hidden="true" />
              Il contenuto non si è caricato.
            </p>
            <Button type="button" variant="outline" className="h-11" onClick={sezioni.riprova}>
              <RotateCw className="size-4" aria-hidden="true" />
              Riprova
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {sezioniVisibili(contenuto.tipo, sezioni.testi).map((campo, i) => (
              <SezioneContenuto
                // another content (precedente, successivo) remounts the toggles: drafts never mix
                key={`${id}-${campo}`}
                id={id}
                campo={campo}
                titolo={titoli[campo]}
                testo={sezioni.testi[campo]}
                impronta={sezioni.impronte[campo]}
                // as Notion's toggles: the first open, and every one with text
                apertaDiBase={i === 0 || !!sezioni.testi[campo]?.trim()}
              />
            ))}
          </div>
        )}

        {puoEliminare ? (
          <div className="border-t border-border pt-4">
            <Elimina
              etichetta="Elimina il contenuto"
              cosa={`il contenuto «${nome}»`}
              fatto="Contenuto eliminato"
              conseguenze={[
                'Si perdono anche il messaggio, gli script e i commenti.',
                // a post no longer on Instagram goes nowhere: it is not work any more
                ...(instagram?.stato === 'collegato' && !instagram.post.eliminato
                  ? ['Il post di Instagram collegato torna in «Da collegare».']
                  : []),
                'Su Instagram e su Notion non cambia niente.',
              ]}
              azione={() => eliminaContenuto({ id })}
              {...(dove === 'pannello' ? { onFatto: onEliminato } : { dopo: '/marketing/contenuti' })}
            />
          </div>
        ) : (
          <p className="border-t border-border pt-4 text-xs text-muted-foreground">
            Un contenuto lo eliminano l’admin e il marketing: per toglierlo dal lavoro puoi segnarlo «Canceled».
          </p>
        )}
      </div>
    </NelPannello>
  )
}
