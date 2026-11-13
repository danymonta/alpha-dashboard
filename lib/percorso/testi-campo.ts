/**
 * The words of the client's home base (1.83.0): Italian only, like the whole area of the client
 * (CLAUDE.md section 32). The team's words are in lib/i18n/testi/campo-base.ts.
 */
export const TESTI_CAMPO = {
  copertinaSopra: 'La tua',
  copertinaSotto: 'dashboard',
  sezioni: 'Le sezioni del tuo campo base',
  schede: {
    percorso: 'Percorso',
    home: 'Home',
    aula: 'Aula',
    call: 'Le mie call',
    regole: 'Regole',
    community: 'Community',
  },
  titoli: {
    home: 'Il tuo campo base',
    aula: 'Aula',
    call: 'Le mie call',
    regole: 'Le regole del percorso',
    community: 'Community',
  },
  sottotitoli: {
    home: 'Tutto quello che ti serve, in un posto solo.',
    aula: 'Le guide e i moduli del percorso. Vai al tuo ritmo: il tuo avanzamento si salva da solo.',
    call: 'Lo storico delle tue call con il coach: di cosa avete parlato e cosa fare entro la prossima.',
    regole: 'Come lavoriamo insieme. Rileggile quando vuoi.',
    community: 'Gli altri allievi e il tuo gruppo privato, su Telegram.',
  },
  // Home
  compitiRicorrenti: 'I tuoi compiti ricorrenti',
  coachRiferimento: 'Coach di riferimento',
  prossimaCall: 'La prossima call',
  prossimaCallTipo: { onboarding: 'Call di onboarding', checkpoint: 'Checkup con il coach' },
  alle: (giorno: string, ora: string) => `${giorno} alle ${ora}`,
  entraCall: 'Entra nella call',
  nessunaCall: 'Nessuna call in calendario: il link per prenotare il checkup arriva su Telegram.',
  continuaAula: 'Riprendi dall’Aula',
  continuaLezione: (lezione: string) => `Prossima lezione: ${lezione}`,
  vaiAula: 'Apri l’Aula',
  // Aula
  aulaVuota: 'L’Aula si sta riempiendo: le prime guide arrivano a breve.',
  completato: (p: number) => `${p}%`,
  progressoModulo: (completate: number, totali: number) =>
    totali === 0 ? 'Nessuna lezione ancora' : `${completate} di ${totali} ${totali === 1 ? 'lezione' : 'lezioni'}`,
  prossimamente: 'Prossimamente',
  bloccato: 'Corso privato',
  dopoLancio: 'Si apre dopo il lancio',
  apriModulo: (titolo: string) => `Apri il modulo ${titolo}`,
  moduloChiuso: (titolo: string, perche: string) => `${titolo}: ${perche}`,
  tornaAula: 'Torna all’Aula',
  lezioni: 'Le lezioni',
  lezioneFatta: 'Completata',
  lezioneObbligatoria: 'Obbligatoria',
  nessunaLezione: 'Questo modulo non ha ancora lezioni.',
  segnaCompletata: 'Segna come completata',
  completataIl: (giorno: string) => `Completata il ${giorno}`,
  lezioneSuccessiva: 'Lezione successiva',
  apriPdf: 'Apri il PDF',
  apriLink: 'Apri il link',
  videoAl90: 'Il video si segna completato quando lo guardi almeno fino al 90%.',
  lezioneCompletata: 'Lezione completata',
  tipoLezione: { video: 'Video', testo: 'Lettura', pdf: 'PDF', link: 'Link' },
  // Call
  callVuote: 'Qui trovi lo storico delle tue call di checkup: dopo ogni call il coach scrive di cosa avete parlato e cosa fare entro la prossima.',
  compitiProssima: 'I tuoi compiti entro la prossima call',
  rivediFathom: 'Rivedi la call su Fathom',
  argomentoMancante: 'Call con il coach',
  // Regole
  regoleVuote: 'Le regole del percorso arrivano a breve.',
  regoleAccettate: 'Le regole che hai accettato',
  // Community
  entraCommunity: 'Entra nella community',
  gruppoPrivato: 'Apri il tuo gruppo privato',
  communityVuota: 'Il link della community te lo mandiamo su Telegram.',
  // states
  errore: 'Questa sezione non si è caricata. Riprova tra poco.',
  riprova: 'Riprova',
  anteprima: 'Anteprima: qui il cliente vede il suo percorso a tappe.',
} as const
