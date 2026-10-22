import type { Canale, Fonte } from '@/lib/insight/canale'
import { formattaOraRecap, type OrigineRecap } from '@/lib/insight/recap'

/**
 * Every Italian word of the Insight page (1.35.0, CLAUDE.md section 29), like
 * lib/setting/commento.ts: a word is changed here. Wherever the artifact
 * "Recap DM Alpha" had words the page keeps them ("tutto paro come
 * l'artefatto"); the rest follows the app (typographic apostrophe, no dash).
 */

export const TITOLO_INSIGHT = 'Insight delle ultime 24h'

export const EYEBROW: Record<Canale, string> = {
  instagram: 'Percorso Alpha · Inbox Instagram',
  messenger: 'Percorso Alpha · Inbox Messenger',
  agenda: 'Percorso Alpha · Agenda call',
}

export const SCHEDE: Record<Canale, string> = { instagram: 'Instagram', messenger: 'Messenger', agenda: 'Agenda' }

/** «Aggiornato 08/10, 22:55 · ultime 24 ore» */
export function metaAggiornato(generatoIl: string, ore = 24): string {
  const quando = formattaOraRecap(generatoIl)
  const testo = quando ? quando.replace(' ', ', ') : ''
  return `${testo ? `Aggiornato ${testo} · ` : ''}ultime ${ore} ore`
}

export const META_NESSUN_RECAP = 'Nessun recap ancora'

/** The setter has no «Automazione»: the meta line says when the recap comes. */
export function metaAutomazione(attivo: boolean, ora: string): string {
  return attivo ? `recap automatico alle ${ora}` : 'recap automatico spento'
}

// ---------- «Giorno» ----------

export const GIORNO = { etichetta: 'Giorno', nessuno: 'nessun recap' } as const

