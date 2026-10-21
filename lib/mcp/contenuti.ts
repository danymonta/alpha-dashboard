import 'server-only'

import { fineMese, oggiRoma } from '@/lib/date'
import type { ContenutoElenco } from '@/lib/marketing/elenco'
import {
  BOZZA_REEL,
  CAMPI,
  ETICHETTA_GRUPPO,
  ETICHETTA_MODELLO,
  ETICHETTA_STATUS,
  GRUPPI_STATUS,
  ORDINE_COLONNE,
  ORDINE_GRUPPI,
  ORDINE_SEZIONI,
  SEZIONI,
  sezioniVisibili,
  type SezioneContenuto,
  type TipoContenuto,
} from '@/lib/marketing/etichette'
import { ICP, ICP_AGGIORNATO_IL } from '@/lib/marketing/icp'
import { GUIDA_AGGIORNATA_IL, GUIDA_CONTESTO, GUIDA_LINEE, GUIDA_SCORING } from '@/lib/marketing/punteggio/guida'
import { improntaTesto } from '@/lib/marketing/impronta'
import {
  contaPerGruppo,
  leggiContenuto,
  leggiElenco,
  leggiOpzioni,
  leggiProprietaContenuto,
  type FiltriElenco,
} from '@/lib/marketing/letture'
import { nomiDa, type Opzioni } from '@/lib/marketing/opzioni'
import {
  cambiaStatusContenuto,
  creaContenuto,
  eliminaContenuto,
  modificaCampiContenuto,
  salvaSezioneContenuto,
} from '@/lib/marketing/operazioni'
import {
  AUDIO_MAX,
  LINK_MAX,
  NOME_MAX,
  SEZIONE_MAX,
  VIEW_COUNT_MAX,
  contenutoSchema,
  lunghezza,
  normalizzaSezione,
  type CampoInCella,
} from '@/lib/validation/contenuto'

import type { ContestoMcp } from './contesto'
import { EtichettaSconosciuta, linkNotion, rigaPerClaude, risolviEtichetta, valoreDa, versioneOpaca } from './etichette'
import { LIMITI_MCP } from './limiti'
import type {
  CambiaStatusInput,
  CreaContenutiInput,
  ElencoContenutiInput,
  EliminaContenutoInput,
  LeggiContenutoInput,
  ModificaContenutoInput,
  ScriviSezioneInput,
} from './schemi'

/**
 * What each MCP tool does (09/10/2026): labels in, labels out, and in between
 * the shared core of the content calendar (lib/marketing/letture.ts and
 * operazioni.ts), the same functions and Zod schemas as the app's pages and
 * server actions. The client is ctx.db, which carries the person's own OAuth
 * token: RLS decides, never the service role. A read that fails throws (the
 * wrapper answers with its generic sentence); a refusal of the core comes back
 * with the core's own words.
 */

export type EsitoStrumento =
  | { ok: true; dati: Record<string, unknown>; esito?: string }
  | { ok: false; messaggio: string; esito?: string }

const NON_TROVATO = 'Questo contenuto non c’è (o non lo vedi).'
const NON_C_E_PIU = 'Questo contenuto non c’è più.'
const CAMBIATO = 'Il contenuto è cambiato da un’altra parte: ricontrolla i valori attuali.'
const SEZIONE_CAMBIATA = 'Questa parte è cambiata da un’altra parte: ecco il testo attuale.'
const NAME_DIVERSO = 'Il Name non coincide con quello del contenuto: non elimino niente.'
const SOLO_ADMIN_ELIMINA = 'Da Claude elimina un contenuto solo l’admin: per toglierlo dal lavoro c’è lo Status Canceled.'
const RILEGGI =
  'Per cambiare poi le proprietà rileggi il contenuto con leggi_contenuto o elenco_contenuti: questa scrittura ha cambiato la sua versione.'

function ok(dati: Record<string, unknown>, esito?: string): EsitoStrumento {
  return { ok: true, dati, esito }
}

