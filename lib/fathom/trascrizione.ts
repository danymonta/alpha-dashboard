import type { SegmentoGrezzo } from '@/lib/fathom/api'

/**
 * A Fathom transcript made compact (1.37.0): one row per stretch of one speaker,
 * who speaks told as closer / lead / other. Pure. The emails of the speakers stay
 * here, in memory, only to say who the closer is: they never go out.
 */
export type Chi = 'closer' | 'lead' | 'altro'
export type Segmento = { t: string; s: number; chi: Chi; testo: string }

export function secondiDa(timestamp: string): number {
  const parti = timestamp.split(':').map((x) => Number(x))
  if (parti.length < 2 || parti.some((x) => !Number.isFinite(x))) return 0
  return parti.reduce((acc, x) => acc * 60 + x, 0)
}

export function minutiSecondi(s: number): string {
  const m = Math.floor(s / 60)
  return `${String(m).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`
}

const normalizza = (t: string) =>
  t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()

/**
 * Who is the closer: the speaker whose calendar email is the closer's, else the
 * one whose display name shares the closer's first name. Every other speaker with
 * an email of an invitee is the lead; the rest is «altro».
 */
export function compatta(segmenti: SegmentoGrezzo[], closer: { email?: string | null; nome?: string | null }): Segmento[] {
  const email = closer.email?.trim().toLowerCase() || null
  const primoNome = closer.nome ? normalizza(closer.nome).split(' ')[0] ?? null : null
  const chiDi = (s: SegmentoGrezzo): Chi => {
    const e = s.speaker.matched_calendar_invitee_email?.trim().toLowerCase() || null
    const nome = s.speaker.display_name ? normalizza(s.speaker.display_name) : ''
    if (email && e === email) return 'closer'
    if (primoNome && primoNome.length >= 3 && nome.split(' ').includes(primoNome)) return 'closer'
    if (e) return 'lead'
    return nome ? 'lead' : 'altro'
  }
  const uscita: Segmento[] = []
  for (const s of segmenti) {
    const testo = s.text.trim()
    if (testo === '') continue
    const chi = chiDi(s)
    const ultimo = uscita[uscita.length - 1]
    if (ultimo && ultimo.chi === chi) {
      ultimo.testo += ' ' + testo
    } else {
      const secondi = secondiDa(s.timestamp)
      uscita.push({ t: minutiSecondi(secondi), s: secondi, chi, testo })
    }
  }
  return uscita
}

/** The share of the call in which the closer speaks: a stretch lasts until the next one, the last until the end. */
export function quotaParlato(segmenti: Segmento[], durataSecondi: number | null): number | null {
  if (segmenti.length < 2) return null
  const fine = durataSecondi && durataSecondi > segmenti[segmenti.length - 1].s ? durataSecondi : segmenti[segmenti.length - 1].s + 15
  let closer = 0
  let totale = 0
  segmenti.forEach((s, i) => {
    const fino = i + 1 < segmenti.length ? segmenti[i + 1].s : fine
    const d = Math.max(0, fino - s.s)
    totale += d
    if (s.chi === 'closer') closer += d
  })
  return totale > 0 ? Math.round((closer / totale) * 1000) / 1000 : null
}

const ETICHETTA: Record<Chi, string> = { closer: 'Closer', lead: 'Lead', altro: 'Altro' }
export const TRASCRIZIONE_MAX_CARATTERI = 60_000

/** The text sent to Claude: `[mm:ss] Closer: …`. Above the limit the middle is cut, and says so. */
export function comeTesto(segmenti: Segmento[], max = TRASCRIZIONE_MAX_CARATTERI): { testo: string; tagliata: boolean } {
  const righe = segmenti.map((s) => `[${s.t}] ${ETICHETTA[s.chi]}: ${s.testo}`)
  const intero = righe.join('\n')
  if (intero.length <= max) return { testo: intero, tagliata: false }
  const meta = Math.floor((max - 120) / 2)
  return { testo: `${intero.slice(0, meta)}\n[… parte centrale della call tagliata per la lunghezza …]\n${intero.slice(-meta)}`, tagliata: true }
}
