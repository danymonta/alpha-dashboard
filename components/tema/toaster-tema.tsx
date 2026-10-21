'use client'

import type { ComponentProps } from 'react'

import { useTema } from '@/components/tema/tema-provider'
import { Toaster } from '@/components/ui/sonner'

/** The toaster of the app, in the page's theme (light, dark, or the device's). */
export function ToasterTema(props: Omit<ComponentProps<typeof Toaster>, 'theme'>) {
  const { tema } = useTema()
  return <Toaster {...props} theme={tema === 'chiaro' ? 'light' : tema === 'sistema' ? 'system' : 'dark'} />
}
