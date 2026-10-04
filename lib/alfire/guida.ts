/**
 * How the dashboard works, in short sections Alfire reads only when asked
 * (the free tier counts every token: the guide stays out of the system prompt).
 */
import { haEconomics, type AppRole } from '@/lib/auth/roles'

/**
 * What Alfire does in chat, for who asks: each role reads its own part, never
 * the admin's list of money tools (CLAUDE.md section 23: the team's texts stay
 * away from the admin's economics). The admin reads the whole list.
 */
const ALFIRE_PER_RUOLO: Partial<Record<AppRole, string>> = {
  admin:
    'Admin: clienti (crea, correggi, elimina), vendite (registra, correggi, interrompi il percorso, elimina), rate (incassa, correggi o annulla l’incasso, fallita, scadenza e importo, rimborso, aggiungi, elimina), costi (anche copia dei ricorrenti), pagamenti e regole delle provvigioni, obiettivi del mese, prodotti, call (fissa, esito, correggi, elimina), lead (stato, correggi, elimina), report giornalieri di ogni setter; in lettura anche la tua giornata da closer, come Setting › Closer con te scelto. Setter: il suo report, le sue call (fissa, sposta), i suoi lead (stato, correggi); in lettura i suoi numeri, i clienti che ha portato con la sua provvigione su ogni incasso e la sua giornata. Closer: esito e dettagli delle sue call, stato dei lead, vendite e incassi delle sue vendite; in lettura le sue vendite con incassato e da incassare e la sua giornata. Ognuno solo i suoi, come nell’app.',
  setter:
    'Setter: il suo report, le sue call (fissa, sposta, le sue note), i suoi lead (stato, correggi). In lettura, solo i suoi, come in I miei numeri (/my-numbers): i numeri e le provvigioni del periodo, i clienti che ha portato (revenue, quanto hanno pagato dall’inizio, ogni pagamento con la provvigione che gli dà, anche quelli di un periodo) e la sua giornata, giorno per giorno. Mai i contatti dei clienti, né clienti e provvigioni di altri.',
  closer:
    'Closer: esito e dettagli delle sue call, stato dei lead, vendite e incassi delle sue vendite. In lettura, solo le sue: le vendite che ha chiuso, come in Le mie vendite (/my-sales), con incassato, da incassare, la prossima rata e le rate, anche quelle chiuse in un periodo, e la sua giornata, giorno per giorno, come in I miei numeri (/setting/closer). Mai vendite di altri closer.',
}

/**
 * What Alfire can record from an attached file, for who asks (03/10/2026):
 * the admin a receipt as a cost or a plan of instalments, the closer the plan
 * of a sale he registers, the setter the numbers of his report. The Projects
 * area's roles: tasks and notes, never money.
 */
const DA_UN_ALLEGATO: Record<AppRole, string> = {
  admin: 'una ricevuta come costo, un piano di rate',
  setter: 'i numeri del tuo report da uno screenshot',
  closer: 'il piano di rate di una vendita che registri',
  coach: 'task e note di un progetto',
  editor: 'task e note di un progetto',
  nutrizione: 'task e note di un progetto',
  dev: 'task e note di un progetto',
}

