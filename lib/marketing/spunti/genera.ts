import 'server-only'

import type Anthropic from '@anthropic-ai/sdk'

import type { AdminClient } from '@/lib/instagram/sincronizza-contenuti'
import { chiediAClaude } from '@/lib/marketing/analisi/claude'
import { MINIMO_ANALISI_MS } from '@/lib/marketing/analisi/config'
import { chiaveNome } from '@/lib/marketing/analisi/verifica'
import { USO_ZERO, type UsoToken } from '@/lib/marketing/analisi/tipi'
import { leggiOpzioni } from '@/lib/marketing/letture'
import { nomiDa } from '@/lib/marketing/opzioni'
import { preparaFonti } from '@/lib/marketing/spunti/fonti'
import { contenutoSpunti, sistemaSpunti, VERSIONE_PROMPT_SPUNTI } from '@/lib/marketing/spunti/prompt'
import { comeSpuntiModello, FORMATO_SPUNTI, LettoSpunti } from '@/lib/marketing/spunti/schema'
import { verificaSpunti } from '@/lib/marketing/spunti/verifica'

/**
 * The weekly brief of the Marketing area (1.37.0, CLAUDE.md section 31): the step the database
 * posted to /api/cron/call with a lease (cosa = spunti). What reaches Claude is decided by the
 * database (marketing_fonti_spunti), cleaned here (names, amounts, health, hidden keys), and
 * what comes back passes the strict layer and the final check before marketing_spunti_fine.
 * The effort is MARKETING_EFFORT_IDEE (medium); never throws; nothing but codes in the log.
 */
export type EsitoSpunti = { esito: 'ok' | 'parziale' | 'fallito' | 'limite_fornitore'; uso: UsoToken }

export const FRASI_SPUNTI = {
  mancanoDati: 'Mancano i dati: nessun reel analizzato, nessun tema dei DM e poche note del setting e delle call nelle ultime 4 settimane.',
  illeggibile: 'La risposta di Claude non si legge: riprova.',
  rifiuto: 'Claude non ha scritto gli spunti: riprova.',
  fornitore: 'Claude ha rifiutato la richiesta (chiave, credito o limite di spesa): controlla la console Anthropic e la chiave su Vercel.',
  nonRisponde: 'Claude non risponde adesso: riprova tra qualche minuto.',
  incompleta: 'La risposta di Claude è arrivata incompleta: riprova.',
  erroreApp: 'Gli spunti non sono partiti per un errore dell’app: avvisa Dany.',
} as const

function effortSpunti(): 'low' | 'medium' | 'high' {
  const v = process.env.MARKETING_EFFORT_IDEE?.trim().toLowerCase()
  return v === 'low' || v === 'medium' || v === 'high' ? v : 'medium'
}

export async function generaSpunti(op: {
  db: AdminClient
  id: string
  passo: string
  /** epoch ms: the step's deadline */
  entro: number
  segnale?: AbortSignal
  cliente?: Anthropic
}): Promise<EsitoSpunti> {
  const { db, id, passo } = op
  let uso: UsoToken = { ...USO_ZERO }

  const fine = async (
    stato: 'pronta' | 'fallita' | 'in_coda',
    c: { contenuto?: unknown; fonti?: unknown; errore?: string; riprovaIl?: string; conta?: boolean; modello?: string } = {},
  ) => {
    const { error } = await db.rpc('marketing_spunti_fine', {
      p_id: id,
      p_passo: passo,
      p_stato: stato,
      p_contenuto: (c.contenuto ?? null) as never,
      p_fonti: (c.fonti ?? null) as never,
      p_modello: (c.modello ?? null) as never,
      p_versione: (stato === 'pronta' ? VERSIONE_PROMPT_SPUNTI : null) as never,
      p_errore: (c.errore ?? null) as never,
      p_riprova_il: (c.riprovaIl ?? null) as never,
      p_conta: c.conta ?? false,
    })
    if (error) console.error('[spunti] non chiusi:', error.code ?? 'errore')
  }
  const tra = (minuti: number) => new Date(Date.now() + minuti * 60_000).toISOString()

  try {
    if (op.entro - Date.now() < MINIMO_ANALISI_MS) {
      await fine('in_coda', { riprovaIl: tra(1) })
      return { esito: 'parziale', uso }
    }
    const { data: brief } = await db.from('marketing_spunti').select('periodo_da, periodo_a, stato').eq('id', id).maybeSingle()
    if (!brief || brief.stato !== 'in_corso') return { esito: 'fallito', uso }

    const { data: crudo, error } = await db.rpc('marketing_fonti_spunti', { p_da: brief.periodo_da, p_a: brief.periodo_a })
    if (error || !crudo) {
      await fine('in_coda', { riprovaIl: tra(10), conta: true })
      return { esito: 'fallito', uso }
    }
    // the labels' live names: a Reel Type or Format a person created reaches Claude with its name
    const fonti = preparaFonti(crudo, chiaveNome, nomiDa(await leggiOpzioni(db).catch(() => undefined)))
    if (fonti.insufficienti) {
      await fine('fallita', { errore: FRASI_SPUNTI.mancanoDati })
      return { esito: 'ok', uso }
    }

    const risposta = await chiediAClaude({
      passo: 'spunti',
      sistema: sistemaSpunti(),
      contenuto: contenutoSpunti(fonti.perClaude),
      formato: FORMATO_SPUNTI,
      schema: LettoSpunti,
      effort: effortSpunti(),
      minimo: MINIMO_ANALISI_MS,
      entro: op.entro,
      segnale: op.segnale,
      maxTokens: 24_000,
      cliente: op.cliente,
    })
    uso = risposta.uso
    if (!risposta.ok) {
      switch (risposta.codice) {
        case 'tempo':
          await fine('in_coda', { riprovaIl: tra(1) })
          return { esito: 'parziale', uso }
        case 'autenticazione':
          await fine('fallita', { errore: FRASI_SPUNTI.fornitore })
          return { esito: 'limite_fornitore', uso }
        case 'rifiuto':
          await fine('fallita', { errore: FRASI_SPUNTI.rifiuto })
          return { esito: 'fallito', uso }
        case 'richiesta':
          await fine('fallita', { errore: FRASI_SPUNTI.erroreApp })
          return { esito: 'fallito', uso }
        case 'max_tokens':
        case 'json':
        case 'schema':
          await fine('in_coda', { riprovaIl: tra(10), conta: true, errore: FRASI_SPUNTI.illeggibile })
          return { esito: 'parziale', uso }
        default:
          await fine('in_coda', { riprovaIl: tra(10), conta: risposta.codice === 'rete', errore: FRASI_SPUNTI.nonRisponde })
          return { esito: 'parziale', uso }
      }
    }
    const verificato = verificaSpunti(comeSpuntiModello(risposta.dati), fonti)
    if (!verificato) {
      await fine('in_coda', { riprovaIl: tra(10), conta: true, errore: FRASI_SPUNTI.illeggibile })
      return { esito: 'parziale', uso }
    }
    console.info('[spunti] controllo', verificato.conteggi, { idee: verificato.dati.idee.length })
    await fine('pronta', { contenuto: verificato.dati, fonti: fonti.riepilogo, modello: risposta.modello })
    return { esito: 'ok', uso }
  } catch (e) {
    console.error('[spunti] interrotti:', e instanceof Error ? e.name : 'errore')
    await fine('in_coda', { riprovaIl: tra(10), conta: true, errore: FRASI_SPUNTI.nonRisponde })
    return { esito: 'fallito', uso }
  }
}
