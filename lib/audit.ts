/**
 * Readable audit entries: which fields changed, from what to what.
 * Pure presentation of the JSON the audit trigger stored.
 */
type Json = string | number | boolean | null | Json[] | { [k: string]: Json }

export const ETICHETTA_TABELLA: Record<string, string> = {
  sales: 'Vendita',
  payments: 'Rata',
  commission_rules: 'Regola provvigione',
  commission_payouts: 'Pagamento provvigione',
  expenses: 'Costo',
  profiles: 'Utente',
}

const ETICHETTA_CAMPO: Record<string, string> = {
  importo_previsto: 'importo previsto',
  importo_incassato: 'importo incassato',
  incassato_il: 'incassata il',
  scadenza: 'scadenza',
  stato: 'stato',
  metodo: 'metodo',
  valore_contratto: 'valore',
  numero_rate: 'rate',
  data_vendita: 'data vendita',
  data_inizio: 'inizio',
  data_fine: 'fine',
  tipo: 'tipo',
  percentuale: 'percentuale',
  applica_a: 'si applica a',
  valida_dal: 'valida dal',
  valida_al: 'valida al',
  periodo: 'periodo',
  pagato_il: 'pagato il',
  importo: 'importo',
  descrizione: 'descrizione',
  categoria: 'categoria',
  data: 'data',
  ricorrente: 'ricorrente',
  ruolo: 'ruolo',
  attivo: 'attivo',
  nome: 'nome',
  note: 'note',
}

/** Technical columns nobody needs to read in an audit trail. */
const IGNORATI = new Set(['id', 'created_at', 'updated_at', 'created_by', 'sale_id', 'client_id', 'product_id', 'call_id', 'setter_id', 'closer_id', 'profile_id', 'email'])

export type Differenza = { campo: string; prima: string; dopo: string }

function leggibile(valore: Json | undefined): string {
  if (valore === null || valore === undefined || valore === '') return '–'
  if (typeof valore === 'boolean') return valore ? 'sì' : 'no'
  if (Array.isArray(valore)) return valore.map((v) => leggibile(v)).join(', ')
  if (typeof valore === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valore)) {
    const [a, m, g] = valore.split('-')
    return `${g}/${m}/${a}`
  }
  return String(valore)
}

function oggetto(v: unknown): Record<string, Json> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, Json>) : {}
}

/**
 * update: only the fields that changed. insert/delete: the meaningful fields
 * of the row that was created or removed.
 */
export function differenze(prima: unknown, dopo: unknown): Differenza[] {
  const a = oggetto(prima)
  const b = oggetto(dopo)
  const campi = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(
    (c) => !IGNORATI.has(c) && c in ETICHETTA_CAMPO,
  )

  return campi
    .filter((c) => JSON.stringify(a[c] ?? null) !== JSON.stringify(b[c] ?? null))
    .map((c) => ({ campo: ETICHETTA_CAMPO[c], prima: leggibile(a[c]), dopo: leggibile(b[c]) }))
}