function no(messaggio: string): EsitoStrumento {
  return { ok: false, messaggio }
}

/** Code points of a value's JSON: how a result is measured against the limits. */
export function misura(valore: unknown): number {
  return lunghezza(JSON.stringify(valore))
}

// ── etichette_contenuti ─────────────────────────────────────────────────────

export async function etichetteContenuti(ctx: ContestoMcp): Promise<EsitoStrumento> {
  // Reel Type and Format are the labels of the app, as they are now (names, codes and colours): read, never fixed
  const opzioni = await leggiOpzioni(ctx.db)
  const modelli = (['reel', 'carousel'] as const satisfies readonly TipoContenuto[]).map((tipo) => ({
    nome: ETICHETTA_MODELLO[tipo],
    sezioni: SEZIONI[tipo],
    ...(tipo === 'reel' ? { bozza_iniziale: BOZZA_REEL } : {}),
  }))
  return ok({
    proprieta: ORDINE_COLONNE.map((c) => CAMPI[c]),
    reel_type: opzioni.reel_type.map((o) => ({ nome: o.nome, codice: o.valore, colore: o.colore })),
    format: opzioni.formato.map((o) => ({ nome: o.nome, codice: o.valore, colore: o.colore })),
    nota_etichette:
      'Reel Type e Format sono etichette colorate che la persona crea e cambia nell’app (Piano editoriale): usa il nome o il codice di una che c’è; se serve una nuova, dillo alla persona, da qui non se ne creano.',
    status: ORDINE_GRUPPI.map((g) => ({
      gruppo: ETICHETTA_GRUPPO[g],
      status: GRUPPI_STATUS[g].map((s) => ETICHETTA_STATUS[s]),
    })),
    modelli,
    nota_carousel: `In un ${ETICHETTA_MODELLO.carousel} la sezione commenti (${SEZIONI.carousel.commenti}) compare solo quando ha un testo.`,
    limiti: {
      [CAMPI.nome]: NOME_MAX,
      [CAMPI.audio]: AUDIO_MAX,
      link: LINK_MAX,
      sezione: SEZIONE_MAX,
      [CAMPI.view_count]: VIEW_COUNT_MAX,
    },
    date: 'AAAA-MM-GG, giorni di Roma',
    oggi: oggiRoma(),
  })
}

// ── icp ─────────────────────────────────────────────────────────────────────

/** The ideal client profile, word for word: a constant of the code, no database read. */
export async function profiloClienteIdeale(): Promise<EsitoStrumento> {
  return ok({ aggiornato_il: ICP_AGGIORNATO_IL, profilo: ICP })
}

// ── guida_contenuti ─────────────────────────────────────────────────────────

/**
 * Dany's guide to the content (1.39.0), a constant of the code like the ICP: no database read, no price
 * (a test checks it). The default part is the guidelines, the part Claude needs to write or propose a
 * content; the scoring part is how a reel is judged; both together stay under the result limit.
 */
export async function guidaContenuti(input: { parte?: 'linee_guida' | 'punteggio' | 'tutta' | null }): Promise<EsitoStrumento> {
  const parte = input.parte ?? 'linee_guida'
  const linee = `# Contesto\n\n${GUIDA_CONTESTO}\n\n# Linee guida per i contenuti\n\n${GUIDA_LINEE}`
  const punteggio = `# Come si valuta un reel\n\n${GUIDA_SCORING}`
  return ok({
    aggiornata_il: GUIDA_AGGIORNATA_IL,
    parte,
    guida: parte === 'linee_guida' ? linee : parte === 'punteggio' ? punteggio : `${linee}\n\n${punteggio}`,
  })
}

// ── elenco_contenuti ────────────────────────────────────────────────────────

