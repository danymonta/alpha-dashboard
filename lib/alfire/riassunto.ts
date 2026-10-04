import { formatData, formatEuro, formatMese } from '@/lib/format'
import { elencoNomi } from '@/lib/progetti'
import type { NomeScrittura } from '@/lib/alfire/permessi'
import { SPOSTA, quandoBreveDa } from '@/lib/call/spostamento'
import { isDataISO } from '@/lib/date'
import {
  MOTIVO_NON_CHIUSURA,
  NOTE_CLOSER,
  NOTE_SETTER,
  SCALE_COMMENTO,
  TESTI_COMMENTO,
  etichettaLivello,
} from '@/lib/setting/commento'
import { ETICHETTA_ESITO, type SceltaEsito } from '@/lib/validation/esito'
import { ETICHETTA_STATO_LEAD, type StatoLead } from '@/lib/validation/lead'

/**
 * What Alfire is about to do, in one sentence plus details, for the
 * confirmation card. Built from the tool input the model produced: the user
 * reads exactly what will be written. The card then adds the preview read
 * from the database (Anteprima): the real row, before → after, and what a
 * deletion takes with it.
 */
export type Riassunto = { titolo: string; dettagli: string[] }

/**
 * The database side of the card (lib/alfire/strumenti.ts, anteprimaScrittura).
 * titolo replaces the sentence above with the row's real name; righe are
 * before → after lines or consequences; sostituisceDettagli: the righe say it
 * all, the input's details are not repeated; incompleta: the database could
 * not be read (a deletion then waits). An errore: the target is not found or
 * not unique, the model has to ask. The card shows errore, in the person's
 * words; per_alfire (which tool or field, what to ask) goes to the model only.
 */
export type Anteprima =
  | { titolo?: string; righe: string[]; sostituisceDettagli?: boolean; incompleta?: boolean }
  | { errore: string; per_alfire?: string }

/** Between the person's words and the model's hint in the reason a stopped card sends back. */
const PER_ALFIRE = '\nPer Alfire: '

/** The reason a stopped card sends back to the model: the person's words, then the hint only the model reads. */
export function motivoAlModello(e: { errore: string; per_alfire?: string }): string {
  return e.per_alfire ? `${e.errore}${PER_ALFIRE}${e.per_alfire}` : e.errore
}

/** What the card shows of that reason, after the model has it: the person's words only. */
export function motivoPerLaPersona(motivo: string): string {
  return motivo.split(PER_ALFIRE)[0]
}

type Input = Record<string, unknown>

/** The setter's counters, in the form's order. No strategy, discovery held or qualified: not asked any more. */
const ETICHETTA_CAMPO_REPORT: Record<string, string> = {
  dm_outbound: 'DM outbound',
  dm_inbound: 'DM inbound',
  conversazioni: 'conversazioni',
  follow_up: 'follow up',
  call_proposte: 'call proposte',
  discovery_prenotate: 'discovery prenotate',
}

const ETICHETTA_TIPO: Record<string, string> = { nuovo: 'Nuovo cliente', rinnovo: 'Rinnovo', upsell: 'Upsell' }

function testo(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null
}

function giorno(v: unknown): string {
  return testo(v) ? formatData(v as string) : 'oggi'
}

function righe(...voci: (string | null | false | undefined)[]): string[] {
  return voci.filter((d): d is string => Boolean(d))
}

function euro(v: unknown): string | null {
  return typeof v === 'number' ? formatEuro(v) : null
}

function mese(v: unknown): string {
  const m = testo(v)
  return m && /^\d{4}-\d{2}/.test(m) ? formatMese(`${m.slice(0, 7)}-01`) : 'questo mese'
}

/** "500,00 € al mese 0 · 500,00 € al mese 1": the plan a product proposes to its sales. */
function pianoAbituale(v: unknown): string | null {
  const rate = Array.isArray(v) ? (v as Input[]) : []
  return rate.length > 0 ? rate.map((r) => `${formatEuro(r.importo as number)} al mese ${String(r.mese)}`).join(' · ') : null
}

function persone(v: unknown): string[] {
  return (Array.isArray(v) ? v : [])
    .map((p) => testo(p))
    .filter((p): p is string => Boolean(p))
    .map((p) => (p.toLowerCase() === 'io' ? 'te' : p))
}

