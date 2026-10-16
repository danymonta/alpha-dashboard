import { CircleCheck, Clock, TriangleAlert } from 'lucide-react'
import type { ReactNode } from 'react'

import { ChiaveFathom, InterruttoriCall, LimiteSpesaCall } from '@/app/(app)/settings/fathom/fathom-client'
import { IntestazionePagina } from '@/components/pagina/intestazione'
import { requireRuolo } from '@/lib/auth/session'
import { formatData } from '@/lib/format'
import { insightConfigurato } from '@/lib/insight/config'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

type Situazione = {
  analisi_attive?: boolean
  spunti_automatici?: boolean
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

const usd = (n: number) => `${n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`

export default async function ImpostazioniFathomPage() {
  await requireRuolo(['admin'])
  const supabase = await createClient()
  const [collegamento, presente, situazione] = await Promise.all([
    supabase.from('fathom_collegamento').select('chiave_aggiornata_il, ultima_prova_il, ultimo_errore, ultimo_errore_il').maybeSingle(),
    supabase.rpc('fathom_chiave_presente'),
    supabase.rpc('call_lavori_situazione'),
  ])
  if (collegamento.error || presente.error || situazione.error) throw new Error('Impossibile caricare il collegamento di Fathom')
  const c = collegamento.data
  const s = (situazione.data ?? {}) as Situazione
  const costo = s.costo_mese ?? 0
  const limite = s.costo_max ?? 10
  const chiaveClaude = insightConfigurato()

  return (
    <div className="max-w-3xl space-y-6">
      <IntestazionePagina
        titolo="Fathom"
        descrizione="Le registrazioni delle call e l’analisi di Claude: la chiave per leggere da Fathom, gli interruttori e il limite di spesa."
      />

      <Riquadro titolo="Collegamento">
        <p className="flex items-start gap-2 text-sm" data-testid="fathom-stato">
          {presente.data ? (
            <>
              <CircleCheck className="mt-0.5 size-4 shrink-0 text-status-ok" aria-hidden="true" />
              Fathom è collegato
              {c?.chiave_aggiornata_il ? `: chiave salvata il ${formatData(c.chiave_aggiornata_il)}` : ''}.
            </>
          ) : (
            <>
              <Clock className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              Non collegato: senza la chiave l’app non trova le registrazioni. Il link incollato nel foglio dell’esito si salva lo stesso.
            </>
          )}
        </p>
        {c?.ultimo_errore ? (
          <p role="alert" className="flex items-start gap-2 text-sm text-status-critical" data-testid="fathom-errore">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {c.ultimo_errore}
          </p>
        ) : null}
        <ChiaveFathom presente={presente.data === true} salvataIl={c?.chiave_aggiornata_il ?? null} />
        <p className="text-xs text-muted-foreground">
          L’app legge da Fathom solo la registrazione che corrisponde al link incollato dal closer, e la trascrizione quando la apri o
          quando Claude analizza la call. Trascrizioni e riassunti non si conservano. Su Fathom, in My Settings, spegni l’uso dei dati
          dell’account per migliorare i loro modelli; nella condivisione dei link scegli «Solo le persone aggiunte».
        </p>
      </Riquadro>

      <Riquadro titolo="Analisi di Claude">
        {!chiaveClaude ? (
          <p role="alert" className="flex items-start gap-2 text-sm text-status-warning" data-testid="fathom-senza-claude">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            Claude non è collegato: manca ANTHROPIC_API_KEY su Vercel. Le analisi aspettano in coda.
          </p>
        ) : null}
        <p className="text-sm" data-testid="fathom-costo">
          Costo del mese: {usd(costo)} su {usd(limite)}
          {s.analisi_mese !== undefined ? ` · analisi del mese: ${s.analisi_mese}` : ''}
          {s.spunti_mese !== undefined ? ` · spunti: ${s.spunti_mese}` : ''}
          {s.analisi_in_coda ? ` · in coda: ${s.analisi_in_coda}` : ''}
        </p>
        {costo >= limite ? (
          <p role="status" className="flex items-start gap-2 text-sm text-status-warning">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            Limite di spesa raggiunto: l’analisi riparte il 1° del mese, o alzando il limite.
          </p>
        ) : null}
        {s.ultimo_errore ? (
          <p className="text-sm text-muted-foreground" data-testid="fathom-ultimo-errore">
            Ultimo problema: {s.ultimo_errore}
          </p>
        ) : null}
        <InterruttoriCall analisi={s.analisi_attive ?? true} spunti={s.spunti_automatici ?? true} />
        <LimiteSpesaCall valore={limite} />
        <p className="text-xs text-muted-foreground">
          Claude analizza tutte le call registrate: il lead rispetto al cliente ideale, le obiezioni, le domande, il motivo di non
          chiusura da usare con un tocco e la performance proposta. Niente salute e niente cifre nell’analisi. Lo dice anche
          l’informativa privacy.
        </p>
      </Riquadro>
    </div>
  )
}
