import { PackageX, Rocket, SearchX } from 'lucide-react'
import type { ReactNode } from 'react'

import { SoloSeFermo } from '@/app/(app)/onboarding/nuovo/palco'
import { WizardNuovoCliente } from '@/app/(app)/onboarding/nuovo/wizard'
import { LinkBottone } from '@/components/link-bottone'
import { IntestazionePagina } from '@/components/pagina/intestazione'
import { StatoVuoto } from '@/components/stati/stato-vuoto'
import { percorsoDiRitorno } from '@/lib/auth/origine'
import { requireRuolo } from '@/lib/auth/session'
import { oggiRoma } from '@/lib/date'
import { getLingua } from '@/lib/i18n/server'
import { NUOVA_VENDITA } from '@/lib/i18n/testi/nuova-vendita'
import { ONBOARDING } from '@/lib/i18n/testi/onboarding'
import { LetturaNonRiuscita, leggiImpostazioni, leggiIngressoWizard, leggiPersone } from '@/lib/onboarding/letture'
import { incarichiPredefiniti } from '@/lib/onboarding/stati'
import { isUuid } from '@/lib/progetti'
import { createClient } from '@/lib/supabase/server'
import { leggiPianoPredefinito } from '@/lib/validation/anagrafiche'

export const dynamic = 'force-dynamic'

/**
 * The wizard «Nuovo cliente» (1.77.0, docs/onboarding/rilascio-a.md): three screens
 * (client, sale, team), a summary and the last screen. Four ways in: the menu (empty),
 * `?call=` (a closed call without its sale: the lead's data), `?vendita=` and `?cliente=`
 * (a «nuovo» sale that exists: «Avvia onboarding», without the screen of the sale).
 * Admin only; the reads go through the admin's session and RLS.
 */
export default async function NuovoClientePage({
  searchParams,
}: {
  searchParams: Promise<{ call?: string; vendita?: string; cliente?: string; da?: string; avviato?: string }>
}) {
  const profilo = await requireRuolo(['admin'])
  const { call, vendita, cliente, da, avviato } = await searchParams

  // «?da=»: the page the call was closed from (the closer's day), only a path of this app
  const tornaA = percorsoDiRitorno(da)
  const lingua = await getLingua()
  const t = ONBOARDING[lingua]
  const supabase = await createClient()
  const oggi = oggiRoma()

  const [ingresso, { data: prodotti, error: erroreProdotti }, persone, impostazioni] = await Promise.all([
    leggiIngressoWizard(supabase, { call, vendita, cliente }, oggi),
    supabase
      .from('products')
      .select('id, nome, durata_mesi, prezzo_listino, piano_predefinito')
      .eq('attivo', true)
      .order('durata_mesi'),
    leggiPersone(supabase),
    leggiImpostazioni(supabase),
  ])
  if (erroreProdotti) throw new LetturaNonRiuscita('Onboarding: i prodotti non si leggono', erroreProdotti.code)

  const indietro = { href: '/onboarding', etichetta: t.titolo }

  // the wizard is done (its last screen wrote `?avviato=` in the address): after a reload, or Back and
  // Forward, the way to the client's card, never an empty wizard that would start him a second time.
  // Never a redirect: the actions of the last screen redraw this same address under it.
  if (avviato && isUuid(avviato)) {
    const parole = t.wizard.impossibile.gia_avviato
    return (
      <SoloSeFermo>
        <div className="max-w-xl space-y-6" data-testid="wizard-avviato">
          <IntestazionePagina titolo={t.wizard.titolo} indietro={indietro} />
          <StatoVuoto
            Icona={Rocket}
            titolo={parole.titolo}
            descrizione={parole.descrizione}
            azione={
              <div className="flex flex-wrap justify-center gap-2">
                <LinkBottone href={`/onboarding/${avviato}`}>{t.apriOnboarding}</LinkBottone>
                <LinkBottone href="/onboarding/nuovo" variant="outline">
                  {t.nuovoCliente}
                </LinkBottone>
              </div>
            }
          />
        </div>
      </SoloSeFermo>
    )
  }

  if (ingresso.modo === 'impossibile') {
    const parole = t.wizard.impossibile[ingresso.motivo]
    let azione: ReactNode = (
      <LinkBottone href="/onboarding" variant="outline">
        {t.tornaOnboarding}
      </LinkBottone>
    )
    if (ingresso.motivo === 'gia_avviato' && ingresso.clienteId) {
      azione = (
        <div className="flex flex-wrap justify-center gap-2">
          <LinkBottone href={`/onboarding/${ingresso.clienteId}`}>{t.apriOnboarding}</LinkBottone>
          {/* a client already in onboarding who buys again in a call: the sale alone, as before */}
          {call && !ingresso.saleId ? (
            <LinkBottone
              href={`/sales/new?${new URLSearchParams({ call, ...(tornaA ? { da: tornaA } : {}) }).toString()}`}
              variant="outline"
            >
              {t.agganci.soloVendita}
            </LinkBottone>
          ) : null}
        </div>
      )
    } else if (ingresso.motivo === 'vendita_non_nuovo' && ingresso.saleId) {
      azione = (
        <LinkBottone href={`/sales/${ingresso.saleId}`} variant="outline">
          {t.apriVendita}
        </LinkBottone>
      )
    } else if (ingresso.motivo === 'call_non_chiusa' || ingresso.motivo === 'call_non_trovata') {
      azione = (
        <LinkBottone href="/calls" variant="outline">
          {NUOVA_VENDITA[lingua].tornaAlleCall}
        </LinkBottone>
      )
    }
    return (
      // while a confirmation of this same wizard is arriving the last screen is about to take the stage
      <SoloSeFermo>
        <div className="max-w-xl space-y-6" data-testid="wizard-impossibile" data-motivo={ingresso.motivo}>
          <IntestazionePagina titolo={t.wizard.titolo} indietro={indietro} />
          <StatoVuoto Icona={SearchX} titolo={parole.titolo} descrizione={parole.descrizione} azione={azione} />
        </div>
      </SoloSeFermo>
    )
  }

  // the screen «Vendita» needs the catalogue, as «Nuova vendita» does
  if (ingresso.modo === 'nuovo' && prodotti.length === 0) {
    const v = NUOVA_VENDITA[lingua]
    return (
      <div className="max-w-xl space-y-6">
        <IntestazionePagina titolo={t.wizard.titolo} indietro={indietro} />
        <StatoVuoto Icona={PackageX} titolo={v.nessunProdotto} descrizione={v.nessunProdottoDescrizione} />
      </div>
    )
  }

  const proposti = incarichiPredefiniti(impostazioni, persone, profilo.id)
  const conPredefiniti = Boolean(
    impostazioni.coach_predefinito_id || impostazioni.revisore_predefinito_id || impostazioni.responsabile_predefinito_id,
  )

  return (
    <WizardNuovoCliente
      // another way in is another wizard: nothing of the one before stays
      key={`${ingresso.modo}:${call ?? ''}:${vendita ?? ''}:${cliente ?? ''}`}
      ingresso={ingresso}
      prodotti={prodotti.map((p) => ({ ...p, piano_predefinito: leggiPianoPredefinito(p.piano_predefinito) }))}
      persone={persone.map(({ id, nome }) => ({ id, nome }))}
      io={profilo.id}
      proposti={proposti}
      conPredefiniti={conPredefiniti}
      aperto={impostazioni.aperto_ai_clienti}
      oggi={oggi}
      ritorno={tornaA}
    />
  )
}
