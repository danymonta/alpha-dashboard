import { formatData, formatEuro } from '@/lib/format'
import { elencoNomi } from '@/lib/progetti'
import type { NomeScrittura } from '@/lib/alfire/permessi'

/**
 * What Alfire is about to do, in one sentence plus details, for the
 * confirmation card. Built from the tool input the model produced: the user
 * reads exactly what will be written.
 */
export type Riassunto = { titolo: string; dettagli: string[] }

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

function testo(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null
}

function giorno(v: unknown): string {
  return testo(v) ? formatData(v as string) : 'oggi'
}

export function riassuntoScrittura(nome: NomeScrittura, input: Input): Riassunto {
  switch (nome) {
    case 'crea_cliente':
      return {
        titolo: `Creo il cliente ${[testo(input.nome), testo(input.cognome)].filter(Boolean).join(' ')}`,
        dettagli: [
          testo(input.email) && `Email ${input.email}`,
          testo(input.telefono) && `Telefono ${input.telefono}`,
          testo(input.instagram_handle) && `Instagram ${input.instagram_handle}`,
          testo(input.fonte) && `Fonte: ${String(input.fonte).replace('_', ' ')}`,
          testo(input.note) && `Note: ${input.note}`,
        ].filter((d): d is string => Boolean(d)),
      }
    case 'segna_incassata':
      return {
        titolo: `Segno incassata la rata di ${testo(input.cliente) ?? 'questo cliente'}`,
        dettagli: [
          typeof input.importo === 'number' ? `Importo ${formatEuro(input.importo)}` : 'Importo previsto dalla rata',
          `Incassata ${giorno(input.incassato_il)}`,
          testo(input.metodo) && `Metodo: ${input.metodo}`,
        ].filter((d): d is string => Boolean(d)),
      }
    case 'registra_costo':
      return {
        titolo: `Registro il costo «${testo(input.descrizione) ?? ''}»`,
        dettagli: [
          typeof input.importo === 'number' ? formatEuro(input.importo) : null,
          testo(input.categoria) && `Categoria: ${input.categoria}`,
          `Data: ${giorno(input.data)}`,
          input.ricorrente ? 'Ricorrente ogni mese' : null,
        ].filter((d): d is string => Boolean(d)),
      }
    case 'aggiorna_report': {
      const aggiungi = input.modalita === 'aggiungi'
      const campi = Object.entries(ETICHETTA_CAMPO_REPORT)
        .filter(([campo]) => typeof input[campo] === 'number')
        .map(([campo, etichetta]) => `${aggiungi ? '+' : ''}${input[campo]} ${etichetta}`)
      if (typeof input.contenuto_pubblicato === 'boolean') {
        campi.push(input.contenuto_pubblicato ? 'contenuto pubblicato' : 'nessun contenuto pubblicato')
      }
      return {
        titolo: `${aggiungi ? 'Aggiungo al' : 'Imposto il'} report di ${giorno(input.data)}`,
        dettagli: campi,
      }
    }
    case 'fissa_call':
      // discovery calls only, from the setter and the admin: the tool always writes that type.
      // Only the admin can name a setter; without one the call is his own
      return {
        titolo: `Fisso una call con ${testo(input.nome) ?? 'il lead'}`,
        dettagli: [
          'Discovery call',
          `${giorno(input.data)} alle ${testo(input.ora) ?? '?'}`,
          testo(input.instagram_handle) && `Instagram ${input.instagram_handle}`,
          testo(input.fonte) && `Fonte: ${String(input.fonte).replace('_', ' ')}`,
          testo(input.setter) && `Setter: ${input.setter}`,
          `Closer: ${testo(input.closer) ?? 'l’admin'}`,
        ].filter((d): d is string => Boolean(d)),
      }
    case 'crea_progetto':
      return {
        titolo: `Creo il progetto «${testo(input.nome) ?? ''}»`,
        dettagli: [
          `Reparto: ${testo(input.reparto) ?? '?'}`,
          testo(input.modello) && `Dal modello ${input.modello}`,
          testo(input.data_inizio) && `Inizio ${formatData(input.data_inizio as string)}`,
          testo(input.data_fine) && `Fine ${formatData(input.data_fine as string)}`,
        ].filter((d): d is string => Boolean(d)),
      }
    case 'aggiungi_task': {
      const persone = (Array.isArray(input.assegnatari) ? input.assegnatari : [])
        .map((p) => testo(p))
        .filter((p): p is string => Boolean(p))
        .map((p) => (p.toLowerCase() === 'io' ? 'te' : p))
      return {
        titolo: `Aggiungo il task «${testo(input.titolo) ?? ''}»`,
        dettagli: [
          `Progetto: ${testo(input.progetto) ?? '?'}`,
          persone.length > 0 ? `Assegnato a: ${elencoNomi(persone)}` : 'Senza assegnatario',
        ],
      }
    }
    case 'completa_task':
      return {
        titolo: `${input.completato === false ? 'Riapro' : 'Segno come fatto'} il task «${testo(input.titolo) ?? ''}»`,
        dettagli: testo(input.progetto) ? [`Progetto: ${input.progetto}`] : [],
      }
    case 'registra_vendita': {
      const rate = Array.isArray(input.rate) ? (input.rate as Input[]) : []
      const pagate = rate.filter((r) => testo(r.incassata_il))
      return {
        titolo: `Registro la vendita a ${testo(input.cliente) ?? '?'}`,
        dettagli: [
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
            (r) =>
              `Incassata ${giorno(r.incassata_il)}: ${formatEuro(r.importo as number)}${testo(r.metodo) ? ` in ${r.metodo}` : ''}`,
          ),
          testo(input.setter) && `Setter: ${input.setter}`,
          testo(input.closer) && `Closer: ${input.closer}`,
          testo(input.fonte) && `Fonte: ${String(input.fonte).replace('_', ' ')}`,
          testo(input.email) && `Email ${input.email}`,
          testo(input.telefono) && `Telefono ${input.telefono}`,
          testo(input.instagram_handle) && `Instagram ${input.instagram_handle}`,
          testo(input.note) && `Note: ${input.note}`,
        ].filter((d): d is string => Boolean(d)),
      }
    }
    case 'modifica_cliente':
      return { titolo: `Correggo il cliente ${testo(input.cliente) ?? '?'}`, dettagli: cambi(input, ['cliente']) }
    case 'modifica_vendita':
      return {
        titolo: `Correggo la vendita di ${testo(input.cliente) ?? '?'}${
          testo(input.data_vendita) ? ` del ${formatData(input.data_vendita as string)}` : ''
        }`,
        dettagli: cambi(input, ['cliente', 'data_vendita']),
      }
    case 'modifica_rata':
      return { titolo: `Correggo una rata di ${testo(input.cliente) ?? '?'}`, dettagli: cambi(input, ['cliente', 'payment_id']) }
    case 'modifica_costo':
      return { titolo: `Correggo il costo «${testo(input.costo) ?? ''}»`, dettagli: cambi(input, ['costo', 'id']) }
    case 'modifica_call':
      return { titolo: `Correggo la call con ${testo(input.lead) ?? '?'}`, dettagli: cambi(input, ['lead', 'call_id']) }
  }
}

const ETICHETTA_TIPO: Record<string, string> = { nuovo: 'Nuovo cliente', rinnovo: 'Rinnovo', upsell: 'Upsell' }

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
}

/** "Campo: nuovo valore" for every field the edit changes. */
function cambi(input: Input, esclusi: string[]): string[] {
  return Object.entries(input)
    .filter(([campo, valore]) => !esclusi.includes(campo) && valore !== undefined && valore !== null && valore !== '')
    .map(([campo, valore]) => {
      const etichetta = ETICHETTA_CAMBIO[campo] ?? campo
      if (typeof valore === 'number' && ['valore', 'importo'].includes(campo)) return `${etichetta}: ${formatEuro(valore)}`
      if (typeof valore === 'boolean') return `${etichetta}: ${valore ? 'sì' : 'no'}`
      if (typeof valore === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valore)) return `${etichetta}: ${formatData(valore)}`
      return `${etichetta}: ${String(valore)}`
    })
}
