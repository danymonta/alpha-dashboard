'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import type { ReactNode } from 'react'

import { useTesti } from '@/components/i18n/lingua-provider'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ACCOUNT } from '@/lib/i18n/testi/account'

const SCHEDE = [{ valore: 'profilo' }, { valore: 'alfire' }, { valore: 'account' }] as const

type Scheda = (typeof SCHEDE)[number]['valore']

/** The open tab lives in the URL (?scheda=alfire): shareable, survives a refresh. */
export function SchedeAccount(contenuti: Record<Scheda, ReactNode>) {
  const router = useRouter()
  const params = useSearchParams()
  const etichette = useTesti(ACCOUNT).schede
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
            {etichette[s.valore]}
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
