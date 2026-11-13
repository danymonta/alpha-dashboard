/**
 * «Prova del percorso» (1.82.0, CLAUDE.md section 34): the onboarding of a client simulated in
 * the memory of the admin's page, with the same rules as the database of flow v1, so that Dany
 * sees exactly what a client sees without creating anything. Pure: no database, no network,
 * no clock but the one passed in. It mirrors, function by function:
 * - percorso_avanza (the closed list of pairs, their starting states and checks),
 * - onboarding_sblocca (automatic unlock by sblocca_dopo, never a step with sblocco 'team'),
 * - video_progresso (seconds joined, 90% = seen),
 * - questionario_salva and questionario_invia (the consent in force, the version, the answers),
 * - the team's functions (call confirmed, call done, goal set, tests received, programme delivered),
 * - percorso_cliente and onboarding_stima (the document of the page).
 * The differences, on purpose: a call is marked done even before its hour (in the test there is
 * no waiting), the 30 second minimum of a video and the «twice the real time» check do not
 * apply, the files of the questionnaire are only names.
 * Tested in tests/percorso-prova.test.ts.
 */
import { aggiungiGiorni, formatOra, istanteRoma, oggiRoma } from '@/lib/date'
import type { AllegatoCliente } from '@/lib/percorso/allegati'
import { leggiBlocchi, type BloccoPercorso } from '@/lib/percorso/blocchi'
import type {
  AttesaTeam,
  CallCliente,
  ConsegnaCliente,
  NodoPercorso,
  PassoPercorso,
  Percorso,
  PersonaTeam,
  StatoPasso,
} from '@/lib/percorso/letture'
import type { Stima } from '@/lib/percorso/stima'
import {
  ERRORI_QUESTIONARIO,
  risposteMancanti,
  risposteValide,
  type CampoAllegato,
  type NumeroSchermata,
  type Risposte,
  type TipoAllegato,
} from '@/lib/validation/questionario'
import { avanzaPassoSchema, ERRORI_PERCORSO } from '@/lib/validation/percorso'

// ---------------------------------------------------------------------------
// What the server reads with the admin's session
// ---------------------------------------------------------------------------

export type DefPasso = {
  chiave: string
  titolo: string
  nodo: string
  ordine: number
  attore: 'cliente' | 'team'
  sblocco: 'automatico' | 'team'
  sbloccaDopo: string[]
}

/** A published block, as contenuti_blocchi has it (the JSON percorso_cliente builds from it). */
export type BloccoGrezzo = {
  id: string
  pagina: 'passo' | 'dopo_lancio'
  passo: string | null
  tipo: string
  titolo: string | null
  corpo: string | null
  youtube_id: string | null
  url: string | null
  obbligatorio: boolean
}

export type PersonaProva = PersonaTeam

export type DatiProva = {
  /** The fake client: «Mario Prova». */
  nomeCompleto: string
  email: string
  passi: DefPasso[]
  /** Published only, in the order of the CMS. */
  blocchi: BloccoGrezzo[]
  team: PersonaProva[]
  /** The version of the health consent in force in the database. */
  versioneConsenso: string
  linkCommunity: string | null
  linkPrenotazione: string | null
  giorni: { call: number; test: number; programma: number }
}

// ---------------------------------------------------------------------------
// The state of the test, in memory
// ---------------------------------------------------------------------------

type Passo = {
  stato: StatoPasso
  iniziatoIl: string | null
  inviatoIl: string | null
  completatoIl: string | null
  dati: { voci?: string[]; richiesta_inviata_il?: string; presentato_il?: string; consegnato_il?: string }
}

type Video = { durata: number; secondi: number[]; visto: boolean }

type CallProva = { tipo: 'onboarding' | 'checkpoint'; inizio: string; stato: CallCliente['stato']; meetUrl: string | null }

export type ConsegnaProva = {
  id: string
  tipo: 'video' | 'pdf' | 'link'
  titolo: string
  youtubeId: string | null
  url: string | null
  obbligatoria: boolean
}

export type StatoProva = {
  passi: Record<string, Passo>
  /** By block id or delivery id. */
  video: Record<string, Video>
  consenso: { versione: string; datoIl: string } | null
  questionario: { risposte: Risposte; versione: number; schermata: NumeroSchermata; inviatoIl: string | null }
  allegati: (AllegatoCliente & { tolto?: true })[]
  call: CallProva | null
  checkpoint: CallProva | null
  consegne: ConsegnaProva[]
  username: string | null
  giornoZero: string
  completatoIl: string | null
  /** A counter for the ids the test makes (files, deliveries): never a random value, so a test reads the same twice. */
  contatore: number
}

export type Esito<T = StatoProva> = { ok: true; stato: T } | { ok: false; errore: string }

const MEET_DI_PROVA = 'https://meet.google.com/abc-defg-hij'
/** A video of the delivery: the first video block of the path if there is one with a real id, else a YouTube id of an example. */
const VIDEO_DI_ESEMPIO = 'M7lc1UVf-VE'

function uuidDi(n: number): string {
  // a valid UUID (version 4, variant 8) from a counter: the components read only valid ids
  const esa = n.toString(16).padStart(12, '0').slice(-12)
  return `00000000-0000-4000-8000-${esa}`
}

function errore(testo: string): { ok: false; errore: string } {
  return { ok: false, errore: testo }
}

function iso(ora: Date): string {
  return ora.toISOString()
}

function blocchiDelPasso(dati: DatiProva, passo: string): BloccoGrezzo[] {
  return dati.blocchi.filter((b) => b.pagina === 'passo' && b.passo === passo)
}

function conPasso(stato: StatoProva, chiave: string, cambia: (p: Passo) => Passo): StatoProva {
  const prima = stato.passi[chiave]
  if (!prima) return stato
  return { ...stato, passi: { ...stato.passi, [chiave]: cambia(prima) } }
}