/** The labels of the tool become the filters of the page (lib/marketing/filtri.ts), plus the dates. */
export function filtriDaInput(input: ElencoContenutiInput, opzioni: Opzioni): FiltriElenco {
  const f: FiltriElenco = {}
  if (input.status) f.stato = valoreDa(ETICHETTA_STATUS, input.status)
  if (input.gruppo) f.gruppo = valoreDa(ETICHETTA_GRUPPO, input.gruppo)
  if (input.reel_type) f.reel_type = risolviEtichetta('reel_type', input.reel_type, opzioni)
  if (input.format) f.formato = risolviEtichetta('formato', input.format, opzioni)
  if (input.modello) f.tipo = valoreDa(ETICHETTA_MODELLO, input.modello)
  const cerca = input.cerca?.trim()
  if (cerca) f.q = cerca
  if (input.mese) {
    f.da = `${input.mese}-01`
    f.a = fineMese(f.da)
  }
  if (input.da) f.da = input.da
  if (input.a) f.a = input.a
  if (input.senza_data) f.senzaData = true
  return f
}

export async function elencoContenuti(input: ElencoContenutiInput, ctx: ContestoMcp): Promise<EsitoStrumento> {
  const limite = input.limite ?? LIMITI_MCP.righeElencoPredefinite
  const opzioni = await leggiOpzioni(ctx.db)
  let filtri: FiltriElenco
  try {
    filtri = filtriDaInput(input, opzioni)
  } catch (e) {
    if (e instanceof EtichettaSconosciuta) return no(e.message)
    throw e
  }
  const nomi = nomiDa(opzioni)
  const [{ righe, totale }, conteggi] = await Promise.all([
    leggiElenco(ctx.db, filtri, limite),
    contaPerGruppo(ctx.db, filtri),
  ])

  const base = {
    oggi: oggiRoma(),
    totale,
    mostrati: 0,
    per_gruppo: Object.fromEntries(ORDINE_GRUPPI.map((g) => [ETICHETTA_GRUPPO[g], conteggi[g]])),
  }
  // whole rows only, dropped from the end when the result would be too long for Claude
  const spazio = LIMITI_MCP.risultato - misura(base) - 400
  const contenuti: ReturnType<typeof rigaPerClaude>[] = []
  let usato = 0
  let tagliati = false
  for (const riga of righe) {
    const voce = rigaPerClaude(riga, nomi)
    const dimensione = misura(voce) + 1
    if (usato + dimensione > spazio) {
      tagliati = true
      break
    }
    contenuti.push(voce)
    usato += dimensione
  }

  const mostrati = contenuti.length
  let avviso: string | undefined
  if (tagliati) {
    avviso = `Ne mostro ${mostrati} di ${totale}: i contenuti hanno proprietà lunghe, restringi i filtri.`
  } else if (mostrati < totale) {
    avviso =
      limite < LIMITI_MCP.righeElenco
        ? `Ne mostro ${mostrati} di ${totale}: restringi i filtri o aumenta il limite (massimo ${LIMITI_MCP.righeElenco}).`
        : `Ne mostro ${mostrati} di ${totale}: restringi i filtri.`
  }
  return ok({ ...base, mostrati, contenuti, ...(avviso ? { avviso } : {}) })
}

// ── leggi_contenuto ─────────────────────────────────────────────────────────

