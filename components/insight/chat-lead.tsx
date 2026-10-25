'use client'

import { ChevronRight, ExternalLink } from 'lucide-react'
import { useId, useState } from 'react'

import { useLingua } from '@/components/i18n/lingua-provider'
import { BottoneCopia } from '@/components/insight/bottone-copia'
import { buttonVariants } from '@/components/ui/button'
import type { Fonte } from '@/lib/insight/canale'
import { chiCopia, trascrizioneChat } from '@/lib/insight/copia-chat'
import { LINK_INBOX_MESSENGER, linkChatInstagram } from '@/lib/insight/link'
import { INSIGHT_RECAP } from '@/lib/i18n/testi/insight-recap'
import type { LeadRecap } from '@/lib/insight/recap'
import { cn } from '@/lib/utils'

/**
 * The chat of a lead, as the artifact: «Leggi la chat (N messaggi)» opens the
 * bubbles (the lead on the left, Percorso Alpha on the right, each with who
 * and when), «Copia chat» copies the transcript, «Apri la chat su Instagram»
 * (or «Apri la inbox Messenger») takes to the conversation in one tap, also
 * with the chat closed: copy the message, open the chat, paste.
 *
 * «Copia chat» is a button next to the disclosure, never inside it (the
 * artifact had it inside <summary>: a control in a control). The bubbles are
 * rendered only when the chat is open, so a recap of a hundred chats does not
 * carry six hundred bubbles in its HTML. A card without messages (an
 * under-14 lead, D25) has only the link.
 */
export function ChatLead({
  lead,
  fonte,
}: {
  lead: Pick<LeadRecap, 'username' | 'name' | 'messages' | 'minore_14'>
  fonte: Fonte
}) {
  const [aperta, setAperta] = useState(false)
  const id = useId()
  const t = INSIGHT_RECAP[useLingua()]
  const { chat: CHAT, copia: COPIA } = t
  const chi = chiCopia(lead, fonte)
  const messaggi = lead.minore_14 ? [] : lead.messages
  const link = fonte === 'messenger' ? LINK_INBOX_MESSENGER : linkChatInstagram(lead.username)
  const etichettaLink = fonte === 'messenger' ? CHAT.apriMessenger : CHAT.apriInstagram

  if (!messaggi.length && !link) return null

  return (
    <div className="border-t border-border pt-2">
      {messaggi.length ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            aria-expanded={aperta}
            aria-controls={`chat-${id}`}
            onClick={() => setAperta((a) => !a)}
            className="-ml-1 inline-flex min-h-11 items-center gap-2 rounded-lg px-1 text-sm font-medium text-foreground hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <ChevronRight
              className={cn('size-4 motion-safe:transition-transform', aperta && 'rotate-90')}
              aria-hidden="true"
            />
            {CHAT.leggi} <span className="num text-muted-foreground">{t.quantiMessaggi(messaggi.length)}</span>
          </button>
          <BottoneCopia
            testo={trascrizioneChat({ ...lead, messages: messaggi }, fonte)}
            etichetta={COPIA.copiaChat}
            nome={t.copiaChatCon(chi)}
          />
        </div>
      ) : null}
      {aperta && messaggi.length ? (
        <div
          id={`chat-${id}`}
          role="region"
          aria-label={t.chatCon(chi)}
          tabIndex={0}
          className="mt-2 flex max-h-[min(520px,70svh)] flex-col gap-2 overflow-y-auto overscroll-contain rounded-lg pr-1 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          {messaggi.map((m, i) => {
            const nostro = m.from === 'alpha'
            return (
              <div
                key={i}
                data-da={m.from}
                className={cn(
                  'grid max-w-[88%] gap-0.5 rounded-xl px-3 py-2 text-sm whitespace-pre-wrap [overflow-wrap:anywhere] sm:max-w-[78%]',
                  nostro ? 'self-end rounded-br-sm bg-primary/25' : 'self-start rounded-bl-sm bg-background',
                )}
              >
                <span className="num block text-xs text-muted-foreground">
                  {nostro ? CHAT.percorsoAlpha : chi}
                  {m.time ? ` · ${m.time}` : ''}
                </span>
                <span lang="it">{m.text}</span>
              </div>
            )
          })}
        </div>
      ) : null}
      {link ? (
        <div className="mt-2 flex justify-end">
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(buttonVariants({ variant: 'outline' }), 'h-11 gap-1.5 px-3')}
          >
            <ExternalLink className="size-4" aria-hidden="true" />
            {etichettaLink}
            <span className="sr-only">{t.nuovaScheda}</span>
          </a>
        </div>
      ) : null}
    </div>
  )
}
