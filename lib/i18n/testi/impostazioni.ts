import { bilingue } from '@/lib/i18n/lingua'

/**
 * Impostazioni (1.53.0): the index and the four pages the business coach opens (Team, Prodotti,
 * Regole provvigioni, Registro modifiche), in what is read. The sheets that write stay Italian
 * for now.
 */
export const IMPOSTAZIONI = bilingue(
  {
    titolo: 'Impostazioni',
    soloLettura: 'In sola lettura: le cambia l’admin.',
    changelog: 'il changelog: cosa cambia a ogni aggiornamento, per te e per il team.',
    gruppi: {
      team: 'Team e accessi',
      prodotti: 'Prodotti e provvigioni',
      chiavi: 'Chiavi e collegamenti',
      esporta: 'Esporta e backup',
      progetti: 'Progetti',
    },
    sezioni: {
      team: ['Team', 'Inviti, ruoli, attivazione degli account.'],
      products: ['Prodotti', 'Percorsi in vendita, durata e prezzo di listino.'],
      commissions: ['Regole provvigioni', 'Percentuale e tipi di vendita per collaboratore.'],
      chiavi: ['Chiavi e guide', 'Instagram, Messenger, Fathom, Claude e Groq: se funzionano, quando scadono, come rigenerarle.'],
      instagram: [
        'Instagram e Messenger',
        'I DM che precompilano il report del setter e preparano l’Insight: chi li lavora, chat escluse, analisi dei reel.',
      ],
      fathom: ['Fathom', 'Le registrazioni delle call e l’analisi di Claude: interruttori e limite di spesa.'],
      export: ['Esporta CSV', 'Vendite, incassi e costi del mese per la commercialista.'],
      audit: ['Registro modifiche', 'Chi ha cambiato un importo, un ruolo o una regola, e quando.'],
      progetti: ['Progetti', 'Reparti e modelli con cui nascono i progetti.'],
    },
    // Team
    team: {
      errore: 'Impossibile caricare il team',
      descrizione: 'Accesso solo su invito. Chi è disattivato non entra più e non vede nessun dato.',
      membri: (n: number) => `Membri (${n})`,
      seiTu: ' · sei tu',
      disattivato: ' · disattivato',
      nota:
        'Il tuo account non si disattiva e non perde il ruolo admin: lo impedisce il database. Il livello progetti vale solo nell’area Progetti; l’admin dell’app ne è sempre admin.',
      inviti: (n: number) => `Inviti in attesa (${n})`,
      nessunInvito: 'Nessun invito in attesa. Chi riceve un invito compare tra i membri al primo accesso.',
      invitatoIl: (ruolo: string, data: string) => `${ruolo} · invitato il ${data}`,
    },
    // Prodotti
    prodotti: {
      errore: 'Impossibile caricare i prodotti',
      descrizione:
        'Il piano abituale si propone nella nuova vendita e resta modificabile. Fuori vendita: sparisce dal modulo ma resta nelle vendite passate. Eliminato: le vendite passate ne tengono il nome.',
      vuoto: 'Nessun prodotto',
      vuotoDescrizione: 'Crea il primo percorso in vendita, ad esempio «Percorso Alpha 3 mesi».',
      mesi: (n: number) => (n === 1 ? '1 mese' : `${n} mesi`),
      poi: ' poi ',
      rateUguali: ' · rate uguali',
      inVendita: 'In vendita',
      fuoriVendita: 'Fuori vendita',
    },
    // Regole provvigioni
    regole: {
      errore: 'Impossibile caricare le regole',
      descrizione: 'La provvigione matura sull’incasso con la regola valida quel giorno. Una nuova regola non riscrive il passato.',
      vuoto: 'Nessuna regola',
      vuotoDescrizione:
        'Senza una regola non matura nessuna provvigione. Crea quella del setter, ad esempio 5% sulle vendite nuove.',
      futura: 'Futura',
      chiusa: 'Chiusa',
      inVigore: 'In vigore',
      sullIncassato: (tipi: string, dal: string, al: string | null) =>
        `Sull’incassato di: ${tipi} · dal ${dal}${al ? ` al ${al}` : ''}`,
    },
    // Registro modifiche
    registro: {
      errore: 'Impossibile caricare il registro',
      descrizione: 'Chi ha cambiato un importo, un ruolo o una regola, e quando. Le ultime 100 voci.',
      filtra: 'Filtra per tipo',
      tutto: 'Tutto',
      vuoto: 'Nessuna modifica registrata',
      vuotoDescrizione: 'Le modifiche a vendite, rate, costi, provvigioni e utenti compaiono qui.',
      oggi: (data: string) => `Oggi · ${data}`,
      ieri: (data: string) => `Ieri · ${data}`,
      piano: (creato: boolean, n: number) => `Piano rate ${creato ? 'creato' : 'eliminato'} · ${n} rate`,
      apri: 'Apri',
      apriDi: (etichetta: string, cliente: string) => `${etichetta} di ${cliente}`,
      sistema: 'sistema',
      leRate: 'Le rate',
      tuttiCampi: 'Tutti i campi',
    },
  },
  {
    titolo: 'Settings',
    soloLettura: 'Read only: the admin changes them.',
    changelog: 'the changelog: what changes with every update, for you and for the team.',
    gruppi: {
      team: 'Team and access',
      prodotti: 'Products and commissions',
      chiavi: 'Keys and connections',
      esporta: 'Export and backup',
      progetti: 'Projects',
    },
    sezioni: {
      team: ['Team', 'Invites, roles, account activation.'],
      products: ['Products', 'Programmes on sale, length and list price.'],
      commissions: ['Commission rules', 'Percentage and sale types for each team member.'],
      chiavi: ['Keys and guides', 'Instagram, Messenger, Fathom, Claude and Groq: whether they work, when they expire, how to renew them.'],
      instagram: [
        'Instagram and Messenger',
        'The DMs that prefill the setter’s report and prepare the Insight: who works them, excluded chats, reel analysis.',
      ],
      fathom: ['Fathom', 'The call recordings and Claude’s analysis: switches and spending limit.'],
      export: ['Export CSV', 'Sales, payments and expenses of the month for the accountant.'],
      audit: ['Change log', 'Who changed an amount, a role or a rule, and when.'],
      progetti: ['Projects', 'Departments and templates projects are born with.'],
    },
    team: {
      errore: 'The team could not be loaded',
      descrizione: 'Access by invitation only. A disabled account cannot sign in and sees no data.',
      membri: (n: number) => `Members (${n})`,
      seiTu: ' · you',
      disattivato: ' · disabled',
      nota:
        'Your account cannot be disabled or lose the admin role: the database prevents it. The projects level applies only in the Projects area; the app’s admin is always its admin.',
      inviti: (n: number) => `Pending invites (${n})`,
      nessunInvito: 'No pending invites. Whoever receives an invite appears among the members at the first sign-in.',
      invitatoIl: (ruolo: string, data: string) => `${ruolo} · invited on ${data}`,
    },
    prodotti: {
      errore: 'The products could not be loaded',
      descrizione:
        'The usual plan is proposed in a new sale and stays editable. Off sale: it leaves the form but stays in past sales. Deleted: past sales keep its name.',
      vuoto: 'No products',
      vuotoDescrizione: 'Create the first programme on sale, for example «Percorso Alpha 3 mesi».',
      mesi: (n: number) => (n === 1 ? '1 month' : `${n} months`),
      poi: ' then ',
      rateUguali: ' · equal instalments',
      inVendita: 'On sale',
      fuoriVendita: 'Off sale',
    },
    regole: {
      errore: 'The rules could not be loaded',
      descrizione: 'The commission accrues on payment with the rule valid that day. A new rule does not rewrite the past.',
      vuoto: 'No rules',
      vuotoDescrizione: 'Without a rule no commission accrues. Create the setter’s, for example 5% on new sales.',
      futura: 'Future',
      chiusa: 'Closed',
      inVigore: 'In force',
      sullIncassato: (tipi: string, dal: string, al: string | null) =>
        `On the payments of: ${tipi} · from ${dal}${al ? ` to ${al}` : ''}`,
    },
    registro: {
      errore: 'The change log could not be loaded',
      descrizione: 'Who changed an amount, a role or a rule, and when. The latest 100 entries.',
      filtra: 'Filter by type',
      tutto: 'All',
      vuoto: 'No changes recorded',
      vuotoDescrizione: 'Changes to sales, instalments, expenses, commissions and users appear here.',
      oggi: (data: string) => `Today · ${data}`,
      ieri: (data: string) => `Yesterday · ${data}`,
      piano: (creato: boolean, n: number) => `Instalment plan ${creato ? 'created' : 'deleted'} · ${n} instalments`,
      apri: 'Open',
      apriDi: (etichetta: string, cliente: string) => `${etichetta} of ${cliente}`,
      sistema: 'system',
      leRate: 'The instalments',
      tuttiCampi: 'All the fields',
    },
  },
)

