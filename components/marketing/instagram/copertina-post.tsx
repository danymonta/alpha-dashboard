'use client'

import { Clapperboard, ExternalLink, GalleryHorizontal, Image as ImmagineIcona } from 'lucide-react'
import { useState } from 'react'

import type { TipoPost } from '@/lib/marketing/abbinamento'
import { cn } from '@/lib/utils'

/** The action button of a toast with «Annulla»: 44 px, like every target. */
export const AZIONE_TOAST = 'h-11! px-4! text-sm!'

const ICONA_TIPO = { reel: Clapperboard, carousel: GalleryHorizontal, foto: ImmagineIcona } as const

/**
 * A post's cover (spec D18): an <img> straight from Instagram's CDN, never
 * next/image (signed URLs that expire would go through Vercel's optimizer and
 * its quota), no referrer, lazy. Without a cover, or when it does not load
 * (expired, or the CDN refuses another site), the icon of the type. Decorative:
 * the card says what the post is in words.
 */
export function CopertinaPost({ url, tipo, className }: { url: string | null; tipo: TipoPost; className?: string }) {
  const [rotta, setRotta] = useState<string | null>(null)
  const Icona = ICONA_TIPO[tipo]
  if (!url || rotta === url) {
    return (
      <div
        aria-hidden="true"
        className={cn('flex h-16 w-12 shrink-0 items-center justify-center rounded-md bg-muted', className)}
      >
        <Icona className="size-5 text-muted-foreground" />
      </div>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- signed CDN URLs that expire: never through Vercel's optimizer (spec D18)
    <img
      src={url}
      alt=""
      width={48}
      height={64}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setRotta(url)}
      className={cn('h-16 w-12 shrink-0 rounded-md bg-muted object-cover', className)}
    />
  )
}

/** «Apri su Instagram»: 44 px, a new tab, said to screen readers. */
export function ApriSuInstagram({ href, className }: { href: string; className?: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
        className,
      )}
    >
      <ExternalLink className="size-4 shrink-0" aria-hidden="true" />
      Apri su Instagram
      <span className="sr-only">(si apre in una nuova scheda)</span>
    </a>
  )
}

/** The first lines of a caption, or «Senza didascalia». */
export function Didascalia({ testo, righe = 2, className }: { testo: string | null; righe?: 2 | 3; className?: string }) {
  if (!testo) return <p className={cn('text-sm text-muted-foreground italic', className)}>Senza didascalia</p>
  return (
    <p
      className={cn(
        'text-sm break-words whitespace-pre-line',
        righe === 2 ? 'line-clamp-2' : 'line-clamp-3',
        className,
      )}
    >
      {testo}
    </p>
  )
}
