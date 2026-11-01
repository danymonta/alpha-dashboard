'use client'

import { useEditorState, type Editor } from '@tiptap/react'
import { BubbleMenu, type BubbleMenuProps } from '@tiptap/react/menus'
import { Copy, ExternalLink, Link2, Link2Off, Pencil } from 'lucide-react'
import { useCallback, useEffect, useId, useImperativeHandle, useRef, useState, type KeyboardEvent as KeyboardEventReact, type Ref } from 'react'
import { toast } from 'sonner'

import { useTesti } from '@/components/i18n/lingua-provider'
import { useOpzioniToast } from '@/components/marketing/contesto-pannello'
import { CONTENUTO } from '@/lib/i18n/testi/contenuto'
import { abbreviaHref, hrefApribile, normalizzaHref } from '@/lib/marketing/link'
import { cn } from '@/lib/utils'

/** The plugin keys of the two menus of a section (one editor each): the link popup tells the colour menu to step aside. */
export const CHIAVE_MENU_LINK = 'menuLink'
export const CHIAVE_MENU_EVIDENZIATORE = 'menuEvidenziatore'

const BASE =
  'inline-flex shrink-0 items-center justify-center rounded-md text-foreground hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none'
const BOTTONE = `${BASE} size-11 pointer-fine:size-8`

export type ManigliaMenuLink = {
  /** Ctrl/⌘+K, or «Link» of the colour menu: the field to add or change the link of the selection. False when there is nothing to link. */
  modifica: () => boolean
  /** Whether the popup is in the editing form now (the colour menu stays away meanwhile). */
  inModifica: () => boolean
}

/** Every control of the popup, in order: the arrows move along them. */
function controlli(menu: HTMLElement | null): HTMLElement[] {
  return menu ? Array.from(menu.querySelectorAll<HTMLElement>('button:not([disabled]), a[href]')) : []
}

/**
 * The popup of a link in a section (01/11/2026, Dany: link cliccabili «stile
 * Google Drive»): a click in a link puts the cursor there, so it can still be
 * written, and under the link a small popup shows the address, shortened, with
 * «Apri» (a new tab, http and https only, `noopener noreferrer`), «Copia»,
 * «Modifica» and «Togli il link». Ctrl/⌘+K on a selection opens the field to
 * add or change the link. The link is a mark of the editor: a change saves
 * itself like every other one. From the keyboard: Alt+F10 in the text brings
 * the focus here, the arrows move along the buttons, Esc goes back to the text.
 */
