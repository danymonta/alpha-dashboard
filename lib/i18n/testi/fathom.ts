import { bilingue } from '@/lib/i18n/lingua'

/**
 * Impostazioni › Fathom (1.37.0) and the Fathom key of Chiavi e collegamenti, in the two
 * languages. Fathom's own menu names (My Settings › API Access) stay as Fathom writes them.
 */
export const FATHOM = bilingue(
  {
    pagina: {
      errore: 'Impossibile caricare il collegamento di Fathom',
      erroreDescrizione: 'Non siamo riusciti a caricare il collegamento di Fathom. Riprova fra un momento.',
      titolo: 'Fathom',
      descrizione:
        'Le registrazioni delle call e l’analisi di Claude: lo stato del collegamento, l’interruttore delle analisi e il limite di spesa. La chiave si incolla in Chiavi e collegamenti.',
      collegamento: 'Collegamento',
      collegato: (data: string | null) => `Fathom è collegato${data ? `: chiave salvata il ${data}` : ''}.`,
      nonCollegato:
        'Non collegato: senza la chiave l’app non trova le registrazioni. Il link incollato nel foglio dell’esito si salva lo stesso.',
      incollaChiave: 'Incolla o rigenera la chiave in Chiavi e collegamenti',
      conGuida: ', con la guida passo passo.',
      nota:
        'L’app legge da Fathom solo la registrazione che corrisponde al link incollato dal closer, e la trascrizione quando la apri o quando Claude analizza la call. Trascrizioni e riassunti non si conservano.',
      analisi: 'Analisi di Claude',
      senzaClaude:
        'Claude non è collegato: manca ANTHROPIC_API_KEY su Vercel. Le analisi aspettano in coda. Come rimetterla:',
      chiaviECollegamenti: 'Chiavi e collegamenti',
      costo: (costo: string, limite: string) => `Costo del mese: ${costo} su ${limite}`,
      analisiMese: (n: number) => ` · analisi del mese: ${n}`,
      spuntiMese: (n: number) => ` · spunti: ${n}`,
      inCoda: (n: number) => ` · in coda: ${n}`,
      limiteRaggiunto: 'Limite di spesa raggiunto: l’analisi riparte il 1° del mese, o alzando il limite.',
      ultimoProblema: (testo: string) => `Ultimo problema: ${testo}`,
      notaAnalisi:
        'Claude analizza tutte le call registrate: il lead rispetto al cliente ideale, le obiezioni, le domande, il motivo di non chiusura da usare con un tocco e la performance proposta. Niente salute e niente cifre nell’analisi. Lo dice anche l’informativa privacy.',
    },
    chiave: {
      incolla: 'Incolla la chiave copiata da Fathom.',
      salvataRisponde: 'Chiave salvata: Fathom risponde.',
      salvata: 'Chiave salvata.',
      tolta: 'Chiave tolta.',
      salvataIl: (data: string | null) => (data ? `Chiave salvata il ${data}` : 'Chiave salvata'),
      risponde: 'Fathom risponde con questa chiave.',
      nuova: 'Chiave nuova',
      api: 'Chiave API',
      sostituisci: 'Incolla qui per sostituirla',
      incollaQui: 'Incolla qui la chiave',
      aiuto: 'Fathom › Impostazioni › API Access › Genera. Non incollarla in chat.',
      salva: 'Salva la chiave',
      conferma: 'Tocca ancora: la ricerca delle registrazioni e l’analisi delle call nuove si fermano',
      togli: 'Togli la chiave',
    },
    analisi: {
      interruttore: (titolo: string, acceso: boolean) => `${titolo}: ${acceso ? 'accese' : 'spente'}`,
      titolo: 'Analisi delle call',
      descrizione:
        'Claude analizza ogni call registrata (svolta, con l’esito e il link di Fathom) pochi minuti dopo l’esito. Spente, partono solo con «Analizza».',
      limiteNonValido: 'Scegli un limite tra 0 e 200 $.',
      limiteSalvato: (limite: string) => `Limite di spesa: ${limite} al mese`,
      limite: 'Limite di spesa al mese ($)',
      salvaLimite: 'Salva il limite',
    },
  },
  {
    pagina: {
      errore: 'The Fathom connection could not be loaded',
      erroreDescrizione: 'We could not load the Fathom connection. Try again in a moment.',
      titolo: 'Fathom',
      descrizione:
        'The call recordings and Claude’s analysis: the state of the connection, the analyses’ switch and the spending limit. The key is pasted in Keys and connections.',
      collegamento: 'Connection',
      collegato: (data: string | null) => `Fathom is connected${data ? `: key saved on ${data}` : ''}.`,
      nonCollegato:
        'Not connected: without the key the app cannot find the recordings. The link pasted in the outcome sheet is saved all the same.',
      incollaChiave: 'Paste or renew the key in Keys and connections',
      conGuida: ', with the step-by-step guide.',
      nota:
        'The app reads from Fathom only the recording that matches the link the closer pasted, and the transcript when you open it or when Claude analyses the call. Transcripts and summaries are not kept.',
      analisi: 'Claude’s analysis',
      senzaClaude:
        'Claude is not connected: ANTHROPIC_API_KEY is missing on Vercel. The analyses wait in the queue. How to put it back:',
      chiaviECollegamenti: 'Keys and connections',
      costo: (costo: string, limite: string) => `Cost this month: ${costo} of ${limite}`,
      analisiMese: (n: number) => ` · analyses this month: ${n}`,
      spuntiMese: (n: number) => ` · ideas: ${n}`,
      inCoda: (n: number) => ` · in the queue: ${n}`,
      limiteRaggiunto: 'Spending limit reached: the analysis starts again on the 1st of the month, or by raising the limit.',
      ultimoProblema: (testo: string) => `Last problem: ${testo}`,
      notaAnalisi:
        'Claude analyses every recorded call: the lead against the ideal client, the objections, the questions, the reason for not closing to use with one tap and the proposed performance. No health and no figures in the analysis. The privacy notice says so too.',
    },
    chiave: {
      incolla: 'Paste the key copied from Fathom.',
      salvataRisponde: 'Key saved: Fathom answers.',
      salvata: 'Key saved.',
      tolta: 'Key removed.',
      salvataIl: (data: string | null) => (data ? `Key saved on ${data}` : 'Key saved'),
      risponde: 'Fathom answers with this key.',
      nuova: 'New key',
      api: 'API key',
      sostituisci: 'Paste here to replace it',
      incollaQui: 'Paste the key here',
      aiuto: 'Fathom › My Settings › API Access › Generate. Do not paste it in a chat.',
      salva: 'Save the key',
      conferma: 'Tap again: the search for recordings and the analysis of new calls stop',
      togli: 'Remove the key',
    },
    analisi: {
      interruttore: (titolo: string, acceso: boolean) => `${titolo}: ${acceso ? 'on' : 'off'}`,
      titolo: 'Call analysis',
      descrizione:
        'Claude analyses every recorded call (done, with the outcome and the Fathom link) a few minutes after the outcome. Off, they start only with «Analizza».',
      limiteNonValido: 'Choose a limit between $0 and $200.',
      limiteSalvato: (limite: string) => `Spending limit: ${limite} a month`,
      limite: 'Monthly spending limit ($)',
      salvaLimite: 'Save the limit',
    },
  },
)
