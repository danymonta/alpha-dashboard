import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { after } from 'next/server'

import { aggiungiRiga, leggiColonna, scriviIntervalli, svuotaIntervalli, type Foglio } from '@/lib/google/fogli'
import { ErroreGoogle, leggiChiave, tokenServizio, type Basi } from '@/lib/google/service-account'
import { cellaExtra, COLONNA_RIF, colonneExtra, INTESTAZIONE_RIF, rigaFoglio, type ColonnaExtra } from '@/lib/onboarding/foglio'
import { DOMANDE, domandeDaRighe, type RigaDomanda } from '@/lib/percorso/questionario'
import { FRASI_FOGLIO } from '@/lib/percorso/frasi-foglio'
import { createAdminClient } from '@/lib/supabase/admin'
import { risposteForma } from '@/lib/validation/questionario'

/**
 * The queue of the onboarding sheet at work (1.82.0, CLAUDE.md section 34, release C), with
 * the service role: the Google key from Vault, the jobs due from onboarding_foglio_prendi, one
 * read of column AH to find the rows already written (the reference of each client), then a
 * new row, a rewrite of the same row (never the team's columns AD-AG) or a clear. Every outcome
 * goes back with onboarding_foglio_esito; an error retries later. Never throws, never logs an
 * answer, a name or the key: only counts and the kind of error. Called after a sending, after
 * a revocation, by the evening cron and by «Scrivi ora» of the settings.
 */

export { FRASI_FOGLIO }

export type EsitoFoglio = {
  scritte: number
  svuotate: number
  errori: number
  motivo?: 'senza_chiave' | 'chiave' | 'nessuno'
}

type Lavoro = {
  client_id: string
  rif: string
  azione: 'scrivi' | 'svuota'
  risposte: unknown
  inviato_il: string | null
  data_inizio: string | null
}

function frase(e: unknown): string {
  if (e instanceof ErroreGoogle) {
    if (e.tipo === 'chiave') return FRASI_FOGLIO.chiave
    if (e.tipo === 'permesso') return FRASI_FOGLIO.permesso
    if (e.tipo === 'non_trovato') return FRASI_FOGLIO.nonTrovato
    if (e.tipo === 'risposta') return FRASI_FOGLIO.risposta
  }
  return FRASI_FOGLIO.rete
}

function tipo(e: unknown): string {
  return e instanceof ErroreGoogle ? `${e.tipo}${e.stato ? ` ${e.stato}` : ''}` : e instanceof Error ? e.name : 'errore'
}