/**
 * A sale's own lines, from the input: what, when, the plan, the cash-ins
 * already made, the notes. Shared with the preview of registra_vendita, which
 * adds the client, the product and who gets the sale as the database will set
 * them.
 */
export function dettagliVendita(input: Input): string[] {
  const rate = Array.isArray(input.rate) ? (input.rate as Input[]) : []
  const pagate = rate.filter((r) => testo(r.incassata_il))
  return righe(
    `${ETICHETTA_TIPO[String(input.tipo)] ?? 'Vendita'}: ${testo(input.prodotto) ?? '?'}${
      typeof input.valore === 'number' ? `, ${formatEuro(input.valore)}` : ''
    }`,
    `Firmata ${giorno(input.data_vendita)}, inizio ${giorno(input.data_inizio)}${
      testo(input.data_fine)
        ? `, fine ${formatData(input.data_fine as string)}`
        : typeof input.durata_mesi === 'number'
          ? `, ${input.durata_mesi} mesi`
          : ''
    }`,
    rate.length > 0
      ? `Piano: ${rate.map((r) => `${formatEuro(r.importo as number)} il ${giorno(r.scadenza)}`).join(' · ')}`
      : `Piano: ${typeof input.numero_rate === 'number' && input.numero_rate > 1 ? `${input.numero_rate} rate mensili uguali` : 'una rata'}`,
    ...pagate.map(
      (r) => `Incassata ${giorno(r.incassata_il)}: ${formatEuro(r.importo as number)}${testo(r.metodo) ? ` in ${r.metodo}` : ''}`,
    ),
    testo(input.note) && `Note: ${input.note}`,
  )
}

/** The button of a card that removes or ends something: red, and it says what it does. */
export function azioneDistruttiva(nome: NomeScrittura, input: Input): string | null {
  if (input.azione === 'elimina' || input.modalita === 'elimina') return 'Elimina'
  if (nome === 'vendita' && input.azione === 'interrompi') return 'Interrompi'
  if (nome === 'progetto' && input.azione === 'togli_membro') return 'Togli'
  return null
}

