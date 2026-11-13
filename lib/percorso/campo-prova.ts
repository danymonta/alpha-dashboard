import { leggiCampoBase, type CampoBase } from '@/lib/percorso/campo-base'

/**
 * The home base in the admin's «Prova del percorso» (1.83.0): the same document campo_base_cliente()
 * gives, built in the page's memory from the published contents the admin reads (the CMS pages and
 * the Aula, never a draft), with the same rules as the database (a module opens when published and,
 * before the launch, only if open during the onboarding; a lesson that is not a video completes with
 * a tap, a video lesson at 90%). One invented check-up, so «Le mie call» is not empty. Pure: tested
 * in tests/percorso-campo-prova.test.ts. Nothing is written.
 */

export type BloccoCampoProva = {
  id: string
  tipo: string
  titolo: string | null
  corpo: string | null
  youtube_id: string | null
  url: string | null
  obbligatorio: boolean
}

export type LezioneProva = {
  id: string
  titolo: string
  tipo: 'video' | 'testo' | 'pdf' | 'link'
  corpo: string | null
  youtube_id: string | null
  url: string | null
  obbligatoria: boolean
}

export type ModuloProva = {
  id: string
  titolo: string
  descrizione: string | null
  copertina_url: string | null
  icona: string
  stato: 'pubblicato' | 'prossimamente' | 'bloccato'
  durante_onboarding: boolean
  lezioni: LezioneProva[]
}

export type DatiCampoProva = {
  home: BloccoCampoProva[]
  regole: BloccoCampoProva[]
  regolePercorso: BloccoCampoProva[]
  community: BloccoCampoProva[]
  linkCommunity: string | null
  coach: { nome: string; foto_url: string | null } | null
  aula: ModuloProva[]
}

/** What the fake client did in the Aula, by lesson. */
export type AulaProva = Record<string, { completataIl: string | null; durata: number | null; visti: [number, number][] }>

type Esito<T> = ({ ok: true } & T) | { ok: false; errore: string }

const NON_DISPONIBILE = 'Questa lezione non è ancora disponibile.'

function aperto(m: ModuloProva, lanciato: boolean): boolean {
  return m.stato === 'pubblicato' && (lanciato || m.durante_onboarding)
}

function unisci(intervalli: [number, number][]): [number, number][] {
  const ordinati = [...intervalli].sort((a, b) => a[0] - b[0])
  const fuori: [number, number][] = []
  for (const [da, a] of ordinati) {
    const ultimo = fuori[fuori.length - 1]
    if (ultimo && da <= ultimo[1]) ultimo[1] = Math.max(ultimo[1], a)
    else fuori.push([da, a])
  }
  return fuori
}

function secondi(intervalli: [number, number][]): number {
  return unisci(intervalli).reduce((t, [da, a]) => t + (a - da), 0)
}

function percentuale(v: AulaProva[string] | undefined): number {
  if (!v || !v.durata) return 0
  return Math.round((Math.min(v.durata, secondi(v.visti)) * 10000) / v.durata) / 100
}

function lezioneAperta(d: DatiCampoProva, lezione: string, lanciato: boolean): LezioneProva | null {
  for (const m of d.aula) {
    const l = m.lezioni.find((x) => x.id === lezione)
    if (l) return aperto(m, lanciato) ? l : null
  }
  return null
}