export function guidaAlfire(ruolo: AppRole): string {
  return [
    'Cosa fa Alfire in chat (testo o voce), sempre dopo il tocco su "Conferma" nella scheda, che mostra la riga vera, prima → dopo, e cosa si porta dietro un’eliminazione (bottone rosso "Elimina").',
    ALFIRE_PER_RUOLO[ruolo],
    'Progetti, per livello: progetti e membri, liste e il coach dei progetti dei clienti (chi gestisce), task, note e il proprio tempo (tutti): avvia e ferma il timer, registra una durata o una fascia Dalle–Alle di oggi o di un giorno passato, correggi (anche spostandole su un altro task o progetto) o elimina le proprie voci, sempre solo le proprie; in lettura quanto tempo hai registrato nel periodo, per giorno, per progetto e per task (es. «quanto ho dedicato alla revisione video di un cliente questo mese?», o senza dire il cliente su tutti i progetti dove c’è quel task), contato dall’app.',
    ruolo === 'admin'
      ? 'In lettura l’admin ha anche il tempo del team, come Tempo › Team (/tempo/team): solo il tempo già dichiarato, mai i timer accesi, nessuna classifica.'
      : null,
    haEconomics(ruolo)
      ? 'I propri numeri, clienti, vendite, giornate, task e tempo, e le call di setter e closer, sono sempre di chi chatta: Alfire non li dà mai per quelli di un altro, e se nessuno strumento legge un’altra persona lo dice.'
      : 'I propri task e il proprio tempo sono sempre di chi chatta: Alfire non li dà mai per quelli di un altro, e se nessuno strumento legge un’altra persona lo dice.',
    'Mai: team, inviti, ruoli, accessi, export, backup, impostazioni dei progetti, dati di altri che il ruolo non vede.',
    'Quando Alfire chiede quale (cliente, progetto, mese) le risposte compaiono come bottoni: un tocco risponde, oppure si scrive o si detta la risposta; un bottone non scrive mai niente da solo. Dopo una risposta può proporre qualche domanda successiva.',
    'Col microfono il testo compare nella casella mentre parli: a fine vocale si rilegge, si corregge e si manda con Invio.',
    `Con la graffetta si allegano fino a 3 file per messaggio (PDF, foto e screenshot, Word, Excel, CSV; 4 MB al massimo): Alfire li legge e risponde, e può registrare quello che contengono (${DA_UN_ALLEGATO[ruolo]}), sempre con la scheda di conferma. I file non si salvano da nessuna parte: restano solo nella chat aperta.`,
  ]
    .filter(Boolean)
    .join(' ')
}

/** The projects topic in its parts: the admin reads them all, the team without his (PROGETTI_TEAM). */
const PROGETTI = {
  struttura:
    'Progetti (/progetti): reparto → progetto → liste con date → task e sotto-task. Livelli: admin, manager (crea e gestisce i suoi progetti), employee (lavora i task suoi).',
  tempo:
    'Tempo dichiarato: la sveglia accanto a ogni task avvia il timer, che resta in alto a destra su ogni pagina accanto ad Alfire; fermandolo chiede una nota. Oppure tempo caricato dopo in Il mio tempo (/tempo; per l’admin la voce si chiama Tempo): la durata, o la fascia oraria facoltativa Dalle–Alle da cui si calcola la durata; correggendo una voce la fascia si aggiunge, si cambia o si toglie. Il totale del periodo si divide per progetto e, sotto ogni progetto, per task.',
  team: 'L’admin ha anche la scheda Team (/tempo/team): il tempo già registrato da ognuno nel periodo, persona per persona in ordine alfabetico, per progetto e task, con le voci; mai i timer accesi degli altri, nessun elenco di chi non ha registrato, nessuna classifica. Lo stesso tempo l’admin lo chiede anche ad Alfire (es. «quanto ha registrato una persona negli ultimi 7 giorni, e su cosa?»), con gli stessi limiti.',
  note: 'Note datate e Gantt per progetto.',
  impostazioni: 'Reparti e modelli in Impostazioni › Progetti.',
  clienti:
    'Ogni cliente che inizia il percorso ha il suo progetto in Fitness Coaching, nato da solo, con 8 task del coach senza scadenze dove si registra il tempo (call di onboarding, analisi e strategia iniziale, programmazione allenamento, programmazione alimentare, revisione video, call di check, assistenza chat, altre attività); chi gestisce il progetto sceglie il coach con «Scegli il coach», e la programmazione alimentare va a chi si occupa di nutrizione, se c’è. Quando il cliente rinnova, il suo progetto torna attivo se era completato o archiviato (in pausa resta in pausa), con lo stesso coach, e i task del modello completati prima del rinnovo (nati col progetto, senza una scadenza passata) tornano da fare da soli, anche se il progetto era attivo o in pausa; i task aggiunti dalle persone, i sotto-task e quelli con la scadenza passata restano come sono, il tempo registrato e le note pure.',
}

