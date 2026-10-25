'use client'

import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import { useEffect, useImperativeHandle, useRef, type ReactNode, type Ref } from 'react'

import './editor-sezione.css'

import { useTesti } from '@/components/i18n/lingua-provider'
import { CONTENUTO } from '@/lib/i18n/testi/contenuto'
import { estensioniEditor } from '@/lib/marketing/editor-markdown'

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
      handleKeyDown: (_view, evento) => {
        if (evento.key !== 'Escape') return false
        richiami.current.onEsc(evento)
        ;(document.activeElement as HTMLElement | null)?.blur()
        return true
      },
    },
    onUpdate: ({ editor: e }: { editor: Editor }) => richiami.current.onCambia(e.getMarkdown()),
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
      testo: () => editor?.getMarkdown() ?? testo ?? '',
      focus: () => editor?.commands.focus('end'),
    }),
    [editor, testo],
  )

  return editor ? <EditorContent editor={editor} /> : <>{riserva}</>
}
