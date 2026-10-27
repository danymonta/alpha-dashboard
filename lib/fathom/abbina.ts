import type { RiunionePerAbbinamento } from '@/lib/fathom/riunione'

/**
 * Which Fathom recording is which held call (1.65.0, Dany, 27/10/2026: «devi
 * analizzarle da fathom»). Pure: the calls without a link, the meetings of the
 * period, the pairs.
 *
 * A meeting is a call's when it carries the lead's name (title, invitees, the
 * part before the @ of their email; accents, case and punctuation aside) and
 * its time is near the call's:
 * - every word of the lead's name, within 48 hours (a call moved and not
 *   written, a time zone, a recording started late);
 * - only one word of it (the first name, the surname, a word of the Instagram
 *   handle), within 3 hours.
 * Never by time alone: the same evening can have an onboarding or a check of a
 * client. Meetings that are not sales calls (onboarding, testimonial, check,
 * checkpoint) are never candidates. Each call one recording, each recording one
 * call: the surest and nearest pairs first.
 */

export type CallDaAbbinare = {
  id: string
  programmata_il: string
  lead_nome: string | null
  lead_handle: string | null
}

export type Abbinamento = { call_id: string; riunione: RiunionePerAbbinamento; certo: boolean; minuti: number }

const FORTE_MS = 48 * 3600_000
const DEBOLE_MS = 3 * 3600_000

/** Words that say nothing of the lead: Dany, the kind of meeting, the glue of a title. */
const VUOTE = new Set([
  'daniele', 'montagnolo', 'dany', 'danymonta', 'and', 'con', 'tra', 'the', 'call', 'discovery', 'sales', 'strategy',
  'percorso', 'alpha', 'meeting', 'google', 'meet', 'zoom', 'impromptu', 'canceled', 'cancelled', 'fathom',
  'gmail', 'icloud', 'hotmail', 'outlook', 'libero', 'yahoo', 'live', 'calendly', 'invite', 'invito', 'follow', 'up',
])
/** Meetings that are not a sales call with a lead. */
const NON_VENDITA = /\b(onboarding|testimonianz\w*|testimonial|check\s*point|checkpoint|check|checkup|percorso cliente)\b/

export function parole(testo: string | null | undefined): string[] {
  return (testo ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]+/g, ' ')
    .split(' ')
    .filter((p) => p.length >= 3 && !VUOTE.has(p))
}

function testoNormale(testo: string): string {
  return testo.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

export function eDiVendita(r: Pick<RiunionePerAbbinamento, 'titolo'>): boolean {
  return !NON_VENDITA.test(testoNormale(r.titolo ?? ''))
}

/** How the meeting names the lead: every word of the name (forte), one word of name or handle (debole), or none. */
export function nomeNellaRiunione(call: Pick<CallDaAbbinare, 'lead_nome' | 'lead_handle'>, nomi: string): 'forte' | 'debole' | null {
  const presenti = new Set(parole(nomi))
  const nome = [...new Set(parole(call.lead_nome))]
  const handle = parole((call.lead_handle ?? '').replace(/[._\d]+/g, ' '))
  if (nome.length > 0 && nome.every((p) => presenti.has(p))) return 'forte'
  if ([...nome, ...handle].some((p) => presenti.has(p))) return 'debole'
  return null
}

export function abbinaRiunioni(
  calls: readonly CallDaAbbinare[],
  riunioni: readonly RiunionePerAbbinamento[],
  giaUsate: ReadonlySet<number> = new Set(),
): Abbinamento[] {
  const coppie: (Abbinamento & { peso: number })[] = []
  for (const r of riunioni) {
    if (giaUsate.has(r.recording_id) || !r.quando || !eDiVendita(r)) continue
    const t = Date.parse(r.quando)
    const annullata = /^\s*cancel+ed\b/i.test(r.titolo ?? '')
    for (const c of calls) {
      const distanza = Math.abs(t - Date.parse(c.programmata_il))
      if (!Number.isFinite(distanza)) continue
      const nome = nomeNellaRiunione(c, r.nomi)
      if (nome === 'forte' && distanza <= FORTE_MS) {
        coppie.push({ call_id: c.id, riunione: r, certo: true, minuti: Math.round(distanza / 60_000), peso: distanza + (annullata ? FORTE_MS : 0) })
      } else if (nome && distanza <= DEBOLE_MS) {
        coppie.push({ call_id: c.id, riunione: r, certo: false, minuti: Math.round(distanza / 60_000), peso: 2 * FORTE_MS + distanza + (annullata ? FORTE_MS : 0) })
      }
    }
  }
  coppie.sort((a, b) => a.peso - b.peso)
  const callFatte = new Set<string>()
  const riunioniFatte = new Set<number>()
  const scelte: Abbinamento[] = []
  for (const { call_id, riunione, certo, minuti } of coppie) {
    if (callFatte.has(call_id) || riunioniFatte.has(riunione.recording_id)) continue
    callFatte.add(call_id)
    riunioniFatte.add(riunione.recording_id)
    scelte.push({ call_id, riunione, certo, minuti })
  }
  return scelte
}
