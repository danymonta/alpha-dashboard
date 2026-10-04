import { formatData, formatEuro } from '@/lib/format'

/**
 * WhatsApp links with the message already written (wa.me): the admin taps,
 * WhatsApp opens on the client's chat, the text is there to check and send.
 * Nothing is sent by the app.
 */

/** "+39 349 243 8115", "3492438115", "0039…" -> "393492438115"; null if it cannot be a number. */
export function numeroWhatsApp(telefono: string | null | undefined): string | null {
  if (!telefono) return null
  let cifre = telefono.replace(/[^\d+]/g, '')
  if (cifre.startsWith('+')) cifre = cifre.slice(1)
  else if (cifre.startsWith('00')) cifre = cifre.slice(2)
  // an Italian mobile written without the country code
  else if (/^3\d{8,9}$/.test(cifre)) cifre = `39${cifre}`
  cifre = cifre.replace(/\D/g, '')
  return cifre.length >= 8 && cifre.length <= 15 ? cifre : null
}

export function linkWhatsApp(telefono: string | null | undefined, testo: string): string | null {
  const numero = numeroWhatsApp(telefono)
  return numero ? `https://wa.me/${numero}?text=${encodeURIComponent(testo)}` : null
}

function nomeProprio(nome: string | null | undefined): string {
  return (nome ?? '').trim().split(/\s+/)[0] ?? ''
}

/** A friendly reminder of an instalment: before the due date, or after it. */
export function messaggioRata(r: {
  nome: string | null
  numero_rata: number
  importo: number
  scadenza: string
  oggi: string
}): string {
  const saluto = nomeProprio(r.nome) ? `Ciao ${nomeProprio(r.nome)}` : 'Ciao'
  const quanto = `la rata ${r.numero_rata} del tuo percorso Percorso Alpha (${formatEuro(r.importo)})`
  return r.scadenza < r.oggi
    ? `${saluto}, ti scrivo per ${quanto}, che era in scadenza il ${formatData(r.scadenza)}. Quando riesci, fammi sapere se hai già provveduto o se ti serve una mano. Grazie!`
    : `${saluto}, un promemoria per ${quanto}, in scadenza il ${formatData(r.scadenza)}. Grazie!`
}

/** The "call dei 3 mesi" (04/10/2026): how the path is going, to collect the client's feedback. */
export function messaggioFeedback(r: { nome: string | null }): string {
  const saluto = nomeProprio(r.nome) ? `Ciao ${nomeProprio(r.nome)}` : 'Ciao'
  return `${saluto}! Come sta andando il tuo percorso con Percorso Alpha? Mi farebbe piacere sentirci per una call: voglio sapere come ti stai trovando e raccogliere il tuo feedback. Quando ti va bene?`
}

/** The renewal conversation, opened a few weeks before the end. */
export function messaggioRinnovo(r: { nome: string | null; data_fine: string; oggi: string }): string {
  const saluto = nomeProprio(r.nome) ? `Ciao ${nomeProprio(r.nome)}` : 'Ciao'
  return r.data_fine < r.oggi
    ? `${saluto}! Il tuo percorso con Percorso Alpha si è chiuso il ${formatData(r.data_fine)}. Ti va di sentirci per capire come proseguire?`
    : `${saluto}! Il tuo percorso con Percorso Alpha finisce il ${formatData(r.data_fine)}. Ti va di sentirci per fare il punto e parlare di come proseguire?`
}
