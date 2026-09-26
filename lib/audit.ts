/**
 * Readable audit entries: which fields changed, from what to what.
 * Pure presentation of the JSON the audit trigger stored: amounts are
 * formatted, never recomputed.
 */
import { ETICHETTA_RUOLO, type AppRole } from '@/lib/auth/roles'
import { formatData, formatEuro, formatMese, formatPercentuale } from '@/lib/format'

type Json = string | number | boolean | null | Json[] | { [k: string]: Json }

export const ETICHETTA_TABELLA: Record<string, string> = {
  sales: 'Vendita',
  payments: 'Rata',
  commission_rules: 'Regola provvigione',
  commission_payouts: 'Pagamento provvigione',
  expenses: 'Costo',
  profiles: 'Utente',
}

/** "Vendita creata", "Costo creato". */
const FEMMINILE = new Set(['sales', 'payments', 'commission_rules'])

const PARTICIPIO = {
  insert: ['creato', 'creata'],
  update: ['modificato', 'modificata'],
  delete: ['eliminato', 'eliminata'],
} as const

export type Azione = keyof typeof PARTICIPIO

/**
 * Display order is the order of this object, not the order of the JSON keys:
 * "inizio" before "fine", the amount before the date it was cashed.
 */
const ETICHETTA_CAMPO: Record<string, string> = {
  nome: 'nome',
  ruolo: 'ruolo',
  attivo: 'attivo',
  tipo: 'tipo',
  valore_contratto: 'valore',
  numero_rate: 'rate',
  data_vendita: 'data vendita',
  data_inizio: 'inizio',
  data_fine: 'fine',
  numero_rata: 'rata',
  scadenza: 'scadenza',
  importo_previsto: 'importo previsto',
  stato: 'stato',
  incassato_il: 'incassata il',
  importo_incassato: 'importo incassato',
  percentuale: 'percentuale',
  applica_a: 'si applica a',
  valida_dal: 'valida dal',
  valida_al: 'valida al',
  periodo: 'periodo',
  data: 'data',
  descrizione: 'descrizione',
  categoria: 'categoria',
  importo: 'importo',
  pagato_il: 'pagato il',
  metodo: 'metodo',
  ricorrente: 'ricorrente',
  note: 'note',
}

const CAMPI = Object.keys(ETICHETTA_CAMPO)
const IMPORTI = new Set(['valore_contratto', 'importo_previsto', 'importo_incassato', 'importo'])

export type Differenza = { campo: string; prima: string; dopo: string }

function vuoto(valore: Json | undefined): valore is null | undefined | '' {
  return valore === null || valore === undefined || valore === ''
}

function numeroOTesto(valore: Json): number | string | null {
  return typeof valore === 'number' || typeof valore === 'string' ? valore : null
}

/** One value, formatted the way the rest of the app shows that field. */
export function leggibile(campo: string, valore: Json | undefined): string {
  if (vuoto(valore)) return '–'
  if (IMPORTI.has(campo)) return formatEuro(numeroOTesto(valore))
  if (campo === 'percentuale') return formatPercentuale(numeroOTesto(valore))
  if (campo === 'periodo' && typeof valore === 'string') return formatMese(valore)
  if (campo === 'ruolo' && typeof valore === 'string') return ETICHETTA_RUOLO[valore as AppRole] ?? valore
  if (typeof valore === 'boolean') return valore ? 'sì' : 'no'
  if (Array.isArray(valore)) return valore.map((v) => leggibile(campo, v)).join(', ')
  if (typeof valore === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valore)) return formatData(valore)
  if (typeof valore === 'string') return valore.replaceAll('_', ' ')
  return String(valore)
}

function oggetto(v: unknown): Record<string, Json> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, Json>) : {}
}

/**
 * update: only the fields that changed. insert/delete: the meaningful fields
 * of the row that was created or removed. Technical columns (ids, timestamps,
 * foreign keys) are not in ETICHETTA_CAMPO, so they never show.
 */
export function differenze(prima: unknown, dopo: unknown): Differenza[] {
  const a = oggetto(prima)
  const b = oggetto(dopo)

  return CAMPI.filter((c) => c in a || c in b)
    .filter((c) => JSON.stringify(a[c] ?? null) !== JSON.stringify(b[c] ?? null))
    .map((c) => ({ campo: ETICHETTA_CAMPO[c], prima: leggibile(c, a[c]), dopo: leggibile(c, b[c]) }))
}

/** "Vendita creata", "Pagamento provvigione eliminato". */
export function titoloVoce(tabella: string, azione: Azione): string {
  const genere = FEMMINILE.has(tabella) ? 1 : 0
  return `${ETICHETTA_TABELLA[tabella] ?? tabella} ${PARTICIPIO[azione][genere]}`
}

