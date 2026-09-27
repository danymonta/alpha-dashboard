import { formatData, formatEuro } from '@/lib/format'
import type { NomeScrittura } from '@/lib/alfire/permessi'

/**
 * What Alfire is about to do, in one sentence plus details, for the
 * confirmation card. Built from the tool input the model produced: the user
 * reads exactly what will be written.
 */
export type Riassunto = { titolo: string; dettagli: string[] }

type Input = Record<string, unknown>

const ETICHETTA_CAMPO_REPORT: Record<string, string> = {
  dm_outbound: 'DM outbound',
  dm_inbound: 'DM inbound',
  conversazioni: 'conversazioni',
  call_proposte: 'call proposte',
  discovery_prenotate: 'discovery prenotate',
  discovery_svolte: 'discovery svolte',
  call_qualificate: 'call qualificate',
  strategy_prenotate: 'strategy prenotate',
  follow_up: 'follow-up',
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
      return {
        titolo: `Fisso una call ${testo(input.tipo) ?? ''} con ${testo(input.nome) ?? 'il lead'}`.replace('  ', ' '),
        dettagli: [
          `${giorno(input.data)} alle ${testo(input.ora) ?? '?'}`,
          testo(input.instagram_handle) && `Instagram ${input.instagram_handle}`,
          testo(input.fonte) && `Fonte: ${String(input.fonte).replace('_', ' ')}`,
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
    case 'aggiungi_task':
      return {
        titolo: `Aggiungo il task «${testo(input.titolo) ?? ''}»`,
        dettagli: [`Progetto: ${testo(input.progetto) ?? '?'}`],
      }
  }
}