// ---------------------------------------------------------------------------
// The unlock and the completion
// ---------------------------------------------------------------------------

/** onboarding_sblocca: every locked step with sblocco automatico whose sblocca_dopo are all done. */
export function sblocca(dati: DatiProva, stato: StatoProva): StatoProva {
  let dopo = stato
  for (const d of dati.passi) {
    const p = dopo.passi[d.chiave]
    if (!p || p.stato !== 'bloccato' || d.sblocco !== 'automatico') continue
    if (d.sbloccaDopo.every((k) => dopo.passi[k]?.stato === 'fatto')) {
      dopo = conPasso(dopo, d.chiave, (x) => ({ ...x, stato: 'disponibile' }))
    }
  }
  return dopo
}

/** onboarding_video_mancanti: a compulsory published video of the step (or of every step) not seen. */
export function videoMancanti(dati: DatiProva, stato: StatoProva, passo: string | null): boolean {
  const passi = passo ? [passo] : Object.keys(stato.passi)
  const blocchi = passi.some((k) =>
    blocchiDelPasso(dati, k).some((b) => b.tipo === 'video' && b.obbligatorio && !stato.video[b.id]?.visto),
  )
  if (blocchi) return true
  if (passo !== null && passo !== 'programma') return false
  return stato.consegne.some((c) => c.tipo === 'video' && c.obbligatoria && !stato.video[c.id]?.visto)
}

function completaSePronto(dati: DatiProva, stato: StatoProva, ora: Date): StatoProva {
  if (stato.completatoIl) return stato
  if (Object.values(stato.passi).some((p) => p.stato !== 'fatto')) return stato
  if (videoMancanti(dati, stato, null)) return stato
  return { ...stato, completatoIl: iso(ora) }
}

function fatto(dati: DatiProva, stato: StatoProva, chiave: string, ora: Date): StatoProva {
  const t = iso(ora)
  const s = conPasso(stato, chiave, (p) => ({ ...p, stato: 'fatto', iniziatoIl: p.iniziatoIl ?? t, completatoIl: t }))
  return completaSePronto(dati, sblocca(dati, s), ora)
}

// ---------------------------------------------------------------------------
// The start
// ---------------------------------------------------------------------------

/** The client just registered (onboarding_registra_cliente): every step locked, then the unlock. */
export function statoIniziale(dati: DatiProva, ora: Date): StatoProva {
  const passi: Record<string, Passo> = {}
  for (const d of dati.passi) {
    passi[d.chiave] = { stato: 'bloccato', iniziatoIl: null, inviatoIl: null, completatoIl: null, dati: {} }
  }
  return sblocca(dati, {
    passi,
    video: {},
    consenso: null,
    questionario: { risposte: { email: dati.email, nome_cognome: dati.nomeCompleto }, versione: 0, schermata: 1, inviatoIl: null },
    allegati: [],
    call: null,
    checkpoint: null,
    consegne: [],
    username: null,
    giornoZero: oggiRoma(ora),
    completatoIl: null,
    contatore: 0,
  })
}

// ---------------------------------------------------------------------------
// The client's actions
// ---------------------------------------------------------------------------

const PARTENZE: Record<string, readonly StatoPasso[]> = {
  'benvenuto/completa': ['disponibile', 'in_corso'],
  'regole/accetta': ['disponibile', 'in_corso'],
  'prenotazione/prenotato': ['disponibile', 'in_corso'],
  'community/username': ['disponibile', 'in_corso'],
  'community/richiesta_inviata': ['disponibile', 'in_corso'],
  'community/presentato': ['disponibile', 'in_corso'],
  'obiettivo/visto': ['disponibile'],
  'test/spunta': ['disponibile', 'in_corso'],
  'programma/completa': ['disponibile'],
}