export function riassuntoScrittura(nome: NomeScrittura, input: Input): Riassunto {
  const azione = testo(input.azione)
  switch (nome) {
    case 'cliente': {
      const chi = testo(input.cliente) ?? '?'
      if (azione === 'elimina') return { titolo: `Elimino il cliente ${chi}`, dettagli: [] }
      if (azione === 'modifica') return { titolo: `Correggo il cliente ${chi}`, dettagli: cambi(input, ['azione', 'cliente']) }
      return {
        titolo: `Creo il cliente ${[testo(input.nome), testo(input.cognome)].filter(Boolean).join(' ')}`,
        dettagli: righe(
          testo(input.email) && `Email ${input.email}`,
          testo(input.telefono) && `Telefono ${input.telefono}`,
          testo(input.instagram_handle) && `Instagram ${input.instagram_handle}`,
          testo(input.fonte) && `Fonte: ${String(input.fonte).replace('_', ' ')}`,
          testo(input.setter) && `Setter: ${input.setter}`,
          testo(input.closer) && `Closer: ${input.closer}`,
          (testo(input.note) || testo(input.aggiungi_nota)) && `Note: ${[testo(input.note), testo(input.aggiungi_nota)].filter(Boolean).join('\n')}`,
        ),
      }
    }
    case 'vendita': {
      const di = `${testo(input.cliente) ?? '?'}${testo(input.data_vendita) ? ` del ${formatData(input.data_vendita as string)}` : ''}`
      if (azione === 'elimina') return { titolo: `Elimino la vendita di ${di}`, dettagli: [] }
      if (azione === 'interrompi') {
        return {
          titolo: `Interrompo il percorso di ${testo(input.cliente) ?? '?'}`,
          dettagli: righe(
            `Ultimo giorno: ${testo(input.ultimo_giorno) ? formatData(input.ultimo_giorno as string) : '?'}`,
            input.togli_rate ? 'Tolgo le rate non pagate dopo quel giorno' : 'Le rate non pagate restano da incassare',
          ),
        }
      }
      return { titolo: `Correggo la vendita di ${di}`, dettagli: cambi(input, ['azione', 'cliente', 'data_vendita']) }
    }
    case 'registra_vendita':
      // until the preview arrives (it replaces these lines with what the database will set)
      return {
        titolo: `Registro la vendita a ${testo(input.cliente) ?? '?'}`,
        dettagli: [
          ...dettagliVendita(input),
          ...righe(
            testo(input.call_id) && 'Dalla call chiusa: setter e closer vengono dalla call',
            testo(input.setter) && `Setter: ${input.setter}`,
            testo(input.closer) && `Closer: ${input.closer}`,
            testo(input.fonte) && `Fonte: ${String(input.fonte).replace('_', ' ')}`,
            testo(input.email) && `Email ${input.email}`,
            testo(input.telefono) && `Telefono ${input.telefono}`,
            testo(input.instagram_handle) && `Instagram ${input.instagram_handle}`,
          ),
        ],
      }
    case 'rata': {
      const chi = testo(input.cliente) ?? '?'
      const quale = righe(
        typeof input.numero === 'number' && `Rata ${input.numero}`,
        testo(input.mese) && `Scadenza a ${mese(input.mese)}`,
      )
      switch (azione) {
        case 'incassa':
          return {
            titolo: `Segno incassata una rata di ${chi}`,
            dettagli: righe(
              ...quale,
              euro(input.importo) ? `Importo ${euro(input.importo)}` : 'Importo previsto dalla rata',
              `Incassata ${giorno(input.data)}`,
              testo(input.metodo) && `Metodo: ${input.metodo}`,
            ),
          }
        case 'correggi_incasso':
          return { titolo: `Correggo l’incasso di una rata di ${chi}`, dettagli: [...quale, ...cambi(input, ['azione', 'cliente', 'numero', 'mese', 'payment_id'])] }
        case 'annulla_incasso':
          return { titolo: `Annullo l’incasso di una rata di ${chi}`, dettagli: [...quale, 'Torna da incassare'] }
        case 'fallita':
          return { titolo: `Segno come fallita una rata di ${chi}`, dettagli: quale }
        case 'modifica':
          return { titolo: `Correggo una rata di ${chi}`, dettagli: [...quale, ...cambi(input, ['azione', 'cliente', 'numero', 'mese', 'payment_id'])] }
        case 'rimborso':
          return {
            titolo: `Registro un rimborso a ${chi}`,
            dettagli: righe(
              ...quale,
              euro(input.importo) ? `Importo ${euro(input.importo)}` : 'Tutto l’incassato della rata',
              `Rimborsato ${giorno(input.data)}`,
              'La provvigione torna indietro nel mese del rimborso',
            ),
          }
        case 'aggiungi':
          return {
            titolo: `Aggiungo una rata di ${euro(input.importo) ?? '?'} alla vendita di ${chi}`,
            dettagli: righe(`Scadenza ${testo(input.scadenza) ? formatData(input.scadenza as string) : '?'}`, 'Le rate si rinumerano in ordine di scadenza'),
          }
        default:
          return { titolo: `Elimino una rata di ${chi}`, dettagli: quale }
      }
    }
    case 'costo': {
      const quale = testo(input.costo) ?? '?'
      if (azione === 'elimina') return { titolo: `Elimino il costo «${quale}»`, dettagli: [] }
      if (azione === 'modifica') return { titolo: `Correggo il costo «${quale}»`, dettagli: cambi(input, ['azione', 'costo', 'id', 'mese']) }
      if (azione === 'copia_ricorrenti') {
        return { titolo: `Copio i costi ricorrenti in ${mese(input.mese)}`, dettagli: ['Dal mese prima; salto quelli che ci sono già'] }
      }
      return {
        titolo: `Registro il costo «${testo(input.descrizione) ?? ''}»`,
        dettagli: righe(
          euro(input.importo),
          testo(input.categoria) && `Categoria: ${input.categoria}`,
          `Data: ${giorno(input.data)}`,
          input.ricorrente ? 'Ricorrente ogni mese' : null,
        ),
      }
    }
    case 'pagamento_provvigione': {
      const chi = testo(input.persona) ?? '?'
      if (azione === 'elimina') return { titolo: `Elimino il pagamento a ${chi} per ${mese(input.mese)}`, dettagli: [] }
      if (azione === 'modifica') {
        return { titolo: `Correggo il pagamento a ${chi} per ${mese(input.mese)}`, dettagli: cambi(input, ['azione', 'persona', 'mese', 'id']) }
      }
      return {
        titolo: `Registro il pagamento di ${euro(input.importo) ?? '?'} a ${chi} per ${mese(input.mese)}`,
        dettagli: righe(`Pagato ${giorno(input.pagato_il)}`, testo(input.metodo) && `Metodo: ${input.metodo}`, testo(input.note) && `Note: ${input.note}`),
      }
    }
    case 'regola_provvigione': {
      const chi = testo(input.persona) ?? '?'
      if (azione === 'nuova') {
        const tipi = Array.isArray(input.applica_a) && input.applica_a.length > 0 ? input.applica_a.join(', ') : 'nuovo'
        return {
          titolo: `Nuova regola per ${chi}: ${typeof input.percentuale === 'number' ? String(input.percentuale).replace('.', ',') : '?'}% su ${tipi}`,
          dettagli: [`Dal ${giorno(input.valida_dal)}`],
        }
      }
      if (azione === 'chiudi') {
        return {
          titolo: `Chiudo la regola di ${chi} al ${testo(input.valida_al) ? formatData(input.valida_al as string) : '?'}`,
          dettagli: ['Le provvigioni fino a quel giorno restano'],
        }
      }
      if (azione === 'elimina') return { titolo: `Elimino la regola di ${chi}`, dettagli: [] }
      return { titolo: `Correggo la regola di ${chi}`, dettagli: cambi(input, ['azione', 'persona', 'alla_data']) }
    }
    case 'obiettivi_mese': {
      if (input.cash === null && input.nuovi_clienti === null) return { titolo: `Tolgo gli obiettivi di ${mese(input.mese)}`, dettagli: [] }
      return {
        titolo: `Obiettivi di ${mese(input.mese)}`,
        dettagli: righe(
          input.cash === null ? 'Cash: tolto' : euro(input.cash) && `Cash: ${euro(input.cash)}`,
          input.nuovi_clienti === null
            ? 'Nuovi clienti: tolto'
            : typeof input.nuovi_clienti === 'number' && `Nuovi clienti: ${input.nuovi_clienti}`,
        ),
      }
    }
    case 'prodotto': {
      const quale = testo(input.prodotto) ?? '?'
      if (azione === 'elimina') return { titolo: `Elimino il prodotto «${quale}»`, dettagli: [] }
      if (azione === 'fuori_vendita') return { titolo: `Metto fuori vendita «${quale}»`, dettagli: [] }
      if (azione === 'in_vendita') return { titolo: `Rimetto in vendita «${quale}»`, dettagli: [] }
      if (azione === 'modifica') return { titolo: `Correggo il prodotto «${quale}»`, dettagli: cambi(input, ['azione', 'prodotto']) }
      return {
        titolo: `Creo il prodotto «${testo(input.nome) ?? '?'}»`,
        dettagli: righe(
          typeof input.durata_mesi === 'number' && `${input.durata_mesi} mesi`,
          euro(input.prezzo_listino) && `Listino ${euro(input.prezzo_listino)}`,
          pianoAbituale(input.piano_predefinito) && `Piano abituale: ${pianoAbituale(input.piano_predefinito)}`,
        ),
      }
    }
    case 'aggiorna_report': {
      const di = testo(input.setter) && !['io', 'me'].includes(String(input.setter).toLowerCase()) ? ` di ${input.setter}` : ''
      if (input.modalita === 'elimina') return { titolo: `Elimino il report${di} di ${giorno(input.data)}`, dettagli: [] }
      const aggiungi = input.modalita === 'aggiungi'
      const campi = Object.entries(ETICHETTA_CAMPO_REPORT)
        .filter(([campo]) => typeof input[campo] === 'number')
        .map(([campo, etichetta]) => `${aggiungi ? '+' : ''}${input[campo]} ${etichetta}`)
      if (typeof input.contenuto_pubblicato === 'boolean') {
        campi.push(input.contenuto_pubblicato ? 'contenuto pubblicato' : 'nessun contenuto pubblicato')
      }
      // how the day went: each answer in the form's words, the texts in full
      for (const scala of SCALE_COMMENTO) {
        const livello = etichettaLivello(scala.campo, testo(input[scala.campo]))
        if (livello) campi.push(`${scala.titolo}: ${livello}`)
      }
      for (const t of TESTI_COMMENTO) {
        if (typeof input[t.campo] !== 'string') continue
        const scritto = testo(input[t.campo])
        campi.push(scritto ? `${t.titolo}${aggiungi ? ' (in aggiunta)' : ''}: ${scritto}` : `${t.titolo}: da togliere`)
      }
      return {
        titolo: `${aggiungi ? 'Aggiungo al' : 'Imposto il'} report${di} di ${giorno(input.data)}`,
        dettagli: campi,
      }
    }
    case 'fissa_call':
      // discovery calls only, from the setter and the admin: the tool always writes that type.
      // Only the admin can name a setter; without one the call is his own
      return {
        titolo: `Fisso una call con ${testo(input.nome) ?? 'il lead'}`,
        dettagli: righe(
          'Discovery call',
          `${giorno(input.data)} alle ${testo(input.ora) ?? '?'}`,
          testo(input.instagram_handle) && `Instagram ${input.instagram_handle}`,
          testo(input.fonte) && `Fonte: ${String(input.fonte).replace('_', ' ')}`,
          testo(input.setter) && `Setter: ${input.setter}`,
          `Closer: ${testo(input.closer) ?? 'l’admin'}`,
        ),
      }
    case 'call': {
      const chi = testo(input.lead) ?? '?'
      if (azione === 'esito') {
        const esito = testo(input.esito) as SceltaEsito | null
        return {
          titolo: `Registro l’esito della call con ${chi}: ${esito ? (ETICHETTA_ESITO[esito] ?? esito) : '?'}`,
          dettagli: righe(
            typeof input.qualificata === 'boolean' && `Qualificata: ${input.qualificata ? 'sì' : 'no'}`,
            testo(input.motivo) && `${MOTIVO_NON_CHIUSURA.titolo}: ${input.motivo}`,
            testo(input.note_closer) && `${NOTE_CLOSER.titolo}: ${input.note_closer}`,
            esito === 'chiusa' && 'Poi registriamo la vendita',
            // "In attesa di conferma" (04/10/2026): no date, the call stays on its day
            esito === 'riprogrammata' && SPOSTA.attesa.descrizione,
          ),
        }
      }
      if (azione === 'elimina') return { titolo: `Elimino la call con ${chi}`, dettagli: [] }
      // the same call moves to its new day, still to be held (Dany, 02/10/2026)
      if (azione === 'sposta') {
        return {
          // the card's preview (read from the database) adds where it comes from
          titolo: `Sposto la call di ${chi} al ${
            isDataISO(testo(input.data) ?? '') && testo(input.ora) ? quandoBreveDa(input.data as string, input.ora as string) : '?'
          }`,
          dettagli: [],
        }
      }
      // two notes on a call: the setter's and the closer's, each with its name
      return {
        titolo: `Correggo la call con ${chi}`,
        dettagli: cambi(input, ['azione', 'lead', 'call_id'], { note: NOTE_SETTER.titolo, note_closer: NOTE_CLOSER.titolo }),
      }
    }
    case 'lead': {
      const chi = testo(input.lead) ?? '?'
      if (azione === 'stato') {
        const stato = testo(input.stato) as StatoLead | null
        return { titolo: `Sposto ${chi} in «${stato ? (ETICHETTA_STATO_LEAD[stato] ?? stato) : '?'}»`, dettagli: [] }
      }
      if (azione === 'elimina') return { titolo: `Elimino il lead ${chi}`, dettagli: [] }
      return { titolo: `Correggo il lead ${chi}`, dettagli: cambi(input, ['azione', 'lead']) }
    }
    case 'progetto': {
      const quale = testo(input.progetto) ?? '?'
      if (azione === 'crea') {
        return {
          titolo: `Creo il progetto «${testo(input.nome) ?? testo(input.cliente) ?? ''}»`,
          dettagli: righe(
            `Reparto: ${testo(input.reparto) ?? '?'}`,
            testo(input.modello) && `Dal modello ${input.modello}`,
            testo(input.cliente) && `Cliente: ${input.cliente}`,
            testo(input.data_inizio) && `Inizio ${formatData(input.data_inizio as string)}`,
            testo(input.data_fine) && `Fine ${formatData(input.data_fine as string)}`,
            persone(input.persone).length > 0 && `Membri: ${elencoNomi(persone(input.persone))}`,
          ),
        }
      }
      if (azione === 'aggiungi_membro') return { titolo: `Aggiungo ${elencoNomi(persone(input.persone))} al progetto «${quale}»`, dettagli: [] }
      if (azione === 'togli_membro') return { titolo: `Tolgo ${elencoNomi(persone(input.persone))} dal progetto «${quale}»`, dettagli: [] }
      if (azione === 'scegli_coach') return { titolo: `${testo(input.coach) ?? '?'} diventa il coach di «${quale}»`, dettagli: [] }
      if (azione === 'elimina') return { titolo: `Elimino il progetto «${quale}»`, dettagli: [] }
      return { titolo: `Correggo il progetto «${quale}»`, dettagli: cambi(input, ['azione', 'progetto', 'persone']) }
    }
    case 'lista': {
      const dove = testo(input.progetto) ?? '?'
      if (azione === 'crea') {
        return {
          titolo: `Creo la lista «${testo(input.nome) ?? '?'}» in «${dove}»`,
          dettagli: cambi(input, ['azione', 'progetto', 'lista', 'nome']),
        }
      }
      if (azione === 'elimina') return { titolo: `Elimino la lista «${testo(input.lista) ?? '?'}» di «${dove}»`, dettagli: [] }
      return { titolo: `Correggo la lista «${testo(input.lista) ?? '?'}» di «${dove}»`, dettagli: cambi(input, ['azione', 'progetto', 'lista']) }
    }
    case 'task': {
      const titolo = testo(input.titolo) ?? ''
      if (azione === 'aggiungi') {
        const chi = persone(input.assegnatari)
        return {
          titolo: `Aggiungo il task «${titolo}»`,
          dettagli: righe(
            `Progetto: ${testo(input.progetto) ?? '?'}`,
            testo(input.lista) && `Lista: ${input.lista}`,
            testo(input.sotto_task_di) && `Sotto-task di «${input.sotto_task_di}»`,
            chi.length > 0 ? `Assegnato a: ${elencoNomi(chi)}` : 'Senza assegnatario',
            testo(input.scadenza) && `Scadenza ${formatData(input.scadenza as string)}`,
          ),
        }
      }
      if (azione === 'completa') return { titolo: `Segno come fatto il task «${titolo}»`, dettagli: righe(testo(input.progetto) && `Progetto: ${input.progetto}`) }
      if (azione === 'riapri') return { titolo: `Riapro il task «${titolo}»`, dettagli: righe(testo(input.progetto) && `Progetto: ${input.progetto}`) }
      if (azione === 'elimina') return { titolo: `Elimino il task «${titolo}»`, dettagli: righe(testo(input.progetto) && `Progetto: ${input.progetto}`) }
      return { titolo: `Correggo il task «${titolo}»`, dettagli: cambi(input, ['azione', 'titolo', 'progetto', 'task_id']) }
    }
    case 'nota_progetto': {
      const dove = testo(input.progetto) ?? '?'
      if (azione === 'aggiungi') {
        return {
          titolo: `Aggiungo una nota a «${dove}»`,
          dettagli: righe(`Giorno: ${giorno(input.data)}`, testo(input.testo) && `«${testo(input.testo)}»`),
        }
      }
      if (azione === 'elimina') return { titolo: `Elimino una nota di «${dove}»`, dettagli: [] }
      return { titolo: `Correggo una nota di «${dove}»`, dettagli: cambi(input, ['azione', 'progetto', 'nota_id']) }
    }
    case 'tempo': {
      const dove = testo(input.progetto)
      switch (azione) {
        case 'avvia':
          // only the task said: the task names it until the preview finds its project
          return {
            titolo: `Avvio il timer su «${dove ?? testo(input.task) ?? '?'}»`,
            dettagli: righe(dove && testo(input.task) && `Task: ${input.task}`, testo(input.nota) && `Nota: ${input.nota}`),
          }
        case 'ferma':
          return { titolo: 'Fermo il timer', dettagli: righe(testo(input.nota) && `Nota: ${input.nota}`) }
        case 'registra': {
          // with a range the duration comes from it
          const fascia = testo(input.dalle) && testo(input.alle) ? `${testo(input.dalle)}–${testo(input.alle)}` : null
          return {
            titolo: `Registro ${fascia ?? testo(input.durata) ?? '?'} del tuo tempo su «${dove ?? testo(input.task) ?? '?'}»`,
            dettagli: righe(`Giorno: ${giorno(input.data)}`, dove && testo(input.task) && `Task: ${input.task}`, testo(input.nota) && `Nota: ${input.nota}`),
          }
        }
        case 'elimina':
          return { titolo: 'Elimino una tua voce di tempo', dettagli: righe(dove && `Progetto: ${dove}`, testo(input.task) && `Task: ${input.task}`) }
        default: {
          const togli = ['nessuna', 'nessuno', '-'].includes((testo(input.dalle) ?? testo(input.alle) ?? '').toLowerCase())
          const fascia = togli
            ? 'Tolgo la fascia oraria'
            : testo(input.dalle) || testo(input.alle)
              ? `Fascia: ${testo(input.dalle) ?? '…'}–${testo(input.alle) ?? '…'}`
              : null
          return {
            titolo: 'Correggo una tua voce di tempo',
            dettagli: [...cambi(input, ['azione', 'progetto', 'voce_id', 'task_id', 'dalle', 'alle']), ...righe(fascia)],
          }
        }
      }
    }
  }
}

