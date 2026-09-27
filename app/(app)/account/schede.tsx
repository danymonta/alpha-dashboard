'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import type { ReactNode } from 'react'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

const SCHEDE = [
  { valore: 'profilo', etichetta: 'Profilo' },
  { valore: 'alfire', etichetta: 'Alfire' },
  { valore: 'account', etichetta: 'Account' },
] as const

type Scheda = (typeof SCHEDE)[number]['valore']

/** The open tab lives in the URL (?scheda=alfire): shareable, survives a refresh. */
export function SchedeAccount(contenuti: Record<Scheda, ReactNode>) {
  const router = useRouter()
  const params = useSearchParams()
  const richiesta = params.get('scheda')
  const attiva: Scheda = SCHEDE.some((s) => s.valore === richiesta) ? (richiesta as Scheda) : 'profilo'

  return (
    <Tabs
      value={attiva}
      onValueChange={(v) => router.replace(v === 'profilo' ? '/account' : `/account?scheda=${v}`, { scroll: false })}
      className="gap-6"
    >
      <TabsList variant="line" className="w-full group-data-horizontal/tabs:h-11 md:w-fit">
        {SCHEDE.map((s) => (
          <TabsTrigger key={s.valore} value={s.valore} className="min-h-10 px-4">
            {s.etichetta}
          </TabsTrigger>
        ))}
      </TabsList>
      {SCHEDE.map((s) => (
        <TabsContent key={s.valore} value={s.valore}>
          {contenuti[s.valore]}
        </TabsContent>
      ))}
    </Tabs>
  )
}
