/**
 * The events of the Google calendar «Dany Discovery Call», read from its secret
 * iCal address (1.76.0, Dany, 11/11/2026: «devono essere contate in automatico
 * quante call di vendita faccio ogni giorno»). Pure: the text of the .ics in,
 * one row per event out, with only what the counts need. Never a name, an
 * Instagram handle, an income or an answer in words: the age and the budget
 * answer become a number and a yes or no, the rest of the description is dropped.
 * The one exception is prenotazioniDaIcal (below): name and handle of the bookings
 * still to add to the app, shown to the admin and never saved.
 */

export type EventoCalendario = {
  uid: string
  /** When it was booked: ISO UTC (CREATED, or DTSTAMP without it). */
  creata_il: string
  /** When the call is: local date and time 'YYYY-MM-DDTHH:MM:SS', in `tz`. */
  inizio: string
  /** The IANA zone of `inizio` ('UTC' for a time with Z). */
  tz: string
  cancellata: boolean
  /** A sales call: not an onboarding, a checkpoint, a follow-up or a check. */
  di_vendita: boolean
  /** From the Calendly form, null without it. */
  eta: number | null
  /** «Sì» or «No» to «Hai almeno 150-300€ al mese…», null without the question. */
  budget_si: boolean | null
}

/** The titles that are not a new sales call (Dany adds them to the same calendar). */
const NON_DI_VENDITA = /onboarding|checkpoint|check[\s-]?in|prossimi passi|rientro|follow[\s-]?up/iu
const CANCELLATA = /^\s*(canceled|cancelled|annullat[oa]|cancellat[oa])\b/iu

/** The lines of the file, unfolded (RFC 5545: a line that starts with a space or a tab continues the one before). */
function righe(testo: string): string[] {
  return testo.replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n')
}

function testoIcal(valore: string): string {
  return valore.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1')
}

type Proprieta = { nome: string; parametri: Record<string, string>; valore: string }

function proprieta(riga: string): Proprieta | null {
  const due = riga.indexOf(':')
  if (due <= 0) return null
  const testa = riga.slice(0, due)
  const [nome, ...par] = testa.split(';')
  const parametri: Record<string, string> = {}
  for (const p of par) {
    const uguale = p.indexOf('=')
    if (uguale > 0) parametri[p.slice(0, uguale).toUpperCase()] = p.slice(uguale + 1).replace(/^"|"$/g, '')
  }
  return { nome: nome.toUpperCase(), parametri, valore: riga.slice(due + 1) }
}

/** '20261103T193000Z' → ISO UTC; '20261103T193000' with TZID → local and zone; '20261103' → the day at 00:00. */
function dataIcal(p: Proprieta): { locale: string; tz: string } | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(p.valore.trim())
  if (!m) return null
  const [, a, me, g, h = '00', mi = '00', s = '00', z] = m
  const locale = `${a}-${me}-${g}T${h}:${mi}:${s}`
  if (z) return { locale, tz: 'UTC' }
  return { locale, tz: p.parametri.TZID || 'Europe/Rome' }
}

/** The answer after «domanda…:» in the description, on its line. */
function risposta(descrizione: string, domanda: RegExp): string | null {
  for (const riga of descrizione.split('\n')) {
    const m = domanda.exec(riga)
    if (!m) continue
    const dopo = riga.slice(riga.indexOf(':', m.index + m[0].length - 1) + 1).trim()
    return dopo || null
  }
  return null
}

export function etaDaRisposta(testo: string | null): number | null {
  if (!testo) return null
  const m = /\d{1,3}/.exec(testo)
  if (!m) return null
  const n = Number(m[0])
  return n >= 5 && n <= 120 ? n : null
}

export function budgetDaRisposta(testo: string | null): boolean | null {
  if (!testo) return null
  const t = testo.trim().toLowerCase()
  // «Sì, sono disposto…» / «No, non sono disposto…»: the first word only
  if (/^s[iì](?![a-zà-ÿ])/u.test(t)) return true
  if (/^no(?![a-zà-ÿ])/u.test(t)) return false
  return null
}