/** percorso_avanza: the same pairs, the same states, the same sentences. */
export function avanza(dati: DatiProva, stato: StatoProva, input: unknown, ora: Date): Esito {
  const parsed = avanzaPassoSchema.safeParse(input)
  if (!parsed.success) return errore(ERRORI_PERCORSO.nonValidi)
  const v = parsed.data
  const partenze = PARTENZE[`${v.passo}/${v.azione}`]
  const p = stato.passi[v.passo]
  if (p?.stato === 'fatto') return errore('Questo passo è già completato.')
  if (partenze && p && (p.stato === 'inviato' || p.stato === 'in_attesa_team')) {
    return errore('Il tuo team sta controllando questo passo: ti avvisiamo quando tocca a te.')
  }
  if (!partenze || !p || !partenze.includes(p.stato)) return errore('Questo passo non è ancora disponibile.')
  const t = iso(ora)

  if (v.passo === 'benvenuto') {
    if (videoMancanti(dati, stato, 'benvenuto')) return errore('Guarda il video fino in fondo prima di andare avanti.')
    return { ok: true, stato: fatto(dati, stato, 'benvenuto', ora) }
  }

  if (v.passo === 'regole') {
    const regole = blocchiDelPasso(dati, 'regole').filter((b) => b.tipo === 'regola')
    if (regole.some((r) => !v.dati.regole.includes(r.id))) return errore('Spunta tutte le regole per andare avanti.')
    if (v.dati.consenso_salute !== dati.versioneConsenso) {
      return errore('Il testo del consenso è cambiato: rileggilo e accettalo di nuovo.')
    }
    const conConsenso: StatoProva = { ...stato, consenso: { versione: dati.versioneConsenso, datoIl: stato.consenso?.datoIl ?? t } }
    return { ok: true, stato: fatto(dati, conConsenso, 'regole', ora) }
  }

  if (v.passo === 'prenotazione') {
    const oggi = oggiRoma(ora)
    if (v.dati.giorno < oggi || v.dati.giorno > aggiungiGiorni(oggi, 60)) return errore('Il giorno della call va da oggi a 60 giorni.')
    const inizio = istanteRoma(v.dati.giorno, v.dati.ora)
    if (new Date(inizio).getTime() < ora.getTime()) {
      return errore('Quest’ora è già passata: scrivi quella della call che hai prenotato.')
    }
    if (stato.call && stato.call.stato !== 'annullata') return errore('Hai già una call di onboarding.')
    const s = conPasso({ ...stato, call: { tipo: 'onboarding', inizio, stato: 'da_confermare', meetUrl: null } }, 'prenotazione', (x) => ({
      ...x,
      stato: 'inviato',
      iniziatoIl: x.iniziatoIl ?? t,
      inviatoIl: t,
    }))
    return { ok: true, stato: s }
  }

  if (v.passo === 'community') {
    if (v.azione === 'username') {
      const username = v.dati.username.trim().replace(/^@/, '').toLowerCase()
      if (!/^[a-z0-9_]{5,32}$/.test(username)) {
        return errore('Lo username di Telegram ha da 5 a 32 caratteri: lettere, numeri e trattino basso.')
      }
      return { ok: true, stato: conPasso({ ...stato, username }, 'community', (x) => ({ ...x, stato: 'in_corso', iniziatoIl: x.iniziatoIl ?? t })) }
    }
    if (v.azione === 'richiesta_inviata') {
      if (!stato.username) return errore('Prima scrivi il tuo username di Telegram.')
      return {
        ok: true,
        stato: conPasso(stato, 'community', (x) => ({
          ...x,
          stato: 'in_corso',
          iniziatoIl: x.iniziatoIl ?? t,
          dati: { ...x.dati, richiesta_inviata_il: x.dati.richiesta_inviata_il ?? t },
        })),
      }
    }
    if (!p.dati.richiesta_inviata_il) return errore('Prima chiedi l’accesso alla community.')
    if (videoMancanti(dati, stato, 'community')) return errore('Guarda il video fino in fondo prima di andare avanti.')
    const s = conPasso(stato, 'community', (x) => ({ ...x, dati: { ...x.dati, presentato_il: t } }))
    return { ok: true, stato: fatto(dati, s, 'community', ora) }
  }

  if (v.passo === 'obiettivo') {
    if (videoMancanti(dati, stato, 'obiettivo')) return errore('Guarda il video fino in fondo prima di andare avanti.')
    return { ok: true, stato: fatto(dati, stato, 'obiettivo', ora) }
  }

  if (v.passo === 'test') {
    const voci = blocchiDelPasso(dati, 'test').filter((b) => b.tipo === 'voce')
    if (!voci.some((b) => b.id === v.dati.voce)) return errore('Voce non valida')
    const spuntate = p.dati.voci ?? []
    const nuove = spuntate.includes(v.dati.voce) ? spuntate : [...spuntate, v.dati.voce]
    const tutte = voci.every((b) => nuove.includes(b.id))
    return {
      ok: true,
      stato: conPasso(stato, 'test', (x) => ({
        ...x,
        stato: tutte ? 'in_attesa_team' : 'in_corso',
        iniziatoIl: x.iniziatoIl ?? t,
        inviatoIl: tutte ? t : x.inviatoIl,
        dati: { ...x.dati, voci: nuove },
      })),
    }
  }

  // programma/completa
  if (videoMancanti(dati, stato, null)) return errore('Guarda i video obbligatori prima di andare avanti.')
  return { ok: true, stato: fatto(dati, stato, 'programma', ora) }
}

/** The steps whose videos count: a block of a step open, or a delivery with the programme to watch. */
function passoDelVideo(dati: DatiProva, stato: StatoProva, id: string): string | null {
  if (stato.consegne.some((c) => c.id === id && c.tipo === 'video')) return 'programma'
  const b = dati.blocchi.find((x) => x.id === id && x.tipo === 'video' && x.pagina === 'passo')
  return b?.passo ?? null
}

/** video_progresso: the seconds joined to the ones already seen; 90% = seen. */
export function progressoVideo(
  dati: DatiProva,
  stato: StatoProva,
  input: { blocco?: string | null; consegna?: string | null; durata: number; intervalli: [number, number][] },
  ora: Date,
): Esito<{ stato: StatoProva; percentuale: number; visto: boolean }> {
  const id = input.consegna ?? input.blocco ?? null
  if (!id || (input.consegna && input.blocco)) return errore('Video non valido')
  const passo = passoDelVideo(dati, stato, id)
  if (!passo) return errore('Video non valido')
  const p = stato.passi[passo]
  if (!p || (p.stato !== 'disponibile' && p.stato !== 'in_corso')) return errore('Questo passo non è ancora disponibile.')
  const prima = stato.video[id]
  const durata = prima?.durata ?? Math.max(1, Math.round(input.durata))
  const visti = new Set(prima?.secondi ?? [])
  for (const [da, a] of input.intervalli) {
    if (da < 0 || da >= durata || a > durata + 2 || a <= da) return errore('Intervalli non validi')
    for (let s = da; s < Math.min(a, durata); s++) visti.add(s)
  }
  const percentuale = Math.round((visti.size * 10000) / durata) / 100
  const visto = (prima?.visto ?? false) || percentuale >= 90
  let s: StatoProva = { ...stato, video: { ...stato.video, [id]: { durata, secondi: [...visti].sort((x, y) => x - y), visto } } }
  if (p.stato === 'disponibile' && passo !== 'obiettivo' && passo !== 'programma') {
    s = conPasso(s, passo, (x) => ({ ...x, stato: 'in_corso', iniziatoIl: x.iniziatoIl ?? iso(ora) }))
  }
  return { ok: true, stato: { stato: s, percentuale, visto } }
}

