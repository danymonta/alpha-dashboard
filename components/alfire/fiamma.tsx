'use client'

import { useId } from 'react'

import { cn } from '@/lib/utils'

/**
 * Alfire's mark: a small flame in the brand fire colours (--brand-fire-*).
 * Still at rest; it flickers while its button is hovered or focused (the
 * parent carries `group`). prefers-reduced-motion keeps it still.
 */
export function Fiamma({ className, accesa = false }: { className?: string; accesa?: boolean }) {
  // unique gradient ids: a gradient defined inside a hidden copy (the mobile
  // bar on desktop) would not paint the visible one
  const id = useId()
  const gradFiamma = `${id}-fiamma`
  const gradCuore = `${id}-cuore`
  const fiamma = accesa
    ? 'motion-safe:animate-[brand-flicker-a_1.1s_ease-in-out_infinite]'
    : 'motion-safe:group-hover:animate-[brand-flicker-a_1.1s_ease-in-out_infinite] motion-safe:group-focus-visible:animate-[brand-flicker-a_1.1s_ease-in-out_infinite]'
  const cuore = accesa
    ? 'motion-safe:animate-[brand-flicker-b_0.8s_ease-in-out_infinite]'
    : 'motion-safe:group-hover:animate-[brand-flicker-b_0.8s_ease-in-out_infinite] motion-safe:group-focus-visible:animate-[brand-flicker-b_0.8s_ease-in-out_infinite]'

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={cn('size-5 overflow-visible', className)}>
      <defs>
        <linearGradient id={gradFiamma} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="var(--brand-fire-deep)" />
          <stop offset="45%" stopColor="var(--brand-fire-ember)" />
          <stop offset="100%" stopColor="var(--brand-fire-flame)" />
        </linearGradient>
        <linearGradient id={gradCuore} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="var(--brand-fire-flame)" />
          <stop offset="100%" stopColor="var(--brand-fire-core)" />
        </linearGradient>
      </defs>
      {/* glow behind the flame, only while it burns */}
      <circle
        cx="12"
        cy="15"
        r="8"
        fill="var(--brand-fire-ember)"
        className={cn(
          'opacity-0 blur-[5px] transition-opacity duration-300',
          accesa ? 'opacity-35' : 'group-hover:opacity-35 group-focus-visible:opacity-35',
        )}
      />
      <path
        d="M12 2.2c.4 3.1 2.3 4.6 3.9 6.4 1.7 1.9 3.1 3.9 3.1 6.8A7 7 0 0 1 12 22.2a7 7 0 0 1-7-6.8c0-2.4 1-4.2 2.4-5.6.3 1.6 1.1 2.6 2.2 3.1-.3-3.9 1-7.5 2.4-10.7Z"
        fill={`url(#${gradFiamma})`}
        style={{ transformOrigin: '12px 22px', transformBox: 'view-box' }}
        className={fiamma}
      />
      <path
        d="M12.2 11.4c.3 1.8 1.6 2.7 2.3 3.9.5.9.6 1.6.6 2.2a3.1 3.1 0 0 1-6.2 0c0-1.2.6-2.1 1.3-2.8.2.8.6 1.2 1.1 1.4-.2-1.7.1-3.2.9-4.7Z"
        fill={`url(#${gradCuore})`}
        style={{ transformOrigin: '12px 21px', transformBox: 'view-box' }}
        className={cuore}
      />
    </svg>
  )
}