const ETICHETTA_CAMBIO: Record<string, string> = {
  nome: 'Nome',
  cognome: 'Cognome',
  email: 'Email',
  telefono: 'Telefono',
  instagram_handle: 'Instagram',
  fonte: 'Fonte',
  setter: 'Setter',
  closer: 'Closer',
  note: 'Note',
  aggiungi_nota: 'Aggiungo alle note',
  tipo: 'Tipo',
  prodotto: 'Prodotto',
  valore: 'Valore',
  importo: 'Importo',
  nuova_data_vendita: 'Data di vendita',
  data_inizio: 'Inizio',
  data_fine: 'Fine',
  scadenza: 'Scadenza',
  data: 'Data',
  ora: 'Ora',
  categoria: 'Categoria',
  descrizione: 'Descrizione',
  ricorrente: 'Ricorrente',
  metodo: 'Metodo',
  pagato_il: 'Pagato il',
  percentuale: 'Percentuale',
  applica_a: 'Si applica a',
  valida_dal: 'Valida dal',
  valida_al: 'Valida al',
  durata_mesi: 'Durata in mesi',
  prezzo_listino: 'Prezzo di listino',
  stato: 'Stato',
  priorita: 'Priorità',
  nuovo_titolo: 'Titolo',
  assegnatari: 'Assegnato a',
  sotto_task_di: 'Sotto-task di',
  lista: 'Lista',
  stima: 'Stima',
  responsabile: 'Responsabile',
  reparto: 'Reparto',
  cliente: 'Cliente',
  testo: 'Testo',
  durata: 'Durata',
  nota: 'Nota',
  task: 'Task',
  nuovo_progetto: 'Sposto sul progetto',
  nuovo_task: 'Sposto sul task',
  esito: 'Esito',
  link_registrazione: 'Registrazione',
  performance: 'Performance',
  prodotto_proposto: 'Prodotto proposto',
  importo_proposto: 'Importo proposto',
  piano_predefinito: 'Piano abituale',
}