/**
 * The test's own help, never a step of the client: the compulsory videos of the steps the client
 * can see now marked as seen (a placeholder id does not play, and nobody wants to watch a whole
 * video to try the next step).
 */
export function segnaVideoVisti(dati: DatiProva, stato: StatoProva): StatoProva {
  const video = { ...stato.video }
  for (const [chiave, p] of Object.entries(stato.passi)) {
    if (p.stato !== 'disponibile' && p.stato !== 'in_corso') continue
    for (const b of blocchiDelPasso(dati, chiave)) {
      if (b.tipo === 'video') video[b.id] = { durata: 100, secondi: Array.from({ length: 100 }, (_, i) => i), visto: true }
    }
    if (chiave === 'programma') {
      for (const c of stato.consegne) {
        if (c.tipo === 'video') video[c.id] = { durata: 100, secondi: Array.from({ length: 100 }, (_, i) => i), visto: true }
      }
    }
  }
  return { ...stato, video }
}

/** Whether the step the client sees now waits for a video (the bar of the test offers «Segna il video come visto»). */
export function aspettaUnVideo(dati: DatiProva, stato: StatoProva): boolean {
  return Object.entries(stato.passi).some(
    ([chiave, p]) =>
      (p.stato === 'disponibile' || p.stato === 'in_corso') &&
      (blocchiDelPasso(dati, chiave).some((b) => b.tipo === 'video' && !stato.video[b.id]?.visto) ||
        (chiave === 'programma' && stato.consegne.some((c) => c.tipo === 'video' && !stato.video[c.id]?.visto))),
  )
}

/** consenso_dai: the version in force given again. */
export function daiConsenso(dati: DatiProva, stato: StatoProva, versione: string, ora: Date): Esito {
  if (versione !== dati.versioneConsenso) return errore('Il testo del consenso è cambiato: rileggilo e accettalo di nuovo.')
  return { ok: true, stato: { ...stato, consenso: { versione, datoIl: iso(ora) } } }
}

// ---------------------------------------------------------------------------
// The questionnaire
// ---------------------------------------------------------------------------

export function consensoInVigore(dati: DatiProva, stato: StatoProva): boolean {
  return stato.consenso?.versione === dati.versioneConsenso
}

function questionarioAperto(dati: DatiProva, stato: StatoProva): string | null {
  if (stato.questionario.inviatoIl) return 'Il questionario è già stato inviato.'
  const p = stato.passi.questionario
  if (!p || (p.stato !== 'disponibile' && p.stato !== 'in_corso')) return 'Questo passo non è ancora disponibile.'
  if (!consensoInVigore(dati, stato)) return 'Serve il consenso al trattamento dei dati sulla salute per compilare il questionario.'
  return null
}

export type EsitoSalvaProva =
  | { ok: true; stato: StatoProva; esito: 'salvato'; versione: number }
  | { ok: true; stato: StatoProva; esito: 'cambiato'; risposte: Risposte; versione: number }
  | { ok: false; errore: string }

/** questionario_salva: only over the version the page read; the first save makes the step in_corso. */
export function salvaQuestionario(
  dati: DatiProva,
  stato: StatoProva,
  input: { risposte: unknown; schermata: number; versione: number },
  ora: Date,
): EsitoSalvaProva {
  const chiuso = questionarioAperto(dati, stato)
  if (chiuso) return errore(chiuso)
  if (!risposteValide(input.risposte)) return errore(ERRORI_QUESTIONARIO.nonValidi)
  if (input.versione !== stato.questionario.versione) {
    return { ok: true, stato, esito: 'cambiato', risposte: stato.questionario.risposte, versione: stato.questionario.versione }
  }
  const schermata = (input.schermata >= 1 && input.schermata <= 4 ? input.schermata : 1) as NumeroSchermata
  const versione = stato.questionario.versione + 1
  let s: StatoProva = { ...stato, questionario: { ...stato.questionario, risposte: input.risposte, schermata, versione } }
  s = conPasso(s, 'questionario', (x) => ({ ...x, stato: 'in_corso', iniziatoIl: x.iniziatoIl ?? iso(ora) }))
  return { ok: true, stato: s, esito: 'salvato', versione }
}

export type EsitoInviaProva =
  | { ok: true; stato: StatoProva; esito: 'inviato'; inviatoIl: string }
  | { ok: true; stato: StatoProva; esito: 'cambiato'; risposte: Risposte; versione: number }
  | { ok: false; errore: string; mancanti?: string[] }

/** questionario_invia: every required answer, at the version read; the step done and the unlock. */
export function inviaQuestionario(dati: DatiProva, stato: StatoProva, versione: number, ora: Date): EsitoInviaProva {
  const chiuso = questionarioAperto(dati, stato)
  if (chiuso) return errore(chiuso)
  if (versione !== stato.questionario.versione) {
    return { ok: true, stato, esito: 'cambiato', risposte: stato.questionario.risposte, versione: stato.questionario.versione }
  }
  const mancanti = risposteMancanti(stato.questionario.risposte)
  if (mancanti.length > 0) return { ok: false, errore: 'Mancano delle risposte: completa le parti segnate.', mancanti }
  const t = iso(ora)
  const s = fatto(dati, { ...stato, questionario: { ...stato.questionario, inviatoIl: t } }, 'questionario', ora)
  return { ok: true, stato: s, esito: 'inviato', inviatoIl: t }
}

