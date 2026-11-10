import { bilingue } from '@/lib/i18n/lingua'

/**
 * «Link mandati, call non prenotate» in Oggi (1.75.0): the leads that got the
 * Calendly in the DMs and did not book, from the latest Insight recap. The
 * messages are Claude's and stay Italian.
 */
export const CALENDLY = bilingue(
  {
    titolo: 'Calendly mandato, call non prenotata',
    descrizione:
      'Dall’ultimo recap dell’Insight: chi ha ricevuto il link e non ha prenotato. Scrivigli il follow-up e spunta «Fatto»: la spunta è la stessa dell’Insight.',
    da: (giorno: string) => `Recap del ${giorno}`,
    giorni: (n: number | null) =>
      n === null ? 'Link mandato prima degli ultimi messaggi' : n === 0 ? 'Link mandato oggi' : n === 1 ? 'Link mandato ieri' : `Link mandato ${n} giorni fa`,
    haRisposto: 'Ha risposto dopo il link',
    messaggio: 'Follow-up suggerito',
    alternativa: 'Alternativa',
    nienteDaScrivere: 'L’Insight dice di non scrivere adesso: aspetta la sua risposta.',
    copia: (chi: string) => `Copia il follow-up per ${chi}`,
    copiaAlternativa: (chi: string) => `Copia l’alternativa per ${chi}`,
    apriChat: 'Apri la chat',
    apriChatDi: (chi: string) => `Apri la chat con ${chi}`,
    apriInbox: 'Apri la inbox Messenger',
    fatti: (n: number) => (n === 1 ? '1 fatto' : `${n} fatti`),
    altri: (n: number) => `E altri ${n}: li trovi nell’Insight.`,
    apriInsight: 'Apri l’Insight',
    canali: { instagram: 'Instagram', messenger: 'Messenger' },
    errore: 'La lista dei Calendly non si è caricata: aprila dall’Insight.',
  },
  {
    titolo: 'Calendly sent, call not booked',
    descrizione:
      'From the latest Insight recap: who got the link and did not book. Write them the follow-up and tick «Done»: it is the same tick as in the Insight.',
    da: (giorno: string) => `Recap of ${giorno}`,
    giorni: (n: number | null) =>
      n === null ? 'Link sent before the latest messages' : n === 0 ? 'Link sent today' : n === 1 ? 'Link sent yesterday' : `Link sent ${n} days ago`,
    haRisposto: 'Replied after the link',
    messaggio: 'Suggested follow-up',
    alternativa: 'Alternative',
    nienteDaScrivere: 'The Insight says not to write now: wait for their reply.',
    copia: (chi: string) => `Copy the follow-up for ${chi}`,
    copiaAlternativa: (chi: string) => `Copy the alternative for ${chi}`,
    apriChat: 'Open the chat',
    apriChatDi: (chi: string) => `Open the chat with ${chi}`,
    apriInbox: 'Open the Messenger inbox',
    fatti: (n: number) => (n === 1 ? '1 done' : `${n} done`),
    altri: (n: number) => `And ${n} more: you find them in the Insight.`,
    apriInsight: 'Open the Insight',
    canali: { instagram: 'Instagram', messenger: 'Messenger' },
    errore: 'The Calendly list did not load: open it from the Insight.',
  },
)