/**
 * The projects topic from the side of who is not the admin (03/10/2026): his
 * own time, and who sees the others' (whoever manages a project, on its Tempo
 * tab); Tempo › Team and Impostazioni › Progetti are the admin's.
 */
const PROGETTI_TEAM = [
  PROGETTI.struttura,
  'Il tuo tempo lo dichiari tu: la sveglia accanto a ogni task avvia il timer, che resta in alto a destra su ogni pagina accanto ad Alfire; fermandolo chiede una nota. Oppure lo carichi dopo in Il mio tempo (/tempo): la durata, o la fascia oraria facoltativa Dalle–Alle da cui si calcola la durata; correggendo una voce la fascia si aggiunge, si cambia o si toglie. Lì il totale del periodo si divide per progetto e, sotto ogni progetto, per task. Il tempo degli altri lo vede chi gestisce un progetto, nella scheda Tempo del progetto; Alfire non lo legge.',
  PROGETTI.note,
  PROGETTI.clienti,
].join(' ')

export const GUIDA = {
  panoramica:
    'Panoramica (/, solo admin): selettore di mese o periodo con confronto col precedente. KPI: cash incassato, revenue firmata (ogni tipo), nuovi clienti, rinnovi, margine operativo (cash - provvigioni - costi, tasse escluse). Sotto il cash, "Di cui" in 4 parti che sommano al totale: nuovi clienti del periodo (incassi delle vendite di tipo nuovo firmate nel periodo), rate di clienti già entrati (vendite nuove firmate prima), rinnovi, upsell; le stesse 4 serie nel grafico dei 12 mesi. Gli indicatori di acquisizione contano solo i nuovi clienti del periodo: cash e revenue per DM, cash per call svolta, valore medio nuovo cliente, e "Da dove arrivano i nuovi clienti" (cash per fonte). "Oggi dal team": incassato oggi (tutto) e di cui nuovi clienti. Funnel DM → conversazioni → call prenotate → svolte → chiuse. Box "Da incassare" (in ritardo, prossimi 30 giorni) e "In scadenza".',
  vendite:
    'Vendite (/sales): i contratti firmati, cioè chi ha comprato cosa, per quanto e in quante rate. Nuova vendita da Vendite › Nuova vendita (/sales/new); per un cliente già in anagrafica, dalla sua scheda: "Registra la prima vendita" se non ne ha, altrimenti "Ha rinnovato" o "Upsell". Prodotto del catalogo o "Personalizzato" (nome e fine a mano), piano a rate uguali o scritto a mano rata per rata. L’inizio del percorso è proposto una settimana dopo la data di vendita (un rinnovo: il giorno dopo la fine del precedente). La prima rata incassata di una vendita nuova o di un rinnovo apre il progetto del cliente in Progetti, o lo riporta tra gli attivi se era completato o archiviato (in pausa resta in pausa), e se è un rinnovo i task del modello completati prima tornano da fare da soli; un upsell no. La somma delle rate deve coincidere col contratto. Rinnovi e upsell non hanno setter (quindi nessuna provvigione), a meno che nascano da una call fissata. Dal dettaglio si modificano vendita e rate, si aggiungono o tolgono rate, si elimina la vendita.',
  incassi:
    'Incassi (/payments): i soldi, rata per rata; ogni riga dice tipo e rata (es. "Primo percorso · Rata 2 di 4", "Rinnovo · Rata 2 di 2"). Una rata è in ritardo se è prevista e la scadenza è passata. "Segna incassata" con la data di oggi già messa; si può annullare, correggere, registrare un rimborso (provvigione negativa nel mese del rimborso).',
  clienti:
    'Clienti (/clients): stato derivato dalle vendite: attivo, in scadenza (finisce entro 30 giorni senza rinnovo), scaduto (finito da meno di 90 giorni), ex cliente, mai attivato. La scheda ha "Storico percorsi": una scheda per vendita, dalla più recente (Primo percorso, Rinnovo 1, 2…, Upsell), con date, stato (da iniziare, in corso, concluso, interrotto), incassato, da incassare e rate con "Segna incassata". "Ha rinnovato" apre la nuova vendita di tipo rinnovo già compilata: inizia il giorno dopo la fine del percorso precedente, stesso prodotto e prezzo, tutto modificabile; il periodo vecchio resta nello storico. "Interrompi il percorso" chiude prima quello in corso. "Modifica" corregge contatti, fonte, setter, closer e note. Chi finisce entro 30-60 giorni: Rinnovi (/rinnovi). «Progetto del percorso» apre il suo progetto in Progetti, con il coach.',
  setting:
    'Setting: il setter compila ogni giorno "Oggi" (/today), salvataggio automatico. DM outbound: persone nuove a cui scrive lui per primo, contate una volta sola il giorno del primo messaggio. DM inbound: persone nuove che chiedono informazioni e a cui risponde, contate una volta sola il primo giorno. Conversazioni: la persona ha risposto e lui ha risposto di nuovo (se risponde il giorno dopo, è una conversazione di quel giorno); non entrano nei DM totali. Follow up: solleciti a chi non ha ancora risposto, senza divisione inbound/outbound. DM totali = outbound + inbound + follow up. Sotto le conversazioni, "Com’è andata la giornata": lead in target (quasi tutti, circa metà, pochi) e qualità delle conversazioni (buone, medie, scarse), un tocco ciascuna, chieste nei giorni con DM o conversazioni (finché mancano il giorno dice "Da completare" al setter, solo nei report creati dal 30/09/2026, ma si salva lo stesso); cosa frenava i lead dal fissare la call, domande e contenuti, altre note: facoltativi. L’admin li legge in Setting, sezione "Per il marketing: cosa dicono i lead", insieme al motivo di non chiusura delle call. Call svolte e qualificate non le scrive il setter: le registra il closer su ogni call. Il setter fissa solo discovery call. Crea un lead solo quando fissa una call ("Nuova call"), con la fonte: da lì si contano le prenotate da inbound e da outbound, senza scriverle a mano. Pipeline (/leads): Call fissata → Follow-up → Cliente / Perso, aggiornata a mano. Metriche in /setting: tasso di conversazione = conversazioni ÷ DM totali; tasso di prenotazione = call prenotate ÷ call proposte; DM per call prenotata = DM totali ÷ call prenotate; show rate, close rate. Scheda Closer (/setting/closer): la giornata del closer giorno per giorno.',
  call:
    'Call (/calls): le fissano il setter (per sé, fino a 7 giorni indietro) e l’admin da Le mie call › "Nuova call" (/calls/new): per sé o per un setter, anche una call già fatta (fino a un anno indietro). Il closer registra l’esito (svolta, no show, cancellata, da riprogrammare; se svolta: qualificata, chiusa / follow-up / persa). Da riprogrammare sono due scelte: «Ha già una nuova data» e «Sposta» (accanto a Registra esito) chiedono il nuovo giorno e l’ora: la stessa call passa lì e torna da fare, senza esito, e la scheda dice «Spostata dal 30/09 alle 19:00» (e quante volte); conta nel nuovo giorno, il giorno della prenotazione non cambia. «In attesa di conferma» non chiede la data: il lead deve ancora confermarne una, la call resta sul suo giorno senza esito (non conta nello show rate) e sta in cima a Le mie call del closer, sotto «In attesa di conferma»; quando il lead conferma, «Sposta» le dà il nuovo giorno. La spostano il closer, l’admin (anche nel passato) e il setter che l’ha fissata, finché è da fare; da oggi in avanti. Una call svolta o no show non si sposta, per nessuno (il no show resta nello show rate del suo giorno): se l’esito è sbagliato il closer o l’admin lo annulla prima; per rivedere il lead il setter o l’admin fissa una nuova call. La matita corregge data e ora sbagliate senza traccia (il setter solo delle call da fare; il closer e l’admin anche di una call svolta o di un no show, che restano tali: è una correzione, non uno spostamento). Con follow-up o persa scrive sempre il motivo di non chiusura (obbligatorio: le obiezioni sul prezzo stanno qui) e, se vuole, note aggiuntive. Esito, motivo e note aggiuntive li scrivono solo il closer e l’admin: il setter li legge sulle call che ha fissato. Le note del setter (con la matita della call) le scrivono il setter e l’admin, il closer le legge. Se chiusa, si apre la nuova vendita precompilata. "Compila la giornata" (/setting/closer/giorno): le call di un giorno con i bottoni dell’esito; la riga del closer (svolte, qualificate, no show, follow up, cancellate, chiuse, cash, revenue) si compila da sola dagli esiti. Cash e revenue contano solo i nuovi clienti: prima rata incassata e contratto delle vendite nuove, nel giorno della vendita. L’admin sceglie il closer e con "Aggiungi una call" aggiunge una call fatta che nell’app non c’è.',
  provvigioni:
    'Provvigioni (/commissions): maturano sull’incasso, non sulla firma: importo incassato × percentuale della regola valida alla data d’incasso e applicabile al tipo di vendita (di solito solo nuovo, rate successive comprese). Le regole si gestiscono in Impostazioni › Regole provvigioni. Si registra il pagamento al setter; il saldo è maturato meno pagato.',
  costi: 'Costi (/expenses): data, categoria (team, software, ads, formazione, altro), importo, ricorrente. Entrano nel margine operativo del mese.',
  progetti: [PROGETTI.struttura, PROGETTI.tempo, PROGETTI.team, PROGETTI.note, PROGETTI.impostazioni, PROGETTI.clienti].join(' '),
  impostazioni:
    'Impostazioni (admin): Team (inviti via email, ruoli, livelli progetti, disattiva, elimina, unisci profili), Prodotti (prezzo, durata, piano rate abituale), Regole provvigioni, Progetti (reparti e modelli), Esporta CSV per la commercialista, Registro modifiche. Il profilo personale (nome, foto) si apre dalla foto in fondo alla sidebar.',
  alfire: guidaAlfire('admin'),
  permessi:
    'Permessi: l’admin vede tutto. Il setter vede i suoi report, i suoi lead e le call che ha fissato con il loro esito; in I miei numeri (/my-numbers), dei clienti che ha portato (le vendite col suo nome: i clienti nuovi, più i rinnovi e gli upsell registrati col suo nome), revenue, rate pagate e la sua provvigione su ogni incasso, e i suoi totali di provvigioni. Mai contatti dei clienti né clienti di altri. Il closer vede le call assegnate a lui, le vendite chiuse da lui e la sua giornata. Nessun collaboratore vede costi, margine o compensi altrui. Coach, video editor, nutrizione e sviluppo vedono i progetti di cui sono membri, i loro task e il loro tempo, mai i soldi dei clienti. Il tempo degli altri lo vede, oltre all’admin, chi gestisce un progetto, nella scheda Tempo del progetto; Alfire lo legge solo all’admin.',
} as const

