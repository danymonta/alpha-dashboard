import { CircleCheck, Clock, TriangleAlert } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'

import { InterruttoriCall, LimiteSpesaCall } from '@/app/(app)/settings/fathom/fathom-client'
import { IntestazionePagina } from '@/components/pagina/intestazione'
import { requireRuolo } from '@/lib/auth/session'
import { formato } from '@/lib/format'
import { getLingua } from '@/lib/i18n/server'
import { FATHOM } from '@/lib/i18n/testi/fathom'
import { formatDollari, IMPOSTAZIONI, traduciImpostazioni } from '@/lib/i18n/testi/impostazioni'
import { insightConfigurato } from '@/lib/insight/config'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

type Situazione = {
  analisi_attive?: boolean
  costo_mese?: number
  costo_max?: number
  analisi_mese?: number
  spunti_mese?: number
  analisi_in_coda?: number
  ultimo_errore?: string | null
  ultimo_esito?: string | null
  ultimo_passo_il?: string | null
}

function Riquadro({ titolo, children }: { titolo: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-xl bg-card p-4">
      <h2 className="text-sm font-medium">{titolo}</h2>
      {children}
    </section>
  )
}

export default async function ImpostazioniFathomPage() {
  await requireRuolo(['admin'])
  const lingua = await getLingua()
  const t = FATHOM[lingua].pagina
  const { formatData } = formato(lingua)
  const usd = (n: number) => formatDollari(n, lingua)
  const supabase = await createClient()
  const [collegamento, presente, situazione] = await Promise.all([
    supabase.from('fathom_collegamento').select('chiave_aggiornata_il, ultima_prova_il, ultimo_errore, ultimo_errore_il').maybeSingle(),
    supabase.rpc('fathom_chiave_presente'),
    supabase.rpc('call_lavori_situazione'),
  ])
  if (collegamento.error || presente.error || situazione.error) throw new Error(t.errore)
  const c = collegamento.data
  const s = (situazione.data ?? {}) as Situazione
  const costo = s.costo_mese ?? 0
  const limite = s.costo_max ?? 10
  const chiaveClaude = insightConfigurato()

  return (
    <div className="max-w-3xl space-y-6">
      <IntestazionePagina
        indietro={{ href: '/settings', etichetta: IMPOSTAZIONI[lingua].titolo }}
        titolo={t.titolo}
        descrizione={t.descrizione}
      />

      <Riquadro titolo={t.collegamento}>
        <p className="flex items-start gap-2 text-sm" data-testid="fathom-stato">
          {presente.data ? (
            <>
              <CircleCheck className="mt-0.5 size-4 shrink-0 text-status-ok" aria-hidden="true" />
              {t.collegato(c?.chiave_aggiornata_il ? formatData(c.chiave_aggiornata_il) : null)}
            </>
          ) : (
            <>
              <Clock className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              {t.nonCollegato}
            </>
          )}
        </p>
        {c?.ultimo_errore ? (
          <p role="alert" className="flex items-start gap-2 text-sm text-status-critical" data-testid="fathom-errore">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {traduciImpostazioni(c.ultimo_errore, lingua)}
          </p>
        ) : null}
        <p className="text-sm">
          <Link href="/settings/chiavi#fathom" className="underline underline-offset-4 hover:text-foreground">
            {t.incollaChiave}
          </Link>
          {t.conGuida}
        </p>
        <p className="text-xs text-muted-foreground">
          {t.nota}
        </p>
      </Riquadro>

      <Riquadro titolo={t.analisi}>
        {!chiaveClaude ? (
          <p role="alert" className="flex items-start gap-2 text-sm text-status-warning" data-testid="fathom-senza-claude">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {t.senzaClaude}{' '}
            <Link href="/settings/chiavi#anthropic" className="underline underline-offset-4">
              {t.chiaviECollegamenti}
            </Link>
            .
          </p>
        ) : null}
        <p className="text-sm" data-testid="fathom-costo">
          {t.costo(usd(costo), usd(limite))}
          {s.analisi_mese !== undefined ? t.analisiMese(s.analisi_mese) : ''}
          {s.spunti_mese !== undefined ? t.spuntiMese(s.spunti_mese) : ''}
          {s.analisi_in_coda ? t.inCoda(s.analisi_in_coda) : ''}
        </p>
        {costo >= limite ? (
          <p role="status" className="flex items-start gap-2 text-sm text-status-warning">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {t.limiteRaggiunto}
          </p>
        ) : null}
        {s.ultimo_errore ? (
          <p className="text-sm text-muted-foreground" data-testid="fathom-ultimo-errore">
            {t.ultimoProblema(traduciImpostazioni(s.ultimo_errore, lingua))}
          </p>
        ) : null}
        <InterruttoriCall analisi={s.analisi_attive ?? true} />
        <LimiteSpesaCall valore={limite} />
        <p className="text-xs text-muted-foreground">
          {t.notaAnalisi}
        </p>
      </Riquadro>
    </div>
  )
}