const DOMANDA_ETA = /quanti anni hai\s*\??/iu
const DOMANDA_BUDGET = /hai almeno [^:\n]*(investire|al mese)[^:\n]*/iu

/** The properties of every VEVENT of the file, in order. */
function blocchiVevent(testo: string): Proprieta[][] {
  const blocchi: Proprieta[][] = []
  let corrente: Proprieta[] | null = null
  for (const riga of righe(testo)) {
    if (riga === 'BEGIN:VEVENT') {
      corrente = []
      continue
    }
    if (riga === 'END:VEVENT') {
      if (corrente) blocchi.push(corrente)
      corrente = null
      continue
    }
    if (corrente) {
      const p = proprieta(riga)
      if (p) corrente.push(p)
    }
  }
  return blocchi
}

/** Every VEVENT of the file, with its UID; the others (a malformed one, one without dates) are skipped. */
export function eventiDaIcal(testo: string): EventoCalendario[] {
  const eventi: EventoCalendario[] = []
  for (const props of blocchiVevent(testo)) {
    const e = evento(props)
    if (e) eventi.push(e)
  }
  return eventi
}

function evento(props: Proprieta[]): EventoCalendario | null {
  const una = (nome: string) => props.find((p) => p.nome === nome)
  const uid = una('UID')?.valore.trim()
  const inizio = una('DTSTART')
  const creata = una('CREATED') ?? una('DTSTAMP')
  if (!uid || !inizio || !creata) return null
  const quando = dataIcal(inizio)
  const quandoCreata = dataIcal(creata)
  if (!quando || !quandoCreata || quandoCreata.tz !== 'UTC') return null
  // a recurring series is not a booking
  if (una('RRULE')) return null

  const titolo = testoIcal(una('SUMMARY')?.valore ?? '')
  const descrizione = testoIcal(una('DESCRIPTION')?.valore ?? '')
  const stato = (una('STATUS')?.valore ?? '').trim().toUpperCase()

  return {
    uid: uid.slice(0, 300),
    creata_il: `${quandoCreata.locale}Z`,
    inizio: quando.locale,
    tz: quando.tz,
    cancellata: stato === 'CANCELLED' || CANCELLATA.test(titolo),
    di_vendita: !NON_DI_VENDITA.test(titolo),
    eta: etaDaRisposta(risposta(descrizione, DOMANDA_ETA)),
    budget_si: budgetDaRisposta(risposta(descrizione, DOMANDA_BUDGET)),
  }
}

/**
 * A booking still to be put in the app (1.78.0, Dany, 13/11/2026: «collegato al calendar anche per la
 * pipeline e le chiamate che avrò a breve»). Unlike EventoCalendario it carries the name and the Instagram
 * handle the lead wrote in the Calendly form: they are read from the calendar while the admin's page renders
 * and shown to him, never saved (call_calendario has no names, CLAUDE.md section 33).
 */
export type PrenotazioneCalendario = {
  uid: string
  /** Local date and time 'YYYY-MM-DDTHH:MM:SS', in `tz`. */
  inizio: string
  tz: string
  /** From the title, without Dany's part; null when nothing usable is left. */
  nome: string | null
  /** From «Nome su Instagram?», lowercase and without @; null when it is not a valid handle. */
  handle: string | null
  eta: number | null
  budget_si: boolean | null
}

/** «… and Daniele Montagnolo», «… & Dany Discovery Call», «… and Dany - Discovery Call»: Dany's half of a title. */
const PARTE_DI_DANY = /\s*(?:\band\b|&|\+|\/|\s-\s|\be\b)\s*(?:daniele(?:\s+montagnolo)?|dany)(?![a-zà-ÿ])[\s\S]*$/iu