const formatoGiorno = new Intl.DateTimeFormat('it-IT', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' })

/** «giovedì 8 ottobre», the artifact's option, from 'YYYY-MM-DD' (the same on the server and in the browser). */
export function etichettaGiornoRecap(giorno: string): string {
  const [a, m, g] = giorno.split('-').map(Number)
  if (!a || !m || !g) return giorno
  return formatoGiorno.format(new Date(Date.UTC(a, m - 1, g, 12)))
}

// ---------- «Aggiorna dati» (admin and, from 1.50.0, the setters) and the run ----------

export const AGGIORNA = {
  bottone: 'Aggiorna dati',
  avvio: 'Avvio…',
  inCorso: 'Aggiornamento in corso…',
  fatto: 'Dati aggiornati.',
  chiaveMancante: 'Insight spento: manca ANTHROPIC_API_KEY su Vercel.',
  tokenScaduto:
    'Token Instagram scaduto: generane uno nuovo dal pannello Meta e incollalo in Impostazioni › Chiavi e collegamenti.',
  apriImpostazioni: 'Apri Chiavi e collegamenti',
  connessione: 'Connessione assente. Riprova.',
  nonAvviato: 'Aggiornamento non avviato. Riprova.',
} as const

/**
 * The setter's words of «Aggiorna dati» (1.50.0, Dany, 22/10/2026: «No, anche
 * Loris deve poter aggiornare i dati!!!!»; CLAUDE.md sections 10 and 29):
 * never a cost, the name of a key or of a variable, the phase of the run or
 * the text of a technical error. The two sentences of insight_richiedi()
 * (FRASI_RICHIESTA) pass as written, to him as to the admin.
 */
export const AGGIORNA_SETTER = {
  /** his line while any run works, his or not */
  inCorso: 'Aggiornamento avviato: il recap arriva tra pochi minuti, puoi chiudere la pagina.',
  /** ANTHROPIC_API_KEY missing: the setter learns only that it is off */
  nonAttivo: 'L’Insight non è attivo: avvisa Dany.',
  /** every other failure: the address of the app, a run that failed, an error of the database */
  nonRiuscito: 'Aggiornamento non riuscito: riprova più tardi o avvisa Dany.',
} as const

/** The sentences insight_richiedi() raises with 22023 (20261027100000_insight_aggiorna_setter.sql). */
export const FRASI_RICHIESTA = {
  inCorso: 'Un aggiornamento è già in corso.',
  limite: 'Hai già aggiornato 8 volte oggi: riprova domani.',
} as const

/** 42501 of insight_richiedi(): the closer, the other roles, an account turned off while the page was open. */
export const SOLO_AGGIORNA = 'I dati dell’Insight li aggiornano l’admin e i setter.'

/**
 * The words of a refused insight_richiedi(). The admin reads the database's
 * sentence (22023 and 42501 are worded for people, messaggioErrore); the
 * setter reads only the two known sentences and the role's, else the generic one.
 */
export function erroreRichiesta(error: { code?: string; message: string }, admin: boolean): string {
  if (admin) {
    return error.code === '22023' || error.code === '42501' ? error.message : AGGIORNA.nonAvviato
  }
  if (error.code === '22023' && (Object.values(FRASI_RICHIESTA) as string[]).includes(error.message)) return error.message
  if (error.code === '42501') return SOLO_AGGIORNA
  return AGGIORNA_SETTER.nonRiuscito
}

export function fasePasso(passo: 'lettura' | 'analisi' | 'unione', fatti: number | null, totali: number | null): string {
  if (passo === 'analisi') {
    return totali ? `Claude analizza le chat (${fatti ?? 0}/${totali})` : 'Claude analizza le chat'
  }
  return passo === 'unione' ? 'preparo il recap' : 'leggo Instagram e Messenger'
}

export function rigaInCorso(minuti: number, fase: string): string {
  return `Aggiornamento avviato ${Math.max(1, minuti)} min fa: ${fase}. Il recap arriva da solo, puoi chiudere la pagina.`
}

export function rigaFallita(errore: string | null): string {
  const motivo = errore?.trim().replace(/[.\s]+$/, '')
  return `L’aggiornamento non è riuscito: ${motivo || 'riprova con Aggiorna dati'}.`
}

export function rigaPianificatore(ora: string | null): string {
  return `Il pianificatore non risponde${ora ? ` dalle ${ora}` : ''}: il recap automatico è fermo. Usa Aggiorna dati e avvisa chi gestisce l’app.`
}

// ---------- tabs ----------

export const CANALE_ARIA = 'Canale'
/** The agenda badge's words for a screen reader (the number is visible): « call oggi». */
export const BADGE_AGENDA = ' call oggi'

// ---------- the verdict and the partial recap ----------

export const VERDETTO = 'Verdetto della giornata'

export function parzialeSetter(fonte: Fonte): string {
  return fonte === 'messenger'
    ? 'Recap parziale: alcune chat non sono state analizzate, aprile dalla inbox Messenger.'
    : 'Recap parziale: alcune chat non sono state analizzate, aprile da Instagram.'
}
export const PARZIALE_ADMIN = 'Recap parziale'

export const RECAP_ILLEGGIBILE = 'Questo recap non si legge: scegli un altro giorno o aggiorna i dati.'

// ---------- the tiles ----------

export const NUMERI = {
  gruppo: 'Filtra le chat',
  suggerimento: 'Tocca un numero per filtrare le chat',
  suggerimentoAttivo: 'Tocca di nuovo il numero per togliere il filtro',
  mostraTutto: 'Mostra tutto',
  nessunaInCategoria: 'Nessuna chat in questa categoria.',
} as const

export function annuncioFiltro(titolo: string, n: number): string {
  return `Filtro: ${titolo}, ${n} chat.`
}
export const ANNUNCIO_FILTRO_TOLTO = 'Filtro tolto: tutte le chat.'

export function titoloNonLead(n: number): string {
  return `Non lead (${n})`
}

// ---------- leads and their cards ----------

export const LEADS = {
  titolo: 'Chat per priorità',
  vuoto: 'Nessuna chat con lead oggi.',
  eta: 'Età',
  situazione: 'Situazione',
  pain: 'Pain',
  prossimaMossa: 'Prossima mossa',
  serveDany: 'Serve Dany',
  pillServeDany: 'serve Dany',
  minore: 'minore sotto i 14 anni',
  analisiMancante: 'analisi non disponibile',
  mossaAnalisiMancante: 'Apri la chat: questa conversazione non è stata analizzata.',
  daRicontrollare: 'Da ricontrollare',
  senzaUsername: '@?',
  lead: 'Lead',
} as const

export function pillPriorita(p: string): string {
  return `priorità ${p}`
}

export function eyebrowMessaggio(conAlternativa: boolean): string {
  return conAlternativa ? 'Messaggio suggerito (se ha visualizzato)' : 'Messaggio suggerito'
}

export function eyebrowAlternativa(condizione: string): string {
  return `Messaggio suggerito (${condizione || 'alternativa'})`
}

export function contaFatte(fatte: number, totali: number): string {
  return `${fatte}/${totali} fatte`
}

// ---------- «Fatto» ----------

export const FATTO = {
  fatto: 'Fatto',
  daFare: 'Da fare',
  nonSalvato: 'Non salvato, riprova',
  solaLetturaTitolo: 'Sola lettura.',
  solaLettura: 'Con il tuo accesso le spunte Fatto non si salvano: chiedi a Dany.',
  realtimeGiu: 'Spunte degli altri non in tempo reale: ricarica la pagina per vederle.',
} as const

export function nomeFatto(chi: string): string {
  return `Fatto: ${chi}`
}

export function annuncioNonSalvato(chi: string): string {
  return `Non salvato: ${chi}, riprova.`
}

// ---------- copy ----------

export const COPIA = {
  copia: 'Copia',
  copiaChat: 'Copia chat',
  copiato: 'Copiato',
  nonRiuscita: 'Copia non riuscita',
  annuncioCopiato: 'Copiato negli appunti.',
  annuncioNonRiuscita: 'Copia non riuscita: tieni premuto sul testo per copiarlo.',
} as const

// ---------- the chat ----------

export const CHAT = {
  leggi: 'Leggi la chat',
  apriInstagram: 'Apri la chat su Instagram',
  apriMessenger: 'Apri la inbox Messenger',
  percorsoAlpha: 'Percorso Alpha',
} as const

export function quantiMessaggi(n: number): string {
  return `(${n} ${n === 1 ? 'messaggio' : 'messaggi'})`
}

// ---------- «Arriva da» (D26) ----------

const TIPO_POST: Record<NonNullable<OrigineRecap['tipo_post']>, string> = { reel: 'reel', post: 'post', carosello: 'carosello' }

/** «reel del 03/10», «post», from the origin. */
export function nomePostOrigine(origine: Pick<OrigineRecap, 'tipo_post' | 'data'>): string {
  const tipo = origine.tipo_post ? TIPO_POST[origine.tipo_post] : 'post'
  return origine.data ? `${tipo} del ${origine.data}` : tipo
}

/** How the lead came: «condiviso in DM», «parola chiave «ALPHA»», «risposta a una storia», «dal testo della chat». */
export function viaOrigine(origine: Pick<OrigineRecap, 'tipo' | 'parola'>): string {
  switch (origine.tipo) {
    case 'condivisione':
      return 'condiviso in DM'
    case 'parola_chiave':
      return origine.parola ? `parola chiave «${origine.parola}»` : 'parola chiave della didascalia'
    case 'storia':
      return 'risposta a una storia'
    default:
      return 'dal testo della chat'
  }
}

export const ARRIVA_DA = {
  storiaSenzaPost: 'Arriva da una risposta a una storia',
  apriPost: 'Apri il post',
  nelCalendario: 'Nel calendario',
} as const

export function arrivaDa(origine: Pick<OrigineRecap, 'tipo_post' | 'data' | 'hook'>): string {
  const hook = origine.hook?.trim()
  return `Arriva da: ${nomePostOrigine(origine)}${hook ? ` «${hook}»` : ''}`
}

// ---------- the other sections ----------

export const RIATTIVARE = 'Da riattivare'
export const OBIEZIONI = { titolo: 'Obiezioni aperte', risposta: 'Risposta suggerita' } as const

export const CONTENT = {
  titolo: 'Content',
  periodo: 'Analisi delle ultime 24 ore',
  tema: 'Tema emerso nei DM',
  chat: 'Chat',
  inTarget: 'In target',
  call: 'Call',
  cosaCiDice: 'Cosa ci dice',
  contenuto: 'Contenuto pubblicato',
  contenutoPredefinito: 'Contenuto',
  views: 'Views',
  salvati: 'Salvati',
  condivisioniBreve: 'Cond.',
  condivisioni: 'Condivisioni',
  dm: 'DM',
  verdetto: 'Verdetto',
  nd: 'n/d',
  mantieni: 'Mantieni',
  cambia: 'Cambia',
  potenzia: 'Potenzia',
  niente: 'Niente da segnalare.',
  neiDm: 'Nei DM funziona',
  idee: 'Idee contenuto',
} as const

export function periodoContent(periodo: string, basatoSu: number): string {
  return `${periodo || CONTENT.periodo}${basatoSu ? ` · ${basatoSu} chat analizzate` : ''}`
}

export function rigaStorie(dm: number, target: number): string {
  return `Risposte alle storie: ${dm} lead, ${target} in target.`
}

export function titoloEscluse(n: number): string {
  return `Escluse dal recap (${n})`
}

export function rigaEscluseImpostazioni(n: number): string {
  return n === 1
    ? '1 chat esclusa dalle impostazioni non è stata analizzata.'
    : `${n} chat escluse dalle impostazioni non sono state analizzate.`
}

export const GESTISCI_ESCLUSE = 'Gestisci le chat escluse'

export const AGENDA = {
  titolo: 'Agenda call',
  nessuna: 'Nessuna call in calendario per oggi e domani.',
  ieri: 'Call di ieri',
  ieriDescrizione: 'Chi si è presentato e chi no',
  promemoria: 'Promemoria',
  messaggio: 'Messaggio',
  meet: 'Meet',
  daVerificare: 'da verificare',
  vuotoTitolo: 'Nessuna call',
  vuotoDescrizione: 'Non ci sono call in calendario per oggi e domani in questo recap.',
} as const

// ---------- empty states ----------

export const DESCRIZIONE_NESSUN_RECAP =
  'Ogni giorno all’orario impostato Claude legge i DM delle ultime 24 ore e li riporta qui: lead in target da seguire, obiezioni aperte e indicazioni per i contenuti.'

export function titoloNessunRecap(canale: Canale): string {
  return canale === 'agenda' ? 'Nessun recap con agenda ancora' : `Nessun recap ${canale === 'messenger' ? 'Messenger' : 'Instagram'} ancora`
}

export const MESSENGER_NON_COLLEGATO = {
  titolo: 'Messenger non collegato',
  admin: 'Incolla il token della Pagina in Impostazioni › Chiavi e collegamenti: dal recap successivo trovi qui le chat Messenger.',
  setter: 'Lo collega Dany.',
} as const

export const ERRORE_PAGINA = {
  titolo: 'Il recap non si è caricato',
  descrizione: 'Non siamo riusciti a leggere i recap dei DM. Riprova fra un momento.',
} as const
