import 'server-only'

import { readFile } from 'node:fs/promises'
import path from 'node:path'

import type Anthropic from '@anthropic-ai/sdk'

import { creaGraphContenuti, origineLocale } from '@/lib/instagram/contenuti'
import { baseGraph, ErroreInstagram } from '@/lib/instagram/richieste'
import type { AdminClient } from '@/lib/instagram/sincronizza-contenuti'
import { datiCalendario } from '@/lib/marketing/analisi/analizza'
import { latoFotogrammi, MINIMO_VISIONE_MS } from '@/lib/marketing/analisi/config'
import { ATTESA_RIPROVA_MS, ATTESA_TOKEN_MS, esitoDelCodice, FRASI_ANALISI } from '@/lib/marketing/analisi/frasi'
import { oscura, paroleDaOscurare } from '@/lib/marketing/analisi/oscura'
import { VERSIONE_PROMPT_VISIONE, type ImmagineDaMandare } from '@/lib/marketing/analisi/prompt'
import { USO_ZERO, type UsoToken } from '@/lib/marketing/analisi/tipi'
import { verificaScheda } from '@/lib/marketing/analisi/verifica'
import { vediReel } from '@/lib/marketing/analisi/visione'
import { trascriviAudio, type SegmentoParlato } from '@/lib/marketing/trascrizione'
import { estraiDalVideo, percorsoFfmpeg, riduciCopertina, type Fotogramma } from '@/lib/marketing/video/ffmpeg'
import { etichettaTempo } from '@/lib/marketing/video/fotogrammi'
import {
  COPERTINA_MAX_BYTE,
  COPERTINA_TIMEOUT_MS,
  nuovaCartella,
  pulisciCartelleVecchie,
  scarica,
  togliCartella,
  VIDEO_MAX_BYTE,
  VIDEO_TIMEOUT_MS,
} from '@/lib/marketing/video/scarica'
import { quandoPubblicato } from '@/lib/marketing/parole-post'

/**
 * The reading of a reel, one step (1.36.0, CLAUDE.md section 30): download the
 * video and the cover to /tmp, ffmpeg makes the audio and the frames, Whisper
 * hears the speech, Claude looks at the frames next to what is said and writes
 * the visual card; then everything is forgotten, only text and numbers stay.
 *
 * Time (R6): a step has 240 s. Claude starts only with 150 s left; if the
 * download, ffmpeg and Whisper took too long the step «resumes»: what Whisper
 * heard stays in the row and the next step does not ask it again (it downloads
 * and extracts again: a few seconds of network, 10 to 25 of CPU). The first
 * resume costs no attempt; the second counts one.
 *
 * Without the video (licensed music, a download that fails, no ffmpeg) the
 * reading goes on from the cover, the caption and the script, and says so. A
 * 429 of Whisper or of Claude puts the reel back in the queue and stops the
 * chain until the next tick. Never the video, the audio, a frame, a URL, a
 * transcript or a caption in a log: only counts and codes.
 */

export type EsitoLettura = {
  esito: 'ok' | 'parziale' | 'fallito' | 'limite_fornitore'
  uso: UsoToken
  /** the audio seconds Groq billed */
  secondiAudio: number
}

type Riga = Record<string, unknown>

/** A JPEG's size from its header (SOF marker): enough to know if a cover needs reducing. */
export function dimensioniJpeg(b: Buffer): { larghezza: number; altezza: number } | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null
  let i = 2
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) {
      i++
      continue
    }
    const marcatore = b[i + 1]
    if (marcatore >= 0xc0 && marcatore <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marcatore)) {
      return { altezza: b.readUInt16BE(i + 5), larghezza: b.readUInt16BE(i + 7) }
    }
    if (marcatore === 0xd8 || marcatore === 0x01 || (marcatore >= 0xd0 && marcatore <= 0xd7)) {
      i += 2
      continue
    }
    i += 2 + b.readUInt16BE(i + 2)
  }
  return null
}

