import { bilingue } from '@/lib/i18n/lingua'

/**
 * «Dalle call» (Marketing, admin only) and the Panoramica's «Di cosa parlare
 * oggi» and money eye (Dany, 27/10/2026). What Claude wrote in the call
 * analyses, the DM recap and the Spunti stays Italian (lang="it").
 */
export const DALLE_CALL = bilingue(
  {
    titolo: 'Dalle call',
    descrizione:
      'Le obiezioni delle call di vendita diventano topic per stories e contenuti. Claude analizza da solo ogni call registrata: qui si leggono le sue analisi, senza costi in più.',
    periodo: 'Periodo',
    giorni: (n: number) => `Ultimi ${n} giorni`,
    riepilogo: (analizzate: number, svolte: number) =>
      `${analizzate} ${analizzate === 1 ? 'call analizzata' : 'call analizzate'} su ${svolte} ${svolte === 1 ? 'svolta' : 'svolte'}.`,
    callCon: (n: number | null) => (n === null ? 'Dalle analisi' : `${n} ${n === 1 ? 'call non chiusa' : 'call non chiuse'}`),
    topic: 'Topic per le stories',
    cosaDicono: 'Cosa dicono i lead',
    comeRispondere: 'Come è stata gestita bene',
    ideeClaude: 'Idee di Claude dalle stesse call',
    perche: 'Perché',
    vuoto: 'Nessuna obiezione nel periodo',
    vuotoDescrizione:
      'Le obiezioni arrivano dalle call registrate con Fathom e analizzate da Claude. Collega il link di Fathom quando registri l’esito di una call.',
    vaiCall: 'Vai a Le mie call',
    errore: 'Le analisi delle call non si sono caricate.',
    inItaliano: 'I testi delle analisi sono di Claude, in italiano.',
    caricamento: 'Carico i topic dalle call…',
  },
  {
    titolo: 'From calls',
    descrizione:
      'The objections of the sales calls become topics for stories and content. Claude analyses every recorded call by itself: here you read its analyses, at no extra cost.',
    periodo: 'Period',
    giorni: (n: number) => `Last ${n} days`,
    riepilogo: (analizzate: number, svolte: number) =>
      `${analizzate} ${analizzate === 1 ? 'call analysed' : 'calls analysed'} out of ${svolte} held.`,
    callCon: (n: number | null) => (n === null ? 'From the analyses' : `${n} ${n === 1 ? 'call not closed' : 'calls not closed'}`),
    topic: 'Topic for the stories',
    cosaDicono: 'What the leads say',
    comeRispondere: 'How it was handled well',
    ideeClaude: 'Claude’s ideas from the same calls',
    perche: 'Why',
    vuoto: 'No objections in the period',
    vuotoDescrizione:
      'Objections come from the calls recorded with Fathom and analysed by Claude. Link the Fathom recording when you log a call’s outcome.',
    vaiCall: 'Go to My calls',
    errore: 'The call analyses did not load.',
    inItaliano: 'The analyses are written by Claude, in Italian.',
    caricamento: 'Loading the topics from calls…',
  },
)

export const STORIES_OGGI = bilingue(
  {
    titolo: 'Di cosa parlare oggi',
    descrizione: 'Gli spunti macro per stories e contenuti, da DM, call e Spunti.',
    dalleChat: 'Dai DM delle ultime 24 ore',
    dalleCall: 'Dalle obiezioni in call (ultimi 14 giorni)',
    dagliSpunti: 'Dagli ultimi Spunti',
    temaDm: (n: number) => `${n} chat`,
    obiezioneCall: (n: number) => `${n} call`,
    tuttiTopic: 'Tutti i topic dalle call',
    apriSpunti: 'Apri gli Spunti',
    apriInsight: 'Apri l’Insight',
    vuoto: 'Ancora niente: arriva col prossimo recap dei DM, con le call analizzate o chiedendo gli Spunti.',
    nonCaricati: 'Gli spunti di oggi non si sono caricati: riprova più tardi.',
  },
  {
    titolo: 'What to talk about today',
    descrizione: 'The macro ideas for stories and content, from DMs, calls and Ideas.',
    dalleChat: 'From the DMs of the last 24 hours',
    dalleCall: 'From the objections in calls (last 14 days)',
    dagliSpunti: 'From the latest Ideas',
    temaDm: (n: number) => `${n} ${n === 1 ? 'chat' : 'chats'}`,
    obiezioneCall: (n: number) => `${n} ${n === 1 ? 'call' : 'calls'}`,
    tuttiTopic: 'All the topics from calls',
    apriSpunti: 'Open Ideas',
    apriInsight: 'Open the Insight',
    vuoto: 'Nothing yet: it arrives with the next DM recap, with analysed calls or by asking for Ideas.',
    nonCaricati: 'Today’s ideas did not load: try again later.',
  },
)

export const OCCHIO_SOLDI = bilingue(
  {
    nascondi: 'Nascondi i soldi',
    mostra: 'Mostra i soldi',
    nascosti: 'I numeri dei soldi sono nascosti su questo dispositivo.',
  },
  {
    nascondi: 'Hide the money',
    mostra: 'Show the money',
    nascosti: 'The money numbers are hidden on this device.',
  },
)
