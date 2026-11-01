'use client'

import { useEditorState, type Editor } from '@tiptap/react'
import { BubbleMenu, type BubbleMenuProps } from '@tiptap/react/menus'
import { Bold, ChevronDown, Italic, Link2, Strikethrough } from 'lucide-react'
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent as KeyboardEventReact, type ReactNode } from 'react'

import './etichette.css'
import './evidenziatore.css'

import { useTesti } from '@/components/i18n/lingua-provider'
import { CHIAVE_MENU_EVIDENZIATORE } from '@/components/marketing/menu-link'
import { CONTENUTO } from '@/lib/i18n/testi/contenuto'
import { COLORI_EVIDENZIATORE, type ColoreEvidenziatore } from '@/lib/marketing/evidenziatore'
import { cn } from '@/lib/utils'

/** A button of the menu; a target of 44 px with the finger, a compact one with the mouse. */
const BASE =
  'inline-flex shrink-0 items-center justify-center rounded-md text-sm text-foreground hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none aria-pressed:bg-accent'
const BOTTONE = `${BASE} size-11 pointer-fine:size-8`

/** Every button of the menu, in order: the arrows move along them. */
function bottoni(menu: HTMLElement | null): HTMLButtonElement[] {
  return menu ? Array.from(menu.querySelectorAll<HTMLButtonElement>('button:not([disabled])')) : []
}

/**
 * The menu over a selection in a section (01/11/2026, «come fa notion»): bold,
 * italic, strikethrough and «Colore», which opens the colour of the text and
 * the background, Notion's ten colours each («Predefinito» takes it away). A
 * mark of the editor (ColoreTesto, SfondoTesto), saved as Markdown like every
 * other change: onUpdate, then the save a moment later. From the keyboard:
 * Alt+F10 in the text brings the focus here (EditorSezione), the arrows move
 * along the buttons, Esc closes the colours and then goes back to the text
 * with the same selection. The menu sits in the section, right after the text,
 * above the selection (below it with the finger, where the phone's own menu is
 * above).
 */