/** A file of the questionnaire, only its name: nothing is uploaded in the test. */
export function aggiungiAllegato(
  dati: DatiProva,
  stato: StatoProva,
  file: { campo: CampoAllegato; nome: string; tipo: TipoAllegato; byte: number },
): Esito<{ stato: StatoProva; allegato: AllegatoCliente }> {
  const chiuso = questionarioAperto(dati, stato)
  if (chiuso) return errore(chiuso)
  if (stato.allegati.filter((a) => a.campo === file.campo && !a.tolto).length >= 3) {
    return errore('Hai già caricato 3 file qui: togline uno per aggiungerne un altro.')
  }
  const contatore = stato.contatore + 1
  const allegato: AllegatoCliente = { id: uuidDi(contatore), campo: file.campo, nomeFile: file.nome, tipo: file.tipo, byte: file.byte }
  return { ok: true, stato: { stato: { ...stato, contatore, allegati: [...stato.allegati, allegato] }, allegato } }
}

export function togliAllegato(dati: DatiProva, stato: StatoProva, id: string): Esito {
  const chiuso = questionarioAperto(dati, stato)
  if (chiuso) return errore(chiuso)
  if (!stato.allegati.some((a) => a.id === id && !a.tolto)) return errore('Questo file non c’è più.')
  return { ok: true, stato: { ...stato, allegati: stato.allegati.filter((a) => a.id !== id) } }
}

/** An answer to every required question: what «Vai allo step» writes for a client who skips the questionnaire. */
export const RISPOSTE_DI_PROVA: Risposte = {
  email: 'mario.prova@example.test',
  telefono: '+39 333 000 0000',
  nome_cognome: 'Mario Prova',
  altezza_peso: { altezza: 178, peso: 75 },
  data_nascita: '1992-04-15',
  obiettivo_principale: 'Fare la prima trazione e sentirmi più sicuro.',
  occupazione: 'Impiegato',
  storia_allenamento: 'Un anno di palestra, poi niente.',
  giorni_settimana: 3,
  infortuni: 'Nessuno.',
  perche_noi: 'Mi piacciono i video.',
  obiettivi_3_6_mesi: 'Cinque trazioni e dieci chili in meno.',
  attrezzatura: 'Una sbarra alla porta.',
  massimali: { piegamenti: 15, trazioni: 'non_lo_so', dip: 5 },
  esercizi_difficolta: 'Le trazioni.',
  pronto: 'si',
  ore_sonno: 'Sette ore.',
  importanza_tecnica: 'Molto.',
  seguito_alimentazione: 'no',
  organizzazione_giornata: 'Lavoro dalle 9 alle 18, ceno alle 20.',
  livello_attivita: 'attivo',
  conoscenza_alimentazione: 'Poca.',
  cattive_abitudini: { scelte: ['sonno'] },
  successo: 'Allenarmi tre volte a settimana senza saltare.',
  minuti_giorno: '30_40',
}

// ---------------------------------------------------------------------------
// The team's actions
// ---------------------------------------------------------------------------

export type AzioneTeam = 'conferma_call' | 'call_svolta' | 'obiettivo' | 'test' | 'programma'

/** The one action of the team the client waits for now, or null. */
export function azioneTeamDovuta(stato: StatoProva): AzioneTeam | null {
  const p = stato.passi
  if (p.prenotazione?.stato === 'inviato' && stato.call?.stato === 'da_confermare') return 'conferma_call'
  if (p.call && p.call.stato !== 'fatto' && p.call.stato !== 'bloccato' && stato.call?.stato === 'prenotata') return 'call_svolta'
  if (p.call?.stato === 'fatto' && p.obiettivo?.stato === 'bloccato') return 'obiettivo'
  if (p.test?.stato === 'in_attesa_team') return 'test'
  if (p.programma?.stato === 'in_attesa_team') return 'programma'
  return null
}

/** The reason of the email «Tocca a te» each action would send (lib/email/cliente.ts, TESTI_TOCCA_A_TE.motivi); null: none. */
export const AVVISO_DELL_AZIONE: Record<AzioneTeam, string | null> = {
  conferma_call: 'call_confermata',
  call_svolta: null,
  obiettivo: 'obiettivo_aperto',
  test: null,
  programma: 'programma_consegnato',
}

/** The first video of the CMS with a real id, for the example delivery; else an example video. */
function videoPerConsegna(dati: DatiProva): string {
  return dati.blocchi.find((b) => b.tipo === 'video' && b.youtube_id && b.youtube_id !== 'XXXXXXXXXXX')?.youtube_id ?? VIDEO_DI_ESEMPIO
}

/** The team's functions: onboarding_call_conferma, onboarding_call_esito svolta, obiettivo_impostato, test_ricevuti, programma_consegnato. */
export function azioneTeam(dati: DatiProva, stato: StatoProva, azione: AzioneTeam, ora: Date): Esito {
  const t = iso(ora)
  if (azione === 'conferma_call') {
    if (stato.call?.stato !== 'da_confermare') return errore('Non c’è una call da confermare.')
    const s: StatoProva = { ...stato, call: { ...stato.call, stato: 'prenotata', meetUrl: MEET_DI_PROVA } }
    return { ok: true, stato: fatto(dati, s, 'prenotazione', ora) }
  }
  if (azione === 'call_svolta') {
    if (stato.call?.stato !== 'prenotata') return errore('Questa call non è da segnare.')
    return { ok: true, stato: fatto(dati, { ...stato, call: { ...stato.call, stato: 'svolta' } }, 'call', ora) }
  }
  if (azione === 'obiettivo') {
    if (stato.passi.call?.stato !== 'fatto') return errore('Prima segna la call di onboarding come svolta.')
    if (stato.passi.obiettivo?.stato !== 'bloccato') return errore('L’obiettivo è già aperto al cliente.')
    return { ok: true, stato: conPasso(stato, 'obiettivo', (x) => ({ ...x, stato: 'disponibile' })) }
  }
  if (azione === 'test') {
    if (stato.passi.test?.stato !== 'in_attesa_team') return errore('Il cliente non ha ancora finito la settimana test.')
    let s = conPasso(stato, 'test', (x) => ({ ...x, stato: 'fatto', completatoIl: t }))
    s = conPasso(s, 'programma', (x) => (x.stato === 'bloccato' ? { ...x, stato: 'in_attesa_team', inviatoIl: t } : x))
    return { ok: true, stato: completaSePronto(dati, sblocca(dati, s), ora) }
  }
  if (stato.passi.programma?.stato !== 'in_attesa_team') return errore('Il programma si consegna dopo aver confermato i test.')
  const contatore = stato.contatore + 1
  const consegna: ConsegnaProva = {
    id: uuidDi(contatore),
    tipo: 'video',
    titolo: 'Video di esempio: la tua prima scheda',
    youtubeId: videoPerConsegna(dati),
    url: null,
    obbligatoria: true,
  }
  const checkpoint = istanteRoma(aggiungiGiorni(oggiRoma(ora), 7), '18:00')
  const s: StatoProva = {
    ...stato,
    contatore,
    consegne: [...stato.consegne, consegna],
    checkpoint: { tipo: 'checkpoint', inizio: checkpoint, stato: 'prenotata', meetUrl: MEET_DI_PROVA },
  }
  return {
    ok: true,
    stato: conPasso(s, 'programma', (x) => ({ ...x, stato: 'disponibile', dati: { ...x.dati, consegnato_il: t } })),
  }
}

