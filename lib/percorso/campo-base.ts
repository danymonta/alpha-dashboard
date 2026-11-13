import { leggiBlocchi, type BloccoPercorso } from '@/lib/percorso/blocchi'

/**
 * The client's home base (1.83.0, CLAUDE.md section 34, «Campo base del cliente»): the shapes the
 * tabs read, from campo_base_cliente() (the client) and campo_base_team() (his team, with the notes
 * of the check-ups). Pure: the client's page, the team's tab, the admin's test of the path and the
 * tests read the same document. A part that does not read becomes empty, never raw data.
 */

export const SCHEDE_CAMPO = ['percorso', 'home', 'aula', 'call', 'regole', 'community'] as const
export type SchedaCampo = (typeof SCHEDE_CAMPO)[number]

export type TipoLezione = 'video' | 'testo' | 'pdf' | 'link'

export type LezioneAula = {
  id: string
  titolo: string
  tipo: TipoLezione
  obbligatoria: boolean
  completataIl: string | null
  percentuale: number
  /** The content arrives only for an open module (or for the team). */
  corpo: string | null
  youtubeId: string | null
  url: string | null
}

export type StatoModulo = 'pubblicato' | 'prossimamente' | 'bloccato'

export type IconaModulo =
  | 'libro'
  | 'mappa'
  | 'carrello'
  | 'forchetta'
  | 'telefono'
  | 'video'
  | 'fotocamera'
  | 'cervello'
  | 'manubrio'
  | 'fiamma'
  | 'stella'
  | 'chiave'

export const ICONE_MODULO: readonly IconaModulo[] = [
  'libro',
  'mappa',
  'carrello',
  'forchetta',
  'telefono',
  'video',
  'fotocamera',
  'cervello',
  'manubrio',
  'fiamma',
  'stella',
  'chiave',
]

export type ModuloAula = {
  id: string
  titolo: string
  descrizione: string | null
  copertinaUrl: string | null
  icona: IconaModulo
  stato: StatoModulo
  duranteOnboarding: boolean
  aperto: boolean
  totali: number
  completate: number
  lezioni: LezioneAula[]
}

export type CheckupCliente = {
  id: string
  giorno: string
  argomento: string | null
  resoconto: string | null
  compiti: string[]
  fathomUrl: string | null
  /** The team only. */
  appunti?: string | null
  coach?: string | null
  callId?: string | null
  importato?: boolean
}

export type CallVicina = { tipo: 'onboarding' | 'checkpoint'; giorno: string; ora: string; meetUrl: string | null }

export type CampoBase = {
  nome: string
  lanciato: boolean
  home: BloccoPercorso[]
  regole: BloccoPercorso[]
  regolePercorso: BloccoPercorso[]
  community: BloccoPercorso[]
  linkCommunity: string | null
  gruppoPrivatoUrl: string | null
  coach: { nome: string; ruolo: string; fotoUrl: string | null } | null
  prossimaCall: CallVicina | null
  aula: ModuloAula[]
  checkup: CheckupCliente[]
}

/** What the team reads in more (campo_base_team()). */
export type CampoBaseTeam = CampoBase & {
  nomeCliente: string
  inPausa: boolean
  registrato: boolean
  onboarding: boolean
  /** The checkpoints held without a recap: «Aggiungi il resoconto». */
  checkpointSenzaResoconto: { id: string; giorno: string; ora: string }[]
}

function oggetto(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

function lista(v: unknown): Record<string, unknown>[] {
  return Array.isArray(v) ? v.map(oggetto).filter((x): x is Record<string, unknown> => x !== null) : []
}

function testo(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null
}

function https(v: unknown): string | null {
  return typeof v === 'string' && v.startsWith('https://') ? v : null
}

function numero(v: unknown): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  return Number.isFinite(n) ? n : 0
}

const GIORNO = /^\d{4}-\d{2}-\d{2}$/
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TIPI_LEZIONE: readonly TipoLezione[] = ['video', 'testo', 'pdf', 'link']
const STATI_MODULO: readonly StatoModulo[] = ['pubblicato', 'prossimamente', 'bloccato']

function leggiLezione(l: Record<string, unknown>): LezioneAula | null {
  const id = testo(l.id)
  const titolo = testo(l.titolo)
  if (!id || !ID.test(id) || !titolo || !(TIPI_LEZIONE as readonly unknown[]).includes(l.tipo)) return null
  const youtubeId = typeof l.youtube_id === 'string' && /^[A-Za-z0-9_-]{11}$/.test(l.youtube_id) ? l.youtube_id : null
  return {
    id,
    titolo,
    tipo: l.tipo as TipoLezione,
    obbligatoria: l.obbligatoria === true,
    completataIl: testo(l.completata_il),
    percentuale: Math.min(100, Math.max(0, numero(l.percentuale))),
    corpo: testo(l.corpo),
    youtubeId,
    url: https(l.url),
  }
}

