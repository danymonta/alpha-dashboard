import { formato } from '@/lib/format'
import type { Lingua } from '@/lib/i18n/lingua'
import { CLIENTI } from '@/lib/i18n/testi/clienti'
import { ETICHETTE } from '@/lib/i18n/testi/etichette'
import type { Database } from '@/lib/supabase/database.types'
import type { Metodo } from '@/lib/validation/incasso'

/**
 * The client list with the path, contract and instalments (Dany, 21/10/2026).
 * Presentation only: month, week, what he paid and what is left come from
 * public.clienti_elenco (admin, SQL); here they are only worded and ordered.
 */

type Enums = Database['public']['Enums']
export type StatoClienteElenco = Enums['client_status']

/** The four cards at the top of Clienti (`?vista=`). */
export const VISTE = ['attivi', 'sospesi', 'chiusi', 'tutti'] as const
export type Vista = (typeof VISTE)[number]

export const ETICHETTA_VISTA: Record<Vista, string> = {
  attivi: 'Attivi',
  sospesi: 'Sospesi',
  chiusi: 'Chiusi',
  tutti: 'Tutti',
}

/**
 * The states each table card lists. "Attivi" are the clients with a path to
 * follow (running, ending soon, about to start); "Chiusi" are the ones the
 * admin closed ("Non rinnova"): an ex cliente (archived) stays among the
 * filters of "Tutti".
 */
export const STATI_VISTA: Record<Exclude<Vista, 'tutti'>, StatoClienteElenco[]> = {
  attivi: ['attivo', 'in_scadenza', 'da_iniziare'],
  sospesi: ['sospeso'],
  chiusi: ['chiuso'],
}

/**
 * The card to open. Without `?vista=` the old links still work: a state filter
 * or a search (Rinnovi links to `?stato=ex_cliente`) is the "Tutti" list.
 */
export function vistaDa(vista: string | undefined, stato?: string, q?: string): Vista {
  if ((VISTE as readonly string[]).includes(vista ?? '')) return vista as Vista
  return stato || q ? 'tutti' : 'attivi'
}

export type RataElenco = {
  numero: number
  scadenza: string
  importo_previsto: number
  stato: Enums['payment_status']
  incassato_il: string | null
  importo_incassato: number | null
  metodo: Enums['payment_method'] | null
  in_ritardo: boolean
}

/**
 * A row of public.clienti_elenco. The generated types make every column
 * non-null (the generator cannot see through `returns table`): the nullable
 * ones are written here by hand.
 */
export type RigaElenco = {
  client_id: string
  nome: string
  cognome: string | null
  instagram_handle?: string | null
  stato: StatoClienteElenco
  sale_id: string
  prodotto: string | null
  tipo: Enums['sale_type']
  numero_percorso: number
  data_inizio: string
  data_fine: string
  mese: number | null
  mesi_totali: number
  settimana: number | null
  settimane_totali: number
  valore_contratto: number
  incassato: number
  da_incassare: number
  in_ritardo: number
  rate_totali: number
  rate_incassate: number
  prossima_scadenza: string | null
  prossimo_importo: number | null
  metodi: string[]
  contratto_url: string | null
  cartella_url: string | null
  ltv: number
  sospeso_il: string | null
  chiuso_il: string | null
  rate: RataElenco[]
}

const giorni = (iso: string) => {
  const [a, m, g] = iso.split('-').map(Number)
  return Date.UTC(a, m - 1, g) / 86_400_000
}

export const nomeCompleto = (r: Pick<RigaElenco, 'nome' | 'cognome'>) => [r.nome, r.cognome].filter(Boolean).join(' ')

/** "Primo percorso", "Rinnovo 1", "Upsell": the words of the path history, from the sale's type and its place among the paths. */
export function etichettaPercorsoVendita(tipo: Enums['sale_type'], numeroPercorso: number, lingua: Lingua = 'it'): string {
  const t = CLIENTI[lingua]
  if (tipo === 'upsell') return t.upsell
  if (tipo === 'rinnovo') return numeroPercorso >= 2 ? t.rinnovoN(numeroPercorso - 1) : t.rinnovo
  return numeroPercorso <= 1 ? t.primoPercorso : t.nuovoPercorso
}

/** "Mese 2 di 6 · Settimana 8 di 26". */
export function testoMeseSettimana(
  r: Pick<RigaElenco, 'mese' | 'mesi_totali' | 'settimana' | 'settimane_totali'>,
  lingua: Lingua = 'it',
): string | null {
  if (r.mese === null || r.settimana === null) return null
  return CLIENTI[lingua].meseSettimana(r.mese, r.mesi_totali, r.settimana, r.settimane_totali)
}

