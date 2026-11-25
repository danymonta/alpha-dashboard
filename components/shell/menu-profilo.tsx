'use client'

import { Menu as MenuPrimitive } from '@base-ui/react/menu'
import { ChevronsUpDown, LogOut, Settings, UserRound, type LucideIcon } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTransition } from 'react'

import { esci } from '@/app/auth/actions'
import { useLingua } from '@/components/i18n/lingua-provider'
import { FotoProfilo } from '@/components/profilo/foto-profilo'
import type { AppRole } from '@/lib/auth/roles'
import { SHELL } from '@/lib/i18n/testi/shell'
import { cn } from '@/lib/utils'

type Variante = 'barra' | 'laterale' | 'ridotta'

type Props = {
  ruolo: AppRole
  nome: string
  foto: string | null
  /** Where the photo sits: the phone's top bar, the sidebar, the shrunk sidebar. */
  variante: Variante
}

const VOCE =
  'flex min-h-11 w-full cursor-default items-center gap-3 rounded-md px-2.5 py-2 text-sm outline-none select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground'

/**
 * The menu of the profile photo (1.87.0, Dany 25/11/2026: «il pulsante impostazioni spostalo
 * sull'icona del profilo»): the profile, the settings for the admin and sign out, one tap away from
 * every page. The photo keeps data-tour="profilo" and the name it had (the tour points at it).
 */
export function MenuProfilo({ ruolo, nome, foto, variante }: Props) {
  const pathname = usePathname()
  const t = SHELL[useLingua()]
  const m = t.menuProfilo
  const [esce, avviaUscita] = useTransition()
  const attiva = pathname.startsWith('/account') || pathname.startsWith('/settings')

  const voci: { href: string; etichetta: string; aiuto: string; Icona: LucideIcon; attiva: boolean }[] = [
    { href: '/account', etichetta: m.profilo, aiuto: m.profiloAiuto, Icona: UserRound, attiva: pathname.startsWith('/account') },
  ]
  if (ruolo === 'admin') {
    voci.push({
      href: '/settings',
      etichetta: m.impostazioni,
      aiuto: m.impostazioniAiuto,
      Icona: Settings,
      attiva: pathname.startsWith('/settings'),
    })
  }

  return (
    <MenuPrimitive.Root>
      <MenuPrimitive.Trigger
        data-tour="profilo"
        data-attiva={attiva ? '' : undefined}
        aria-label={t.profilo(nome)}
        className={cn(
          'flex min-h-11 items-center rounded-lg hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none data-attiva:bg-accent data-popup-open:bg-accent',
          variante === 'barra' && 'size-11 justify-center hover:bg-transparent data-attiva:bg-transparent',
          variante === 'ridotta' && 'size-11 justify-center',
          variante === 'laterale' && 'w-full min-w-0 gap-3 px-2 py-1.5 text-left',
        )}
      >
        <FotoProfilo nome={nome} foto={foto} className={variante === 'barra' ? 'size-8' : undefined} />
        {variante === 'laterale' ? (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{nome}</span>
              <span className="block text-xs text-muted-foreground">{t.ruoli[ruolo]}</span>
            </span>
            <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </>
        ) : null}
      </MenuPrimitive.Trigger>
      <MenuPrimitive.Portal>
        <MenuPrimitive.Positioner
          className="isolate z-50 outline-none"
          side={variante === 'barra' ? 'bottom' : variante === 'ridotta' ? 'right' : 'top'}
          align={variante === 'barra' ? 'end' : 'start'}
          sideOffset={6}
        >
          <MenuPrimitive.Popup
            data-testid="menu-profilo"
            className="z-50 w-72 max-w-[calc(100vw-2rem)] origin-(--transform-origin) rounded-xl vetro-menu p-1.5 text-popover-foreground shadow-lg ring-1 ring-foreground/10 outline-none data-closed:animate-out data-closed:fade-out-0 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95"
          >
            <div className="flex items-center gap-3 px-2.5 pt-1.5 pb-2.5">
              <FotoProfilo nome={nome} foto={foto} />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{nome}</span>
                <span className="block text-xs text-muted-foreground">{t.ruoli[ruolo]}</span>
              </span>
            </div>
            <div className="my-1 h-px bg-border" role="separator" />
            {voci.map(({ href, etichetta, aiuto, Icona, attiva: qui }) => (
              <MenuPrimitive.LinkItem
                key={href}
                closeOnClick
                label={etichetta}
                aria-current={qui ? 'page' : undefined}
                render={<Link href={href} />}
                className={cn(VOCE, qui && 'bg-accent/60')}
              >
                <Icona className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block font-medium">{etichetta}</span>
                  <span className="block text-xs text-muted-foreground">{aiuto}</span>
                </span>
              </MenuPrimitive.LinkItem>
            ))}
            <div className="my-1 h-px bg-border" role="separator" />
            <MenuPrimitive.Item
              disabled={esce}
              onClick={() => avviaUscita(() => esci())}
              className={cn(VOCE, 'text-muted-foreground data-disabled:opacity-60')}
            >
              <LogOut className="size-4 shrink-0" aria-hidden="true" />
              {t.esci}
            </MenuPrimitive.Item>
          </MenuPrimitive.Popup>
        </MenuPrimitive.Positioner>
      </MenuPrimitive.Portal>
    </MenuPrimitive.Root>
  )
}
