import { z } from 'zod'

import { isDataISO } from '@/lib/date'
import { Constants } from '@/lib/supabase/database.types'
import { FONTI } from '@/lib/validation/call'
import { METODI } from '@/lib/validation/incasso'
import { MASSIMO_CONTRATTO, MASSIMO_RATE, TIPI_VENDITA } from '@/lib/validation/vendita'

/**
 * The inputs of the MCP tools on clients, sales, instalments and cash-ins
 * (Claude a 360 gradi, phase 3, 23/10/2026), zod 3 like the rest of the app.
 * They describe the shapes; the rules stay in lib/validation (anagrafiche,
 * vendita, incasso, chiusura, sospensione), which the shared cores
 * (lib/clienti/operazioni.ts, lib/vendite/operazioni.ts) apply again on every
 * write, so the error messages are the app's. Every object is strict; an
 * optional property accepts null, which means "not said" (on a change: leave
 * it as it is). Ids come from the reads: elenco_clienti, leggi_cliente,
 * elenco_vendite, leggi_vendita, incassi, persone_del_team, prodotti,
 * elenco_call. Amounts are euros, as numbers.
 */

const id = (cosa: string, da: string) => z.string().uuid(`Id ${cosa} non valido: usa quello letto con ${da}.`)

const ID_CLIENTE = id('del cliente', 'elenco_clienti o leggi_cliente')
const ID_VENDITA = id('della vendita', 'elenco_vendite o leggi_vendita')
const ID_RATA = id('della rata', 'leggi_vendita, leggi_cliente o incassi')
const ID_PERSONA = id('della persona', 'persone_del_team')
const ID_PRODOTTO = id('del prodotto', 'prodotti')
const ID_CALL = id('della call', 'elenco_call o leggi_call')

const data = z.string().refine(isDataISO, 'Data non valida: scrivila come AAAA-MM-GG (giorno di Roma).')
const testo = (max: number) => z.string().max(max, `Al massimo ${max} caratteri.`)
const euro = (descrizione: string) =>
  z.number({ invalid_type_error: 'Un importo in euro, come numero: 1500 o 1500.50.' }).positive('Un importo maggiore di zero.').max(MASSIMO_CONTRATTO, 'Importo troppo alto: controlla gli zeri.').describe(descrizione)
const limite = (predefinito: number) =>
  z.number().int().min(1).max(100).nullish().describe(`Quanti al massimo (${predefinito} se non dici altro, al massimo 100).`)

export const STATI_CLIENTE = Constants.public.Enums.client_status
export const VISTE_CLIENTI = ['attivi', 'sospesi', 'chiusi', 'tutti'] as const
const TIPO = z.enum(TIPI_VENDITA, { errorMap: () => ({ message: `Tipo di vendita: uno tra ${TIPI_VENDITA.join(', ')}.` }) })
const METODO = z.enum(METODI, { errorMap: () => ({ message: `Metodo: uno tra ${METODI.join(', ')}.` }) })

// ── reads ────────────────────────────────────────────────────────────────────
export const elencoClientiSchema = z
  .object({
    vista: z
      .enum(VISTE_CLIENTI)
      .nullish()
      .describe('attivi (in corso, in scadenza, da iniziare; predefinita), sospesi, chiusi («Non rinnova»), tutti.'),
    stato: z
      .enum(STATI_CLIENTE)
      .nullish()
      .describe(`Solo i clienti in questo stato (vale al posto di vista): ${STATI_CLIENTE.join(', ')}.`),
    cerca: testo(80).nullish().describe('Un pezzo del nome o del cognome.'),
    limite: limite(50),
  })
  .strict()

export const leggiClienteSchema = z.object({ client_id: ID_CLIENTE }).strict()

export const rinnoviSchema = z
  .object({
    entro: z
      .union([z.literal(30), z.literal(60)])
      .nullish()
      .describe('Chi finisce il percorso entro 30 (predefinito) o 60 giorni.'),
  })
  .strict()