/** The lead's name from a Calendly title; the whole title when the pattern does not fit. */
export function nomeDaTitolo(titolo: string): string | null {
  const intero = titolo.replace(/\s+/g, ' ').trim()
  const senzaDany = intero.replace(PARTE_DI_DANY, '').trim()
  const nome = senzaDany.length >= 2 ? senzaDany : intero
  return nome.length >= 2 ? nome.slice(0, 120).trim() : null
}

const HANDLE = /^[a-z0-9._]{1,30}$/

/** «Chicco_codenotti_», «@chicco», «instagram.com/chicco/» → «chicco_codenotti_»; anything else null. */
export function handleDaRisposta(testo: string | null): string | null {
  if (!testo) return null
  const pulito = testo
    .trim()
    .toLowerCase()
    .replace(/^(?:https?:\/\/)?(?:www\.)?instagram\.com\//, '')
    .replace(/[/?#].*$/, '')
    .replace(/^@+/, '')
  return HANDLE.test(pulito) ? pulito : null
}

const DOMANDA_INSTAGRAM = /nome su instagram[^:\n]*/iu

/**
 * The sales calls still on the calendar, with the lead's name and handle: one per UID, never a cancelled one,
 * never an onboarding, a checkpoint or a follow-up, never a recurring series.
 */
export function prenotazioniDaIcal(testo: string): PrenotazioneCalendario[] {
  const visti = new Set<string>()
  const prenotazioni: PrenotazioneCalendario[] = []
  for (const props of blocchiVevent(testo)) {
    const e = evento(props)
    if (!e || e.cancellata || !e.di_vendita || visti.has(e.uid)) continue
    visti.add(e.uid)
    const una = (nome: string) => props.find((p) => p.nome === nome)
    const titolo = testoIcal(una('SUMMARY')?.valore ?? '')
    const descrizione = testoIcal(una('DESCRIPTION')?.valore ?? '')
    prenotazioni.push({
      uid: e.uid,
      inizio: e.inizio,
      tz: e.tz,
      nome: nomeDaTitolo(titolo),
      handle: handleDaRisposta(risposta(descrizione, DOMANDA_INSTAGRAM)),
      eta: e.eta,
      budget_si: e.budget_si,
    })
  }
  return prenotazioni
}

const orologi = new Map<string, Intl.DateTimeFormat | null>()

function orologio(tz: string): Intl.DateTimeFormat | null {
  if (!orologi.has(tz)) {
    try {
      orologi.set(
        tz,
        new Intl.DateTimeFormat('en-GB', {
          timeZone: tz,
          hourCycle: 'h23',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }),
      )
    } catch {
      orologi.set(tz, null)
    }
  }
  return orologi.get(tz) ?? null
}

/** Minutes the zone is ahead of UTC at an instant. */
function scarto(ms: number, fmt: Intl.DateTimeFormat): number {
  const p = Object.fromEntries(fmt.formatToParts(new Date(ms)).map((x) => [x.type, Number(x.value)]))
  const comeUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return Math.round((comeUtc - Math.floor(ms / 1000) * 1000) / 60_000)
}

/**
 * The instant (ISO UTC) of a local 'YYYY-MM-DDTHH:MM:SS' in an IANA zone, as the database reads it
 * (calendario_salva: `inizio::timestamp at time zone tz`, UTC for an unknown zone).
 */
export function istanteDa(locale: string, tz: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/.exec(locale)
  if (!m) return null
  const [, a, me, g, h, mi, s] = m.map(Number)
  const comeUtc = Date.UTC(a, me - 1, g, h, mi, s)
  if (Number.isNaN(comeUtc)) return null
  const fmt = tz === 'UTC' ? null : orologio(tz)
  if (!fmt) return new Date(comeUtc).toISOString()
  // the offset before and after any change of that night
  const prima = scarto(comeUtc - 12 * 3_600_000, fmt)
  const dopo = scarto(comeUtc + 12 * 3_600_000, fmt)
  const conDopo = comeUtc - dopo * 60_000
  if (scarto(conDopo, fmt) === dopo) return new Date(conDopo).toISOString()
  return new Date(comeUtc - prima * 60_000).toISOString()
}
