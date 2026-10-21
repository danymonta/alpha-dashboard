import { LogOut } from 'lucide-react'
import { Suspense } from 'react'

import { PreferenzeAlfire } from '@/app/(app)/account/preferenze-alfire'
import { ProfiloForm } from '@/app/(app)/account/profilo-form'
import { SchedeAccount } from '@/app/(app)/account/schede'
import { esci } from '@/app/auth/actions'
import { AppCollegate, ScheletroAppCollegate } from '@/components/account/app-collegate'
import { ScheletroCollegaClaude, SezioneCollegaClaude } from '@/components/account/sezione-collega-claude'
import { LinkNotifiche } from '@/components/account/link-notifiche'
import { VoceNovita } from '@/components/changelog/voce-novita'
import { IntestazionePagina } from '@/components/pagina/intestazione'
import { SceltaTema } from '@/components/tema/scelta-tema'
import { RivediTutorial } from '@/components/tutorial/rivedi-tutorial'
import { TestaTutorial } from '@/components/tutorial/testa-tutorial'
import { Button } from '@/components/ui/button'
import { alfireConfigurata, nomeModelloAlfire, nomeModelloVisione } from '@/lib/alfire/config'
import { ETICHETTA_LIVELLO_PM, ETICHETTA_RUOLO, RUOLI_MCP, livelloPmEffettivo } from '@/lib/auth/roles'
import { requireProfilo } from '@/lib/auth/session'

export const dynamic = 'force-dynamic'

/** The person's own settings: profile, Alfire, account. Every role. */
export default async function AccountPage() {
  const profilo = await requireProfilo()

  return (
    <div className="max-w-2xl">
      <IntestazionePagina titolo="Il tuo profilo" descrizione="Foto, nome e preferenze: valgono solo per te." />
      <SchedeAccount
        profilo={
          <div className="space-y-8">
            <ProfiloForm id={profilo.id} nome={profilo.nome} foto={profilo.foto_url} />
            <SceltaTema />
          </div>
        }
        alfire={
          <PreferenzeAlfire
            configurata={alfireConfigurata()}
            modello={nomeModelloAlfire()}
            modelloVisione={nomeModelloVisione()}
          />
        }
        account={
          <div className="space-y-6">
            <dl className="divide-y divide-border rounded-xl bg-card">
              {[
                ['Email', profilo.email],
                ['Ruolo', ETICHETTA_RUOLO[profilo.ruolo]],
                ['Livello nei progetti', ETICHETTA_LIVELLO_PM[livelloPmEffettivo(profilo.ruolo, profilo.livello_pm)]],
                ['Accesso', 'Con Google, su invito'],
              ].map(([voce, valore]) => (
                <div key={voce} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-0.5 px-4 py-3">
                  <dt className="text-sm text-muted-foreground">{voce}</dt>
                  <dd className="min-w-0 truncate text-sm font-medium">{valore}</dd>
                </div>
              ))}
            </dl>
            <p className="text-sm text-muted-foreground">Ruolo e livello li cambia l’admin in Impostazioni › Team.</p>
            {/* Claude connected to the content calendar (09/10/2026): the steps for who may
                connect it, and every role's own connected apps, each streamed on its own */}
            {RUOLI_MCP.includes(profilo.ruolo) ? (
              <Suspense fallback={<ScheletroCollegaClaude />}>
                <SezioneCollegaClaude admin={profilo.ruolo === 'admin'} />
              </Suspense>
            ) : null}
            <Suspense fallback={<ScheletroAppCollegate />}>
              <AppCollegate />
            </Suspense>
            {/* the notification center (1.41.0): the emails the app sends, saved here too */}
            <LinkNotifiche />
            {/* the version in use and what changes in this person's work (CLAUDE.md section 23) */}
            <VoceNovita testId="voce-novita-profilo" descrizione="cosa cambia nel tuo lavoro a ogni aggiornamento." />
            <div className="flex flex-wrap gap-2">
              <RivediTutorial />
              {/* admin, phone only: on desktop it sits top right */}
              {profilo.ruolo === 'admin' ? <TestaTutorial conEtichetta variant="outline" className="md:hidden" /> : null}
              <form action={esci}>
                <Button type="submit" variant="outline" className="h-11">
                  <LogOut className="size-4" aria-hidden="true" />
                  Esci
                </Button>
              </form>
            </div>
          </div>
        }
      />
    </div>
  )
}