export const elencoVenditeSchema = z
  .object({
    da: data.nullish().describe('Dalla data di vendita (compresa), AAAA-MM-GG.'),
    a: data.nullish().describe('Alla data di vendita (compresa), AAAA-MM-GG.'),
    tipo: TIPO.nullish(),
    client_id: ID_CLIENTE.nullish().describe('Solo le vendite di questo cliente.'),
    setter_id: ID_PERSONA.nullish().describe('Solo l’admin: le vendite con questo setter.'),
    closer_id: ID_PERSONA.nullish().describe('Solo l’admin: le vendite con questo closer.'),
    da_incassare: z.boolean().nullish().describe('Solo le vendite con rate ancora da incassare.'),
    limite: limite(30),
  })
  .strict()

export const leggiVenditaSchema = z.object({ sale_id: ID_VENDITA }).strict()

export const daIncassareSchema = z.object({}).strict()

export const STATI_RATA = Constants.public.Enums.payment_status
export const incassiSchema = z
  .object({
    stato: z
      .enum(STATI_RATA)
      .nullish()
      .describe('prevista (da incassare), incassata, fallita, rimborsata. Senza: ogni stato.'),
    in_ritardo: z.boolean().nullish().describe('Solo le rate da incassare con la scadenza passata.'),
    da: data.nullish().describe('Dal giorno (compreso): la scadenza, o il giorno dell’incasso con stato incassata o rimborsata.'),
    a: data.nullish().describe('Al giorno (compreso), come da.'),
    client_id: ID_CLIENTE.nullish(),
    limite: limite(50),
  })
  .strict()

export const mieiClientiSchema = z
  .object({
    cerca: testo(60).nullish().describe('Nome o cognome di uno dei tuoi clienti: le sue vendite, con le rate.'),
    da: data.nullish().describe('Gli incassi da questo giorno (compreso), AAAA-MM-GG.'),
    a: data.nullish().describe('Gli incassi fino a questo giorno (compreso). Con da e senza a: fino a oggi.'),
  })
  .strict()

export const anteprimaInterruzioneSchema = z
  .object({
    sale_id: ID_VENDITA,
    ultimo_giorno: data.describe('L’ultimo giorno del percorso, AAAA-MM-GG, tra l’inizio e la fine della vendita.'),
    togli_rate: z.boolean().describe('true: le rate non pagate dopo quel giorno se ne vanno e il contratto scende; false: restano da incassare.'),
  })
  .strict()

export const anteprimaRimborsoSchema = z
  .object({
    payment_id: ID_RATA.describe('La rata incassata da rimborsare.'),
    importo: euro('Quanto si rimborsa, in euro: al massimo quanto è stato incassato per quella rata.'),
    data: data.describe('Il giorno del rimborso, AAAA-MM-GG: mai nel futuro, mai prima dell’incasso.'),
    note: testo(300).nullish().describe('Una nota facoltativa sul rimborso.'),
  })
  .strict()

// ── writes ───────────────────────────────────────────────────────────────────
const anagrafica = {
  cognome: testo(80).nullish().describe('Il cognome; "" lo toglie.'),
  email: testo(160).nullish().describe('L’email; "" la toglie.'),
  telefono: testo(30).nullish().describe('Il telefono, con il prefisso; "" lo toglie.'),
  instagram_handle: testo(40).nullish().describe('L’handle Instagram, con o senza @; "" lo toglie.'),
  fonte: z
    .enum([...FONTI, ''] as [string, ...string[]])
    .nullish()
    .describe(`Da dove arriva: ${FONTI.join(', ')}; "" la toglie.`),
  setter_id: ID_PERSONA.or(z.literal('')).nullish().describe('Chi ha portato il cliente (id da persone_del_team); "" nessuno.'),
  closer_id: ID_PERSONA.or(z.literal('')).nullish().describe('Chi l’ha chiuso; "" nessuno.'),
  note: testo(1000).nullish().describe('Le note; "" le toglie.'),
}

