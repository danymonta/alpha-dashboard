import { bilingue, type Lingua } from '@/lib/i18n/lingua'

/**
 * Impostazioni (1.53.0): the index and the four pages the business coach opens (Team, Prodotti,
 * Regole provvigioni, Registro modifiche), in what is read. The sheets that write stay Italian
 * for now.
 */
export const IMPOSTAZIONI = bilingue(
  {
    titolo: 'Impostazioni',
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
      onboarding: ['Onboarding', 'Incarichi predefiniti, community e durata del link.'],
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
    // Prodotti: the sheet that creates and edits a product
    prodottoForm: {
      creato: 'Prodotto creato',
      aggiornato: 'Prodotto aggiornato',
      modifica: (nome: string) => `Modifica ${nome}`,
      nuovo: 'Nuovo prodotto',
      descrizione: 'Il prezzo di listino precompila il valore nelle nuove vendite.',
      nome: 'Nome',
      durata: 'Durata (mesi)',
      prezzo: 'Prezzo di listino',
      salva: 'Salva',
      elimina: 'Elimina il prodotto',
      eliminato: (nome: string) => `${nome} eliminato`,
      fuoriVenditaInvece: 'Se vuoi solo non offrirlo più, mettilo fuori vendita: resta nello storico.',
      importoOgniRata: 'Scrivi l’importo di ogni rata, ad esempio 500',
      pianoLegenda: 'Piano di pagamento abituale (facoltativo)',
      pianoAiuto:
        'Senza piano, in vendita si propongono rate mensili uguali. Con un piano, per esempio 3 rate da 500 € e poi 3 da 333,33 €, la nuova vendita parte da qui e resta modificabile.',
      ratePiano: 'Rate del piano abituale',
      mese: 'Mese',
      allaFirma: 'Alla firma',
      piuMesi: (m: number) => `+${m} ${m === 1 ? 'mese' : 'mesi'}`,
      importo: 'Importo',
      togliRata: (n: number) => `Togli la rata ${n} del piano`,
      quante: 'Quante',
      importoRata: 'Importo di ogni rata (€)',
      aggiungi: 'Aggiungi al piano',
      inVenditaDi: (nome: string) => `${nome} in vendita`,
      diNuovoInVendita: (nome: string) => `${nome} di nuovo in vendita`,
      messoFuoriVendita: (nome: string) => `${nome} fuori vendita`,
      inVendita: 'In vendita',
      fuoriVendita: 'Fuori vendita',
    },
    // Regole provvigioni: the sheets that create, close and edit a rule
    regoleForm: {
      salvata: 'Regola salvata: la precedente si chiude il giorno prima',
      nuova: 'Nuova regola',
      titoloNuova: 'Nuova regola provvigionale',
      descrizioneNuova: 'Vale dalla data scelta in avanti. Le provvigioni già maturate non cambiano.',
      collaboratore: 'Collaboratore',
      percentuale: 'Percentuale',
      valeDal: 'Vale dal',
      siApplica: 'Si applica all’incassato di',
      salvaRegola: 'Salva la regola',
      chiusaDal: (data: string) => `Regola chiusa dal ${data}`,
      chiudi: 'Chiudi…',
      titoloChiudi: 'Chiudi la regola',
      descrizioneChiudi: (etichetta: string) =>
        `${etichetta}. Le provvigioni maturate fino a quel giorno restano come sono.`,
      ultimoGiorno: 'Ultimo giorno di validità',
      annulla: 'Annulla',
      chiudiDal: (data: string) => `Chiudi dal ${data}`,
      scegliData: 'Scegli una data',
      aggiornata: 'Regola aggiornata',
      modifica: 'Modifica',
      titoloModifica: (etichetta: string) => `Modifica la regola · ${etichetta}`,
      descrizioneModifica:
        'Cambia le provvigioni già maturate con questa regola. Per un cambio da una data in poi usa “Nuova regola”.',
      finoAl: 'Fino al (facoltativo)',
      elimina: 'Elimina la regola',
      laRegola: (etichetta: string) => `la regola ${etichetta}`,
      eliminata: 'Regola eliminata',
      conseguenze: [
        'Le provvigioni maturate con questa regola spariscono da tutti i mesi, anche passati.',
        'Per smettere da una data in poi, usa “Chiudi” invece di eliminare.',
      ],
      regola: 'Regola',
    },
    // Esporta CSV
    esporta: {
      descrizione: 'Per la commercialista: si aprono direttamente in Excel. Più sotto il backup completo.',
      voci: {
        vendite: ['Vendite', 'Contratti firmati nel periodo: cliente, tipo, prodotto, valore, rate.'],
        incassi: ['Incassi', 'Rate incassate e rimborsi del periodo, con metodo di pagamento.'],
        costi: ['Costi', 'Spese del periodo per categoria.'],
      },
      delMese: (etichetta: string) => `di ${etichetta}`,
      formato: 'Formato: separatore punto e virgola, decimali con la virgola, date gg/mm/aaaa.',
      backup: 'Backup completo',
      backupDescrizione:
        'Tutto il database in un file. Arriva da solo via email ogni lunedì mattina; qui lo scarichi quando vuoi.',
      scaricaBackup: 'Scarica il backup',
    },
  },
  {
    titolo: 'Settings',
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
      onboarding: ['Onboarding', 'Default people, community and link duration.'],
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
    prodottoForm: {
      creato: 'Product created',
      aggiornato: 'Product updated',
      modifica: (nome: string) => `Edit ${nome}`,
      nuovo: 'New product',
      descrizione: 'The list price prefills the value in new sales.',
      nome: 'Name',
      durata: 'Length (months)',
      prezzo: 'List price',
      salva: 'Save',
      elimina: 'Delete the product',
      eliminato: (nome: string) => `${nome} deleted`,
      fuoriVenditaInvece: 'If you just want to stop offering it, take it off sale: it stays in the history.',
      importoOgniRata: 'Write the amount of each instalment, for example 500',
      pianoLegenda: 'Usual payment plan (optional)',
      pianoAiuto:
        'Without a plan, a sale proposes equal monthly instalments. With a plan, for example 3 instalments of €500 and then 3 of €333.33, the new sale starts from here and stays editable.',
      ratePiano: 'Instalments of the usual plan',
      mese: 'Month',
      allaFirma: 'At signing',
      piuMesi: (m: number) => `+${m} ${m === 1 ? 'month' : 'months'}`,
      importo: 'Amount',
      togliRata: (n: number) => `Remove instalment ${n} of the plan`,
      quante: 'How many',
      importoRata: 'Amount of each instalment (€)',
      aggiungi: 'Add to the plan',
      inVenditaDi: (nome: string) => `${nome} on sale`,
      diNuovoInVendita: (nome: string) => `${nome} on sale again`,
      messoFuoriVendita: (nome: string) => `${nome} off sale`,
      inVendita: 'On sale',
      fuoriVendita: 'Off sale',
    },
    regoleForm: {
      salvata: 'Rule saved: the previous one closes the day before',
      nuova: 'New rule',
      titoloNuova: 'New commission rule',
      descrizioneNuova: 'It applies from the chosen date onwards. Commissions already accrued do not change.',
      collaboratore: 'Team member',
      percentuale: 'Percentage',
      valeDal: 'Valid from',
      siApplica: 'Applies to the payments of',
      salvaRegola: 'Save the rule',
      chiusaDal: (data: string) => `Rule closed from ${data}`,
      chiudi: 'Close…',
      titoloChiudi: 'Close the rule',
      descrizioneChiudi: (etichetta: string) => `${etichetta}. Commissions accrued up to that day stay as they are.`,
      ultimoGiorno: 'Last valid day',
      annulla: 'Cancel',
      chiudiDal: (data: string) => `Close from ${data}`,
      scegliData: 'Choose a date',
      aggiornata: 'Rule updated',
      modifica: 'Edit',
      titoloModifica: (etichetta: string) => `Edit the rule · ${etichetta}`,
      descrizioneModifica:
        'This changes the commissions already accrued with this rule. For a change from a date onwards use “New rule”.',
      finoAl: 'Until (optional)',
      elimina: 'Delete the rule',
      laRegola: (etichetta: string) => `the rule ${etichetta}`,
      eliminata: 'Rule deleted',
      conseguenze: [
        'The commissions accrued with this rule disappear from every month, past ones included.',
        'To stop from a date onwards, use “Close” instead of deleting.',
      ],
      regola: 'Rule',
    },
    esporta: {
      descrizione: 'For the accountant: they open straight in Excel. The full backup is further down.',
      voci: {
        vendite: ['Sales', 'Contracts signed in the period: client, type, product, value, instalments.'],
        incassi: ['Payments', 'Instalments paid and refunds of the period, with the payment method.'],
        costi: ['Expenses', 'Expenses of the period by category.'],
      },
      delMese: (etichetta: string) => `for ${etichetta}`,
      formato: 'Format: semicolon separator, comma decimals, dates dd/mm/yyyy.',
      backup: 'Full backup',
      backupDescrizione:
        'The whole database in one file. It arrives by email on its own every Monday morning; here you download it whenever you want.',
      scaricaBackup: 'Download the backup',
    },
  },
)

