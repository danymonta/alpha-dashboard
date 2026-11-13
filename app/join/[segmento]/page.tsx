import type { Metadata } from 'next'
import Link from 'next/link'
import { Clock, LinkIcon, ShieldCheck } from 'lucide-react'

import { ContinuaInvito } from '@/components/percorso/continua-invito'
import { CorniceAccesso, RigaStato } from '@/components/percorso/cornice-accesso'
import { buttonVariants } from '@/components/ui/button'
import { separaJoin } from '@/lib/onboarding/link'
import { sha256 } from '@/lib/percorso/accesso'
import { TESTI_JOIN as T } from '@/lib/percorso/testi'
import { createAdminClient } from '@/lib/supabase/admin'
import { cn } from '@/lib/utils'

export const metadata: Metadata = {
  title: T.titoloPagina,
  robots: { index: false, follow: false },
}

type Stato = 'attivo' | 'in_attesa' | 'non_attivo' | 'usato' | 'scaduto' | 'revocato' | 'non_valido'

/**
 * The page of the personal link /join/<slug>-<token> (release B1a): one page per state,
 * only the first name, never the email, never data of the path. GET only reads (a preview
 * of Telegram, which only does GET, consumes nothing): «Continua» is a form with a server
 * action. The token is read here and never again in an address.
 */
export default async function JoinPage({ params }: { params: Promise<{ segmento: string }> }) {
  const { segmento } = await params
  const parti = separaJoin(segmento)

  let stato: Stato = 'non_valido'
  let nome = ''
  if (parti) {
    const { data, error } = await createAdminClient().rpc('onboarding_join_leggi', {
      p_token_hash: sha256(parti.token),
      p_slug: parti.slug,
    })
    if (error) {
      console.error('[join] lettura del link non riuscita:', error.code)
      throw new Error(T.nonDisponibile)
    }
    const r = data && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, unknown>) : {}
    const letto = r.stato
    stato =
      letto === 'attivo' ||
      letto === 'in_attesa' ||
      letto === 'non_attivo' ||
      letto === 'usato' ||
      letto === 'scaduto' ||
      letto === 'revocato'
        ? letto
        : 'non_valido'
    nome = typeof r.nome === 'string' ? r.nome : ''
  }

  if (stato === 'attivo') {
    return (
      <CorniceAccesso titolo={T.attivo.saluto(nome)} sotto={T.attivo.sotto}>
        <ContinuaInvito segmento={segmento} />
      </CorniceAccesso>
    )
  }

  if (stato === 'usato') {
    return (
      <CorniceAccesso titolo={T.usato}>
        <Link href="/entra" data-slot="button" className={cn(buttonVariants(), 'h-11 w-full')}>
          {T.entra}
        </Link>
      </CorniceAccesso>
    )
  }

  const testo =
    stato === 'in_attesa'
      ? T.inAttesa
      : stato === 'non_attivo'
        ? T.nonAttivo
        : stato === 'scaduto'
          ? T.scaduto
          : T.nonValido
  const icona =
    stato === 'in_attesa' || stato === 'non_attivo' ? (
      <Clock className="size-4" aria-hidden="true" />
    ) : stato === 'scaduto' ? (
      <ShieldCheck className="size-4" aria-hidden="true" />
    ) : (
      <LinkIcon className="size-4" aria-hidden="true" />
    )
  return (
    <CorniceAccesso titolo={T.titoloPagina}>
      <RigaStato icona={icona}>{testo}</RigaStato>
    </CorniceAccesso>
  )
}