export const creaClienteSchema = z
  .object({
    nome: testo(80).describe('Il nome del cliente (obbligatorio).'),
    ...anagrafica,
  })
  .strict()

export const modificaClienteSchema = z
  .object({
    client_id: ID_CLIENTE,
    nome: testo(80).nullish().describe('Il nome (non si svuota).'),
    ...anagrafica,
  })
  .strict()

export const AZIONI_STATO_CLIENTE = ['non_rinnova', 'riapri', 'archivia', 'togli_archivio', 'sospendi', 'riattiva'] as const

export const statoClienteSchema = z
  .object({
    client_id: ID_CLIENTE,
    azione: z.enum(AZIONI_STATO_CLIENTE, {
      errorMap: () => ({ message: `Azione: una tra ${AZIONI_STATO_CLIENTE.join(', ')}.` }),
    }),
    giorno: data
      .nullish()
      .describe('Con non_rinnova o sospendi: da quando, AAAA-MM-GG (di base oggi, mai nel futuro).'),
    motivo: testo(500).nullish().describe('Con non_rinnova o sospendi: il motivo, facoltativo.'),
  })
  .strict()

const rata = z
  .object({
    scadenza: data.describe('La scadenza, AAAA-MM-GG.'),
    importo: euro('L’importo della rata in euro.'),
  })
  .strict()

export const registraVenditaSchema = z
  .object({
    call_id: ID_CALL.nullish().describe('La call chiusa da cui nasce la vendita (cliente, setter e closer vengono dalla call).'),
    client_id: ID_CLIENTE.nullish().describe('Solo l’admin: un cliente che c’è già (per un rinnovo o un upsell).'),
    nome: testo(80).nullish().describe('Un cliente nuovo: il nome (obbligatorio senza client_id e senza una call col cliente).'),
    cognome: testo(80).nullish(),
    email: testo(160).nullish(),
    telefono: testo(30).nullish(),
    instagram_handle: testo(40).nullish(),
    tipo: TIPO.describe('nuovo, rinnovo o upsell: rinnovo e upsell vogliono un cliente che c’è già.'),
    product_id: ID_PRODOTTO.nullish().describe('Il prodotto del catalogo (id da prodotti). Senza: prodotto_personalizzato e data_fine.'),
    prodotto_personalizzato: testo(120).nullish().describe('Un percorso fuori catalogo, per nome, con la sua data_fine.'),
    data_fine: data.nullish().describe('Con un percorso fuori catalogo: quando finisce, AAAA-MM-GG.'),
    data_vendita: data.nullish().describe('Il giorno della vendita, AAAA-MM-GG (mai nel futuro). Senza: oggi.'),
    data_inizio: data
      .nullish()
      .describe('Il giorno in cui inizia il percorso, AAAA-MM-GG. Senza: una settimana dopo la vendita, come nell’app.'),
    valore_contratto: euro('Il valore del contratto in euro.'),
    numero_rate: z
      .number()
      .int()
      .min(1)
      .max(MASSIMO_RATE)
      .nullish()
      .describe(`Rate mensili uguali, da 1 a ${MASSIMO_RATE} (senza rate scritte a mano). Senza: una rata.`),
    rate: z
      .array(rata)
      .min(1)
      .max(60)
      .nullish()
      .describe('Il piano scritto a mano: una riga per rata, con scadenza e importo; la somma deve fare il contratto.'),
    note: testo(1000).nullish(),
  })
  .strict()

export const modificaVenditaSchema = z
  .object({
    sale_id: ID_VENDITA,
    tipo: TIPO.nullish(),
    product_id: ID_PRODOTTO.nullish().describe('Il prodotto del catalogo (id da prodotti).'),
    prodotto_personalizzato: testo(120).nullish().describe('Un percorso fuori catalogo, al posto del prodotto.'),
    valore_contratto: euro('Il valore del contratto in euro.').nullish(),
    data_vendita: data.nullish(),
    data_inizio: data.nullish(),
    data_fine: data.nullish(),
    setter_id: ID_PERSONA.or(z.literal('')).nullish().describe('Il setter della vendita; "" nessuno (nessuna provvigione).'),
    closer_id: ID_PERSONA.or(z.literal('')).nullish().describe('Il closer della vendita; "" nessuno.'),
    note: testo(1000).nullish().describe('Le note; "" le toglie.'),
  })
  .strict()

