import 'server-only'

import { abbinaRiunioni, type CallDaAbbinare } from '@/lib/fathom/abbina'
import { riunioniDelPeriodo } from '@/lib/fathom/api'
import { ErroreFathom } from '@/lib/fathom/frasi'
import { normalizzaLink } from '@/lib/fathom/link'
import type { createAdminClient } from '@/lib/supabase/admin'

/**
 * Looks on Fathom for the recordings of the held calls that have none (1.65.0,
 * Dany, 27/10/2026: «devi analizzarle da fathom»). Service role: the callers
 * (the admin's route, the evening cron) have already decided who may. The key
 * is read from Vault and goes nowhere but the header of the requests.
 *
 * The calls: held, with an outcome, no link, in the period; never one marked
 * «non registrata» (also how a lead who opposed is respected). The meetings: the
 * list of the period, a day around, up to `pagineMax` pages of 10. The pairs:
 * lib/fathom/abbina.ts. Each pair is written by fathom_collega_trovata, which
 * checks everything again; the 1.37.0 triggers queue the analysis.
 *
 * Only counts come back and go in the log: never a name, a title or a link.
 */
type Db = Pick<ReturnType<typeof createAdminClient>, 'rpc' | 'from'>

export type EsitoCercaCall =
  | { esito: 'fatto'; cercate: number; collegate: number; senza: number; completo: boolean }
  | { esito: 'non_collegato' }
  /** the database does not have fathom_collega_trovata yet (its migration is not applied) */
  | { esito: 'non_pronto' }
  | { esito: 'errore'; errore: ErroreFathom }

const GIORNO_MS = 24 * 3600_000

export async function cercaRegistrazioniCall(op: {
  db: Db
  da: string
  a: string
  pagineMax?: number
  segnale?: AbortSignal
  fetch?: typeof fetch
}): Promise<EsitoCercaCall> {
  const dal = new Date(`${op.da}T00:00:00Z`)
  const al = new Date(Date.parse(`${op.a}T00:00:00Z`) + 2 * GIORNO_MS)

  const { data: righe, error } = await op.db
    .from('calls')
    .select('id, programmata_il, leads(nome, instagram_handle), call_registrazioni(stato)')
    .eq('stato', 'svolta')
    .not('esito', 'is', null)
    .is('link_registrazione', null)
    .gte('programmata_il', dal.toISOString())
    .lt('programmata_il', al.toISOString())
    .order('programmata_il', { ascending: false })
    .limit(300)
  if (error) return { esito: 'errore', errore: new ErroreFathom('rete') }

  type Riga = {
    id: string
    programmata_il: string
    leads: { nome: string | null; instagram_handle: string | null } | null
    call_registrazioni: { stato: string } | { stato: string }[] | null
  }
  const calls: CallDaAbbinare[] = ((righe ?? []) as unknown as Riga[])
    .filter((r) => {
      const reg = Array.isArray(r.call_registrazioni) ? r.call_registrazioni[0] : r.call_registrazioni
      return reg?.stato !== 'non_registrata'
    })
    .map((r) => ({ id: r.id, programmata_il: r.programmata_il, lead_nome: r.leads?.nome ?? null, lead_handle: r.leads?.instagram_handle ?? null }))
  if (calls.length === 0) return { esito: 'fatto', cercate: 0, collegate: 0, senza: 0, completo: true }

  const { data: chiave, error: errChiave } = await op.db.rpc('fathom_chiave')
  if (errChiave) return { esito: 'errore', errore: new ErroreFathom('rete') }
  if (typeof chiave !== 'string' || chiave === '') return { esito: 'non_collegato' }

  const { data: usate } = await op.db.from('call_registrazioni').select('recording_id').not('recording_id', 'is', null)
  const giaUsate = new Set(((usate ?? []) as { recording_id: number | null }[]).flatMap((u) => (u.recording_id ? [Number(u.recording_id)] : [])))

  let lette
  try {
    lette = await riunioniDelPeriodo({
      chiave,
      dal: new Date(dal.getTime() - GIORNO_MS),
      al,
      pagineMax: op.pagineMax ?? 15,
      segnale: op.segnale,
      fetch: op.fetch,
    })
  } catch (e) {
    return { esito: 'errore', errore: e instanceof ErroreFathom ? e : new ErroreFathom('rete') }
  }

  let collegate = 0
  for (const a of abbinaRiunioni(calls, lette.riunioni, giaUsate)) {
    const link = normalizzaLink(a.riunione.url)
    if (!link.ok || !link.fathom) continue
    const { data: esito, error: e } = await op.db.rpc('fathom_collega_trovata', {
      p_call_id: a.call_id,
      p_url: link.canonico,
      p_recording_id: a.riunione.recording_id,
      p_durata: a.riunione.durata_secondi ?? 0,
      p_inizio: a.riunione.inizio ?? a.riunione.quando ?? new Date().toISOString(),
    })
    if (e && (e.code === 'PGRST202' || e.code === '42883')) return { esito: 'non_pronto' }
    if (!e && esito === 'collegata') collegate++
  }
  return { esito: 'fatto', cercate: calls.length, collegate, senza: calls.length - collegate, completo: lette.completo }
}