export async function leggiContenutoPerClaude(input: LeggiContenutoInput, ctx: ContestoMcp): Promise<EsitoStrumento> {
  const riga = await leggiContenuto(ctx.db, input.id)
  if (!riga) return no(NON_TROVATO)
  const nomi = nomiDa(await leggiOpzioni(ctx.db))

  const valori: Record<SezioneContenuto, string | null> = {
    messaggio: riga.messaggio,
    bozza: riga.bozza,
    commenti: riga.commenti,
    finale: riga.finale,
  }
  const scelte = input.sezioni
    ? ORDINE_SEZIONI.filter((s) => input.sezioni?.includes(s))
    : sezioniVisibili(riga.tipo, valori)

  // whole sections only: one is at most 30,000 characters, so it always fits the 45,000
  const sezioni: { chiave: SezioneContenuto; titolo: string; testo: string; impronta: string; caratteri: number }[] = []
  const daLeggere: { chiave: SezioneContenuto; titolo: string; caratteri: number }[] = []
  let usati = 0
  for (const chiave of scelte) {
    const testo = valori[chiave] ?? ''
    const caratteri = lunghezza(testo)
    const titolo = SEZIONI[riga.tipo][chiave]
    if (usati + caratteri <= LIMITI_MCP.testoLettura) {
      sezioni.push({ chiave, titolo, testo, impronta: improntaTesto(valori[chiave]), caratteri })
      usati += caratteri
    } else {
      daLeggere.push({ chiave, titolo, caratteri })
    }
  }

  return ok({
    contenuto: { ...rigaPerClaude(riga, nomi), ...(riga.notion_page_id ? { Notion: linkNotion(riga.notion_page_id) } : {}) },
    sezioni,
    ...(daLeggere.length > 0 ? { da_leggere_a_parte: daLeggere } : {}),
  })
}

// ── crea_contenuti ──────────────────────────────────────────────────────────

type Nuovo = CreaContenutiInput['contenuti'][number]

/** The properties of a new content, from labels to values: the input of contenutoSchema. */
function proprietaNuove(c: Nuovo, opzioni: Opzioni) {
  return {
    tipo: valoreDa(ETICHETTA_MODELLO, c.modello ?? ETICHETTA_MODELLO.reel),
    nome: c.name,
    reel_type: c.reel_type ? risolviEtichetta('reel_type', c.reel_type, opzioni) : null,
    formato: c.format ? risolviEtichetta('formato', c.format, opzioni) : null,
    stato: c.status ? valoreDa(ETICHETTA_STATUS, c.status) : 'not_started',
    post_date: c.post_date ?? null,
    inspiration: c.inspiration ?? null,
    audio: c.audio ?? null,
    url: c.url ?? null,
    view_count: c.view_count ?? null,
  }
}

/** The sections to write: the texts given, an empty one left out (a reel then keeps its template). */
function sezioniDaScrivere(sezioni: Nuovo['sezioni']): Partial<Record<SezioneContenuto, string>> {
  const testi: Partial<Record<SezioneContenuto, string>> = {}
  for (const chiave of ORDINE_SEZIONI) {
    const testo = sezioni?.[chiave]
    if (typeof testo === 'string' && normalizzaSezione(testo) !== null) testi[chiave] = testo
  }
  return testi
}

export async function creaContenuti(input: CreaContenutiInput, ctx: ContestoMcp): Promise<EsitoStrumento> {
  const risultati: Record<string, unknown>[] = []
  let creati = 0
  const opzioni = await leggiOpzioni(ctx.db)
  const nomi = nomiDa(opzioni)
  // one after the other, in order: an item that fails does not stop the others
  for (const c of input.contenuti) {
    let proprieta: ReturnType<typeof proprietaNuove>
    try {
      proprieta = proprietaNuove(c, opzioni)
    } catch (e) {
      // a label that is not there: this content is not created, with the valid ones in the answer
      if (!(e instanceof EtichettaSconosciuta)) throw e
      risultati.push({ esito: 'errore', [CAMPI.nome]: c.name, errore: e.message })
      continue
    }
    const esito = await creaContenuto(ctx.db, proprieta, sezioniDaScrivere(c.sezioni))
    if (!esito.ok) {
      risultati.push({ esito: 'errore', [CAMPI.nome]: c.name, errore: esito.errore })
      continue
    }
    creati += 1
    // the row as the database stored it: the same normalisation the core applied
    const salvate = contenutoSchema.safeParse(proprieta)
    const valori = salvate.success ? salvate.data : proprieta
    const scritte = ORDINE_SEZIONI.filter((s) => esito.sezioni[s] === true)
    const nonScritte = ORDINE_SEZIONI.flatMap((s) => {
      const errore = esito.sezioni[s]
      return typeof errore === 'string' ? [{ sezione: s, errore }] : []
    })
    risultati.push({
      esito: 'creato',
      ...rigaPerClaude({ id: esito.id, ...valori, updated_at: esito.versione }, nomi),
      sezioni_scritte: scritte,
      ...(nonScritte.length > 0 ? { sezioni_non_scritte: nonScritte } : {}),
    })
  }
  return ok(
    { creati, errori: input.contenuti.length - creati, contenuti: risultati },
    creati === input.contenuti.length ? 'ok' : creati === 0 ? 'errore' : 'parziale',
  )
}