/** The document of the home base, as campo_base_cliente() would give it. */
export function campoDiProva(
  d: DatiCampoProva,
  aula: AulaProva,
  opzioni: { lanciato: boolean; nome: string; giornoCheckup: string },
): CampoBase {
  const documento = {
    nome: opzioni.nome,
    lanciato: opzioni.lanciato,
    home: d.home,
    regole: d.regole,
    regole_percorso: d.regolePercorso,
    community: d.community,
    link_community: d.linkCommunity,
    gruppo_privato_url: null,
    coach: d.coach ? { nome: d.coach.nome, foto_url: d.coach.foto_url, ruolo: 'Fitness Coach' } : null,
    prossima_call: null,
    aula: d.aula.map((m) => {
      const apre = aperto(m, opzioni.lanciato)
      return {
        id: m.id,
        titolo: m.titolo,
        descrizione: m.descrizione,
        copertina_url: m.copertina_url,
        icona: m.icona,
        stato: m.stato,
        durante_onboarding: m.durante_onboarding,
        aperto: apre,
        lezioni_totali: m.lezioni.length,
        lezioni_completate: m.lezioni.filter((l) => aula[l.id]?.completataIl).length,
        lezioni: m.lezioni.map((l) => ({
          id: l.id,
          titolo: l.titolo,
          tipo: l.tipo,
          obbligatoria: l.obbligatoria,
          completata_il: aula[l.id]?.completataIl ?? null,
          percentuale: percentuale(aula[l.id]),
          ...(apre ? { corpo: l.corpo, youtube_id: l.youtube_id, url: l.url } : {}),
        })),
      }
    }),
    checkup: [
      {
        id: '00000000-0000-4000-8000-0000000c4ec0',
        giorno: opzioni.giornoCheckup,
        argomento: 'Esempio: la prima call di checkup',
        resoconto: `${opzioni.nome || 'Mario'}, grazie della call, oggi abbiamo parlato di questo topic principale: come impostare le prime due settimane.`,
        compiti: ['Carica il peso su Coach Plus entro domenica', 'Registra il video delle trazioni', 'Prossima call tra due settimane'],
        fathom_url: null,
      },
    ],
  }
  return leggiCampoBase(documento)!
}

/** «Segna come completata» on a lesson that is not a video. */
export function completaLezioneProva(
  d: DatiCampoProva,
  aula: AulaProva,
  lezione: string,
  lanciato: boolean,
  ora: Date,
): Esito<{ aula: AulaProva; completataIl: string }> {
  const l = lezioneAperta(d, lezione, lanciato)
  if (!l) return { ok: false, errore: NON_DISPONIBILE }
  if (l.tipo === 'video') return { ok: false, errore: 'Questa lezione si completa guardando il video.' }
  const prima = aula[lezione]
  const completataIl = prima?.completataIl ?? ora.toISOString()
  return {
    ok: true,
    completataIl,
    aula: { ...aula, [lezione]: { completataIl, durata: prima?.durata ?? null, visti: prima?.visti ?? [] } },
  }
}

/** The seconds of a video lesson seen: completed at 90%. */
export function videoLezioneProva(
  d: DatiCampoProva,
  aula: AulaProva,
  input: { lezione: string; durata: number; intervalli: [number, number][] },
  lanciato: boolean,
  ora: Date,
): Esito<{ aula: AulaProva; percentuale: number; visto: boolean }> {
  const l = lezioneAperta(d, input.lezione, lanciato)
  if (!l || l.tipo !== 'video') return { ok: false, errore: 'Video non valido' }
  const prima = aula[input.lezione]
  const durata = prima?.durata ?? input.durata
  if (!Number.isInteger(durata) || durata < 30 || durata > 10800) return { ok: false, errore: 'Durata non valida' }
  const nuovi: [number, number][] = []
  for (const [da, a] of input.intervalli) {
    if (!(Number.isInteger(da) && Number.isInteger(a)) || da < 0 || da >= durata || a <= da || a > durata + 2) {
      return { ok: false, errore: 'Intervalli non validi' }
    }
    nuovi.push([da, Math.min(a, durata)])
  }
  const visti = unisci([...(prima?.visti ?? []), ...nuovi])
  const riga = { completataIl: prima?.completataIl ?? null, durata, visti }
  const p = percentuale(riga)
  if (p >= 90 && !riga.completataIl) riga.completataIl = ora.toISOString()
  return { ok: true, aula: { ...aula, [input.lezione]: riga }, percentuale: p, visto: riga.completataIl !== null }
}

/** «Segna il video come visto» of the bar, for the video lessons too: every open video lesson completed. */
export function segnaVideoLezioniProva(d: DatiCampoProva, aula: AulaProva, lanciato: boolean, ora: Date): AulaProva {
  const fuori: AulaProva = { ...aula }
  for (const m of d.aula) {
    if (!aperto(m, lanciato)) continue
    for (const l of m.lezioni) {
      if (l.tipo !== 'video' || fuori[l.id]?.completataIl) continue
      fuori[l.id] = { completataIl: ora.toISOString(), durata: fuori[l.id]?.durata ?? null, visti: fuori[l.id]?.visti ?? [] }
    }
  }
  return fuori
}
