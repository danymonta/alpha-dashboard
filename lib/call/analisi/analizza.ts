import 'server-only'

import type Anthropic from '@anthropic-ai/sdk'

import { ATTESA_RIPROVA_CALL_MS, esitoCall, FRASI_CALL } from '@/lib/call/analisi/parole'
import { contenutoCall, sistemaCall, VERSIONE_PROMPT_CALL } from '@/lib/call/analisi/prompt'
import { FORMATO_ANALISI_CALL, SchemaAnalisiCall } from '@/lib/call/analisi/schema'
import { paroleDiNote, verificaAnalisiCall } from '@/lib/call/analisi/verifica'
import { effortCall } from '@/lib/call/lavori/config'
import { trascrizione as leggiTrascrizione } from '@/lib/fathom/api'
import { ErroreFathom } from '@/lib/fathom/frasi'
import { risolviLink } from '@/lib/fathom/risolvi'
import { comeTesto, compatta, quotaParlato } from '@/lib/fathom/trascrizione'
import type { AdminClient } from '@/lib/instagram/sincronizza-contenuti'
import { chiediAClaude } from '@/lib/marketing/analisi/claude'
import { MINIMO_ANALISI_MS } from '@/lib/marketing/analisi/config'
import { oscura, paroleDaOscurare } from '@/lib/marketing/analisi/oscura'
import { USO_ZERO, type UsoToken } from '@/lib/marketing/analisi/tipi'

/**
 * The analysis of one held call (1.37.0, CLAUDE.md section 31), the step the database posted
 * to /api/cron/call with a lease (call_prendi_passo).
 *
 * 1. What may reach Claude is decided by the database (call_fonti_analisi): the call, the
 *    lead's source and post, the setter's note, the product pitched (never the amount),
 *    plus the names to blank, which stay on the server.
 * 2. The recording: the id found for the pasted link, or looked for now in a window around
 *    the call (the link is the only key: equal or nothing).
 * 3. The transcript is read from Fathom now, made compact, cleaned of names, amounts and
 *    links, and sent to Claude: it is never stored, never logged.
 * 4. The answer passes the strict layer and the final check (lib/call/analisi/verifica.ts:
 *    names, figures, health, copies, dashes) and is saved by call_analisi_salva, only with
 *    the step's lease. The level of the performance is worked out by the code.
 *
 * Never throws; nothing but codes and counts in the log.
 */
export type EsitoPassoCall = { esito: 'ok' | 'parziale' | 'fallito' | 'limite_fornitore'; uso: UsoToken }

type Riga = Record<string, unknown>

