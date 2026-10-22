import { useId } from 'react'

import type { Lingua } from '@/lib/i18n/lingua'
import { cn } from '@/lib/utils'

/**
 * The flag of a language, drawn (an emoji flag is two letters on Windows): the Italian
 * tricolour, the Union Jack for English. Decoration only: the code and the name next to
 * it say the language, never the flag alone. Colours from the --bandiera-* tokens.
 */
export function Bandiera({ lingua, className }: { lingua: Lingua; className?: string }) {
  // two flags on a page (the phone's bar and the computer's) need two clip paths
  const taglio = `bandiera-uk-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  if (lingua === 'it') {
    return (
      <svg viewBox="0 0 3 2" aria-hidden="true" className={cn('h-3 w-[18px] shrink-0 rounded-[2px]', className)}>
        <rect width="1" height="2" x="0" fill="var(--bandiera-it-verde)" />
        <rect width="1" height="2" x="1" fill="var(--bandiera-it-bianco)" />
        <rect width="1" height="2" x="2" fill="var(--bandiera-it-rosso)" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 60 30" aria-hidden="true" className={cn('h-3 w-6 shrink-0 rounded-[2px]', className)}>
      <clipPath id={taglio}>
        <path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z" />
      </clipPath>
      <path d="M0,0 v30 h60 v-30 z" fill="var(--bandiera-uk-blu)" />
      <path d="M0,0 L60,30 M60,0 L0,30" stroke="var(--bandiera-uk-bianco)" strokeWidth="6" />
      <path d="M0,0 L60,30 M60,0 L0,30" clipPath={`url(#${taglio})`} stroke="var(--bandiera-uk-rosso)" strokeWidth="4" />
      <path d="M30,0 v30 M0,15 h60" stroke="var(--bandiera-uk-bianco)" strokeWidth="10" />
      <path d="M30,0 v30 M0,15 h60" stroke="var(--bandiera-uk-rosso)" strokeWidth="6" />
    </svg>
  )
}
