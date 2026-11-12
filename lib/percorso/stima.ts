/**
 * The estimate of the start of the path in words (release B1a). The numbers come from the
 * database (onboarding_stima, inside percorso_cliente().stima): here only formatting.
 */
export type Stima = {
  data: string | null
  giorni: number
  quasi: boolean
  base: 'call_non_prenotata' | 'call_prenotata' | 'settimana_test' | 'iniziato'
  cose_da_fare: number
  video_mancanti: string[]
}

export function leggiStima(valore: unknown): Stima | null {
  if (!valore || typeof valore !== 'object' || Array.isArray(valore)) return null
  const v = valore as Record<string, unknown>
  const base = v.base
  if (base !== 'call_non_prenotata' && base !== 'call_prenotata' && base !== 'settimana_test' && base !== 'iniziato') {
    return null
  }
  const giorni = typeof v.giorni === 'number' && Number.isFinite(v.giorni) ? Math.max(0, Math.round(v.giorni)) : 0
  const cose = typeof v.cose_da_fare === 'number' && Number.isFinite(v.cose_da_fare) ? Math.max(0, Math.round(v.cose_da_fare)) : 0
  return {
    data: typeof v.data === 'string' ? v.data : null,
    giorni,
    quasi: v.quasi === true,
    base,
    cose_da_fare: cose,
    video_mancanti: Array.isArray(v.video_mancanti) ? v.video_mancanti.filter((t): t is string => typeof t === 'string') : [],
  }
}

/** «Mancano circa 9 giorni all'inizio del tuo percorso», «Ci siamo quasi», «Il tuo percorso è iniziato». */
export function fraseGiorni(stima: Pick<Stima, 'giorni' | 'quasi' | 'base'>): string {
  if (stima.base === 'iniziato') return 'Il tuo percorso è iniziato'
  if (stima.quasi || stima.giorni <= 0) return 'Ci siamo quasi'
  if (stima.giorni === 1) return 'Manca circa 1 giorno all’inizio del tuo percorso'
  return `Mancano circa ${stima.giorni} giorni all’inizio del tuo percorso`
}

/** «Ti restano 6 cose da fare», «Ti resta 1 cosa da fare», nothing when there is none. */
export function fraseCose(cose: number): string | null {
  if (cose <= 0) return null
  return cose === 1 ? 'Ti resta 1 cosa da fare' : `Ti restano ${cose} cose da fare`
}

/** The two together, as the top of the timeline says them. */
export function fraseStima(stima: Stima): string {
  const cose = fraseCose(stima.cose_da_fare)
  return cose ? `${fraseGiorni(stima)} · ${cose}` : fraseGiorni(stima)
}