// ── modifica_contenuto ──────────────────────────────────────────────────────

type CampoDaScrivere = { campo: CampoInCella; valore: unknown; prima: unknown }

/**
 * The fields Claude gave, from labels to values, each with the value it read
 * (`prima`, the row at the version Claude holds): exactly what a cell sends.
 * Absent keeps the current value (not written), null empties it.
 */
function campiDaScrivere(c: ModificaContenutoInput['campi'], riga: ContenutoElenco, opzioni: Opzioni): CampoDaScrivere[] {
  const campi: CampoDaScrivere[] = []
  const aggiungi = (campo: CampoInCella, valore: unknown) => {
    if (valore !== undefined) campi.push({ campo, valore, prima: riga[campo] })
  }
  aggiungi('tipo', c.modello === undefined ? undefined : valoreDa(ETICHETTA_MODELLO, c.modello))
  aggiungi('nome', c.name)
  aggiungi('reel_type', c.reel_type == null ? c.reel_type : risolviEtichetta('reel_type', c.reel_type, opzioni))
  aggiungi('formato', c.format == null ? c.format : risolviEtichetta('formato', c.format, opzioni))
  aggiungi('post_date', c.post_date)
  aggiungi('inspiration', c.inspiration)
  aggiungi('audio', c.audio)
  aggiungi('url', c.url)
  aggiungi('view_count', c.view_count)
  return campi
}

export async function modificaContenutoPerClaude(
  input: ModificaContenutoInput,
  ctx: ContestoMcp,
): Promise<EsitoStrumento> {
  // the properties only: the sections are not needed to compare a version
  const riga = await leggiProprietaContenuto(ctx.db, input.id)
  if (!riga) return no(NON_C_E_PIU)
  const opzioni = await leggiOpzioni(ctx.db)
  const nomi = nomiDa(opzioni)
  if (versioneOpaca(riga.updated_at) !== input.versione) {
    return ok({ esito: 'cambiato', messaggio: CAMBIATO, contenuto: rigaPerClaude(riga, nomi) }, 'cambiato')
  }

  let campi: CampoDaScrivere[]
  try {
    campi = campiDaScrivere(input.campi, riga, opzioni)
  } catch (e) {
    // a label that is not there: nothing is written, the answer lists the valid ones
    if (e instanceof EtichettaSconosciuta) return no(e.message)
    throw e
  }

  // the version is the one just read, so these are the values Claude saw: each field is written
  // over its own (the write of the cells, 1.33.0), all in one statement; one changed between this
  // read and the write stops everything (cambiato), a field Claude did not name is never written
  const esito = await modificaCampiContenuto(ctx.db, {
    id: riga.id,
    campi,
    stato: input.campi.status ? valoreDa(ETICHETTA_STATUS, input.campi.status) : undefined,
  })
  // the row as the write left it: its version covers exactly these values
  if (esito.ok) return ok({ esito: 'salvato', contenuto: rigaPerClaude(esito.riga, nomi) })
  if (esito.cambiato) {
    return ok({ esito: 'cambiato', messaggio: CAMBIATO, contenuto: rigaPerClaude(esito.cambiato, nomi) }, 'cambiato')
  }
  if (esito.sparito) return no(NON_C_E_PIU)
  return no(esito.errore)
}