export function leggiModulo(m: Record<string, unknown>): ModuloAula | null {
  const id = testo(m.id)
  const titolo = testo(m.titolo)
  if (!id || !ID.test(id) || !titolo || !(STATI_MODULO as readonly unknown[]).includes(m.stato)) return null
  const lezioni = lista(m.lezioni)
    .map(leggiLezione)
    .filter((l): l is LezioneAula => l !== null)
  return {
    id,
    titolo,
    descrizione: testo(m.descrizione),
    copertinaUrl: https(m.copertina_url),
    icona: (ICONE_MODULO as readonly unknown[]).includes(m.icona) ? (m.icona as IconaModulo) : 'libro',
    stato: m.stato as StatoModulo,
    duranteOnboarding: m.durante_onboarding === true,
    aperto: m.aperto === true,
    totali: Math.max(0, Math.round(numero(m.lezioni_totali))),
    completate: Math.max(0, Math.round(numero(m.lezioni_completate))),
    lezioni,
  }
}

function leggiCheckup(k: Record<string, unknown>): CheckupCliente | null {
  const id = testo(k.id)
  const giorno = testo(k.giorno)
  if (!id || !ID.test(id) || !giorno || !GIORNO.test(giorno)) return null
  const compiti = Array.isArray(k.compiti)
    ? k.compiti.filter((c): c is string => typeof c === 'string' && c.trim() !== '').slice(0, 20)
    : []
  const fathom = typeof k.fathom_url === 'string' && k.fathom_url.startsWith('https://fathom.video/') ? k.fathom_url : null
  return {
    id,
    giorno,
    argomento: testo(k.argomento),
    resoconto: testo(k.resoconto),
    compiti,
    fathomUrl: fathom,
    ...('appunti' in k ? { appunti: testo(k.appunti) } : {}),
    ...('coach' in k ? { coach: testo(k.coach) } : {}),
    ...('call_id' in k ? { callId: testo(k.call_id) } : {}),
    ...('importato' in k ? { importato: k.importato === true } : {}),
  }
}

function leggiCallVicina(v: unknown): CallVicina | null {
  const c = oggetto(v)
  if (!c) return null
  const giorno = testo(c.giorno)
  const ora = testo(c.ora)
  if (!giorno || !GIORNO.test(giorno) || !ora) return null
  const meet = typeof c.meet_url === 'string' && c.meet_url.startsWith('https://meet.google.com/') ? c.meet_url : null
  return { tipo: c.tipo === 'onboarding' ? 'onboarding' : 'checkpoint', giorno, ora, meetUrl: meet }
}

/** campo_base_cliente() (or the common part of campo_base_team()) as the tabs use it. */
export function leggiCampoBase(valore: unknown): CampoBase | null {
  const v = oggetto(valore)
  if (!v) return null
  const coach = oggetto(v.coach)
  return {
    nome: testo(v.nome) ?? '',
    lanciato: v.lanciato === true,
    home: leggiBlocchi(v.home),
    regole: leggiBlocchi(v.regole),
    regolePercorso: leggiBlocchi(v.regole_percorso),
    community: leggiBlocchi(v.community),
    linkCommunity: https(v.link_community),
    gruppoPrivatoUrl: https(v.gruppo_privato_url),
    coach: coach && testo(coach.nome) ? { nome: testo(coach.nome)!, ruolo: testo(coach.ruolo) ?? 'Coach', fotoUrl: https(coach.foto_url) } : null,
    prossimaCall: leggiCallVicina(v.prossima_call),
    aula: lista(v.aula)
      .map(leggiModulo)
      .filter((m): m is ModuloAula => m !== null),
    checkup: lista(v.checkup)
      .map(leggiCheckup)
      .filter((k): k is CheckupCliente => k !== null),
  }
}

export function leggiCampoBaseTeam(valore: unknown): CampoBaseTeam | null {
  const v = oggetto(valore)
  if (!v) return null
  const nomeCliente = [testo(v.nome), testo(v.cognome)].filter(Boolean).join(' ')
  if (v.in_pausa === true) {
    return {
      ...vuoto(nomeCliente),
      nomeCliente,
      inPausa: true,
      registrato: false,
      onboarding: false,
      checkpointSenzaResoconto: [],
    }
  }
  const base = leggiCampoBase(v)
  if (!base) return null
  return {
    ...base,
    nomeCliente,
    inPausa: false,
    registrato: v.registrato === true,
    onboarding: v.onboarding === true,
    checkpointSenzaResoconto: lista(v.call_checkpoint).flatMap((c) => {
      const id = testo(c.id)
      const giorno = testo(c.giorno)
      const ora = testo(c.ora)
      return id && giorno && GIORNO.test(giorno) && ora ? [{ id, giorno, ora }] : []
    }),
  }
}

function vuoto(nome: string): CampoBase {
  return {
    nome,
    lanciato: false,
    home: [],
    regole: [],
    regolePercorso: [],
    community: [],
    linkCommunity: null,
    gruppoPrivatoUrl: null,
    coach: null,
    prossimaCall: null,
    aula: [],
    checkup: [],
  }
}