const IMPORTI = ['valore', 'importo', 'prezzo_listino', 'importo_proposto']

/** "Campo: nuovo valore" for every field the edit changes (the card adds before → after from the database). */
function cambi(input: Input, esclusi: string[], etichette: Record<string, string> = {}): string[] {
  return Object.entries(input)
    .filter(([campo, valore]) => !esclusi.includes(campo) && valore !== undefined && valore !== null && valore !== '')
    .map(([campo, valore]) => {
      const etichetta = etichette[campo] ?? ETICHETTA_CAMBIO[campo] ?? campo
      if (campo === 'piano_predefinito') return `${etichetta}: ${pianoAbituale(valore) ?? 'nessuno'}`
      if (typeof valore === 'number' && IMPORTI.includes(campo)) return `${etichetta}: ${formatEuro(valore)}`
      if (typeof valore === 'boolean') return `${etichetta}: ${valore ? 'sì' : 'no'}`
      if (campo === 'assegnatari') return `${etichetta}: ${persone(valore).length > 0 ? elencoNomi(persone(valore)) : 'nessuno'}`
      if (Array.isArray(valore)) return `${etichetta}: ${valore.join(', ')}`
      if (typeof valore === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valore)) return `${etichetta}: ${formatData(valore)}`
      if (typeof valore === 'object') return etichetta
      return `${etichetta}: ${String(valore)}`
    })
}
