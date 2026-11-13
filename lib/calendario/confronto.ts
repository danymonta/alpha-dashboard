import { istanteDa, type PrenotazioneCalendario } from '@/lib/calendario/ical'
import { formatOra, oggiRoma } from '@/lib/date'

/**
 * Which bookings of the calendar «Dany Discovery Call» are not in the app yet (1.78.0, Dany, 13/11/2026).
 * Pure: the bookings read from the .ics and the calls the admin's session reads, in; the bookings to add, out.
 * A booking is already in the app when a call (not cancelled) is within MARGINE_MINUTI of the same instant,
 * or has the same Instagram handle, or the same name (without accents, case and extra spaces) anywhere in the
 * window: a call moved to another day by hand, or a name typed slightly differently from the calendar, is
 * caught by the other two.
 */

export const MARGINE_MINUTI = 15
export const GIORNI_AVANTI_PRENOTATE = 30

export type CallDelGestionale = {
  programmata_il: string
  nome: string | null
  instagram_handle: string | null
}

export type PrenotataDaAggiungere = {
  uid: string
  /** ISO UTC. */
  istante: string
  /** The day and the time in Europe/Rome, as «Nuova call» wants them. */
  giorno: string
  ora: string
  nome: string | null
  handle: string | null
  eta: number | null
  budget_si: boolean | null
}

export function nomeConfrontabile(nome: string | null | undefined): string | null {
  if (!nome) return null
  const n = nome
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
  return n || null
}

export function handleConfrontabile(handle: string | null | undefined): string | null {
  if (!handle) return null
  const h = handle.trim().replace(/^@+/, '').toLowerCase()
  return h || null
}

export function prenotateDaAggiungere(
  prenotazioni: PrenotazioneCalendario[],
  calls: CallDelGestionale[],
  adesso: number,
  giorni: number = GIORNI_AVANTI_PRENOTATE,
): PrenotataDaAggiungere[] {
  const fine = adesso + giorni * 24 * 3_600_000
  const margine = MARGINE_MINUTI * 60_000
  const istanti = calls.map((c) => new Date(c.programmata_il).getTime()).filter((t) => !Number.isNaN(t))
  const handles = new Set(calls.map((c) => handleConfrontabile(c.instagram_handle)).filter((h): h is string => h !== null))
  const nomi = new Set(calls.map((c) => nomeConfrontabile(c.nome)).filter((n): n is string => n !== null))

  const voci: PrenotataDaAggiungere[] = []
  for (const p of prenotazioni) {
    const istante = istanteDa(p.inizio, p.tz)
    if (!istante) continue
    const t = new Date(istante).getTime()
    if (t < adesso || t > fine) continue
    if (istanti.some((c) => Math.abs(c - t) <= margine)) continue
    const handle = handleConfrontabile(p.handle)
    if (handle && handles.has(handle)) continue
    const nome = nomeConfrontabile(p.nome)
    if (nome && nomi.has(nome)) continue
    voci.push({
      uid: p.uid,
      istante,
      giorno: oggiRoma(new Date(istante)),
      ora: formatOra(istante),
      nome: p.nome,
      handle: p.handle,
      eta: p.eta,
      budget_si: p.budget_si,
    })
  }
  return voci.sort((a, b) => a.istante.localeCompare(b.istante))
}