/** The tab a client lands on: the path during the onboarding, Home after the launch. */
export function schedaIniziale(lanciato: boolean): SchedaCampo {
  return lanciato ? 'home' : 'percorso'
}

/** The tab of the address (`?scheda=`), or the one the client lands on. */
export function schedaDa(valore: string | null | undefined, lanciato: boolean): SchedaCampo {
  return (SCHEDE_CAMPO as readonly string[]).includes(valore ?? '') ? (valore as SchedaCampo) : schedaIniziale(lanciato)
}

/** The progress of a module, in whole percent (0 without lessons). */
export function percentualeModulo(m: Pick<ModuloAula, 'totali' | 'completate'>): number {
  if (m.totali <= 0) return 0
  return Math.min(100, Math.round((m.completate / m.totali) * 100))
}

/** Why a module does not open: null when it opens. */
export function chiusoPerche(m: Pick<ModuloAula, 'stato' | 'aperto'>): 'prossimamente' | 'bloccato' | 'dopo_lancio' | null {
  if (m.stato === 'prossimamente') return 'prossimamente'
  if (m.stato === 'bloccato') return 'bloccato'
  return m.aperto ? null : 'dopo_lancio'
}

/** The next lesson to do in a module: the first one not completed, else the first. */
export function prossimaLezione(m: Pick<ModuloAula, 'lezioni'>): LezioneAula | null {
  return m.lezioni.find((l) => !l.completataIl) ?? m.lezioni[0] ?? null
}

/** The first name of a person, for the recap. */
export function nomeDiBattesimo(nome: string): string {
  return nome.trim().split(/\s+/)[0] ?? ''
}

/** The opening of the recap, as in Dany's model of the monthly check-up. */
export function resocontoIniziale(nome: string): string {
  const n = nomeDiBattesimo(nome)
  return `${n ? `${n}, ` : ''}grazie della call, oggi abbiamo parlato di questo topic principale: `
}

/** The recap to send on Telegram: the text, then the tasks for the next call. */
export function testoTelegram(k: Pick<CheckupCliente, 'resoconto' | 'compiti'>): string {
  const righe: string[] = []
  if (k.resoconto?.trim()) righe.push(k.resoconto.trim())
  if (k.compiti.length > 0) {
    if (righe.length > 0) righe.push('')
    righe.push('I tuoi compiti entro la nostra prossima call:')
    righe.push('')
    for (const c of k.compiti) righe.push(`- ${c}`)
  }
  return righe.join('\n')
}

/** The tasks written one per line in the form: empty lines dropped, at most 20, each at most 300 characters. */
export function compitiDaTesto(t: string): string[] {
  return t
    .split('\n')
    .map((r) => r.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
    .filter((r) => r !== '')
    .slice(0, 20)
    .map((r) => r.slice(0, 300))
}

/** The scaletta of the notes, as Dany's monthly check-up (the team fills it in). */
export const SCALETTA_APPUNTI = [
  'Tracciamento variabili (peso, circonferenze, dieta, workout saltati, foto, questionari):',
  '',
  'Check video autoanalisi:',
  '',
  'Domande del cliente:',
  '',
  'Prossimi passi:',
  '',
].join('\n')

/**
 * The stages of the onboarding from the steps the team reads (onboarding_scheda_incaricato), with
 * the rule of percorso_cliente(): a stage is completed when all its steps are done, the current one
 * is the first not completed with a step open, the others are future. In the order of the steps.
 */
export function nodiDaPassi(
  passi: readonly { nodo: string | null; stato: string; completato_il: string | null }[],
): { chiave: string; ordine: number; stato: 'completato' | 'attuale' | 'futuro'; completatoIl: string | null }[] {
  const gruppi = new Map<string, { ordine: number; completato: boolean; aperto: boolean; completatoIl: string | null }>()
  passi.forEach((p, i) => {
    if (!p.nodo) return
    const g = gruppi.get(p.nodo) ?? { ordine: i, completato: true, aperto: false, completatoIl: null }
    g.completato = g.completato && p.stato === 'fatto'
    g.aperto = g.aperto || p.stato !== 'bloccato'
    if (p.completato_il && (!g.completatoIl || p.completato_il > g.completatoIl)) g.completatoIl = p.completato_il
    gruppi.set(p.nodo, g)
  })
  const ordinati = [...gruppi.entries()].sort((a, b) => a[1].ordine - b[1].ordine)
  const attuale = ordinati.find(([, g]) => !g.completato && g.aperto)?.[0] ?? null
  return ordinati.map(([chiave, g]) => ({
    chiave,
    ordine: g.ordine,
    stato: g.completato ? 'completato' : chiave === attuale ? 'attuale' : 'futuro',
    completatoIl: g.completato ? g.completatoIl : null,
  }))
}