export type ArgomentoGuida = keyof typeof GUIDA

export const ARGOMENTI_GUIDA = Object.keys(GUIDA) as ArgomentoGuida[]

/**
 * The topics a collaborator reads in his own words (03/10/2026): the setter
 * his own commission, the closer his own sales and cash-ins, the roles of the
 * Projects area their projects and time, never a money explanation that is
 * not theirs. The admin reads GUIDA as it is.
 */
const PER_RUOLO: Partial<Record<AppRole, Partial<Record<ArgomentoGuida, string>>>> = {
  setter: {
    provvigioni:
      'Le tue provvigioni (I miei numeri, /my-numbers): maturano sull’incasso, non sulla firma: su ogni rata incassata dei clienti nuovi che hai portato tu, rate successive comprese, nel mese in cui è incassata. Rinnovi e upsell nascono senza setter, quindi senza provvigione, a meno che nascano da una call fissata da te. Un rimborso toglie la provvigione nel mese del rimborso. Per mese vedi maturato, pagato e saldo; in «I tuoi clienti», la provvigione di ogni incasso. I pagamenti li registra l’admin.',
    permessi:
      'Permessi del setter: i suoi report, i suoi lead e le call che ha fissato, con l’esito, il motivo di non chiusura e le note aggiuntive del closer (le legge, non le scrive). In I miei numeri (/my-numbers), dei clienti che ha portato (i clienti nuovi, più i rinnovi e gli upsell registrati col suo nome): revenue, rate pagate e la sua provvigione su ogni incasso, e i suoi totali di provvigioni. Mai i contatti dei clienti, né clienti e provvigioni di altri. Alfire gli dà gli stessi numeri, solo i suoi. Nei progetti: quelli di cui è membro, i suoi task e il suo tempo; il tempo degli altri solo nei progetti che gestisce, nella scheda Tempo del progetto (Alfire non lo legge).',
  },
  closer: {
    vendite:
      'Le tue vendite (Le mie vendite, /my-sales): quelle dove sei il closer, nuovi clienti, rinnovi e upsell. Con l’esito «Chiusa» di una call si apre «Nuova vendita» già compilata (cliente, setter, closer e la call), con la data di vendita nel giorno della call: prodotto del catalogo o "Personalizzato", piano a rate uguali o scritto rata per rata, e la somma delle rate deve coincidere col contratto. L’inizio del percorso è proposto una settimana dopo la data di vendita: controllalo. La prima rata incassata di una vendita nuova o di un rinnovo apre il progetto del cliente in Progetti. Correggere la vendita, cambiare il piano rate ed eliminare restano all’admin.',
    incassi:
      'Gli incassi delle tue vendite: apri la vendita da Le mie vendite (/my-sales) e tocca «Segna incassata», con la data di oggi già messa; un incasso si corregge o si annulla, e una rata da incassare si segna fallita. Una rata è in ritardo se è da incassare e la scadenza è passata. Scadenze, importi delle rate, rate in più o in meno e rimborsi li cambia l’admin.',
    permessi:
      'Permessi del closer: le call assegnate a lui (esito, motivo di non chiusura e note aggiuntive li scrive lui; le note del setter le legge), le vendite chiuse da lui con le loro rate, di cui registra gli incassi, e la sua giornata (I miei numeri, /setting/closer). Mai vendite o call di altri closer. Alfire gli dà le stesse vendite, rate e giornate, solo le sue. Nei progetti: quelli di cui è membro, i suoi task e il suo tempo; il tempo degli altri solo nei progetti che gestisce, nella scheda Tempo del progetto (Alfire non lo legge).',
  },
}