// ---------------------------------------------------------------------------
// «Vai allo step»: everything before done with fake data
// ---------------------------------------------------------------------------

/** Where «Vai allo step» can go: the steps of the client and the launch. */
export type Meta = string | 'lancio'

function arrivato(stato: StatoProva, meta: Meta): boolean {
  if (meta === 'lancio') return stato.passi.programma?.stato === 'fatto'
  const p = stato.passi[meta]
  if (!p) return true
  if (meta === 'programma') return p.stato === 'disponibile' || p.stato === 'fatto'
  return p.stato === 'disponibile' || p.stato === 'in_corso' || p.stato === 'fatto'
}

/** One move forward, the client's first and then the team's, with fake data. */
function unPasso(dati: DatiProva, stato: StatoProva, ora: Date): StatoProva | null {
  const s0 = segnaVideoVisti(dati, stato)
  const ordinati = [...dati.passi].sort((a, b) => a.ordine - b.ordine)
  for (const d of ordinati) {
    const p = s0.passi[d.chiave]
    if (!p) continue
    const aperto = p.stato === 'disponibile' || p.stato === 'in_corso'
    if (!aperto) continue
    const avanti = (input: unknown) => {
      const e = avanza(dati, s0, input, ora)
      return e.ok ? e.stato : null
    }
    switch (d.chiave) {
      case 'benvenuto':
        return avanti({ passo: 'benvenuto', azione: 'completa' })
      case 'regole':
        return avanti({
          passo: 'regole',
          azione: 'accetta',
          dati: { regole: blocchiDelPasso(dati, 'regole').filter((b) => b.tipo === 'regola').map((b) => b.id), consenso_salute: dati.versioneConsenso },
        })
      case 'questionario': {
        const conRisposte: StatoProva = {
          ...s0,
          consenso: s0.consenso ?? { versione: dati.versioneConsenso, datoIl: iso(ora) },
          questionario: { ...s0.questionario, risposte: RISPOSTE_DI_PROVA, versione: s0.questionario.versione + 1 },
        }
        const e = inviaQuestionario(dati, conRisposte, conRisposte.questionario.versione, ora)
        return e.ok ? e.stato : null
      }
      case 'prenotazione':
        return avanti({ passo: 'prenotazione', azione: 'prenotato', dati: { giorno: aggiungiGiorni(oggiRoma(ora), 2), ora: '18:00' } })
      case 'community': {
        let s = s0
        if (!s.username) {
          const e = avanza(dati, s, { passo: 'community', azione: 'username', dati: { username: 'mario_prova' } }, ora)
          if (!e.ok) return null
          s = e.stato
        }
        if (!s.passi.community?.dati.richiesta_inviata_il) {
          const e = avanza(dati, s, { passo: 'community', azione: 'richiesta_inviata' }, ora)
          if (!e.ok) return null
          s = e.stato
        }
        const e = avanza(dati, s, { passo: 'community', azione: 'presentato' }, ora)
        return e.ok ? e.stato : null
      }
      case 'obiettivo':
        if (p.stato !== 'disponibile') continue
        return avanti({ passo: 'obiettivo', azione: 'visto' })
      case 'test': {
        let s = s0
        for (const b of blocchiDelPasso(dati, 'test').filter((x) => x.tipo === 'voce')) {
          if (s.passi.test?.dati.voci?.includes(b.id)) continue
          const e = avanza(dati, s, { passo: 'test', azione: 'spunta', dati: { voce: b.id } }, ora)
          if (!e.ok) return null
          s = e.stato
        }
        // a week without items: nothing to tick, the coach confirms as soon as he can
        if (s.passi.test?.stato !== 'in_attesa_team') s = conPasso(s, 'test', (x) => ({ ...x, stato: 'in_attesa_team' }))
        return s
      }
      case 'programma':
        if (p.stato !== 'disponibile') continue
        return avanti({ passo: 'programma', azione: 'completa' })
      default:
        continue
    }
  }
  const azione = azioneTeamDovuta(s0)
  if (!azione) return null
  const e = azioneTeam(dati, s0, azione, ora)
  return e.ok ? e.stato : null
}

/** «Vai allo step»: from the state of now, forward until the step is the client's (or the rocket left). Never backwards. */
export function vaiA(dati: DatiProva, stato: StatoProva, meta: Meta, ora: Date): StatoProva {
  let s = stato
  for (let i = 0; i < 60 && !arrivato(s, meta); i++) {
    const dopo = unPasso(dati, s, ora)
    if (!dopo) break
    s = dopo
  }
  return s
}