/** How far the path is, 0 to 1, by days; null when the card has no bar (a closed client). */
export function avanzamentoPercorso(r: Pick<RigaElenco, 'data_inizio' | 'data_fine'>, oggi: string): number {
  const totale = giorni(r.data_fine) - giorni(r.data_inizio) + 1
  if (totale <= 0) return 1
  const fatti = giorni(oggi) - giorni(r.data_inizio) + 1
  return Math.min(1, Math.max(0, fatti / totale))
}

export type TestoPercorso = {
  /** The main line: month and week, "Inizia il …", or the closing day. */
  principale: string
  /** The small line under it: until when the path runs. */
  dettaglio: string
  /** The thin bar; null where it would mean nothing (not started, closed). */
  avanzamento: number | null
}

export function testoPercorso(r: RigaElenco, oggi: string, lingua: Lingua = 'it'): TestoPercorso {
  const t = CLIENTI[lingua]
  const { formatData } = formato(lingua)
  const fine = r.data_fine >= oggi ? t.fino(formatData(r.data_fine)) : t.finito(formatData(r.data_fine))
  if (r.stato === 'chiuso' && r.chiuso_il) {
    // only the first letter goes small: an English month keeps its capital
    const minuscola = lingua === 'it' ? fine.toLowerCase() : fine.charAt(0).toLowerCase() + fine.slice(1)
    return { principale: t.chiusoIl(formatData(r.chiuso_il)), dettaglio: t.percorso(minuscola), avanzamento: null }
  }
  if (r.data_inizio > oggi) {
    return { principale: t.iniziaIl(formatData(r.data_inizio)), dettaglio: fine, avanzamento: null }
  }
  return { principale: testoMeseSettimana(r, lingua) ?? fine, dettaglio: fine, avanzamento: avanzamentoPercorso(r, oggi) }
}

/** "Bonifico, Stripe": the methods he paid with so far, in the app's words. */
export function testoMetodi(metodi: readonly string[], lingua: Lingua = 'it'): string | null {
  const parole = metodi.map((m) => ETICHETTE[lingua].metodo[m as Metodo] ?? m)
  return parole.length > 0 ? parole.join(', ') : null
}

/** "1 di 3 rate pagate", "Pagamento unico", "Tutte le 3 rate pagate". */
export function testoRatePagate(r: Pick<RigaElenco, 'rate_totali' | 'rate_incassate'>, lingua: Lingua = 'it'): string {
  const t = CLIENTI[lingua]
  if (r.rate_totali <= 1) return r.rate_incassate >= r.rate_totali ? t.unicoPagato : t.unico
  if (r.rate_incassate >= r.rate_totali) return t.tutteRate(r.rate_totali)
  return t.ratePagate(r.rate_incassate, r.rate_totali)
}

/** The next instalment to collect (planned or failed), the one due first. */
export function prossimaRata(r: Pick<RigaElenco, 'rate'>): RataElenco | null {
  return (
    r.rate
      .filter((x) => x.stato === 'prevista' || x.stato === 'fallita')
      .sort((a, b) => a.scadenza.localeCompare(b.scadenza) || a.numero - b.numero)[0] ?? null
  )
}

/** "Rata 2 di 3". */
export function testoRata(rata: Pick<RataElenco, 'numero'>, totali: number, lingua: Lingua = 'it'): string {
  return CLIENTI[lingua].rataDi(rata.numero, totali)
}

const perNome = (a: RigaElenco, b: RigaElenco) =>
  nomeCompleto(a).localeCompare(nomeCompleto(b), 'it') || a.client_id.localeCompare(b.client_id)

/**
 * The order of each card: active clients by the nearest end of the path (who
 * is about to finish on top), suspended ones by the day they were put on hold
 * and closed ones by the closing day, the most recent first. Ties by name.
 * Never an order by money or by person: a list to work through, not a ranking.
 */
export function ordinaElenco(righe: readonly RigaElenco[], vista: Exclude<Vista, 'tutti'>): RigaElenco[] {
  const copia = [...righe]
  const piuRecente = (campo: 'sospeso_il' | 'chiuso_il') => (a: RigaElenco, b: RigaElenco) => {
    const x = a[campo]
    const y = b[campo]
    if (x === y) return perNome(a, b)
    if (x === null) return 1
    if (y === null) return -1
    return y.localeCompare(x) || perNome(a, b)
  }
  if (vista === 'attivi') return copia.sort((a, b) => a.data_fine.localeCompare(b.data_fine) || perNome(a, b))
  if (vista === 'sospesi') return copia.sort(piuRecente('sospeso_il'))
  return copia.sort(piuRecente('chiuso_il'))
}