export async function lavoraFoglio(
  admin: SupabaseClient,
  opzioni: { limite?: number; client?: string; basi?: Basi } = {},
): Promise<EsitoFoglio> {
  const esito: EsitoFoglio = { scritte: 0, svuotate: 0, errori: 0 }
  try {
    const { data: testo, error: erroreChiave } = await admin.rpc('google_chiave')
    if (erroreChiave) throw erroreChiave
    const chiave = leggiChiave(typeof testo === 'string' ? testo : null)
    if (!chiave) {
      // only said when there is something waiting: an app without the sheet stays quiet
      const { count } = await admin
        .from('onboarding_foglio')
        .select('client_id', { count: 'exact', head: true })
        .in('stato', ['da_scrivere', 'da_svuotare'])
      if ((count ?? 0) > 0) await admin.rpc('google_segna_errore', { p_errore: FRASI_FOGLIO.senzaChiave })
      return { ...esito, motivo: 'senza_chiave' }
    }

    let token: string
    try {
      token = await tokenServizio(chiave, opzioni.basi)
    } catch (e) {
      console.error('[foglio] token', tipo(e))
      await admin.rpc('google_segna_errore', { p_errore: frase(e) })
      return { ...esito, errori: 1, motivo: 'chiave' }
    }

    const { data, error } = await admin.rpc('onboarding_foglio_prendi', {
      p_limite: opzioni.limite ?? 20,
      p_client: opzioni.client ?? null,
    })
    if (error) throw error
    const pacco = (data ?? {}) as { foglio_id?: string; scheda?: string; lavori?: Lavoro[] }
    const lavori = Array.isArray(pacco.lavori) ? pacco.lavori : []
    if (lavori.length === 0 || !pacco.foglio_id || !pacco.scheda) return { ...esito, motivo: 'nessuno' }

    const foglio: Foglio = { id: pacco.foglio_id, scheda: pacco.scheda, token, basi: opzioni.basi }

    // the questions as they are now (1.88.0): the labels of the options, and the columns after AH of the ones added
    const { data: righeDomande, error: erroreDomande } = await admin.from('onboarding_domande').select('*')
    if (erroreDomande) throw erroreDomande
    const tutte = (righeDomande ?? []) as RigaDomanda[]
    const domande = tutte.length > 0 ? domandeDaRighe(tutte.map((r) => ({ ...r, attiva: true }))) : [...DOMANDE]
    const extra: ColonnaExtra[] = colonneExtra(tutte)
    const ultima = extra.at(-1)

    const esiti = async (l: Lavoro, riga: number | null, errore: string | null) => {
      await admin.rpc('onboarding_foglio_esito', {
        p_client: l.client_id,
        p_rif: l.rif,
        p_azione: l.azione,
        p_riga: riga,
        p_errore: errore,
      })
    }

    // the references already on the sheet: row number = index + 1
    let colonna: string[]
    try {
      colonna = await leggiColonna(foglio, COLONNA_RIF)
    } catch (e) {
      console.error('[foglio] lettura', tipo(e))
      for (const l of lavori) await esiti(l, null, frase(e))
      return { ...esito, errori: lavori.length }
    }
    const righe = new Map<string, number>()
    colonna.forEach((v, i) => {
      if (v) righe.set(v.trim(), i + 1)
    })

    let intestata = (colonna[0] ?? '').trim() !== ''
    for (const l of lavori) {
      const riga = righe.get(l.rif) ?? null
      try {
        if (l.azione === 'scrivi') {
          if (!risposteForma(l.risposte) || !l.inviato_il) throw new ErroreGoogle('risposta')
          const celle = rigaFoglio(l.risposte, l.inviato_il, l.data_inizio, domande)
          const risposte = l.risposte
          const celleExtra = extra.map((c) => ({ c, valore: cellaExtra(c, risposte) }))
          let scritta = riga
          if (riga) {
            await scriviIntervalli(foglio, [
              { celle: `A${riga}:AC${riga}`, valori: celle },
              { celle: `${COLONNA_RIF}${riga}`, valori: [l.rif] },
              ...celleExtra.map(({ c, valore }) => ({ celle: `${c.lettera}${riga}`, valori: [valore] })),
            ])
          } else {
            // A to AH: the team's columns AD-AG empty on a new row; then the columns of the questions added
            const fino = ultima ? ultima.colonna : 33
            const valori: (string | number)[] = [...celle, '', '', '', '', l.rif]
            for (let i = 34; i <= fino; i++) valori.push(celleExtra.find(({ c }) => c.colonna === i)?.valore ?? '')
            scritta = await aggiungiRiga(foglio, `A:${ultima ? ultima.lettera : COLONNA_RIF}`, valori)
            if (scritta) righe.set(l.rif, scritta)
          }
          if (!intestata || extra.length > 0) {
            // the heading of AH once; the headings of the columns added follow the words of their questions
            await scriviIntervalli(foglio, [
              { celle: `${COLONNA_RIF}1`, valori: [INTESTAZIONE_RIF] },
              ...extra.map((c) => ({ celle: `${c.lettera}1`, valori: [c.intestazione] })),
            ])
            intestata = true
          }
          await esiti(l, scritta && scritta > 1 ? scritta : null, null)
          esito.scritte++
        } else {
          if (riga && riga > 1) {
            await svuotaIntervalli(foglio, [
              `A${riga}:AC${riga}`,
              `${COLONNA_RIF}${riga}`,
              ...extra.map((c) => `${c.lettera}${riga}`),
            ])
          }
          await esiti(l, null, null)
          esito.svuotate++
        }
      } catch (e) {
        console.error('[foglio]', l.azione, tipo(e))
        esito.errori++
        await esiti(l, null, frase(e))
      }
    }
    return esito
  } catch (e) {
    console.error('[foglio] coda', tipo(e))
    return { ...esito, errori: esito.errori + 1 }
  }
}

/**
 * After the answer of a server action (a sending, a revocation): the queue at work with the service
 * role, so that the actions of the onboarding never import it (tests/onboarding-operazioni.test.ts).
 */
export function lavoraFoglioDopo(): void {
  after(async () => {
    await lavoraFoglio(createAdminClient(), { limite: 5 })
  })
}
