import { bilingue } from '@/lib/i18n/lingua'

/** «Le mie vendite», the closer's page (1.62.0: in English too). */
export const MIE_VENDITE = bilingue(
  {
    titolo: 'Le mie vendite',
    descrizione:
      'Le vendite dove sei il closer: nuovi clienti, rinnovi e upsell (il tipo è su ogni riga). Apri una vendita per segnare una rata incassata.',
    vuoto: 'Ancora nessuna vendita',
    vuotoDescrizione: 'Quando registri l’esito «Chiusa» di una call, la vendita compare qui con il suo piano rate.',
    vaiCall: 'Vai alle mie call',
    aperte: (n: number) => `Con rate da incassare (${n})`,
    saldate: 'Saldate',
    caricamento: 'Caricamento delle vendite',
  },
  {
    titolo: 'My sales',
    descrizione:
      'The sales where you are the closer: new clients, renewals and upsells (the type is on each row). Open a sale to mark an instalment as cashed.',
    vuoto: 'No sales yet',
    vuotoDescrizione: 'When you record a call as «Closed», the sale shows up here with its payment plan.',
    vaiCall: 'Go to my calls',
    aperte: (n: number) => `With instalments to collect (${n})`,
    saldate: 'Paid in full',
    caricamento: 'Loading the sales',
  },
)