export const interrompiPercorsoSchema = anteprimaInterruzioneSchema
  .extend({
    codice_anteprima: z
      .string()
      .regex(/^[0-9a-f]{16}$/, 'Codice dell’anteprima non valido: chiedi prima anteprima_interruzione.')
      .describe('Il codice che anteprima_interruzione ha dato con gli stessi valori, dopo averla mostrata alla persona.'),
  })
  .strict()

export const registraRimborsoSchema = anteprimaRimborsoSchema
  .extend({
    codice_anteprima: z
      .string()
      .regex(/^[0-9a-f]{16}$/, 'Codice dell’anteprima non valido: chiedi prima anteprima_rimborso.')
      .describe('Il codice che anteprima_rimborso ha dato con gli stessi valori, dopo averla mostrata alla persona.'),
  })
  .strict()

export const AZIONI_RATA = ['incassa', 'correggi_incasso', 'annulla_incasso', 'fallita', 'modifica'] as const

export const rataSchema = z
  .object({
    payment_id: ID_RATA,
    azione: z.enum(AZIONI_RATA, { errorMap: () => ({ message: `Azione: una tra ${AZIONI_RATA.join(', ')}.` }) }),
    incassato_il: data
      .nullish()
      .describe('Con incassa (di base oggi) o correggi_incasso (obbligatorio): il giorno dell’incasso, mai nel futuro.'),
    importo: euro('Con incassa (di base l’importo previsto) o correggi_incasso (obbligatorio): quanto è stato incassato.').nullish(),
    metodo: METODO.nullish().describe(`Con incassa o correggi_incasso: ${METODI.join(', ')}.`),
    scadenza: data.nullish().describe('Con modifica (solo l’admin, una rata ancora da incassare): la nuova scadenza.'),
    importo_previsto: euro('Con modifica: il nuovo importo previsto.').nullish(),
  })
  .strict()

export const aggiungiRataSchema = z
  .object({
    sale_id: ID_VENDITA,
    scadenza: data.describe('La scadenza della rata nuova, AAAA-MM-GG.'),
    importo: euro('L’importo della rata nuova in euro.'),
  })
  .strict()

export type ElencoClientiInput = z.output<typeof elencoClientiSchema>
export type LeggiClienteInput = z.output<typeof leggiClienteSchema>
export type RinnoviInput = z.output<typeof rinnoviSchema>
export type ElencoVenditeInput = z.output<typeof elencoVenditeSchema>
export type LeggiVenditaInput = z.output<typeof leggiVenditaSchema>
export type IncassiInput = z.output<typeof incassiSchema>
export type MieiClientiInput = z.output<typeof mieiClientiSchema>
export type AnteprimaInterruzioneInput = z.output<typeof anteprimaInterruzioneSchema>
export type AnteprimaRimborsoInput = z.output<typeof anteprimaRimborsoSchema>
export type CreaClienteInput = z.output<typeof creaClienteSchema>
export type ModificaClienteInput = z.output<typeof modificaClienteSchema>
export type StatoClienteInput = z.output<typeof statoClienteSchema>
export type RegistraVenditaInput = z.output<typeof registraVenditaSchema>
export type ModificaVenditaInput = z.output<typeof modificaVenditaSchema>
export type InterrompiPercorsoInput = z.output<typeof interrompiPercorsoSchema>
export type RegistraRimborsoInput = z.output<typeof registraRimborsoSchema>
export type RataInput = z.output<typeof rataSchema>
export type AggiungiRataInput = z.output<typeof aggiungiRataSchema>
