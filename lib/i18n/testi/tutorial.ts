import { bilingue } from '@/lib/i18n/lingua'

/**
 * The frame of the guided tour (1.53.0), and the business coach's six steps in English
 * (he is the one who reads the app in English first). The other roles' tours stay Italian.
 */
export const TUTORIAL = bilingue(
  {
    chiudi: 'Chiudi il tutorial',
    anteprima: 'Anteprima: sul tuo account questo elemento non c’è, chi ha questo ruolo lo vede evidenziato.',
    indietro: 'Indietro',
    tocca: 'Tocca il pulsante evidenziato',
    fine: 'Fine',
    avanti: 'Avanti',
    testa: 'Testa il tutorial',
    tutorialDi: 'Tutorial di…',
    businessCoach: {
      benvenuto: 'Benvenuto in Alpha Management',
      benvenutoTesto:
        'Vedi tutto quello che vede l’admin, in sola lettura: numeri, call, clienti, setter, contenuti e progetti. Niente si modifica dal tuo account. Puoi rivedere questo tour quando vuoi dal tuo profilo.',
      panoramica: 'Panoramica',
      panoramicaTesto:
        'Il mese in un colpo d’occhio: cash incassato e quanto viene da nuovi clienti, rate di clienti già entrati o rinnovi, margine operativo, obiettivi e chi deve pagare.',
      setter: 'Setter',
      setterTesto: 'I numeri del setting giorno per giorno e, nella scheda «Insight 24h», il recap dei DM.',
      closer: 'Closer',
      closerTesto: 'I numeri del closer giorno per giorno: call, show rate, chiuse, cash e revenue dei clienti nuovi.',
      alfire: 'Alfire, la nostra AI',
      alfireTesto: 'Chiedile i numeri, anche col vocale: legge quello che leggi tu, e non scrive niente.',
      profilo: 'Il tuo profilo',
      profiloTesto: 'Tocca la tua foto per cambiarla, correggere il nome, rivedere questo tour o uscire.',
    },
  },
  {
    chiudi: 'Close the tutorial',
    anteprima: 'Preview: this element is not on your account; whoever has this role sees it highlighted.',
    indietro: 'Back',
    tocca: 'Tap the highlighted button',
    fine: 'Done',
    avanti: 'Next',
    testa: 'Try the tutorial',
    tutorialDi: 'Tutorial of…',
    businessCoach: {
      benvenuto: 'Welcome to Alpha Management',
      benvenutoTesto:
        'You see everything the admin sees, read only: numbers, calls, clients, setters, content and projects. Nothing can be changed from your account. You can replay this tour from your profile whenever you want. The flag at the top switches between English and Italian.',
      panoramica: 'Overview',
      panoramicaTesto:
        'The month at a glance: cash collected and how much comes from new clients, instalments of earlier clients or renewals, operating margin, targets and who has to pay.',
      setter: 'Setter',
      setterTesto: 'The setting numbers day by day and, in the «Insight 24h» tab, the recap of the DMs (written in Italian).',
      closer: 'Closer',
      closerTesto: 'The closer’s numbers day by day: calls, show rate, closed, cash and revenue of the new clients.',
      alfire: 'Alfire, our AI',
      alfireTesto: 'Ask it for the numbers, by voice too: it reads what you read and writes nothing.',
      profilo: 'Your profile',
      profiloTesto: 'Tap your photo to change it, fix your name, replay this tour, choose the language or sign out.',
    },
  },
)
