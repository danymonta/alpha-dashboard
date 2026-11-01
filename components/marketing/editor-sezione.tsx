'use client'

import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import { useEffect, useImperativeHandle, useRef, type ReactNode, type Ref } from 'react'

import './editor-sezione.css'
import './etichette.css'
import './evidenziatore.css'

import { useTesti } from '@/components/i18n/lingua-provider'
import { MenuEvidenziatore } from '@/components/marketing/menu-evidenziatore'
import { MenuLink, type ManigliaMenuLink } from '@/components/marketing/menu-link'
import { CONTENUTO } from '@/lib/i18n/testi/contenuto'
import { estensioniEditor, markdownDellEditor } from '@/lib/marketing/editor-markdown'
import { hrefApribile } from '@/lib/marketing/link'

export type ManigliaEditor = {
  /** The text from elsewhere (a conflict, another person's save): replaced without counting as a change. */
  imposta: (testo: string | null) => void
  /** The Markdown on screen now. */
  testo: () => string
  focus: () => void
}

/**
 * A section of a content, always editable (Dany, 24/10/2026: «deve essere
 * proprio un campo modificabile di default… ctrl + b mette in automatico in
 * grassetto»): Tiptap, written like Notion, read and written as Markdown. Only
 * the person's own edits call `onCambia` (a text set from outside does not).
 * Esc leaves the field (the content panel stays: `onEsc` marks the event).
 * A selection shows the menu of the highlighter (01/11/2026, MenuEvidenziatore):
 * bold, italic, strikethrough, the colour of the text and the background;
 * Alt+F10 brings the keyboard there. A link (01/11/2026, «stile Google Drive»)
 * shows its popup under it when the cursor is in it (MenuLink); Ctrl/⌘+click
 * opens it in a new tab, Ctrl/⌘+K adds or changes the link of the selection.
 * Loaded by itself with next/dynamic: the list pages never carry the editor.
 */
export default function EditorSezione({
  testo,
  titolo,
  idDescrizione,
  invalido,
  onCambia,
  onEsce,
  onEsc,
  riserva,
  ref,
}: {
  testo: string | null
  titolo: string
  idDescrizione: string
  invalido: boolean
  onCambia: (markdown: string) => void
  onEsce: () => void
  onEsc: (evento: KeyboardEvent) => void
  /** What shows until the editor is ready (the text as the page renders it): no blank frame. */
  riserva: ReactNode
  ref?: Ref<ManigliaEditor>
}) {
  // the callbacks change at every render of the section: the editor reads the latest
  const segnaposto = useTesti(CONTENUTO).sezione.segnaposto
  const richiami = useRef({ onCambia, onEsce, onEsc })
  const link = useRef<ManigliaMenuLink>(null)
  useEffect(() => {
    richiami.current = { onCambia, onEsce, onEsc }
  })

  const editor = useEditor({
    // the server renders the Markdown (the fallback): the editor only in the browser, no hydration mismatch
    immediatelyRender: false,
    shouldRerenderOnTransaction: false,
    extensions: estensioniEditor(segnaposto),
    content: testo ?? '',
    contentType: 'markdown',
    editorProps: {
      attributes: {
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': titolo,
        'aria-describedby': idDescrizione,
        class: 'editor-sezione',
      },
      // Ctrl/⌘+click on a link opens it in a new tab (a plain click puts the cursor in it, to write)
      handleClick: (view, pos, evento) => {
        if (!(evento.metaKey || evento.ctrlKey)) return false
        const segno = view.state.doc
          .resolve(pos)
          .marks()
          .find((m) => m.type.name === 'link')
        const href = hrefApribile(segno?.attrs.href as string | undefined)
        if (!href) return false
        window.open(href, '_blank', 'noopener,noreferrer')
        return true
      },
      handleKeyDown: (view, evento) => {
        // Alt+F10, the editors' way to their toolbar: to the menu that shows (a link's popup, or the one of a selection)
        if (evento.altKey && evento.key === 'F10') {
          // both menus sit next to the text while they show (the plugin removes them when they hide)
          const vicini = view.dom.parentElement
          const aperto = vicini?.querySelector('[data-menu-link]') ?? vicini?.querySelector('[data-menu-evidenziatore]')
          const primo = aperto?.querySelector<HTMLElement>('button, a[href], input')
          if (!primo) return false
          primo.focus()
          return true
        }
        // Ctrl/⌘+K: add or change the link of the selection (or of the link the cursor is in)
        if ((evento.metaKey || evento.ctrlKey) && !evento.altKey && !evento.shiftKey && evento.key.toLowerCase() === 'k') {
          return link.current?.modifica() ?? false
        }
        if (evento.key !== 'Escape') return false
        richiami.current.onEsc(evento)
        ;(document.activeElement as HTMLElement | null)?.blur()
        return true
      },
    },
    onUpdate: ({ editor: e }: { editor: Editor }) => richiami.current.onCambia(markdownDellEditor(e)),
    onBlur: () => richiami.current.onEsce(),
  })

  useEffect(() => {
    editor?.view.dom.setAttribute('aria-invalid', invalido ? 'true' : 'false')
  }, [editor, invalido])

  useImperativeHandle(
    ref,
    () => ({
      imposta: (nuovo) => {
        editor?.commands.setContent(nuovo ?? '', { contentType: 'markdown', emitUpdate: false })
      },
      testo: () => (editor ? markdownDellEditor(editor) : (testo ?? '')),
      focus: () => editor?.commands.focus('end'),
    }),
    [editor, testo],
  )

  if (!editor) return <>{riserva}</>
  return (
    <>
      <EditorContent editor={editor} />
      <MenuEvidenziatore
        editor={editor}
        onEsc={(evento) => richiami.current.onEsc(evento)}
        onLink={() => link.current?.modifica()}
        linkInModifica={() => link.current?.inModifica() ?? false}
      />
      <MenuLink editor={editor} ref={link} onEsc={(evento) => richiami.current.onEsc(evento)} />
    </>
  )
}