/** What is said from each frame to the next: «[0:11,4-0:14,9] …». */
export function parlatoPerFotogramma(fotogrammi: readonly { t: number }[], segmenti: readonly SegmentoParlato[]): (string | undefined)[] {
  return fotogrammi.map((f, i) => {
    const fine = fotogrammi[i + 1]?.t ?? Number.POSITIVE_INFINITY
    const inizio = i === 0 ? Number.NEGATIVE_INFINITY : f.t
    const dentro = segmenti.filter((s) => s.da >= inizio && s.da < fine)
    if (dentro.length === 0) return undefined
    return dentro.map((s) => `[${etichettaTempo(s.da)}-${etichettaTempo(s.a)}] ${s.testo}`).join('\n')
  })
}

/** «F3 · 0:01,0 (gancio)» */
export function etichettaFotogramma(n: number, f: Pick<Fotogramma, 't' | 'parte'>): string {
  return `F${n} · ${etichettaTempo(f.t)}${f.parte === 'gancio' ? ' (gancio)' : f.parte === 'fine' ? ' (fine)' : ''}`
}

export async function leggiReel(op: {
  db: AdminClient
  media_id: string
  /** epoch ms: the step's deadline */
  entro: number
  segnale?: AbortSignal
  cliente?: Anthropic
  fetch?: typeof fetch
}): Promise<EsitoLettura> {
  const { db, media_id } = op
  let uso: UsoToken = { ...USO_ZERO }
  let secondiAudio = 0
  const avvio = Date.now()

  const fine = async (esito: Riga) => {
    const { error } = await db.rpc('marketing_lettura_fine', { p_media_id: media_id, p_esito: esito as never })
    if (error) console.error('[analisi] lettura non chiusa:', error.code ?? 'errore')
  }
  const inCoda = (errore: string, tra: number | null, extra: Riga = {}) =>
    fine({
      stato: 'in_coda',
      tentativo: tra !== null,
      errore,
      ...(tra !== null ? { prossimo_il: new Date(Date.now() + tra).toISOString() } : {}),
      ...extra,
    })

  const cartella = await nuovaCartella().catch(() => null)
  try {
    await pulisciCartelleVecchie()
    const [post, lettura] = await Promise.all([
      db
        .from('instagram_contenuti')
        .select('media_id, shortcode, pubblicato_il, didascalia, eliminato_il, audio_tipo')
        .eq('media_id', media_id)
        .maybeSingle(),
      db
        .from('instagram_letture')
        .select('stato, richiesta, trascrizione_esito, trascrizione, segmenti, gancio_parlato, modello_trascrizione')
        .eq('media_id', media_id)
        .maybeSingle(),
    ])
    if (post.error || lettura.error || !post.data || !lettura.data || !cartella) {
      await inCoda(FRASI_ANALISI.lettura, ATTESA_RIPROVA_MS)
      return { esito: 'fallito', uso, secondiAudio }
    }
    const p = post.data
    const l = lettura.data
    if (p.eliminato_il) {
      await fine({ stato: 'fallita', errore: FRASI_ANALISI.reelSparito })
      return { esito: 'fallito', uso, secondiAudio }
    }
    const completa = l.richiesta === 'completa'

    // the token, from Vault (service role only): read, never refreshed here
    const { data: salvato, error: erroreToken } = await db.rpc('instagram_token')
    const token = typeof salvato === 'string' ? salvato.trim() : ''
    if (erroreToken || !token) {
      await inCoda(FRASI_ANALISI.senzaToken, ATTESA_TOKEN_MS)
      return { esito: 'parziale', uso, secondiAudio }
    }
    const base = baseGraph()
    const locale = origineLocale(base)
    const graph = creaGraphContenuti({ token, base, entro: op.entro })

    let indirizzi: Awaited<ReturnType<typeof graph.video>>
    try {
      indirizzi = await graph.video(media_id)
    } catch (e) {
      if (!(e instanceof ErroreInstagram)) throw e
      if (e.tipo === 'token') await inCoda(FRASI_ANALISI.tokenScaduto, ATTESA_TOKEN_MS)
      else if (e.tipo === 'limite' || e.tipo === 'rete') await inCoda(FRASI_ANALISI.nonRisponde, ATTESA_RIPROVA_MS)
      else if (e.tipo === 'tempo') await inCoda(FRASI_ANALISI.nonRisponde, null)
      else await fine({ stato: 'fallita', errore: FRASI_ANALISI.reelSparito })
      return { esito: e.tipo === 'meta' ? 'fallito' : 'parziale', uso, secondiAudio }
    }

    const risultato: Riga = {
      durata_ms: undefined,
      audio_tipo: indirizzi.audio ?? undefined,
      video_disponibile: indirizzi.url !== null,
    }
    let video: 'letto' | 'senza_media_url' | 'troppo_grande' | 'non_scaricabile' | 'senza_estrattore' = 'letto'
    let durata: number | null = null
    let haAudio = false
    let fotogrammi: Fotogramma[] = []
    let audio: string | null = null

    // 1. the video
    let fileVideo: string | null = null
    if (indirizzi.url === null) {
      video = 'senza_media_url'
    } else {
      const destinazione = path.join(cartella, 'video.mp4')
      let scarico = await scarica({ url: indirizzi.url, file: destinazione, tipo: 'video', max: VIDEO_MAX_BYTE, timeoutMs: VIDEO_TIMEOUT_MS, locale, fetch: op.fetch, entro: op.entro })
      if (!scarico.ok && scarico.stato === 403) {
        // the signed URL may have expired between the two requests: read it again, once
        try {
          const nuovi = await graph.video(media_id)
          if (nuovi.url) scarico = await scarica({ url: nuovi.url, file: destinazione, tipo: 'video', max: VIDEO_MAX_BYTE, timeoutMs: VIDEO_TIMEOUT_MS, locale, fetch: op.fetch, entro: op.entro })
        } catch {
          // the first answer stands
        }
      }
      if (scarico.ok) fileVideo = destinazione
      else video = scarico.codice
    }

    // 2. ffmpeg: the audio and the frames
    if (fileVideo) {
      const bin = await percorsoFfmpeg()
      if (!bin) {
        console.error('[analisi] ffmpeg non trovato')
        video = 'senza_estrattore'
      } else {
        const t0 = Date.now()
        const estratto = await estraiDalVideo({ bin, file: fileVideo, cartella, entro: op.entro, lato: latoFotogrammi(), soloAudio: !completa })
        console.info('[analisi] ffmpeg', {
          secondi: Math.round((Date.now() - t0) / 100) / 10,
          fotogrammi: estratto.fotogrammi.length,
          problema: estratto.problema,
        })
        durata = estratto.durata
        haAudio = estratto.ha_audio
        audio = estratto.audio
        fotogrammi = estratto.fotogrammi
        if (estratto.problema !== null && fotogrammi.length === 0 && !audio) video = 'senza_estrattore'
        if (durata !== null && durata * 1000 >= 1 && durata * 1000 <= 3_600_000) risultato.durata_ms = Math.round(durata * 1000)
      }
    }

    // 3. Whisper (not again if an earlier step of this reading already heard it)
    let tEsito = l.trascrizione_esito as string | null
    let trascrizione = l.trascrizione as string | null
    let segmenti = (Array.isArray(l.segmenti) ? l.segmenti : null) as SegmentoParlato[] | null
    let gancio = l.gancio_parlato as string | null
    let modelloTrascrizione = l.modello_trascrizione as string | null
    if (!tEsito) {
      if (video === 'senza_media_url' || (fileVideo === null)) tEsito = 'senza_video'
      else if (!haAudio || !audio) tEsito = 'senza_audio'
      else {
        const t = await trascriviAudio({ file: audio, durataSecondi: durata, segnale: op.segnale, fetch: op.fetch })
        if (t.esito === 'limite') {
          await inCoda(FRASI_ANALISI.nonRisponde, Math.max(2 * 60_000, (t.riprovaTraSecondi ?? 0) * 1000))
          return { esito: 'limite_fornitore', uso, secondiAudio }
        }
        if (t.esito === 'spenta') tEsito = 'spenta'
        else if (t.esito === 'fallita') {
          secondiAudio += t.secondiFatturati
          tEsito = 'fallita'
        } else {
          secondiAudio += t.secondiFatturati
          modelloTrascrizione = t.modello
          if (t.esito === 'pronta') {
            tEsito = 'pronta'
            trascrizione = t.trascrizione
            segmenti = t.segmenti
            gancio = t.gancio
          } else {
            tEsito = 'senza_parlato'
          }
        }
      }
    }
    Object.assign(risultato, {
      video,
      ha_audio: haAudio,
      trascrizione_esito: tEsito,
      trascrizione: tEsito === 'pronta' ? trascrizione : null,
      segmenti: tEsito === 'pronta' ? segmenti : null,
      gancio_parlato: tEsito === 'pronta' ? gancio : null,
      modello_trascrizione: tEsito === 'pronta' ? modelloTrascrizione : null,
    })

    if (!completa) {
      await fine({ stato: 'fatta', ...risultato })
      return { esito: 'ok', uso, secondiAudio }
    }

    // 4. the time left for Claude: otherwise «resume» (the speech stays saved)
    if (op.entro - Date.now() < MINIMO_VISIONE_MS) {
      await fine({ stato: 'in_coda', ...risultato })
      return { esito: 'parziale', uso, secondiAudio }
    }

    // 5. the images: the cover and the frames
    const immagini: ImmagineDaMandare[] = []
    let copertina: Buffer | null = null
    if (indirizzi.copertina) {
      const grezza = path.join(cartella, 'copertina.jpg')
      const c = await scarica({ url: indirizzi.copertina, file: grezza, tipo: 'image', max: COPERTINA_MAX_BYTE, timeoutMs: COPERTINA_TIMEOUT_MS, locale, fetch: op.fetch, entro: op.entro })
      if (c.ok) {
        const bin = await percorsoFfmpeg()
        const ridotta = bin ? await riduciCopertina({ bin, file: grezza, cartella, entro: op.entro, lato: latoFotogrammi() }) : null
        const letto = await readFile(ridotta ?? grezza).catch(() => null)
        const misure = letto ? dimensioniJpeg(letto) : null
        // not reduced: sent as it is only under 2000 px a side
        if (letto && (ridotta || (misure && Math.max(misure.larghezza, misure.altezza) < 2000))) copertina = letto
      }
    }
    if (copertina) immagini.push({ etichetta: 'Copertina (griglia del profilo):', jpeg: copertina })
    const parlati = parlatoPerFotogramma(fotogrammi, tEsito === 'pronta' && segmenti ? segmenti : [])
    for (const [i, f] of fotogrammi.entries()) {
      const jpeg = await readFile(f.file).catch(() => null)
      if (jpeg) immagini.push({ etichetta: etichettaFotogramma(i + 1, f), jpeg, parlato: parlati[i] })
    }
    const nelleImmagini = immagini.length - (copertina ? 1 : 0)
    const fonteVisione = fotogrammi.length > 0 ? 'video' : 'copertina'

    if (immagini.length === 0) {
      await fine({ stato: 'fatta', ...risultato, visione_esito: 'fallita', fonte_visione: 'copertina' })
      return { esito: 'parziale', uso, secondiAudio }
    }

    // 6. Claude looks
    const { data: nomiDb } = await db.rpc('marketing_da_oscurare')
    const parole = paroleDaOscurare(Array.isArray(nomiDb) ? (nomiDb as string[]) : [])
    const cal = await datiCalendario(db, { shortcode: p.shortcode, pubblicato_il: p.pubblicato_il }, parole)
    const collegato = cal.calendario !== null
    const reel = {
      pubblicato: quandoPubblicato(p.pubblicato_il),
      durata_secondi: durata !== null ? Math.round(durata * 10) / 10 : null,
      audio: indirizzi.audio === 'MUSIC' ? 'musica' : indirizzi.audio === 'ORIGINAL_SOUND' ? 'voce originale' : null,
      didascalia: oscura((p.didascalia ?? '').slice(0, 1000), parole),
      trascrizione: tEsito === 'pronta' ? null : tEsito,
      solo_copertina: fotogrammi.length === 0,
      calendario: cal.calendario,
    }
    const risposta = await vediReel({ immagini, reel, entro: op.entro, segnale: op.segnale, cliente: op.cliente })
    uso = risposta.uso
    if (!risposta.ok) {
      const e = esitoDelCodice(risposta.codice)
      const base = { ...risultato, errore: e.frase }
      if (risposta.codice === 'tempo') {
        await fine({ stato: 'in_coda', ...risultato })
        return { esito: 'parziale', uso, secondiAudio }
      }
      if (risposta.codice === 'rifiuto') {
        await fine({ stato: 'fatta', ...risultato, visione_esito: 'rifiutata', fonte_visione: fonteVisione, scheda: null, fotogrammi: nelleImmagini, lato_px: latoFotogrammi() })
        return { esito: 'ok', uso, secondiAudio }
      }
      if (e.fornitore) {
        await fine({ stato: 'fallita', ...base })
        return { esito: 'limite_fornitore', uso, secondiAudio }
      }
      if (risposta.codice === 'limite') {
        await fine({ stato: 'in_coda', ...base, tentativo: true, prossimo_il: new Date(Date.now() + ATTESA_RIPROVA_MS).toISOString() })
        return { esito: 'limite_fornitore', uso, secondiAudio }
      }
      // network, a broken answer: one more try later (3 attempts at most)
      await fine({ stato: 'in_coda', ...base, tentativo: true, prossimo_il: new Date(Date.now() + ATTESA_RIPROVA_MS).toISOString() })
      return { esito: 'parziale', uso, secondiAudio }
    }

    const verificata = verificaScheda(risposta.dati, { durata, collegato }, { parole, note: [] })
    if (!verificata) {
      await fine({ stato: 'fatta', ...risultato, visione_esito: 'fallita', fonte_visione: fonteVisione, scheda: null, fotogrammi: nelleImmagini, lato_px: latoFotogrammi() })
      return { esito: 'parziale', uso, secondiAudio }
    }
    console.info('[analisi] controllo', { passo: 'visione', ...verificata.conteggi, scartate: verificata.scartate })
    await fine({
      stato: 'fatta',
      ...risultato,
      visione_esito: 'pronta',
      fonte_visione: fonteVisione,
      scheda: verificata.dati,
      fotogrammi: nelleImmagini,
      lato_px: latoFotogrammi(),
      modello_visione: risposta.modello,
      versione_prompt_visione: VERSIONE_PROMPT_VISIONE,
    })
    console.info('[analisi] lettura', { immagini: immagini.length, secondi: Math.round((Date.now() - avvio) / 100) / 10 })
    return { esito: 'ok', uso, secondiAudio }
  } catch (e) {
    console.error('[analisi] lettura interrotta:', e instanceof Error ? e.name : 'errore')
    await inCoda(FRASI_ANALISI.lettura, ATTESA_RIPROVA_MS)
    return { esito: 'fallito', uso, secondiAudio }
  } finally {
    if (cartella) await togliCartella(cartella)
  }
}