export async function analizzaCall(op: {
  db: AdminClient
  callId: string
  /** the step's lease (call_prendi_passo): the database writes only with it */
  passo: string
  /** epoch ms: the step's deadline */
  entro: number
  segnale?: AbortSignal
  cliente?: Anthropic
  fetch?: typeof fetch
}): Promise<EsitoPassoCall> {
  const { db, callId, passo } = op
  let uso: UsoToken = { ...USO_ZERO }

  const fallita = async (stato: 'fallita' | 'rifiutata', frase: string) => {
    const { error } = await db.rpc('call_analisi_fallita', { p_call: callId, p_passo: passo, p_stato: stato, p_errore: frase, p_conta: false })
    if (error) console.error('[analisi-call] non chiusa:', error.code ?? 'errore')
  }
  /** Back to the queue: `conta` when the failure counts as an attempt (three and it fails for good). */
  const dopo = async (frase: string | null, conta: boolean, minuti = ATTESA_RIPROVA_CALL_MS / 60_000) => {
    const { error } = await db.rpc('call_analisi_fallita', {
      p_call: callId,
      p_passo: passo,
      p_stato: 'in_coda',
      p_errore: (frase ?? null) as never,
      p_riprova_tra: `${minuti} minutes`,
      p_conta: conta,
    })
    if (error) console.error('[analisi-call] non rimessa in coda:', error.code ?? 'errore')
  }

  try {
    if (op.entro - Date.now() < MINIMO_ANALISI_MS) {
      await dopo(null, false, 1)
      return { esito: 'parziale', uso }
    }

    const { data: fonti, error: erroreFonti } = await db.rpc('call_fonti_analisi', { p_call: callId })
    if (erroreFonti || !fonti) {
      await dopo(FRASI_CALL.nonRisponde, true)
      return { esito: 'fallito', uso }
    }
    const { da_oscurare: daOscurare, registrazione, ...contesto } = fonti as Riga & {
      da_oscurare?: string[]
      registrazione: { link: string | null; recording_id: number | null; link_verificato: string | null; durata_secondi: number | null; programmata_il: string }
    }
    const parole = paroleDaOscurare(Array.isArray(daOscurare) ? daOscurare : [])
    if (!registrazione.link) {
      await fallita('fallita', FRASI_CALL.senzaRegistrazione)
      return { esito: 'fallito', uso }
    }

    // the recording: the id found for this very link, or look for it now
    let recordingId = registrazione.link_verificato === registrazione.link ? registrazione.recording_id : null
    let durata = registrazione.durata_secondi
    if (recordingId === null) {
      const trovata = await risolviLink({ db, callId, link: registrazione.link, programmataIl: registrazione.programmata_il, segnale: op.segnale, fetch: op.fetch })
      switch (trovata.esito) {
        case 'trovata':
          recordingId = trovata.riunione.recording_id
          durata = trovata.riunione.durata_secondi
          break
        case 'non_trovata':
          // Fathom may not have it yet: the wait counts from the request (6 hours)
          await dopo(FRASI_CALL.senzaRegistrazione, false)
          return { esito: 'parziale', uso }
        case 'non_collegato':
          await fallita('fallita', FRASI_CALL.fathomNonCollegato)
          return { esito: 'fallito', uso }
        case 'non_fathom':
        case 'link_non_valido':
          await fallita('fallita', FRASI_CALL.linkNonFathom)
          return { esito: 'fallito', uso }
        case 'errore':
          if (trovata.errore.tipo === 'chiave') {
            await db.rpc('fathom_segna_esito', { p_errore: trovata.errore.message })
            await fallita('fallita', FRASI_CALL.fathomChiave)
            return { esito: 'fallito', uso }
          }
          await dopo(FRASI_CALL.nonRisponde, trovata.errore.tipo !== 'limite')
          return { esito: 'parziale', uso }
      }
    }

    // the transcript, read now
    const { data: chiave } = await db.rpc('fathom_chiave')
    if (typeof chiave !== 'string' || chiave === '') {
      await fallita('fallita', FRASI_CALL.fathomNonCollegato)
      return { esito: 'fallito', uso }
    }
    const { data: chiamata } = await db.from('calls').select('closer_id').eq('id', callId).maybeSingle()
    const { data: closer } = chiamata?.closer_id
      ? await db.from('profiles').select('nome, email').eq('id', chiamata.closer_id).maybeSingle()
      : { data: null }
    let grezza
    try {
      grezza = await leggiTrascrizione({ chiave, recordingId, segnale: op.segnale, fetch: op.fetch })
    } catch (e) {
      const tipo = e instanceof ErroreFathom ? e.tipo : 'rete'
      if (tipo === 'chiave') {
        await fallita('fallita', FRASI_CALL.fathomChiave)
        return { esito: 'fallito', uso }
      }
      // not found / not ready yet / network: back in the queue, the wait is 6 hours from the request
      await dopo(FRASI_CALL.trascrizioneAssente, tipo === 'rete' || tipo === 'tempo' || tipo === 'formato')
      return { esito: 'parziale', uso }
    }
    const segmenti = compatta(grezza, { email: closer?.email ?? null, nome: closer?.nome ?? null })
    if (segmenti.length === 0) {
      await dopo(FRASI_CALL.trascrizioneAssente, false)
      return { esito: 'parziale', uso }
    }
    const testo = comeTesto(segmenti)
    const trascrizionePulita = oscura(testo.testo, parole)

    const risposta = await chiediAClaude({
      passo: 'call',
      sistema: sistemaCall(),
      contenuto: contenutoCall(pulisciContesto(contesto, parole), trascrizionePulita, testo.tagliata),
      formato: FORMATO_ANALISI_CALL,
      schema: SchemaAnalisiCall,
      effort: effortCall(),
      minimo: MINIMO_ANALISI_MS,
      entro: op.entro,
      segnale: op.segnale,
      cliente: op.cliente,
    })
    uso = risposta.uso
    if (!risposta.ok) {
      const e = esitoCall(risposta.codice)
      if (e.azione === 'tempo') {
        await dopo(null, false, 1)
        return { esito: 'parziale', uso }
      }
      if (e.azione === 'riprova') {
        await dopo(e.frase, true)
        return { esito: 'parziale', uso }
      }
      await fallita(e.azione, e.frase)
      return { esito: e.fornitore ? 'limite_fornitore' : 'fallito', uso }
    }

    const c = (contesto.call ?? {}) as Riga
    const esito = c.esito === 'chiusa' || c.esito === 'follow_up' || c.esito === 'persa' ? c.esito : null
    const verificata = verificaAnalisiCall(risposta.dati, {
      esito,
      durataSecondi: durata,
      parole,
      note: paroleDiNote([
        c.motivo_non_chiusura as string | null,
        c.note_closer as string | null,
        (contesto.setting as { note_setter?: string | null } | undefined)?.note_setter,
      ]),
      quotaParlato: quotaParlato(segmenti, durata),
    })
    if (!verificata.ok) {
      await dopo(FRASI_CALL.illeggibile, true)
      return { esito: 'parziale', uso }
    }
    console.info('[analisi-call] controllo', verificata.conteggi)
    if (verificata.minorenne) {
      await fallita('rifiutata', FRASI_CALL.minorenne)
      return { esito: 'ok', uso }
    }
    const { data: salvata, error } = await db.rpc('call_analisi_salva', {
      p_call: callId,
      p_passo: passo,
      p: { recording_id: recordingId, versione_prompt: VERSIONE_PROMPT_CALL, ...verificata.dati } as never,
    })
    if (error) {
      console.error('[analisi-call] non salvata:', error.code ?? 'errore')
      await dopo(FRASI_CALL.nonRisponde, true)
      return { esito: 'fallito', uso }
    }
    return { esito: salvata ? 'ok' : 'parziale', uso }
  } catch (e) {
    console.error('[analisi-call] interrotta:', e instanceof Error ? e.name : 'errore')
    await dopo(FRASI_CALL.nonRisponde, true)
    return { esito: 'fallito', uso }
  }
}

/** The texts of the context (notes, reasons, the post's first line) reach Claude cleaned of the names. */
function pulisciContesto(contesto: Riga, parole: ReadonlySet<string>): Riga {
  const c = (contesto.call ?? {}) as Riga
  const lead = (contesto.lead ?? {}) as Riga
  const cont = lead.contenuto as Riga | null
  const prima = (contesto.prima_call ?? {}) as Riga
  const s = (contesto.setting ?? {}) as Riga
  const testo = (v: unknown) => (typeof v === 'string' ? oscura(v, parole) : v)
  return {
    call: { ...c, motivo_non_chiusura: testo(c.motivo_non_chiusura), note_closer: testo(c.note_closer) },
    lead: { ...lead, contenuto: cont ? { ...cont, didascalia: testo(cont.didascalia), name: testo(cont.name) } : null },
    setting: { note_setter: testo(s.note_setter) },
    prodotto: contesto.prodotto ?? null,
    prima_call: { riassunto: testo(prima.riassunto) },
  }
}
