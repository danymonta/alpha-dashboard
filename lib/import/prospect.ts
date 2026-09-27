/**
 * Dany's sales call sheet ("Database Sales Call") mapped to leads and calls.
 * Pure functions, tested; scripts/import-prospect.ts does the IO.
 * Nothing economic is created from it: sales come from the DM tracking Excel.
 */

/** A CSV file with "," or ";" and quoted fields that may contain newlines. */
export function leggiCsv(testo: string): string[][] {
  const pulito = testo.replace(/^﻿/, '')
  const primaRiga = pulito.slice(0, pulito.indexOf('\n') >= 0 ? pulito.indexOf('\n') : undefined)
  const separatore = primaRiga.split(';').length > primaRiga.split(',').length ? ';' : ','
  const righe: string[][] = []
  let riga: string[] = []
  let campo = ''
  let virgolette = false
  for (let i = 0; i < pulito.length; i++) {
    const c = pulito[i]
    if (virgolette) {
      if (c === '"' && pulito[i + 1] === '"') {
        campo += '"'
        i++
      } else if (c === '"') virgolette = false
      else campo += c
    } else if (c === '"') virgolette = true
    else if (c === separatore) {
      riga.push(campo)
      campo = ''
    } else if (c === '\n') {
      riga.push(campo)
      righe.push(riga)
      riga = []
      campo = ''
    } else if (c !== '\r') campo += c
  }
  if (campo !== '' || riga.length > 0) {
    riga.push(campo)
    righe.push(riga)
  }
  return righe.filter((r) => r.some((v) => v.trim() !== ''))
}

export type Esito = 'chiusa' | 'follow_up' | 'persa'
export type StatoCall = 'programmata' | 'svolta' | 'cancellata'
export type StatoLead = 'call_fissata' | 'follow_up' | 'cliente' | 'perso'
export type Performance = 'ottima' | 'buona' | 'discreta' | 'media' | 'scarsa'

export type CallProspect = {
  riga: number
  nome: string
  instagram_handle: string | null
  data: string
  stato: StatoCall
  esito: Esito | null
  qualificata: boolean | null
  stato_lead: StatoLead
  obiezione: string | null
  note: string | null
  link: string | null
  performance: Performance | null
  prodotto: string | null
  importo: number | null
}

const STATI: Record<string, { stato: StatoCall; esito: Esito | null; qualificata: boolean | null; lead: StatoLead; nota?: string }> = {
  chiusa: { stato: 'svolta', esito: 'chiusa', qualificata: true, lead: 'cliente' },
  acconto: { stato: 'svolta', esito: 'chiusa', qualificata: true, lead: 'cliente', nota: 'Acconto versato.' },
  'follow up chiuso': { stato: 'svolta', esito: 'chiusa', qualificata: true, lead: 'cliente', nota: 'Chiusa dopo il follow-up.' },
  'follow up da risentire': { stato: 'svolta', esito: 'follow_up', qualificata: true, lead: 'follow_up' },
  'follow up perso': { stato: 'svolta', esito: 'persa', qualificata: true, lead: 'perso', nota: 'Persa dopo il follow-up.' },
  persa: { stato: 'svolta', esito: 'persa', qualificata: null, lead: 'perso' },
  'call annullata': { stato: 'cancellata', esito: null, qualificata: null, lead: 'perso' },
  lead: { stato: 'programmata', esito: null, qualificata: null, lead: 'call_fissata' },
}

const PERFORMANCE: Record<string, Performance> = {
  ottima: 'ottima',
  buona: 'buona',
  discreta: 'discreta',
  media: 'media',
  scarsa: 'scarsa',
}

/** Sheet "Tipologia" -> product name in the catalogue (scripts/prodotti-base.ts). */
export const PRODOTTO_DA_TIPOLOGIA: Record<string, string> = {
  semestrale: 'Percorso Alpha 6 mesi',
  trimestrale: 'Percorso Alpha 3 mesi',
}

function testo(v: string | undefined): string | null {
  const t = (v ?? '').replace(/\s+/g, ' ').trim()
  return t === '' ? null : t
}

/** "Marco (marcogh.87)" -> name Marco, handle @marcogh.87; "fili_manzi" -> both the handle. */
export function nomeEHandle(grezzo: string): { nome: string; handle: string | null } {
  const pulito = grezzo.replace(/\s+/g, ' ').trim()
  const tra = pulito.match(/^(.*?)\s*\(([A-Za-z0-9._]{3,30})\)\s*$/)
  if (tra) return { nome: tra[1].trim() || tra[2], handle: `@${tra[2].toLowerCase()}` }
  const sembraHandle = /^[A-Za-z0-9._]{3,30}$/.test(pulito) && (/[._\d]/.test(pulito) || pulito === pulito.toLowerCase())
  return { nome: pulito, handle: sembraHandle ? `@${pulito.toLowerCase()}` : null }
}

function data(v: string | undefined): string | null {
  const m = (v ?? '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return null
  const iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  const d = new Date(`${iso}T00:00:00Z`)
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso ? null : iso
}

/**
 * Header: Nome, Data call, Status, Importo pitch €, Tipologia, Performance,
 * Motivo di non chiusura, Link alla call, Note aggiuntive. Rows that cannot be
 * placed in time or have an unknown status are returned as warnings.
 */
export function mappaProspect(righe: string[][]): { call: CallProspect[]; avvisi: string[] } {
  const call: CallProspect[] = []
  const avvisi: string[] = []

  righe.slice(1).forEach((r, i) => {
    const n = i + 2
    const grezzo = testo(r[0])
    if (!grezzo) return
    const { nome, handle } = nomeEHandle(grezzo)
    const giorno = data(r[1])
    if (!giorno) {
      avvisi.push(`Riga ${n} (${nome}): senza data della call, non importata`)
      return
    }
    const stato = STATI[(r[2] ?? '').trim().toLowerCase()]
    if (!stato) {
      avvisi.push(`Riga ${n} (${nome}): stato "${r[2]}" non riconosciuto, non importata`)
      return
    }

    const tipologia = (r[4] ?? '').trim().toLowerCase()
    const prodotto = PRODOTTO_DA_TIPOLOGIA[tipologia] ?? null
    const motivo = testo(r[6])
    const link = testo(r[7])
    const importo = /^\d+([.,]\d{1,2})?$/.test((r[3] ?? '').trim()) ? Number((r[3] ?? '').trim().replace(',', '.')) : null

    const note = [
      stato.nota,
      tipologia && !prodotto ? `Tipologia: ${(r[4] ?? '').trim()}.` : null,
      // a reason on a closed call is context, not an objection
      stato.esito === 'chiusa' && motivo ? motivo : null,
      testo(r[8]),
    ].filter(Boolean)

    call.push({
      riga: n,
      nome,
      instagram_handle: handle,
      data: giorno,
      stato: stato.stato,
      esito: stato.esito,
      qualificata: stato.qualificata,
      stato_lead: stato.lead,
      obiezione: stato.esito === 'chiusa' ? null : motivo,
      note: note.length > 0 ? note.join(' ') : null,
      link: link && /^https?:\/\/\S+$/i.test(link) && link.length <= 500 ? link : null,
      performance: PERFORMANCE[(r[5] ?? '').trim().toLowerCase()] ?? null,
      prodotto,
      importo,
    })
  })

  return { call, avvisi }
}