export function MenuLink({
  editor,
  onEsc,
  ref,
}: {
  editor: Editor
  onEsc: (evento: KeyboardEvent) => void
  ref?: Ref<ManigliaMenuLink>
}) {
  const t = useTesti(CONTENUTO).link
  const opzioniToast = useOpzioniToast()
  const idCampo = useId()
  const campo = useRef<HTMLInputElement>(null)
  /** The editing form, read by shouldShow (outside React's render). */
  const inModifica = useRef(false)
  const [modifica, setModifica] = useState(false)
  const [bozza, setBozza] = useState('')
  const [errore, setErrore] = useState<string | null>(null)

  const href = useEditorState({
    editor,
    selector: ({ editor: e }) => (e.isActive('link') ? ((e.getAttributes('link').href as string | undefined) ?? '') : null),
  })

  const shouldShow = useCallback<NonNullable<BubbleMenuProps['shouldShow']>>(({ editor: e, view, state, element }) => {
    if (!e.isEditable) return false
    if (!(view.hasFocus() || element.contains(document.activeElement))) return false
    if (inModifica.current) return true
    return state.selection.empty && e.isActive('link')
  }, [])

  // under the link itself, like Google Docs; the selection when there is no link yet (Ctrl/⌘+K on a selection)
  const sottoIlLink = useCallback(() => {
    const { from, empty } = editor.state.selection
    if (!empty) return null
    const { node } = editor.view.domAtPos(from)
    const el = node.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : node.parentElement
    const a = el?.closest('a')
    if (!a || !editor.view.dom.contains(a)) return null
    return { getBoundingClientRect: () => a.getBoundingClientRect(), getClientRects: () => a.getClientRects() }
  }, [editor])

  const [opzioni] = useState(() => ({
    placement: 'bottom' as const,
    offset: 6,
    flip: { fallbackPlacements: ['top' as const] },
    shift: { padding: 8 },
    onHide: () => {
      inModifica.current = false
      setModifica(false)
      setErrore(null)
    },
  }))

  const chiudiModifica = useCallback(
    (alTesto: boolean) => {
      inModifica.current = false
      setModifica(false)
      setErrore(null)
      if (alTesto) editor.commands.focus()
    },
    [editor],
  )

  useImperativeHandle(
    ref,
    () => ({
      modifica: () => {
        const { empty } = editor.state.selection
        const nelLink = editor.isActive('link')
        if (empty && !nelLink) return false
        inModifica.current = true
        setBozza(nelLink ? ((editor.getAttributes('link').href as string | undefined) ?? '') : '')
        setErrore(null)
        setModifica(true)
        // the colour menu steps aside, this one shows (the plugin only looks again at a change of the selection)
        editor.view.dispatch(editor.state.tr.setMeta(CHIAVE_MENU_EVIDENZIATORE, 'hide').setMeta(CHIAVE_MENU_LINK, 'show'))
        return true
      },
      inModifica: () => inModifica.current,
    }),
    [editor],
  )

  // the form opened: its field takes the focus, and the popup takes its place under the link
  useEffect(() => {
    if (!modifica) return
    editor.view.dispatch(editor.state.tr.setMeta(CHIAVE_MENU_LINK, 'updatePosition'))
    campo.current?.focus()
    campo.current?.select()
  }, [modifica, editor])

  function salva() {
    const nuovo = normalizzaHref(bozza)
    if (!nuovo) {
      setErrore(t.errore)
      campo.current?.focus()
      return
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: nuovo }).run()
    chiudiModifica(false)
  }

  async function copia() {
    if (!href) return
    try {
      await navigator.clipboard.writeText(href)
      toast.success(t.copiato, opzioniToast)
    } catch {
      toast.error(t.copiaNo, opzioniToast)
    }
  }

  function tasto(evento: KeyboardEventReact<HTMLDivElement>) {
    if (evento.key === 'Escape') {
      evento.preventDefault()
      evento.stopPropagation()
      onEsc(evento.nativeEvent)
      if (inModifica.current && editor.isActive('link')) {
        // back from the field to the popup of the link
        inModifica.current = false
        setModifica(false)
        setErrore(null)
        const barra = evento.currentTarget
        requestAnimationFrame(() => controlli(barra)[0]?.focus())
        return
      }
      chiudiModifica(true)
      return
    }
    if (modifica) return
    const avanti = evento.key === 'ArrowRight' || evento.key === 'ArrowDown'
    const indietro = evento.key === 'ArrowLeft' || evento.key === 'ArrowUp'
    if (!avanti && !indietro) return
    const tutti = controlli(evento.currentTarget)
    const qui = tutti.indexOf(document.activeElement as HTMLElement)
    if (qui < 0) return
    evento.preventDefault()
    tutti[(qui + (avanti ? 1 : -1) + tutti.length) % tutti.length]?.focus()
  }

  const apribile = hrefApribile(href)

  return (
    <BubbleMenu
      editor={editor}
      pluginKey={CHIAVE_MENU_LINK}
      updateDelay={0}
      shouldShow={shouldShow}
      getReferencedVirtualElement={sottoIlLink}
      data-menu-link=""
      className="z-50 max-w-[calc(100vw-1rem)] rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md"
      options={opzioni}
    >
      <div onKeyDown={tasto}>
        {modifica ? (
          <form
            noValidate
            className="flex w-72 max-w-full flex-col gap-1.5 p-1"
            onSubmit={(e) => {
              e.preventDefault()
              salva()
            }}
          >
            <label htmlFor={idCampo} className="text-xs font-medium text-muted-foreground">
              {t.campo}
            </label>
            <input
              ref={campo}
              id={idCampo}
              type="text"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              value={bozza}
              onChange={(e) => {
                setBozza(e.target.value)
                if (errore) setErrore(null)
              }}
              aria-invalid={errore !== null}
              aria-describedby={errore ? `${idCampo}-errore` : undefined}
              placeholder="https://"
              className="h-11 w-full rounded-md border border-input bg-input/30 px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-status-critical pointer-fine:h-8"
            />
            {errore ? (
              <p id={`${idCampo}-errore`} role="alert" className="text-xs text-status-critical">
                {errore}
              </p>
            ) : null}
            <div className="flex justify-end gap-1">
              <button
                type="button"
                className={cn(BASE, 'h-11 px-3 text-sm pointer-fine:h-8')}
                onClick={() => chiudiModifica(true)}
              >
                {t.annulla}
              </button>
              <button
                type="submit"
                className="inline-flex h-11 shrink-0 items-center justify-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none pointer-fine:h-8"
              >
                {t.salva}
              </button>
            </div>
          </form>
        ) : href !== null ? (
          <div role="toolbar" aria-label={t.barra} aria-orientation="horizontal" className="flex items-center gap-0.5">
            <span
              className="flex max-w-[9rem] min-w-0 items-center gap-1.5 px-2 text-sm text-muted-foreground sm:max-w-[16rem]"
              title={href}
            >
              <Link2 className="size-4 shrink-0" aria-hidden="true" />
              <span className="truncate">
                <span className="sr-only">{t.campo}: </span>
                {abbreviaHref(href)}
              </span>
            </span>
            {apribile ? (
              <a
                href={apribile}
                target="_blank"
                rel="noopener noreferrer"
                className={BOTTONE}
                aria-label={t.apri}
                title={t.apri}
                onMouseDown={(e) => e.preventDefault()}
              >
                <ExternalLink className="size-4" aria-hidden="true" />
              </a>
            ) : (
              <span className={cn(BOTTONE, 'cursor-not-allowed text-muted-foreground hover:bg-transparent')} title={t.apriNo}>
                <ExternalLink className="size-4" aria-hidden="true" />
                <span className="sr-only">{t.apriNo}</span>
              </span>
            )}
            <button
              type="button"
              className={BOTTONE}
              aria-label={t.copia}
              title={t.copia}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => void copia()}
            >
              <Copy className="size-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              className={BOTTONE}
              aria-label={t.modifica}
              title={t.modifica}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                inModifica.current = true
                setBozza(href)
                setErrore(null)
                setModifica(true)
              }}
            >
              <Pencil className="size-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              className={BOTTONE}
              aria-label={t.togli}
              title={t.togli}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => editor.chain().focus().extendMarkRange('link').unsetLink().run()}
            >
              <Link2Off className="size-4" aria-hidden="true" />
            </button>
          </div>
        ) : null}
      </div>
    </BubbleMenu>
  )
}
