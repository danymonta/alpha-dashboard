'use client'

import { MessageCircle, Reply } from 'lucide-react'

import { useLingua } from '@/components/i18n/lingua-provider'
import { useFatti } from '@/components/insight/fatti'
import { InterruttoreFatto } from '@/components/insight/interruttore-fatto'
import { MessaggioCopiabile } from '@/components/insight/messaggio-copiabile'
import type { LinkSenzaPrenotazione } from '@/lib/insight/calendly'
import type { Fonte } from '@/lib/insight/canale'
import { LINK_INBOX_MESSENGER, linkChatInstagram } from '@/lib/insight/link'
import { CALENDLY } from '@/lib/i18n/testi/calendly'
import { cn } from '@/lib/utils'

/**
 * The cards of one channel: the ones still to do first, the ticked ones
 * below, struck through. The tick is the Insight's «Fatto» of that recap
 * (FattiProvider), so Oggi and the Insight never disagree.
 */
export function ListaCalendly({ fonte, righe }: { fonte: Fonte; righe: LinkSenzaPrenotazione[] }) {
  const t = CALENDLY[useLingua()]
  const { fatto } = useFatti()
  const ordinate = [...righe].sort((a, b) => Number(fatto(a.chiave)) - Number(fatto(b.chiave)))

  return (
    <ul className="space-y-2">
      {ordinate.map((r) => {
        const chi = r.username ? `@${r.username}` : r.nome
        const fattaGia = fatto(r.chiave)
        const link = fonte === 'instagram' ? linkChatInstagram(r.username) : LINK_INBOX_MESSENGER
        return (
          <li
            key={r.chiave}
            data-testid="calendly-lead"
            data-fatto={fattaGia || undefined}
            className={cn('space-y-2 rounded-xl border border-border bg-card p-3', fattaGia && 'opacity-60')}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className={cn('font-medium wrap-anywhere', fattaGia && 'line-through')}>
                  {r.nome || chi}
                  {r.username && r.nome ? <span className="ml-1.5 text-sm font-normal text-muted-foreground">@{r.username}</span> : null}
                </p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                  <span className={cn('num', (r.giorni ?? 0) >= 3 && 'font-medium text-status-warning')}>{t.giorni(r.giorni)}</span>
                  {r.ultimo_da_lead ? (
                    <span className="inline-flex items-center gap-1 font-medium text-foreground">
                      <Reply className="size-3.5" aria-hidden="true" />
                      {t.haRisposto}
                    </span>
                  ) : null}
                </p>
              </div>
              <InterruttoreFatto chiave={r.chiave} chi={chi} />
            </div>

            {r.situazione ? (
              <p lang="it" className="text-sm text-muted-foreground">
                {r.situazione}
              </p>
            ) : null}

            {r.messaggio ? (
              <MessaggioCopiabile eyebrow={t.messaggio} testo={r.messaggio} nomeCopia={t.copia(chi)} />
            ) : (
              <p className="text-sm text-muted-foreground">{t.nienteDaScrivere}</p>
            )}
            {r.alternativa ? (
              <MessaggioCopiabile eyebrow={t.alternativa} testo={r.alternativa} nomeCopia={t.copiaAlternativa(chi)} />
            ) : null}

            {link ? (
              <a
                href={link}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={fonte === 'instagram' ? t.apriChatDi(chi) : t.apriInbox}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-1 text-sm font-medium underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <MessageCircle className="size-4" aria-hidden="true" />
                {fonte === 'instagram' ? t.apriChat : t.apriInbox}
              </a>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}