// ---------------------------------------------------------------------------
// The document of the page: percorso_cliente and onboarding_stima
// ---------------------------------------------------------------------------

function comeBlocchi(dati: DatiProva, stato: StatoProva, grezzi: readonly BloccoGrezzo[], passo: Passo | null): BloccoPercorso[] {
  return leggiBlocchi(
    grezzi.map((b) => ({
      id: b.id,
      tipo: b.tipo,
      titolo: b.titolo,
      corpo: b.corpo,
      youtube_id: b.youtube_id,
      url: b.url,
      obbligatorio: b.obbligatorio,
      ...(b.tipo === 'video'
        ? {
            video: {
              percentuale: stato.video[b.id]
                ? Math.round((stato.video[b.id]!.secondi.length * 10000) / stato.video[b.id]!.durata) / 100
                : 0,
              visto: stato.video[b.id]?.visto ?? false,
            },
          }
        : {}),
      ...(b.tipo === 'voce' ? { spuntata: passo?.dati.voci?.includes(b.id) ?? false } : {}),
    })),
  )
}

function comeCall(c: CallProva | null): CallCliente | null {
  if (!c) return null
  return {
    giorno: oggiRoma(new Date(c.inizio)),
    ora: formatOra(c.inizio),
    inizio: c.inizio,
    durataMinuti: 30,
    stato: c.stato,
    meetUrl: c.stato === 'prenotata' ? c.meetUrl : null,
  }
}

/** onboarding_stima, with the same bases and the same days of the settings. */
export function stima(dati: DatiProva, stato: StatoProva, ora: Date): Stima {
  const oggi = oggiRoma(ora)
  const g = dati.giorni
  const test = stato.passi.test
  const programma = stato.passi.programma
  const obiettivo = stato.passi.obiettivo
  const giornoDi = (t: string | null | undefined) => (t ? oggiRoma(new Date(t)) : oggi)

  let base: Stima['base']
  let data: string
  const lancio =
    programma && ['disponibile', 'in_corso', 'fatto'].includes(programma.stato)
      ? (programma.dati.consegnato_il ?? programma.completatoIl)
      : null
  if (lancio) {
    base = 'iniziato'
    data = giornoDi(lancio)
  } else if (test && (test.stato === 'in_attesa_team' || test.stato === 'fatto')) {
    base = 'settimana_test'
    data = aggiungiGiorni(giornoDi(test.inviatoIl ?? test.completatoIl), g.programma)
  } else if (test && (test.stato === 'disponibile' || test.stato === 'in_corso')) {
    base = 'settimana_test'
    data = aggiungiGiorni(giornoDi(test.iniziatoIl ?? obiettivo?.completatoIl), g.test + g.programma)
  } else if (stato.call && stato.call.stato !== 'annullata') {
    base = 'call_prenotata'
    data = aggiungiGiorni(giornoDi(stato.call.inizio), g.test + g.programma)
  } else {
    base = 'call_non_prenotata'
    data = aggiungiGiorni(oggi, g.call + g.test + g.programma)
  }

  let cose = dati.passi.filter((d) => {
    const p = stato.passi[d.chiave]
    if (!p || d.attore !== 'cliente' || p.stato === 'fatto') return false
    return !(d.chiave === 'test' && (p.stato === 'disponibile' || p.stato === 'in_corso'))
  }).length
  if (test && (test.stato === 'disponibile' || test.stato === 'in_corso')) {
    cose += blocchiDelPasso(dati, 'test').filter((b) => b.tipo === 'voce' && !test.dati.voci?.includes(b.id)).length
  }

  const video: string[] = []
  for (const d of [...dati.passi].sort((a, b) => a.ordine - b.ordine)) {
    const p = stato.passi[d.chiave]
    if (!p || p.stato === 'bloccato' || p.stato === 'fatto') continue
    for (const b of blocchiDelPasso(dati, d.chiave)) {
      if (b.tipo === 'video' && b.obbligatorio && !stato.video[b.id]?.visto) video.push(b.titolo ?? 'Video')
    }
  }
  if (programma && ['disponibile', 'in_corso', 'fatto'].includes(programma.stato)) {
    for (const c of stato.consegne) if (c.obbligatoria && !stato.video[c.id]?.visto) video.push(c.titolo)
  }

  return {
    data: base === 'iniziato' || data >= oggi ? data : null,
    giorni: base === 'iniziato' ? 0 : Math.max(0, Math.round((Date.parse(data) - Date.parse(oggi)) / 86_400_000)),
    quasi: base !== 'iniziato' && data < oggi,
    base,
    cose_da_fare: cose,
    video_mancanti: video,
  }
}

function primoNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] ?? ''
}