// ── after a write ───────────────────────────────────────────────────────────

/**
 * The properties as they are right after a write, with their version: a
 * version never leaves without the values it covers. The version a write
 * returns also covers what others changed since Claude's last read, so on its
 * own it would let modifica_contenuto overwrite a value Claude never saw. Null
 * when the read fails: the write is saved anyway, and the result asks Claude
 * to read again instead of giving a version.
 */
async function proprietaDopo(ctx: ContestoMcp, id: string): Promise<ReturnType<typeof rigaPerClaude> | null> {
  try {
    const [riga, opzioni] = await Promise.all([leggiProprietaContenuto(ctx.db, id), leggiOpzioni(ctx.db)])
    return riga ? rigaPerClaude(riga, nomiDa(opzioni)) : null
  } catch {
    return null
  }
}

// ── cambia_status ───────────────────────────────────────────────────────────

export async function cambiaStatus(input: CambiaStatusInput, ctx: ContestoMcp): Promise<EsitoStrumento> {
  const esito = await cambiaStatusContenuto(ctx.db, { id: input.id, stato: valoreDa(ETICHETTA_STATUS, input.status) })
  if (!esito.ok) return no(esito.errore)
  const contenuto = await proprietaDopo(ctx, input.id)
  return ok(
    contenuto
      ? { esito: 'salvato', contenuto }
      : { esito: 'salvato', contenuto: { id: input.id, [CAMPI.stato]: input.status }, avviso: RILEGGI },
  )
}

// ── scrivi_sezione ──────────────────────────────────────────────────────────

export async function scriviSezione(input: ScriviSezioneInput, ctx: ContestoMcp): Promise<EsitoStrumento> {
  const esito = await salvaSezioneContenuto(ctx.db, {
    id: input.id,
    campo: input.sezione,
    testo: input.testo,
    impronta: input.impronta,
  })
  if (esito.ok) {
    // the new version only with the properties it covers (proprietaDopo), never the one of the RPC alone
    const contenuto = await proprietaDopo(ctx, input.id)
    return ok(
      { esito: 'salvata', impronta: esito.impronta, ...(contenuto ? { contenuto } : { avviso: RILEGGI }) },
      'salvata',
    )
  }
  if (esito.cambiata) {
    // not an error: Claude merges the two texts with the person and writes again over the new
    // fingerprint. Nothing was written, so no version: the one Claude holds is still its last.
    return ok(
      {
        esito: 'cambiata',
        messaggio: SEZIONE_CAMBIATA,
        attuale: esito.cambiata.attuale ?? '',
        impronta: esito.cambiata.impronta,
      },
      'cambiata',
    )
  }
  if (esito.sparito) return no(NON_C_E_PIU)
  return no(esito.errore)
}

// ── elimina_contenuto ───────────────────────────────────────────────────────

/** The Name typed by Claude and the stored one, compared as the same text (NFC, trimmed). */
export function stessoNome(a: string, b: string): boolean {
  return a.normalize('NFC').trim() === b.normalize('NFC').trim()
}

export async function eliminaContenutoPerClaude(
  input: EliminaContenutoInput,
  ctx: ContestoMcp,
): Promise<EsitoStrumento> {
  // the tool exists only for the admin; the policy says so again for an OAuth token
  if (ctx.ruolo !== 'admin') return no(SOLO_ADMIN_ELIMINA)
  const riga = await leggiProprietaContenuto(ctx.db, input.id)
  if (!riga) return no(NON_C_E_PIU)
  if (!stessoNome(riga.nome, input.name)) return no(NAME_DIVERSO)
  const esito = await eliminaContenuto(ctx.db, { id: riga.id })
  if (!esito.ok) return no(esito.errore)
  return ok({ esito: 'eliminato', [CAMPI.nome]: riga.nome }, 'eliminato')
}