/** The Projects area's roles (coach, video editor, nutrition, development): no money, nothing that is not theirs. */
const PERMESSI_PROGETTI =
  'Permessi: vedi i progetti di cui sei membro, con liste, task e note; lavori i task assegnati a te o creati da te, e chi gestisce un progetto li lavora tutti. Il tempo è il tuo: lo registri, lo correggi e lo leggi. Quello degli altri lo vede chi gestisce un progetto, nella scheda Tempo del progetto; Alfire non lo legge. Le altre aree del gestionale non sono del tuo ruolo.'

/**
 * The topics each role reads (03/10/2026): the admin all of them; the team
 * only what is theirs, never the overview, costs or settings.
 */
export function argomentiGuida(ruolo: AppRole): ArgomentoGuida[] {
  switch (ruolo) {
    case 'admin':
      return ARGOMENTI_GUIDA
    case 'setter':
      return ['setting', 'call', 'provvigioni', 'progetti', 'alfire', 'permessi']
    case 'closer':
      return ['call', 'vendite', 'incassi', 'progetti', 'alfire', 'permessi']
    default:
      return ['progetti', 'alfire', 'permessi']
  }
}

/** A topic's text for who asks: the Alfire topic says what this role does, the others what concerns that role. */
export function testoGuida(argomento: ArgomentoGuida, ruolo: AppRole): string {
  if (argomento === 'alfire') return guidaAlfire(ruolo)
  if (argomento === 'permessi' && !haEconomics(ruolo)) return PERMESSI_PROGETTI
  if (argomento === 'progetti' && ruolo !== 'admin') return PROGETTI_TEAM
  return PER_RUOLO[ruolo]?.[argomento] ?? GUIDA[argomento]
}