/** percorso_cliente, field by field, for the fake client. */
export function percorsoDi(dati: DatiProva, stato: StatoProva, ora: Date): Percorso {
  const ordinati = [...dati.passi].sort((a, b) => a.ordine - b.ordine)

  // the nodes: completed (all their steps done), the current one (the first not completed with a step open), the future ones
  const gruppi = new Map<string, { ordine: number; completato: boolean; aperto: boolean; completatoIl: string | null }>()
  for (const d of ordinati) {
    const p = stato.passi[d.chiave]
    if (!p) continue
    const g = gruppi.get(d.nodo) ?? { ordine: d.ordine, completato: true, aperto: false, completatoIl: null }
    g.ordine = Math.min(g.ordine, d.ordine)
    g.completato = g.completato && p.stato === 'fatto'
    g.aperto = g.aperto || p.stato !== 'bloccato'
    if (p.completatoIl && (!g.completatoIl || p.completatoIl > g.completatoIl)) g.completatoIl = p.completatoIl
    gruppi.set(d.nodo, g)
  }
  const elenco = [...gruppi.entries()].sort((a, b) => a[1].ordine - b[1].ordine)
  const attuale = elenco.find(([, g]) => !g.completato && g.aperto)?.[0] ?? null
  const nodi: NodoPercorso[] = elenco.map(([chiave, g]) => ({
    chiave,
    ordine: g.ordine,
    stato: g.completato ? 'completato' : chiave === attuale ? 'attuale' : 'futuro',
    completatoIl: g.completato ? g.completatoIl : null,
  }))

  const passi: PassoPercorso[] = ordinati
    .filter((d) => stato.passi[d.chiave])
    .map((d) => {
      const p = stato.passi[d.chiave]!
      return {
        chiave: d.chiave,
        titolo: d.titolo,
        nodo: d.nodo,
        attore: d.attore,
        stato: p.stato,
        completatoIl: p.stato === 'fatto' ? p.completatoIl : null,
        blocchi: p.stato !== 'bloccato' ? comeBlocchi(dati, stato, blocchiDelPasso(dati, d.chiave), p) : null,
      }
    })

  const st = (k: string) => stato.passi[k]?.stato ?? 'bloccato'
  const programmaAperto = ['disponibile', 'in_corso', 'fatto'].includes(st('programma'))
  const consegne: ConsegnaCliente[] = programmaAperto
    ? stato.consegne.map((c) => ({
        id: c.id,
        tipo: c.tipo,
        titolo: c.titolo,
        url: c.tipo === 'video' ? null : c.url,
        youtubeId: c.youtubeId,
        obbligatoria: c.obbligatoria,
        video:
          c.tipo === 'video'
            ? {
                percentuale: stato.video[c.id] ? Math.round((stato.video[c.id]!.secondi.length * 10000) / stato.video[c.id]!.durata) / 100 : 0,
                visto: stato.video[c.id]?.visto ?? false,
              }
            : null,
      }))
    : []

  const lanciato = st('programma') === 'fatto'
  const call = comeCall(stato.call)
  const coach = dati.team.find((t) => t.incarico === 'coach') ?? null
  const coachNome = coach ? primoNome(coach.nome) || null : null
  const cosa = (testo: string) => testo
  let attesa: AttesaTeam | null = null
  if (st('prenotazione') === 'inviato') {
    attesa = { passo: 'prenotazione', cosa: cosa(`${coachNome ?? 'Il tuo coach'} sta confermando la tua call.`), chi: null }
  } else if ((st('call') === 'disponibile' || st('call') === 'in_corso') && call) {
    attesa = { passo: 'call', cosa: `La tua call di onboarding con ${coachNome ?? 'il tuo coach'} è fissata.`, chi: null }
  } else if (st('call') === 'fatto' && st('obiettivo') === 'bloccato') {
    attesa = { passo: 'obiettivo', cosa: `${coachNome ?? 'Il tuo coach'} sta impostando il tuo obiettivo su Coach Plus.`, chi: null }
  } else if (st('test') === 'in_attesa_team') {
    attesa = { passo: 'test', cosa: `${coachNome ?? 'Il tuo coach'} sta controllando i tuoi test e i tuoi tracciamenti.`, chi: null }
  } else if (st('programma') === 'in_attesa_team') {
    attesa = { passo: 'programma', cosa: `${coachNome ?? 'Il tuo coach'} sta preparando il tuo programma.`, chi: null }
  }
  if (attesa && coachNome && coach) attesa = { ...attesa, chi: { nome: coachNome, ruolo: 'Coach', fotoUrl: coach.fotoUrl } }

  const completato = stato.completatoIl !== null
  const inAttesa =
    !completato &&
    !ordinati.some((d) => {
      const s = st(d.chiave)
      return (d.attore === 'cliente' && (s === 'disponibile' || s === 'in_corso')) || (d.chiave === 'programma' && s === 'disponibile')
    })

  const community =
    st('community') !== 'bloccato'
      ? {
          username: stato.username,
          richiestaInviataIl: stato.passi.community?.dati.richiesta_inviata_il ?? null,
          presentatoIl: stato.passi.community?.dati.presentato_il ?? null,
        }
      : null

  return {
    nome: primoNome(dati.nomeCompleto),
    stato: completato ? 'completato' : 'in_corso',
    giornoZero: stato.giornoZero,
    completatoIl: stato.completatoIl,
    nodi,
    passi,
    team: dati.team,
    consensi: [
      {
        tipo: 'salute',
        versioneInVigore: dati.versioneConsenso,
        versione: stato.consenso?.versione ?? null,
        datoIl: stato.consenso?.datoIl ?? null,
      },
    ],
    stima: stima(dati, stato, ora),
    inAttesa,
    call,
    checkpoint: comeCall(stato.checkpoint?.stato === 'prenotata' ? stato.checkpoint : null),
    consegne,
    community,
    linkCommunity: st('community') !== 'bloccato' ? dati.linkCommunity : null,
    linkPrenotazione: st('prenotazione') !== 'bloccato' ? dati.linkPrenotazione : null,
    gruppoPrivatoUrl: null,
    attesaTeam: attesa,
    lanciato,
    dopoLancio: lanciato ? comeBlocchi(dati, stato, dati.blocchi.filter((b) => b.pagina === 'dopo_lancio'), null) : [],
  }
}

/** The steps «Vai allo step» offers, in order: the client's, then the launch. */
export function metePossibili(dati: DatiProva): { chiave: Meta; titolo: string }[] {
  return [
    ...[...dati.passi]
      .sort((a, b) => a.ordine - b.ordine)
      .filter((d) => d.attore === 'cliente' || d.chiave === 'programma')
      .map((d) => ({ chiave: d.chiave, titolo: d.titolo })),
    // its words are the bar's (lib/i18n/testi/prova.ts)
    { chiave: 'lancio', titolo: '' },
  ]
}