export function MenuEvidenziatore({
  editor,
  onEsc,
  onLink,
  linkInModifica,
}: {
  editor: Editor
  /** The Esc that closes the menu is the menu's: the content panel stays (escGestito). */
  onEsc: (evento: KeyboardEvent) => void
  /** «Link»: the field of the link popup for the selection (menu-link.tsx). */
  onLink: () => void
  /** While the link popup has its field open this menu stays away. */
  linkInModifica: () => boolean
}) {
  const t = useTesti(CONTENUTO).evidenziatore
  const idColori = useId()
  const bottoneColore = useRef<HTMLButtonElement>(null)
  const [coloriAperti, setColoriAperti] = useState(false)
  // one object for the life of the menu: a new one at every render would send the plugin an update each time
  const [opzioni] = useState(() => {
    const dalBasso = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
    return {
      placement: dalBasso ? ('bottom' as const) : ('top' as const),
      offset: 8,
      flip: { fallbackPlacements: [dalBasso ? ('top' as const) : ('bottom' as const)] },
      shift: { padding: 8 },
      onHide: () => setColoriAperti(false),
    }
  })

  // the plugin's own rule (a text selection, the focus in the text or in the menu), and never over the link's field
  const richiamoLink = useRef(linkInModifica)
  useEffect(() => {
    richiamoLink.current = linkInModifica
  })
  const shouldShow = useCallback<NonNullable<BubbleMenuProps['shouldShow']>>(({ editor: e, view, state, from, to, element }) => {
    if (!e.isEditable || state.selection.empty || !state.doc.textBetween(from, to).length) return false
    if (!(view.hasFocus() || element.contains(document.activeElement))) return false
    return !richiamoLink.current()
  }, [])

  const stato = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      grassetto: e.isActive('bold'),
      corsivo: e.isActive('italic'),
      barrato: e.isActive('strike'),
      link: e.isActive('link'),
      colore: (e.getAttributes('coloreTesto').colore as ColoreEvidenziatore | undefined) ?? null,
      sfondo: (e.getAttributes('sfondoTesto').sfondo as ColoreEvidenziatore | undefined) ?? null,
    }),
  })

  function tasto(evento: KeyboardEventReact<HTMLDivElement>) {
    if (evento.key === 'Escape') {
      evento.preventDefault()
      evento.stopPropagation()
      onEsc(evento.nativeEvent)
      if (coloriAperti) {
        setColoriAperti(false)
        bottoneColore.current?.focus()
      } else {
        editor.commands.focus()
      }
      return
    }
    const avanti = evento.key === 'ArrowRight' || evento.key === 'ArrowDown'
    const indietro = evento.key === 'ArrowLeft' || evento.key === 'ArrowUp'
    if (!avanti && !indietro) return
    const tutti = bottoni(evento.currentTarget)
    const qui = tutti.indexOf(document.activeElement as HTMLButtonElement)
    if (qui < 0) return
    evento.preventDefault()
    tutti[(qui + (avanti ? 1 : -1) + tutti.length) % tutti.length]?.focus()
  }

  function scegliColore(colore: ColoreEvidenziatore | null) {
    const catena = editor.chain()
    ;(colore ? catena.setMark('coloreTesto', { colore }) : catena.unsetMark('coloreTesto')).run()
  }

  function scegliSfondo(sfondo: ColoreEvidenziatore | null) {
    const catena = editor.chain()
    ;(sfondo ? catena.setMark('sfondoTesto', { sfondo }) : catena.unsetMark('sfondoTesto')).run()
  }

  const stile = (attivo: boolean, nome: string, icona: ReactNode, azione: () => void) => (
    <button
      type="button"
      className={BOTTONE}
      aria-pressed={attivo}
      aria-label={nome}
      title={nome}
      // the selection stays in the text: a click with the mouse never takes the focus away
      onMouseDown={(e) => e.preventDefault()}
      onClick={azione}
    >
      {icona}
    </button>
  )

  return (
    <BubbleMenu
      editor={editor}
      data-menu-evidenziatore=""
      pluginKey={CHIAVE_MENU_EVIDENZIATORE}
      shouldShow={shouldShow}
      // at once, not 250 ms after the selection: Alt+F10 right after selecting finds the menu already there
      updateDelay={0}
      className="z-50 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md"
      options={opzioni}
    >
      <div role="toolbar" aria-label={t.barra} aria-orientation="horizontal" onKeyDown={tasto}>
        <div className="flex items-center gap-0.5">
          {stile(stato.grassetto, t.grassetto, <Bold className="size-4" aria-hidden="true" />, () =>
            editor.chain().toggleBold().run(),
          )}
          {stile(stato.corsivo, t.corsivo, <Italic className="size-4" aria-hidden="true" />, () =>
            editor.chain().toggleItalic().run(),
          )}
          {stile(stato.barrato, t.barrato, <Strikethrough className="size-4" aria-hidden="true" />, () =>
            editor.chain().toggleStrike().run(),
          )}
          {stile(stato.link, t.link, <Link2 className="size-4" aria-hidden="true" />, onLink)}
          <span className="mx-0.5 h-6 w-px bg-border" aria-hidden="true" />
          <button
            ref={bottoneColore}
            type="button"
            className={cn(BASE, 'h-11 min-w-11 gap-1 px-2 pointer-fine:h-8')}
            aria-expanded={coloriAperti}
            aria-controls={coloriAperti ? idColori : undefined}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setColoriAperti((a) => !a)}
          >
            <span
              aria-hidden="true"
              className={cn('font-semibold', stato.colore && 'ev-colore', stato.sfondo && 'ev-sfondo')}
              data-colore={stato.colore ?? undefined}
              data-sfondo={stato.sfondo ?? undefined}
            >
              A
            </span>
            {t.colore}
            <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden="true" />
          </button>
        </div>

        {coloriAperti ? (
          <div id={idColori} className="mt-1 space-y-2 border-t border-border px-1 pt-2 pb-1">
            <Gruppo
              titolo={t.coloreTesto}
              attivo={stato.colore}
              nomi={t.nomi}
              anteprima={(colore) => (
                <span className={cn('font-semibold', colore && 'ev-colore')} data-colore={colore ?? undefined}>
                  A
                </span>
              )}
              onScegli={scegliColore}
            />
            <Gruppo
              titolo={t.sfondo}
              attivo={stato.sfondo}
              nomi={t.nomi}
              anteprima={(sfondo) => (
                <span
                  className={cn('inline-flex size-6 items-center justify-center rounded font-semibold', sfondo ? 'ev-sfondo' : 'border border-border')}
                  data-sfondo={sfondo ?? undefined}
                >
                  A
                </span>
              )}
              onScegli={scegliSfondo}
            />
          </div>
        ) : null}
      </div>
    </BubbleMenu>
  )
}

/** One group of the colours: «Predefinito» and the nine colours, each an «A» painted with it and named in words. */
function Gruppo({
  titolo,
  attivo,
  nomi,
  anteprima,
  onScegli,
}: {
  titolo: string
  attivo: ColoreEvidenziatore | null
  nomi: Record<'predefinito' | ColoreEvidenziatore, string>
  anteprima: (colore: ColoreEvidenziatore | null) => ReactNode
  onScegli: (colore: ColoreEvidenziatore | null) => void
}) {
  const idTitolo = useId()
  const scelte: (ColoreEvidenziatore | null)[] = [null, ...COLORI_EVIDENZIATORE]
  return (
    <div role="group" aria-labelledby={idTitolo}>
      <p id={idTitolo} className="mb-1 px-1 text-xs font-medium text-muted-foreground">
        {titolo}
      </p>
      <div className="grid grid-cols-5 gap-0.5">
        {scelte.map((colore) => {
          const nome = nomi[colore ?? 'predefinito']
          return (
            <button
              key={colore ?? 'predefinito'}
              type="button"
              className={BOTTONE}
              aria-label={nome}
              aria-pressed={attivo === colore}
              title={nome}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onScegli(colore)}
            >
              {anteprima(colore)}
            </button>
          )
        })}
      </div>
    </div>
  )
}
