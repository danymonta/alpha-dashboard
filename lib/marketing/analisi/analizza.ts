import 'server-only'

import type Anthropic from '@anthropic-ai/sdk'

import { quandoPubblicato } from '@/lib/marketing/parole-post'
import type { AdminClient } from '@/lib/instagram/sincronizza-contenuti'
import { chiediAClaude } from '@/lib/marketing/analisi/claude'
import { effortAnalisi, ideeDaProporre, MINIMO_ANALISI_MS } from '@/lib/marketing/analisi/config'
import { ATTESA_RIPROVA_MS, esitoDelCodice, FRASI_ANALISI } from '@/lib/marketing/analisi/frasi'
import { oscura, paroleDaOscurare, paroleNormalizzate } from '@/lib/marketing/analisi/oscura'
import { contenutoAnalisi, sistemaAnalisi, VERSIONE_PROMPT_ANALISI } from '@/lib/marketing/analisi/prompt'
import { FORMATO_ANALISI_REEL, LettoAnalisiReel } from '@/lib/marketing/analisi/schema'
import { USO_ZERO, type FontiAnalisi, type SchedaVisiva, type UsoToken } from '@/lib/marketing/analisi/tipi'
import { chiaveNome, verificaAnalisi, type Candidato } from '@/lib/marketing/analisi/verifica'
import { ETICHETTA_FORMAT, ETICHETTA_REEL_TYPE, ETICHETTA_STATUS } from '@/lib/marketing/etichette'

/**
 * The second pass of the reel analysis (1.36.0, CLAUDE.md section 30): text
 * only. From the visual card, the speech, the caption, the numbers against the
 * medians of the account with the verdict already decided in SQL, the leads
 * that came in the DMs and the calendar, Claude says why the numbers say what
 * they say, what worked, what to improve, which content of the calendar the
 * reel is (if it is not linked) and proposes the ideas.
 *
 * What reaches Claude is decided by the database (marketing_fonti_analisi):
 * with «Note di setter e closer nelle analisi» off, nothing of those notes
 * exists in the request. Every text passes through oscura() before and through
 * the strict layer and the final check after. Never writes outside
 * marketing_analisi_fine; never throws.
 */

export type EsitoPassoClaude = { esito: 'ok' | 'parziale' | 'fallito' | 'limite_fornitore'; uso: UsoToken }

type Riga = Record<string, unknown>

const CONTESTO_GIORNI = 28
const CANDIDATI_MAX = 8
const SEGMENTI_MAX = 200
const SCRIPT_CANDIDATO_MAX = 600
const taglia = (testo: string | null | undefined, max: number) => [...(testo ?? '')].slice(0, max).join('')

/** The calendar content already linked to the reel, or the contents it could be. */
export async function datiCalendario(
  db: AdminClient,
  post: { shortcode: string; pubblicato_il: string },
  parole: ReadonlySet<string>,
) {
  const collegato = await db
    .from('marketing_contenuti')
    .select('id, nome, reel_type, formato, stato, messaggio, bozza, finale')
    .eq('instagram_shortcode', post.shortcode)
    .maybeSingle()
  if (collegato.error) throw new Error('calendario non letto')
  const c = collegato.data
  if (c) {
    return {
      calendario: {
        name: oscura(c.nome, parole),
        reel_type: c.reel_type ? ETICHETTA_REEL_TYPE[c.reel_type] : null,
        format: c.formato ? ETICHETTA_FORMAT[c.formato] : null,
        status: ETICHETTA_STATUS[c.stato],
        messaggio: oscura(taglia(c.messaggio, 800), parole),
        bozza: oscura(taglia(c.bozza, 1000), parole),
        finale: oscura(taglia(c.finale, 1500), parole),
      },
      candidati: [] as { ref: string; id: string; json: Riga }[],
    }
  }

  const [contenuti, rifiuti] = await Promise.all([
    db
      .from('marketing_contenuti')
      .select('id, nome, post_date, stato, messaggio, bozza, finale')
      .eq('tipo', 'reel')
      .is('url', null)
      .neq('stato', 'canceled')
      .limit(400),
    db.from('marketing_abbinamenti_rifiutati').select('contenuto_id').eq('shortcode', post.shortcode),
  ])
  if (contenuti.error || rifiuti.error) throw new Error('candidati non letti')
  const rifiutati = new Set((rifiuti.data ?? []).map((r) => r.contenuto_id))
  const quando = Date.parse(post.pubblicato_il)
  const giorno = 86_400_000
  const vicini = (contenuti.data ?? [])
    .filter((x) => !rifiutati.has(x.id))
    .map((x) => ({ x, distanza: x.post_date ? Math.abs(Date.parse(`${x.post_date}T12:00:00Z`) - quando) / giorno : null }))
    // within 10 days of the publication, or without a Post Date
    .filter((v) => v.distanza === null || v.distanza <= 10.5)
    .sort((a, b) => (a.distanza ?? 99) - (b.distanza ?? 99))
    .slice(0, CANDIDATI_MAX)
  return {
    calendario: null,
    candidati: vicini.map(({ x }, i) => ({
      ref: `C${i + 1}`,
      id: x.id,
      json: {
        ref: `C${i + 1}`,
        name: oscura(x.nome, parole),
        post_date: x.post_date,
        status: ETICHETTA_STATUS[x.stato],
        script: oscura(taglia(x.finale ?? x.bozza ?? x.messaggio, SCRIPT_CANDIDATO_MAX), parole),
      },
    })),
  }
}

