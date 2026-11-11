/**
 * The events of the Google calendar «Dany Discovery Call», read from its secret
 * iCal address (1.76.0, Dany, 11/11/2026: «devono essere contate in automatico
 * quante call di vendita faccio ogni giorno»). Pure: the text of the .ics in,
 * one row per event out, with only what the counts need. Never a name, an
 * Instagram handle, an income or an answer in words: the age and the budget
 * answer become a number and a yes or no, the rest of the description is dropped.
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

/** Every VEVENT of the file, with its UID; the others (a malformed one, one without dates) are skipped. */
export function eventiDaIcal(testo: string): EventoCalendario[] {
  const eventi: EventoCalendario[] = []
  let corrente: Proprieta[] | null = null
  for (const riga of righe(testo)) {
    if (riga === 'BEGIN:VEVENT') {
      corrente = []
      continue
    }
    if (riga === 'END:VEVENT') {
      if (corrente) {
        const e = evento(corrente)
        if (e) eventi.push(e)
      }
      corrente = null
      continue
    }
    if (corrente) {
      const p = proprieta(riga)
      if (p) corrente.push(p)
    }
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