/** «0,94 $» in Italian, «$0.94» in English: the dollars Claude costs (computed in SQL, only said here). */
const DOLLARI = {
  it: new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  en: new Intl.NumberFormat('en-IE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
}
export function formatDollari(n: number, lingua: Lingua): string {
  return lingua === 'en' ? `$${DOLLARI.en.format(n)}` : `${DOLLARI.it.format(n)} $`
}

/** A dollar amount as typed in a limit field: «25» or «12,5» in Italian, «12.5» in English. */
export function numeroDollari(n: number, lingua: Lingua): string {
  return lingua === 'en' ? `$${n.toLocaleString('en-IE')}` : `${n.toLocaleString('it-IT')} $`
}

/**
 * The fixed sentences the Settings pages receive (their server actions, the shared form
 * schemas, the connections' last errors written by the nightly runs), in English. The
 * actions and the database keep answering in Italian (Claude, Alfire and the tests read
 * them so): the page translates what it shows, and anything unknown stays as it came.
 */
const ERRORI_EN: Record<string, string> = {
  // common
  'Connessione assente. Riprova.': 'No connection. Try again.',
  'Dati non validi.': 'Invalid data.',
  'Richiesta non valida.': 'Invalid request.',
  'Valore non valido.': 'Invalid value.',
  'Data non valida': 'Invalid date',
  'Operazione riservata all’admin.': 'Only the admin can do this.',
  'Operazione non riuscita.': 'That did not work.',
  'Operazione non riuscita. Riprova.': 'That did not work. Try again.',
  'Scelta non valida.': 'Invalid choice.',
  'Scelta non salvata. Riprova.': 'Choice not saved. Try again.',
  'Impostazione non salvata. Riprova.': 'Setting not saved. Try again.',
  'Scegli un limite tra 0 e 200 $.': 'Choose a limit between $0 and $200.',
  'Limite non salvato. Riprova.': 'Limit not saved. Try again.',
  // Instagram
  'Incolla il token copiato dal pannello Meta.': 'Paste the token copied from the Meta panel.',
  'Il token non sembra valido: copialo di nuovo per intero dal pannello Meta.':
    'The token does not look valid: copy it again in full from the Meta panel.',
  'Token non salvato. Riprova.': 'Token not saved. Try again.',
  'Token non tolto. Riprova.': 'Token not removed. Try again.',
  'Il collegamento di Instagram non si trova. Ricarica la pagina.': 'The Instagram connection cannot be found. Reload the page.',
  'Chat non esclusa. Riprova.': 'Chat not excluded. Try again.',
  'Chat non valida.': 'Invalid chat.',
  'Esclusione non tolta. Riprova.': 'Exclusion not removed. Try again.',
  'Questa chat non era più tra le escluse. Ricarica la pagina.': 'This chat was no longer excluded. Reload the page.',
  'Chat esclusa, ma i suoi messaggi già salvati nell’Insight non si sono cancellati: togli l’esclusione e rifalla per riprovare.':
    'Chat excluded, but its messages already saved in the Insight were not deleted: remove the exclusion and add it again to retry.',
  'Scrivi lo username, senza @': 'Write the username, without @',
  'Uno username di Instagram: lettere, numeri, punto e trattino basso, al massimo 30 caratteri':
    'An Instagram username: letters, numbers, dot and underscore, at most 30 characters',
  'Il motivo: al massimo 120 caratteri': 'The reason: at most 120 characters',
  'Scegli una persona dell’elenco': 'Choose a person from the list',
  'È passata la mezzanotte: ricarica la pagina e ricalcola ieri.': 'Midnight has passed: reload the page and recalculate yesterday.',
  // the nightly report (FRASI_ERRORE, lib/instagram/report.ts)
  'Si ricalcola solo un giorno già finito, degli ultimi 7 giorni: Instagram tiene solo gli ultimi 20 messaggi di ogni chat.':
    'Only a day already over, of the last 7 days, can be recalculated: Instagram keeps only the last 20 messages of each chat.',
  'Nessun setter scelto per i DM di Instagram: scegli chi li lavora e la proposta riparte la notte dopo.':
    'No setter chosen for the Instagram DMs: choose who works them and the proposal starts again the next night.',
  'Il setter scelto per i DM di Instagram non è più un setter attivo: scegline un altro.':
    'The setter chosen for the Instagram DMs is no longer an active setter: choose another one.',
  'Instagram non è collegato: manca il token. Incollalo di nuovo.': 'Instagram is not connected: the token is missing. Paste it again.',
  'Il token di Instagram è scaduto o non è più valido: generane uno nuovo dal pannello Meta e incollalo di nuovo.':
    'The Instagram token has expired or is no longer valid: generate a new one from the Meta panel and paste it again.',
  'Instagram ha limitato le letture per troppe richieste: si riprova la notte dopo, o più tardi con il ricalcolo.':
    'Instagram limited the reads for too many requests: it tries again the next night, or later with the recalculation.',
  'Instagram non ha risposto: si riprova la notte dopo, o più tardi con il ricalcolo.':
    'Instagram did not answer: it tries again the next night, or later with the recalculation.',
  'Le chat da leggere erano troppe per il tempo a disposizione: nessuna proposta salvata. Riprova con il ricalcolo.':
    'There were too many chats to read in the time available: no proposal saved. Try again with the recalculation.',
  // the posts' run (FRASI_CONTENUTI, lib/instagram/sincronizza-contenuti.ts)
  'Instagram non è collegato: l’admin incolla il token in Impostazioni › Chiavi e collegamenti.':
    'Instagram is not connected: the admin pastes the token in Settings › Keys and connections.',
  'Il token di Instagram è scaduto: l’admin ne incolla uno nuovo in Impostazioni › Chiavi e collegamenti.':
    'The Instagram token has expired: the admin pastes a new one in Settings › Keys and connections.',
  'Instagram ha chiesto di rallentare: il resto arriva col prossimo aggiornamento.':
    'Instagram asked to slow down: the rest arrives with the next update.',
  'Instagram non ha risposto: riprova più tardi.': 'Instagram did not answer: try again later.',
  'Instagram ha rifiutato la lettura dei post.': 'Instagram refused to read the posts.',
  'I post non si salvano: riprova più tardi.': 'The posts are not being saved: try again later.',
  // Messenger
  'Incolla il token della Pagina copiato da Meta.': 'Paste the Page token copied from Meta.',
  'Il token della Pagina non è valido o non ha accesso ai messaggi: generane uno nuovo da Meta › Messenger › Impostazioni dell’API e incollalo qui.':
    'The Page token is not valid or has no access to the messages: generate a new one from Meta › Messenger › API settings and paste it here.',
  'Meta non ha risposto: riprova tra qualche minuto.': 'Meta did not answer: try again in a few minutes.',
  'Token della Pagina non salvato. Riprova.': 'Page token not saved. Try again.',
  'Token della Pagina non tolto. Riprova.': 'Page token not removed. Try again.',
  'Scegli una chat dell’elenco.': 'Choose a chat from the list.',
  'Messenger non letto: il token della Pagina è scaduto o non è più valido. Incollane uno nuovo in Impostazioni › Chiavi e collegamenti.':
    'Messenger not read: the Page token has expired or is no longer valid. Paste a new one in Settings › Keys and connections.',
  'Messenger non letto: Meta non ha risposto. Riprova più tardi con Aggiorna dati.':
    'Messenger not read: Meta did not answer. Try again later with Refresh data.',
  // Fathom (the settings actions and FRASI_FATHOM, lib/fathom/frasi.ts)
  'Incolla la chiave copiata da Fathom.': 'Paste the key copied from Fathom.',
  'Questa non sembra una chiave di Fathom: copiala di nuovo da Impostazioni › API Access.':
    'This does not look like a Fathom key: copy it again from Settings › API Access.',
  'Chiave non salvata. Riprova.': 'Key not saved. Try again.',
  'Chiave non tolta. Riprova.': 'Key not removed. Try again.',
  'La chiave di Fathom non funziona più: l’admin la cambia in Impostazioni › Fathom.':
    'The Fathom key no longer works: the admin changes it in Settings › Fathom.',
  'Fathom non dà questa registrazione: è stata eliminata, o è privata di un altro account.':
    'Fathom does not give this recording: it was deleted, or it is private to another account.',
  'Fathom chiede di rallentare: riprova tra poco.': 'Fathom asks to slow down: try again shortly.',
  'Fathom non risponde: riprova più tardi.': 'Fathom does not answer: try again later.',
  'Fathom ha risposto in un modo che l’app non conosce: riprova più tardi.':
    'Fathom answered in a way the app does not know: try again later.',
  'Fathom non è collegato: l’admin incolla la chiave in Impostazioni › Fathom.':
    'Fathom is not connected: the admin pastes the key in Settings › Fathom.',
  // Team
  'Questa persona è già nel team: cambia il suo ruolo dall’elenco.': 'This person is already in the team: change their role from the list.',
  'Invito non salvato. Riprova.': 'Invite not saved. Try again.',
  'Invito non valido.': 'Invalid invite.',
  'Invito non trovato o già usato.': 'Invite not found or already used.',
  'Invito non eliminato. Riprova.': 'Invite not deleted. Try again.',
  'Persona non valida.': 'Invalid person.',
  'Persona non eliminata. Riprova.': 'Person not deleted. Try again.',
  'Persona non trovata.': 'Person not found.',
  'Profili non uniti. Riprova.': 'Profiles not merged. Try again.',
  'Ruolo non aggiornato. Riprova.': 'Role not updated. Try again.',
  'Livello non aggiornato. Riprova.': 'Level not updated. Try again.',
  'Scegli il ruolo': 'Choose the role',
  'Scrivi un indirizzo email valido': 'Write a valid email address',
  'Scegli il livello': 'Choose the level',
  'Scegli il profilo in cui unire': 'Choose the profile to merge into',
  // Prodotti
  'Prodotto non salvato. Riprova.': 'Product not saved. Try again.',
  'Prodotto non valido.': 'Invalid product.',
  'Prodotto non eliminato. Riprova.': 'Product not deleted. Try again.',
  'Scrivi il nome del prodotto': 'Write the product’s name',
  'Durata in mesi': 'Length in months',
  'Solo mesi interi': 'Whole months only',
  'Almeno un mese': 'At least one month',
  'Al massimo 36 mesi': 'At most 36 months',
  'Scrivi il prezzo, ad esempio 1.500': 'Write the price, for example 1,500',
  'Importo troppo alto: controlla gli zeri': 'Amount too high: check the zeros',
  'Mese non valido': 'Invalid month',
  'Mesi interi': 'Whole months',
  'Da 0 in su': 'From 0 up',
  'Al massimo 60': 'At most 60',
  'Al massimo 60 rate': 'At most 60 instalments',
  'Scrivi l’importo della rata': 'Write the instalment’s amount',
  'L’importo deve essere positivo': 'The amount must be positive',
  // Regole provvigioni
  'Regola non valida.': 'Invalid rule.',
  'Regola non trovata.': 'Rule not found.',
  'Regola non salvata. Riprova.': 'Rule not saved. Try again.',
  'Regola non chiusa. Riprova.': 'Rule not closed. Try again.',
  'Regola non aggiornata. Riprova.': 'Rule not updated. Try again.',
  'Regola non eliminata. Riprova.': 'Rule not deleted. Try again.',
  'Scegli il collaboratore': 'Choose the team member',
  'Scrivi una percentuale tra 0 e 50, ad esempio 5': 'Write a percentage between 0 and 50, for example 5',
  'Scegli almeno un tipo di vendita': 'Choose at least one sale type',
  'Scegli da quando vale': 'Choose when it starts',
  'La fine viene dopo l’inizio': 'The end comes after the start',
}

/** "@mario è già tra le chat escluse." and the other sentences with a name inside. */
const CON_NOME: [RegExp, (...g: string[]) => string][] = [
  [/^@(.+) è già tra le chat escluse\.$/, (u) => `@${u} is already among the excluded chats.`],
  [/^(.+) è già tra le chat Messenger escluse\.$/, (n) => `${n} is already among the excluded Messenger chats.`],
]

/** A fixed sentence of the Settings pages in the page's language; an unknown one stays as it came. */
export function traduciImpostazioni(testo: string, lingua: Lingua): string
export function traduciImpostazioni(testo: string | null | undefined, lingua: Lingua): string | undefined
export function traduciImpostazioni(testo: string | null | undefined, lingua: Lingua): string | undefined {
  if (!testo) return testo ?? undefined
  if (lingua === 'it') return testo
  const noto = ERRORI_EN[testo]
  if (noto) return noto
  for (const [re, inglese] of CON_NOME) {
    const m = re.exec(testo)
    if (m) return inglese(...m.slice(1))
  }
  return testo
}