/**
 * The few fields that identify the row at a glance, e.g.
 * "nuovo · 900,00 € · 3 rate" for a sale, "rata 2 · 300,00 € · scadenza 01/10/2026".
 */
export function sintesi(tabella: string, dati: unknown): string {
  const d = oggetto(dati)
  const parti: (string | null)[] = (() => {
    switch (tabella) {
      case 'sales': {
        const rate = typeof d.numero_rate === 'number' ? d.numero_rate : null
        return [
          vuoto(d.tipo) ? null : leggibile('tipo', d.tipo),
          vuoto(d.valore_contratto) ? null : leggibile('valore_contratto', d.valore_contratto),
          rate === null ? null : rate === 1 ? '1 rata' : `${rate} rate`,
        ]
      }
      case 'payments':
        return [
          vuoto(d.numero_rata) ? null : `rata ${d.numero_rata}`,
          vuoto(d.importo_previsto) ? null : leggibile('importo_previsto', d.importo_previsto),
          vuoto(d.scadenza) ? null : `scadenza ${leggibile('scadenza', d.scadenza)}`,
        ]
      case 'commission_rules':
        return [
          vuoto(d.percentuale) ? null : leggibile('percentuale', d.percentuale),
          vuoto(d.valida_dal) ? null : `dal ${leggibile('valida_dal', d.valida_dal)}`,
          vuoto(d.valida_al) ? null : `al ${leggibile('valida_al', d.valida_al)}`,
        ]
      case 'commission_payouts':
        return [
          vuoto(d.importo) ? null : leggibile('importo', d.importo),
          vuoto(d.periodo) ? null : `riferito a ${leggibile('periodo', d.periodo)}`,
        ]
      case 'expenses':
        return [
          vuoto(d.descrizione) ? null : leggibile('descrizione', d.descrizione),
          vuoto(d.importo) ? null : leggibile('importo', d.importo),
        ]
      case 'profiles':
        return [
          vuoto(d.nome) ? null : leggibile('nome', d.nome),
          vuoto(d.ruolo) ? null : leggibile('ruolo', d.ruolo),
        ]
      default:
        return []
    }
  })()
  return parti.filter(Boolean).join(' · ')
}

export type VoceRegistro = {
  id: string
  tabella: string
  record_id: string | null
  azione: Azione
  dati_prima: unknown
  dati_dopo: unknown
  created_at: string
}

/** The sale an entry belongs to, when there is one. */
export function venditaDellaVoce(v: Pick<VoceRegistro, 'tabella' | 'record_id' | 'dati_prima' | 'dati_dopo'>): string | null {
  if (v.tabella === 'sales') return v.record_id
  if (v.tabella !== 'payments') return null
  const saleId = oggetto(v.dati_dopo).sale_id ?? oggetto(v.dati_prima).sale_id
  return typeof saleId === 'string' ? saleId : null
}

/** Where to look at the record today. Nothing for a deleted row. */
export function collegamentoVoce(
  v: Pick<VoceRegistro, 'tabella' | 'record_id' | 'azione' | 'dati_prima' | 'dati_dopo'>,
): { href: string; etichetta: string } | null {
  if (v.azione === 'delete') return null
  const vendita = venditaDellaVoce(v)
  if (vendita) return { href: `/sales/${vendita}`, etichetta: 'Apri la vendita' }
  switch (v.tabella) {
    case 'commission_rules':
      return { href: '/settings/commissions', etichetta: 'Apri le regole' }
    case 'commission_payouts':
      return { href: '/commissions', etichetta: 'Apri le provvigioni' }
    case 'expenses':
      return { href: '/expenses', etichetta: 'Apri i costi' }
    case 'profiles':
      return { href: '/settings/team', etichetta: 'Apri il team' }
    default:
      return null
  }
}

/**
 * Creating a sale writes one audit row per instalment in the same transaction
 * (same created_at). Those rows are shown as one "piano rate" entry instead of
 * N near-identical ones. Everything else stays one entry per row.
 */
export function raggruppaVoci<T extends VoceRegistro>(voci: T[]): T[][] {
  const gruppi: T[][] = []
  const piani = new Map<string, T[]>()
  for (const v of voci) {
    const vendita = venditaDellaVoce(v)
    if (v.tabella !== 'payments' || v.azione === 'update' || !vendita) {
      gruppi.push([v])
      continue
    }
    // rows of one transaction share created_at but may come back in any order
    const chiave = `${v.azione}|${v.created_at}|${vendita}`
    const piano = piani.get(chiave)
    if (piano) piano.push(v)
    else {
      const nuovo = [v]
      piani.set(chiave, nuovo)
      gruppi.push(nuovo)
    }
  }
  for (const g of piani.values()) {
    g.sort((a, b) => Number(oggetto(a.dati_dopo ?? a.dati_prima).numero_rata) - Number(oggetto(b.dati_dopo ?? b.dati_prima).numero_rata))
  }
  return gruppi
}
