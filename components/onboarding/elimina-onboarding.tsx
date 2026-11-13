'use client'

import { Info } from 'lucide-react'

import { eliminaOnboarding } from '@/app/(app)/onboarding/actions'
import { Elimina } from '@/components/form/elimina'
import { useLingua } from '@/components/i18n/lingua-provider'
import { ONBOARDING, traduciErroreOnboarding } from '@/lib/i18n/testi/onboarding'

/**
 * «Elimina onboarding» at the bottom of the card (release B1a, Dany 12/11/2026): only for an
 * onboarding whose client has not registered; the question of components/form/elimina.tsx
 * counts what goes (anteprima_eliminazione('onboarding')). With an account it says why it
 * is not there and points to «Revoca».
 */
export function EliminaOnboarding({ clientId, cliente, registrato }: { clientId: string; cliente: string; registrato: boolean }) {
  const lingua = useLingua()
  const t = ONBOARDING[lingua].cliente
  return (
    <section aria-labelledby="elimina-onboarding-titolo" className="space-y-2 rounded-xl bg-card p-3" data-testid="riquadro-elimina">
      <h2 id="elimina-onboarding-titolo" className="text-sm font-medium">
        {t.eliminaTitolo}
      </h2>
      {registrato ? (
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {t.eliminaRegistrato}
        </p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">{t.eliminaAiuto}</p>
          <Elimina
            cosa={t.eliminaCosa(cliente)}
            fatto={t.eliminaFatto}
            etichetta={t.eliminaTitolo}
            anteprima={{ tipo: 'onboarding', id: clientId }}
            dopo="/onboarding"
            azione={async () => {
              const esito = await eliminaOnboarding({ client_id: clientId })
              return esito.ok ? esito : { ok: false, errore: traduciErroreOnboarding(esito.errore, lingua) }
            }}
          />
        </>
      )}
    </section>
  )
}
