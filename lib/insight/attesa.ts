import { attendeRisposta } from '@/lib/insight/filtri'
import type { LeadRecap } from '@/lib/insight/recap'

/**
 * «aspetta da N ore» on a lead's card, as the artifact "Recap DM Alpha"
 * computes it (waitInfo): from the lead's last message to now, rounded the
 * same way («aspetta da meno di 1 ora», «1 ora», «N ore» below 48 hours, then
 * «N giorni»), hot from 12 hours. Only when the lead is waiting (D8, the rule
 * of lib/insight/filtri.ts): the artifact also counted from our own last
 * message when the status said «attende».
 *
 * «Now» is the server's instant at the first render and the browser's clock
 * afterwards, every 60 seconds (D11): pure functions, the caller passes it.
 * The instant of the last message is `last_message_at` (ISO UTC), or the
 * `time` of the lead's last message ('GG/MM HH:MM', Europe/Rome) read in the
 * recap's year.
 */

/** From this many hours the pill turns hot (critical tone). */
export const ORE_CALDA = 12
const ORA_MS = 3_600_000

const partiRoma = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Rome',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

/** Rome's offset from UTC at an instant, in milliseconds (+1 h in winter, +2 h in summer). */
function scartoRomaMs(istante: number): number {
  const p = Object.fromEntries(partiRoma.formatToParts(new Date(istante)).map((x) => [x.type, x.value]))
  const comeUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second))
  return comeUtc - Math.floor(istante / 1000) * 1000
}

const RE_ORA_RECAP = /^(\d{2})\/(\d{2})(?:\/(\d{4}))?\s+(\d{2}):(\d{2})/

/**
 * 'GG/MM HH:MM' (or 'GG/MM/AAAA HH:MM'), a wall-clock time in Europe/Rome,
 * as an instant; null when it is not one. The year is the recap's when the
 * text has none.
 */
export function parseOraRecap(testo: string | null | undefined, anno: number): Date | null {
  const m = RE_ORA_RECAP.exec(testo ?? '')
  if (!m) return null
  const [giorno, mese, ora, minuti] = [Number(m[1]), Number(m[2]), Number(m[4]), Number(m[5])]
  const a = m[3] ? Number(m[3]) : anno
  if (mese < 1 || mese > 12 || giorno < 1 || giorno > 31 || ora > 23 || minuti > 59) return null
  const muro = Date.UTC(a, mese - 1, giorno, ora, minuti)
  const verifica = new Date(muro)
  if (verifica.getUTCDate() !== giorno || verifica.getUTCMonth() !== mese - 1) return null
  // twice: the offset of the guess, then the offset of the instant found (the DST changes)
  const prima = muro - scartoRomaMs(muro)
  return new Date(muro - scartoRomaMs(prima))
}

type LeadConAttesa = Pick<LeadRecap, 'last_from' | 'stage' | 'last_message_at' | 'messages'>

/** The instant of the lead's last message: last_message_at, else the `time` of his last message in the chat. */
export function ultimoMessaggioDelLead(lead: LeadConAttesa, anno: number): Date | null {
  const iso = lead.last_message_at ? new Date(lead.last_message_at) : null
  if (iso && !Number.isNaN(iso.getTime())) return iso
  const ultimo = [...lead.messages].reverse().find((m) => m.from === 'lead')
  return ultimo ? parseOraRecap(ultimo.time, anno) : null
}

export type Attesa = { ore: number; etichetta: string; calda: boolean }

/** The artifact's label, with its rounding. */
export function etichettaAttesa(ore: number): string {
  if (ore < 1) return 'aspetta da meno di 1 ora'
  if (ore < 48) {
    const n = Math.round(ore)
    return `aspetta da ${n} ${n === 1 ? 'ora' : 'ore'}`
  }
  return `aspetta da ${Math.round(ore / 24)} giorni`
}

/** «aspetta da …» of a lead, or null when he is not waiting for us (or the time is unknown). */
export function attesaLead(lead: LeadConAttesa, adessoMs: number, anno: number): Attesa | null {
  if (!attendeRisposta(lead)) return null
  let quando = ultimoMessaggioDelLead(lead, anno)
  // '31/12 23:40' in the recap of 1 January: the year before, never a time in the future
  if (quando && quando.getTime() - adessoMs > 24 * ORA_MS && !lead.last_message_at) quando = ultimoMessaggioDelLead(lead, anno - 1)
  if (!quando) return null
  const ore = Math.max(0, (adessoMs - quando.getTime()) / ORA_MS)
  return { ore, etichetta: etichettaAttesa(ore), calda: ore >= ORE_CALDA }
}

/** The year of a recap from its day ('YYYY-MM-DD'), for the times without one. */
export function annoDelRecap(giorno: string, ripiego: number): number {
  const anno = Number(giorno.slice(0, 4))
  return Number.isInteger(anno) && anno > 2000 ? anno : ripiego
}

/** «silenzio da 1 giorno», «silenzio da N giorni» (the artifact said «1 giorni»); nothing at 0. */
export function etichettaSilenzio(giorni: number): string | null {
  if (!Number.isFinite(giorni) || giorni <= 0) return null
  const n = Math.round(giorni)
  return `silenzio da ${n} ${n === 1 ? 'giorno' : 'giorni'}`
}