/** The whole second pass for the analysis `id`. */
export async function analizzaReel(op: {
  db: AdminClient
  id: string
  /** epoch ms: the step's deadline */
  entro: number
  segnale?: AbortSignal
  cliente?: Anthropic
}): Promise<EsitoPassoClaude> {
  const { db, id } = op
  let uso: UsoToken = { ...USO_ZERO }
  const chiudi = async (
    stato: 'pronta' | 'fallita' | 'in_coda',
    campi: { numeri?: unknown; contenuto?: unknown; fonti?: unknown; modello?: string; errore?: string; riprovaIl?: string },
  ) => {
    const { error } = await db.rpc('marketing_analisi_fine', {
      p_id: id,
      p_stato: stato,
      p_numeri: (campi.numeri ?? null) as never,
      p_contenuto: (campi.contenuto ?? null) as never,
      p_fonti: (campi.fonti ?? null) as never,
      p_modello: (campi.modello ?? null) as never,
      p_versione: (stato === 'pronta' ? VERSIONE_PROMPT_ANALISI : null) as never,
      p_errore: (campi.errore ?? null) as never,
      p_riprova_il: (campi.riprovaIl ?? null) as never,
    })
    if (error) console.error('[analisi] analisi non chiusa:', error.code ?? 'errore')
  }

  try {
    const { data: a, error: erroreAnalisi } = await db.from('marketing_analisi').select('id, media_id, stato, periodo_da, periodo_a').eq('id', id).maybeSingle()
    if (erroreAnalisi || !a || a.stato !== 'in_corso') return { esito: 'fallito', uso }

    // no time for Claude: back to the queue, no attempt
    if (op.entro - Date.now() < MINIMO_ANALISI_MS) {
      await chiudi('in_coda', {})
      return { esito: 'parziale', uso }
    }

    const [post, lettura] = await Promise.all([
      db
        .from('instagram_contenuti')
        .select('media_id, shortcode, permalink, pubblicato_il, didascalia, durata_ms, audio_tipo, like_count, comments_count')
        .eq('media_id', a.media_id)
        .maybeSingle(),
      db
        .from('instagram_letture')
        .select('stato, trascrizione_esito, trascrizione, segmenti, scheda, fotogrammi, fonte_visione, video')
        .eq('media_id', a.media_id)
        .maybeSingle(),
    ])
    if (post.error || lettura.error || !post.data) {
      await chiudi('fallita', { errore: FRASI_ANALISI.lettura })
      return { esito: 'fallito', uso }
    }
    const p = post.data
    const l = lettura.data

    const [numeriRpc, fontiRpc] = await Promise.all([
      db.rpc('analisi_numeri_reel', { p_media_id: a.media_id }),
      db.rpc('marketing_fonti_analisi', { p_da: a.periodo_da, p_a: a.periodo_a }),
    ])
    if (numeriRpc.error || fontiRpc.error || !numeriRpc.data || !fontiRpc.data) {
      await chiudi('in_coda', { errore: FRASI_ANALISI.nonRisponde, riprovaIl: new Date(Date.now() + ATTESA_RIPROVA_MS).toISOString() })
      return { esito: 'fallito', uso }
    }
    const numeri = numeriRpc.data as Riga & { lead?: Riga }
    const { da_oscurare: daOscurare, ...contesto } = fontiRpc.data as Riga & { da_oscurare?: string[]; note_del_team?: string }
    const parole = paroleDaOscurare(Array.isArray(daOscurare) ? daOscurare : [])
    const conNote = contesto.note_del_team === 'accese'

    // the notes of the team as words, for the check against a phrase copied word for word
    const note: string[][] = []
    if (conNote) {
      const cs = contesto.commenti_setter as { testi?: { testo?: string }[] } | undefined
      for (const t of cs?.testi ?? []) if (t.testo) note.push(paroleNormalizzate(t.testo))
      for (const m of (contesto.motivi_closer as { motivo?: string; note?: string }[] | undefined) ?? []) {
        if (m.motivo) note.push(paroleNormalizzate(m.motivo))
        if (m.note) note.push(paroleNormalizzate(m.note))
      }
    }
    // every text of the period's context reaches Claude cleaned of the names: the contents already in the calendar
    // (a Name may name the client of a testimonial), the hooks of the best and worst reels, the themes of the DMs
    const puliscoElenco = (valore: unknown, chiavi: readonly string[]) =>
      Array.isArray(valore)
        ? valore.map((v) =>
            v && typeof v === 'object'
              ? Object.fromEntries(Object.entries(v as Riga).map(([k, x]) => [k, chiavi.includes(k) && typeof x === 'string' ? oscura(x, parole) : x]))
              : v,
          )
        : valore
    const account = contesto.account as { migliori?: unknown; peggiori?: unknown } | undefined
    const contestoBase: Riga = {
      ...contesto,
      in_calendario: puliscoElenco(contesto.in_calendario, ['name']),
      ...(account ? { account: { ...account, migliori: puliscoElenco(account.migliori, ['gancio']), peggiori: puliscoElenco(account.peggiori, ['gancio']) } } : {}),
    }
    // the texts of the notes reach Claude cleaned of the names
    const contestoPulito = conNote
      ? {
          ...contestoBase,
          temi_dm: puliscoElenco(contesto.temi_dm, ['tema']),
          commenti_setter: {
            scale: (contesto.commenti_setter as { scale?: unknown } | undefined)?.scale,
            testi: ((contesto.commenti_setter as { testi?: Riga[] } | undefined)?.testi ?? []).map((t) => ({
              ...t,
              testo: oscura(String(t.testo ?? ''), parole),
            })),
          },
          motivi_closer: ((contesto.motivi_closer as Riga[] | undefined) ?? []).map((m) => ({
            ...m,
            motivo: oscura(String(m.motivo ?? ''), parole),
            note: oscura(String(m.note ?? ''), parole),
          })),
        }
      : contestoBase

    const cal = await datiCalendario(db, p, parole)
    const collegato = cal.calendario !== null
    const nomi = await db.from('marketing_contenuti').select('nome').limit(1000)
    const nomiInCalendario = new Set((nomi.data ?? []).map((n) => chiaveNome(n.nome)))

    const scheda = (l?.scheda ?? null) as SchedaVisiva | null
    const schedaPerClaude = scheda
      ? { ...scheda, ...(collegato ? { classificazione: undefined } : {}) }
      : null
    const segmenti = Array.isArray(l?.segmenti)
      ? (l?.segmenti as { da: number; a: number; testo: string }[]).slice(0, SEGMENTI_MAX).map((s) => ({ ...s, testo: oscura(s.testo, parole) }))
      : []
    const proposta = ideeDaProporre(numeri.verdetto as string | null)
    const lead = (numeri.lead ?? {}) as Riga
    const contati = lead.contati === true

    const blocco = {
      pubblicato: quandoPubblicato(p.pubblicato_il),
      eta_ore: numeri.eta_ore,
      durata_secondi: p.durata_ms ? Math.round(p.durata_ms / 100) / 10 : null,
      audio: p.audio_tipo === 'MUSIC' ? 'musica' : p.audio_tipo === 'ORIGINAL_SOUND' ? 'voce originale' : null,
      didascalia: oscura(taglia(p.didascalia, 1000), parole),
      trascrizione: segmenti.length > 0 ? { segmenti } : (l?.trascrizione_esito ?? null),
      scheda: schedaPerClaude,
      calendario: cal.calendario,
      candidati: cal.candidati.map((c) => c.json),
      numeri: {
        confronto: numeri.confronto,
        eta_confronto: numeri.eta_confronto,
        reel_di_confronto: numeri.reel_di_confronto,
        views: numeri.views,
        views_mediana: numeri.views_mediana,
        views_rapporto: numeri.views_rapporto,
        views_percentile: numeri.views_percentile,
        copertura: numeri.copertura,
        tasso_salvataggio: numeri.tasso_salvataggi,
        salvataggi_rapporto: numeri.salvataggi_rapporto,
        tasso_condivisione: numeri.tasso_condivisioni,
        condivisioni_rapporto: numeri.condivisioni_rapporto,
        visione_media_s: typeof numeri.visione_media_ms === 'number' ? Math.round(numeri.visione_media_ms / 100) / 10 : null,
        quota_vista: numeri.quota_vista,
        vista_rapporto: numeri.vista_rapporto,
        skip_rate: numeri.skip_rate,
        like: p.like_count,
        commenti: p.comments_count,
      },
      lead: {
        finestra: lead.finestra ?? null,
        contati: contati ? 'si' : 'no',
        dm: contati ? lead.dm : null,
        in_target: contati ? lead.lead_in_target : null,
        call: contati ? lead.call_prenotate : null,
        in_target_p75: contati ? lead.in_target_p75 : null,
      },
      note_del_team: conNote ? 'accese' : 'spente',
      fasce: { pubblico: numeri.fascia_pubblico, lead: numeri.fascia_lead },
      verdetto: numeri.verdetto,
      idee_da_proporre: proposta,
    }

    const risposta = await chiediAClaude({
      passo: 'analisi',
      sistema: sistemaAnalisi(),
      contenuto: contenutoAnalisi({ periodo_giorni: CONTESTO_GIORNI, ...contestoPulito }, blocco),
      formato: FORMATO_ANALISI_REEL,
      schema: LettoAnalisiReel,
      effort: effortAnalisi(),
      minimo: MINIMO_ANALISI_MS,
      entro: op.entro,
      segnale: op.segnale,
      cliente: op.cliente,
    })
    uso = risposta.uso
    if (!risposta.ok) {
      const e = esitoDelCodice(risposta.codice)
      if (e.azione === 'tempo') {
        await chiudi('in_coda', {})
        return { esito: 'parziale', uso }
      }
      if (e.azione === 'riprova') {
        await chiudi('in_coda', { errore: e.frase, riprovaIl: new Date(Date.now() + ATTESA_RIPROVA_MS).toISOString() })
        return { esito: 'parziale', uso }
      }
      await chiudi('fallita', { errore: e.frase })
      return { esito: e.fornitore ? 'limite_fornitore' : 'fallito', uso }
    }

    const candidati: Candidato[] = cal.candidati.map((c) => ({ ref: c.ref, contenuto_id: c.id }))
    const verificata = verificaAnalisi(risposta.dati, { candidati, idee: proposta, nomiInCalendario }, { parole, note })
    if (!verificata) {
      await chiudi('fallita', { errore: FRASI_ANALISI.illeggibile })
      return { esito: 'fallito', uso }
    }
    console.info('[analisi] controllo', { passo: 'analisi', ...verificata.conteggi, scartate: verificata.scartate })

    const fonti: FontiAnalisi = {
      fotogrammi: l?.fotogrammi ?? 0,
      video: l?.fonte_visione === 'video' ? 'si' : l?.fonte_visione === 'copertina' ? 'copertina' : 'no',
      trascrizione: l?.trascrizione_esito === 'pronta' ? 'si' : l?.trascrizione_esito === 'senza_parlato' ? 'senza_parlato' : 'no',
      lead: contati ? 'si' : 'no',
      note_team: conNote,
    }
    await chiudi('pronta', { numeri, contenuto: verificata.dati, fonti, modello: risposta.modello })
    return { esito: 'ok', uso }
  } catch (e) {
    console.error('[analisi] analisi interrotta:', e instanceof Error ? e.name : 'errore')
    await chiudi('in_coda', { errore: FRASI_ANALISI.nonRisponde, riprovaIl: new Date(Date.now() + ATTESA_RIPROVA_MS).toISOString() })
    return { esito: 'fallito', uso }
  }
}
