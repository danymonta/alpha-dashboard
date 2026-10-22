/**
 * How the dashboard works, in short sections Alfire reads only when asked
 * (the free tier counts every token: the guide stays out of the system prompt).
 */
import { haEconomics, haMarketing, type AppRole } from '@/lib/auth/roles'

/**
 * What Alfire does in chat, for who asks: each role reads its own part, never
 * the admin's list of money tools (CLAUDE.md section 23: the team's texts stay
 * away from the admin's economics). The admin reads the whole list.
 */
const ALFIRE_PER_RUOLO: Partial<Record<AppRole, string>> = {
  admin:
    'Admin: clienti (crea, correggi, chiudi se non rinnova, archivia come ex cliente e togli dall’archivio, riapri, sospendi e riattiva, elimina), vendite (registra, correggi, interrompi il percorso, elimina), rate (incassa, correggi o annulla l’incasso, fallita, scadenza e importo, rimborso, aggiungi, elimina), costi (anche copia dei ricorrenti), pagamenti e regole delle provvigioni, obiettivi del mese, prodotti, call (fissa, esito anche con la call di follow-up già fissata, fissa la call di follow-up dopo, correggi, elimina), lead (stato, correggi, elimina), report giornalieri di ogni setter; in lettura anche la tua giornata da closer, come la pagina Closer con te scelto. Setter: il suo report, le sue call (fissa, sposta), i suoi lead (stato, correggi); in lettura i suoi numeri, i clienti che ha portato con la sua provvigione su ogni incasso, la sua giornata e i numeri del closer di tutti i setter, come la pagina Closer. Closer: esito e dettagli delle sue call (anche la call di follow-up), stato dei lead, vendite e incassi delle sue vendite; in lettura le sue vendite con incassato e da incassare e la sua giornata. Ognuno solo i suoi, come nell’app.',
  setter:
    'Setter: il suo report, le sue call (fissa, sposta, le sue note), i suoi lead (stato, correggi). In lettura, solo i suoi, come in I miei numeri (/my-numbers): i numeri e le provvigioni del periodo, i clienti che ha portato (revenue, quanto hanno pagato dall’inizio, ogni pagamento con la provvigione che gli dà, anche quelli di un periodo) e la sua giornata, giorno per giorno. In lettura anche i numeri del closer sulle call di tutti i setter, giorno per giorno, come la pagina Closer (/setting/closer): non sono i suoi, e mai le call, i lead o le note degli altri. Mai i contatti dei clienti, né clienti e provvigioni di altri.',
  closer:
    'Closer: esito e dettagli delle sue call (con «Follow-up» anche la call di follow-up, già fissata o da fissare dopo), stato dei lead, vendite e incassi delle sue vendite. In lettura, solo le sue: le vendite che ha chiuso, come in Le mie vendite (/my-sales), con incassato, da incassare, la prossima rata e le rate, anche quelle chiuse in un periodo, e la sua giornata, giorno per giorno, come in I miei numeri (/setting/closer). Mai vendite di altri closer.',
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
  marketing: 'task e note di un progetto',
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
    // the content calendar (1.32.0): no Alfire tool yet, only the guide
    haMarketing(ruolo)
      ? 'Il calendario dei contenuti e i post di Instagram (area Marketing) per ora no: Alfire spiega come funzionano, ma non li legge e non li scrive.'
      : null,
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
    'Progetti (/progetti): reparto → progetto → liste con date → task e sotto-task, in Elenco o in Timeline (la vista scelta resta per la volta dopo, su quel browser). Livelli: admin, manager (crea e gestisce i suoi progetti), employee (lavora i task suoi). I miei task (/task): i task assegnati a te in tutti i progetti; il titolo apre il task nel suo progetto (Attività, con la sua scheda aperta), il nome del progetto apre il progetto.',
  tempo:
    'Tempo dichiarato: la sveglia accanto a ogni task avvia il timer, che resta in alto a destra su ogni pagina accanto ad Alfire; fermandolo chiede una nota. Oppure tempo caricato dopo in Il mio tempo (/tempo; per l’admin la voce si chiama Tempo): la durata, o la fascia oraria facoltativa Dalle–Alle da cui si calcola la durata; correggendo una voce la fascia si aggiunge, si cambia o si toglie. Il totale del periodo si divide per progetto e, sotto ogni progetto, per task.',
  team: 'L’admin ha anche la scheda Team (/tempo/team): il tempo già registrato da ognuno nel periodo, persona per persona in ordine alfabetico, per progetto e task, con le voci; mai i timer accesi degli altri, nessun elenco di chi non ha registrato, nessuna classifica. Lo stesso tempo l’admin lo chiede anche ad Alfire (es. «quanto ha registrato una persona negli ultimi 7 giorni, e su cosa?»), con gli stessi limiti.',
  note: 'Note datate e Gantt per progetto.',
  impostazioni: 'Reparti e modelli in Impostazioni › Progetti.',
  clienti:
    'Ogni cliente che inizia il percorso ha il suo progetto in Fitness Coaching, nato da solo, con 8 task del coach senza scadenze dove si registra il tempo (call di onboarding, analisi e strategia iniziale, programmazione allenamento, programmazione alimentare, revisione video, call di check, assistenza chat, altre attività); chi gestisce il progetto sceglie il coach con «Scegli il coach», e la programmazione alimentare va a chi si occupa di nutrizione, se c’è. Quando il cliente rinnova, il suo progetto torna attivo se era completato o archiviato (in pausa resta in pausa), con lo stesso coach, e i task del modello completati prima del rinnovo (nati col progetto, senza una scadenza passata) tornano da fare da soli, anche se il progetto era attivo o in pausa; i task aggiunti dalle persone, i sotto-task e quelli con la scadenza passata restano come sono, il tempo registrato e le note pure. Nel progetto di un cliente, sotto il coach, «Cartella Drive» apre la cartella del cliente su Google Drive: la vedono, la collegano (link incollato o «Scegli da Drive» col proprio account Google), la cambiano e la tolgono solo l’admin e il coach del cliente; gli altri membri non la vedono. Se il coach non trova la cartella su Drive, l’admin gliela condivide. Da Alfire si legge (dettaglio del progetto), non si scrive.',
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

/**
 * The setting topic in its parts (07/10/2026): the report and its metrics for
 * everybody who reads it; the menu from the side of who reads it. The admin
 * has «Setter» and «Closer» instead of the old «Setting» with two tabs; the
 * setter opens «Closer» to read the closer's numbers of every setter. The
 * Insight of the last 24 hours (1.35.0) for both, said where it is: Alfire
 * never reads it (the DMs' text never goes to Groq, CLAUDE.md section 20).
 */
const SETTING = {
  report:
    'Setting: il setter compila ogni giorno "Oggi" (/today), salvataggio automatico. DM outbound: persone nuove a cui scrive lui per primo, contate una volta sola il giorno del primo messaggio. DM inbound: persone nuove che chiedono informazioni e a cui risponde, contate una volta sola il primo giorno. Conversazioni: la persona ha risposto e lui ha risposto di nuovo (se risponde il giorno dopo, è una conversazione di quel giorno); non entrano nei DM totali. Follow up: solleciti a chi non ha ancora risposto, senza divisione inbound/outbound. DM totali = outbound + inbound + follow up. Sotto le conversazioni, "Com’è andata la giornata": lead in target (quasi tutti, circa metà, pochi) e qualità delle conversazioni (buone, medie, scarse), un tocco ciascuna, poi cosa frenava i lead dal fissare la call. Dall’08/10/2026 queste tre risposte sono obbligatorie per il setter nei giorni con DM o conversazioni: i numeri si salvano lo stesso, ma la giornata dice "Manca il commento della giornata" e il numero su "Oggi" la conta, solo al setter; anche la proposta da Instagram il setter la conferma, la corregge o tiene i suoi numeri solo dopo aver scritto il commento di quel giorno (l’admin decide senza, e il commento resta al setter). Nei giorni prima dell’08/10/2026 resta la regola di prima: le due risposte a un tocco chieste nei giorni con DM o conversazioni ("Da completare", solo nei report creati dal 30/09/2026), mai obbligatorie. Domande e contenuti e altre note: sempre facoltative. Nei fogli dell’admin nella pagina Setter (Aggiungi giornata, correzione di un report) sono tutte facoltative. L’admin li legge nella pagina Setter (/setting), sezione «Per il marketing: cosa dicono i lead», insieme al motivo di non chiusura delle call. Call svolte e qualificate non le scrive il setter: le registra il closer su ogni call. Il setter fissa solo discovery call. Crea un lead solo quando fissa una call ("Nuova call"), con la fonte: da lì si contano le prenotate da inbound e da outbound, senza scriverle a mano. Pipeline (/leads): Call fissata → Follow-up → Cliente / Perso, aggiornata a mano. Metriche: tasso di conversazione = conversazioni ÷ DM totali; tasso di prenotazione = call prenotate ÷ call proposte; DM per call prenotata = DM totali ÷ call prenotate; show rate, close rate.',
  menu: 'Nel menu, nel gruppo «Team», due voci al posto di Setting: «Setter» (/setting), con le metriche e i report giornalieri di ogni setter, e «Closer» (/setting/closer), che si apre sulle call da registrare e poi mostra i numeri del closer giorno per giorno. Anche il setter apre «Closer», in sola lettura. Il menu è a gruppi con un titolo ciascuno (Vendite, Team, Marketing, Progetti, Amministrazione), gli stessi sulla barra laterale e nel foglio «Altro» del telefono.',
  menuSetter:
    'La pagina Closer (/setting/closer; sul telefono in «Altro»): i numeri del closer sulle call fissate da tutti i setter, giorno per giorno e per closer, in sola lettura: call svolte, qualificate, no show, follow up, cancellate, chiuse, show rate e close rate, cash e revenue dei clienti nuovi. Mai le call, i lead o le note degli altri setter. I tuoi numeri restano in I miei numeri (/my-numbers).',
  insight:
    'Insight 24h (/insight): non è una voce del menu ma la seconda scheda di «Setter» per l’admin e di «Oggi» per il setter (le schede «Numeri | Insight 24h» e «Il mio giorno | Insight 24h»): il recap dei DM delle ultime 24 ore che Claude prepara ogni sera, con chi aspetta una risposta, il messaggio da copiare e da quale post arriva il lead; Alfire non lo legge.',
}

export const GUIDA = {
  panoramica:
    'Panoramica (/, solo admin): selettore di mese o periodo con confronto col precedente. KPI: cash incassato, revenue firmata (ogni tipo), nuovi clienti, rinnovi, margine operativo (cash - provvigioni - costi, tasse escluse). Sotto il cash, "Di cui" in 4 parti che sommano al totale: nuovi clienti del periodo (incassi delle vendite di tipo nuovo firmate nel periodo), rate di clienti già entrati (vendite nuove firmate prima), rinnovi, upsell; le stesse 4 serie nel grafico dei 12 mesi. Gli indicatori di acquisizione contano solo i nuovi clienti del periodo: cash e revenue per DM, cash per call svolta, valore medio nuovo cliente, e "Da dove arrivano i nuovi clienti" (cash per fonte). "Oggi dal team": incassato oggi (tutto) e di cui nuovi clienti. Funnel DM → conversazioni → call prenotate → svolte → chiuse. Box "Da incassare" (in ritardo, prossimi 30 giorni) e "In scadenza" (chi finisce il percorso entro 30 giorni, iniziato o no, mai i chiusi: come in Rinnovi). Il riepilogo per email arriva agli admin solo il venerdì sera, non più ogni sera: la settimana da sabato a venerdì, con cash incassato e di cui, vendite firmate, rate in ritardo, in scadenza nei 7 giorni, DM, conversazioni, call prenotate, svolte, no show e chiuse, e gli incassi e le vendite giorno per giorno; il lunedì sera arriva anche il backup.',
  vendite:
    'Vendite (/sales): i contratti firmati, cioè chi ha comprato cosa, per quanto e in quante rate. Nuova vendita da Vendite › Nuova vendita (/sales/new); per un cliente già in anagrafica, dalla sua scheda: "Registra la prima vendita" se non ne ha, altrimenti "Ha rinnovato" o "Upsell". Prodotto del catalogo o "Personalizzato" (nome e fine a mano), piano a rate uguali o scritto a mano rata per rata. L’inizio del percorso è proposto una settimana dopo la data di vendita (un rinnovo: il giorno dopo la fine del precedente). La prima rata incassata di una vendita nuova o di un rinnovo apre il progetto del cliente in Progetti, o lo riporta tra gli attivi se era completato o archiviato (in pausa resta in pausa), e se è un rinnovo i task del modello completati prima tornano da fare da soli; un upsell no. La somma delle rate deve coincidere col contratto. Rinnovi e upsell non hanno setter (quindi nessuna provvigione), a meno che nascano da una call fissata. Dal dettaglio si modificano vendita e rate, si aggiungono o tolgono rate, si elimina la vendita.',
  incassi:
    'Incassi (/payments): i soldi, rata per rata; ogni riga dice tipo e rata (es. "Primo percorso · Rata 2 di 4", "Rinnovo · Rata 2 di 2"). Una rata è in ritardo se è prevista e la scadenza è passata. "Segna incassata" con la data di oggi già messa; si può annullare, correggere, registrare un rimborso (provvigione negativa nel mese del rimborso).',
  clienti:
    'Clienti (/clients): stato derivato dalle vendite: attivo, in scadenza (finisce entro 30 giorni senza rinnovo), da iniziare (nessun percorso in corso e uno che comincia più avanti: il cliente nuovo nella settimana prima dell’inizio, o un rinnovo che riparte dopo una pausa), scaduto (finito da meno di 90 giorni), ex cliente, mai attivato; chiuso lo decide l’admin con «Non rinnova» nella scheda (giorno, di base oggi, e motivo facoltativo): vince su tutti gli altri stati anche col percorso ancora in corso (il coach continua fino alla fine), esce da In scadenza e Da recuperare e niente più promemoria del percorso; una nuova vendita nuovo o rinnovo lo riapre da sola, «Riapri» lo riapre a mano. Sospeso (21/10/2026) lo decide l’admin con «Sospendi» nella scheda (giorno, di base oggi, e motivo facoltativo): il cliente va in pausa, in Clienti ha la sua scheda «Sospesi», esce da In scadenza e dai rinnovi da chiamare e niente promemoria; percorso, rate e incassi non cambiano; «Riattiva» lo toglie, e una nuova vendita nuovo o rinnovo o «Non rinnova» la finiscono da sole (chiuso vince). In Clienti le schede «Attivi», «Sospesi», «Chiusi» e «Tutti» elencano i clienti con mese e settimana del percorso, contratto (link a Drive della vendita), cartella Drive, pagato, come pagano e rate da saldare. Un cliente chiuso che non ricompra si archivia con «Archivia come ex cliente» (scheda o Rinnovi): diventa ex cliente, esce da «Non rinnovano» e si trova in Clienti col filtro «Ex cliente»; «Togli dall’archivio» lo rimette chiuso, «Riapri» o una nuova vendita lo riaprono. La scheda ha "Storico percorsi": una scheda per vendita, dalla più recente (Primo percorso, Rinnovo 1, 2…, Upsell), con date, stato (da iniziare, in corso, concluso, interrotto), incassato, da incassare e rate con "Segna incassata". "Ha rinnovato" apre la nuova vendita di tipo rinnovo già compilata: inizia il giorno dopo la fine del percorso precedente, stesso prodotto e prezzo, tutto modificabile; il periodo vecchio resta nello storico. "Interrompi il percorso" chiude prima quello in corso. "Modifica" corregge contatti, fonte, setter, closer e note. Chi finisce entro 30-60 giorni: Rinnovi (/rinnovi), che ha anche «Non rinnovano» (i chiusi, con giorno e motivo, WhatsApp, «Archivia», «Riapri» e il rinnovo a un tocco). «Progetto del percorso» apre il suo progetto in Progetti, con il coach.',
  setting: `${SETTING.report} ${SETTING.menu} ${SETTING.insight}`,
  call:
    'Call (/calls): le fissano il setter (per sé, fino a 7 giorni indietro) e l’admin da Le mie call › "Nuova call" (/calls/new): per sé o per un setter, anche una call già fatta (fino a un anno indietro). Il closer registra l’esito (svolta, no show, cancellata, da riprogrammare; se svolta: qualificata, chiusa / follow-up / persa). Al closer e all’admin la pagina Closer (/setting/closer; per il closer «I miei numeri») mostra in cima le loro call passate ancora senza esito («Da registrare») e quelle di oggi, con gli stessi bottoni; accanto a «Le mie call» e a quella pagina un numero dice quanti esiti mancano, solo a chi li deve registrare. Da riprogrammare sono due scelte: «Ha già una nuova data» e «Sposta» (accanto a Registra esito) chiedono il nuovo giorno e l’ora: la stessa call passa lì e torna da fare, senza esito, e la scheda dice «Spostata dal 30/09 alle 19:00» (e quante volte); conta nel nuovo giorno, il giorno della prenotazione non cambia. «In attesa di conferma» non chiede la data: il lead deve ancora confermarne una, la call resta sul suo giorno senza esito (non conta nello show rate) e sta in cima a Le mie call del closer, sotto «In attesa di conferma»; quando il lead conferma, «Sposta» le dà il nuovo giorno. La spostano il closer, l’admin (anche nel passato) e il setter che l’ha fissata, finché è da fare; da oggi in avanti. Una call svolta o no show non si sposta, per nessuno (il no show resta nello show rate del suo giorno): se l’esito è sbagliato il closer o l’admin lo annulla prima; per rivedere il lead il setter o l’admin fissa una nuova call. La matita corregge data e ora sbagliate senza traccia (il setter solo delle call da fare; il closer e l’admin anche di una call svolta o di un no show, che restano tali: è una correzione, non uno spostamento). Dal 16/10/2026, per una call svolta (chiusa, follow-up o persa), il foglio dell’esito chiede anche il link della registrazione di Fathom: si incolla, oppure si tocca «Call non registrata» (un tocco, senza motivo); no show, cancellata e in attesa di conferma non lo chiedono. In chat il closer e l’admin lo dicono con l’esito («registrazione» con il link, o «non registrata»). L’app trova la registrazione su Fathom e Claude, un’intelligenza artificiale, la analizza: propone la performance e il motivo di non chiusura, che il closer conferma o cambia (Alfire non li scrive); l’analisi della conduzione è solo di chi ha fatto la call. Con follow-up o persa scrive sempre il motivo di non chiusura (obbligatorio: le obiezioni sul prezzo stanno qui) e, se vuole, note aggiuntive. Toccando «Follow-up» il foglio chiede «Hai fissato una call di follow-up?»: «Sì, call fissata» chiede giorno e ora e crea una call nuova collegata alla prima, con lo stesso lead, lo stesso setter e lo stesso closer, da fare in quel giorno (porta «Follow-up della call del …»); «No, follow-up in chat» va avanti senza data. Una call svolta in follow-up senza la sua call di follow-up ha «Fissa la call di follow-up» (il closer della call e l’admin). La call di follow-up conta nei numeri del closer come ogni call, non tra le prenotate del setter; se chiude, la vendita resta del setter della prima call, con la sua provvigione. Esito, motivo e note aggiuntive li scrivono solo il closer e l’admin: il setter li legge sulle call col suo nome (quelle che ha fissato e le loro call di follow-up). Le note del setter (con la matita della call) le scrivono il setter e l’admin, il closer le legge. Se chiusa, si apre la nuova vendita precompilata, col setter della call (anche di una call di follow-up); una call chiusa senza vendita mostra «Vendita da registrare» con «Registra la vendita» (il closer della call e l’admin), così cash, revenue e provvigione del setter non si perdono; se la vendita era già stata registrata senza la call (da Vendite), l’admin la collega dalla scheda della call con «La vendita c’è già: collegala», mai una seconda vendita (Alfire non la collega, e non ne registra un’altra con la call); il closer chiede all’admin di collegarla, e la nuova vendita della call lo avvisa quando ce n’è già una che le somiglia. "Compila la giornata" (/setting/closer/giorno): le call di un giorno con i bottoni dell’esito; la riga del closer (svolte, qualificate, no show, follow up, cancellate, chiuse, cash, revenue) si compila da sola dagli esiti. Cash e revenue contano solo i nuovi clienti: prima rata incassata e contratto delle vendite nuove, nel giorno della vendita. L’admin sceglie il closer e con "Aggiungi una call" aggiunge una call fatta che nell’app non c’è.',
  provvigioni:
    'Provvigioni (/commissions): maturano sull’incasso, non sulla firma: importo incassato × percentuale della regola valida alla data d’incasso e applicabile al tipo di vendita (di solito solo nuovo, rate successive comprese). Le regole si gestiscono in Impostazioni › Regole provvigioni. Si registra il pagamento al setter; il saldo è maturato meno pagato.',
  costi: 'Costi (/expenses): data, categoria (team, software, ads, formazione, altro), importo, ricorrente. Entrano nel margine operativo del mese.',
  progetti: [PROGETTI.struttura, PROGETTI.tempo, PROGETTI.team, PROGETTI.note, PROGETTI.impostazioni, PROGETTI.clienti].join(' '),
  // the Marketing area (1.32.0, the panel, the cells and the posts of Instagram 1.33.0): the admin, the video editor and marketing read it
  marketing:
    'Piano editoriale (area Marketing, /marketing/contenuti, fino al 21/10/2026 «Contenuti»): il calendario dei reel e dei caroselli di Instagram, con le stesse proprietà di Notion (Name, Reel Type, Format, Inspiration, Status, Post Date, Audio, URL, View Count). Una sola vista, la tabella dalla Post Date più recente (Name, Reel Type, Format, Status, Post Date, URL, Views; Inspiration e Audio nel pannello); sul telefono le card. «Nuovo» in alto crea una riga con il cursore nel Name. Reel Type e Format sono etichette colorate che le persone creano e cambiano dalla cella (Crea «nome», Rinomina, dieci colori, Elimina per admin e marketing): non sono una lista fissa. Un tocco sul Name (o sulla card) apre il contenuto in un pannello a lato, a tutto schermo sul telefono, senza cambiare pagina: proprietà, Status e testi si modificano lì e si salvano da soli, con il contenuto precedente e il successivo a un tocco; l’indirizzo (?contenuto=…) si condivide, Esc o Indietro lo chiudono, Cmd o Ctrl e clic apre la pagina intera. Ogni proprietà si cambia anche dalla sua cella (sul telefono Status, Post Date, Reel Type e Format dalla card): una modifica non scrive mai sopra un valore che un altro ha cambiato nel frattempo, e allora mostra quello salvato; lo Status no, vince l’ultimo tocco. Ogni contenuto nasce da un modello di Notion: Reel Topic (Topic / Main Message, Script (Rough Draft) con Hook, Line, Line e CTA, Comments, Script (Final)) o Carousel Topic (Idea/Message, Carousel, Caption); ogni sezione si scrive sul posto anche dal telefono, e se qualcuno l’ha cambiata nel frattempo la pagina ricarica il testo salvato e il tuo resta da copiare. Eliminano un contenuto l’admin e il marketing; il video editor lo segna Canceled. Pubblicati (/marketing/pubblicati, dal 25/10/2026 al posto di «Post di Instagram» e «Analisi»): una riga per ogni post e reel dell’account, dal più recente, con la copertina e l’inizio della didascalia, il contenuto del Piano editoriale a cui corrisponde (il Name con le etichette, che apre il suo pannello) oppure «Collega», e i numeri affiancati: Views, Reach, Salvati, Condivisioni, Commenti di Instagram, DM, lead in target e call prenotate dai DM, e per i reel il punteggio e cosa fare. Un numero che Instagram non ha dato è «–», mai zero. Si filtra per periodo (30, 90, 180 giorni), tipo (reel, caroselli, foto), «Nel piano / Non nel piano» e ricerca nella didascalia; un tocco sulla riga apre il pannello del reel (analisi di Claude, trascrizione, cosa fare). Nessuno deve collegare i post: si legano da soli quando incolli il link del reel nell’URL di un contenuto, e il giro della mattina collega da solo i casi sicuri («Collegato da solo»); «Collega» in una riga, o nel pannello, sceglie a mano un contenuto ancora senza post, e «Scollega» (nel pannello, con «Annulla») toglie il link e quel post non si ripropone più per quel contenuto. Il View Count di un contenuto collegato a un post si compila e si aggiorna da solo dalle views di Instagram (in sola lettura, «Da Instagram: si aggiorna da solo»); se il contenuto non è collegato, o Instagram non ha ancora dato le statistiche, resta quello scritto a mano. «Aggiorna da Instagram» rilegge subito i post (admin e marketing); il video editor li trova aggiornati ogni mattina. I vecchi indirizzi /marketing/instagram e /marketing/analisi portano qui. Alfire per ora non legge e non scrive i contenuti né i post di Instagram.',
  impostazioni:
    'Impostazioni (admin), a gruppi: Team e accessi (inviti via email, ruoli, livelli progetti, disattiva, elimina, unisci profili); Prodotti e provvigioni (prezzo, durata, piano rate abituale; regole provvigioni); Chiavi e collegamenti (/settings/chiavi: lo stato e la guida passo passo per generare o rigenerare le chiavi di Instagram, Messenger, Fathom, Claude e Groq, con i campi dove incollare quelle di Instagram, Messenger e Fathom; Instagram e Messenger per chi lavora i DM e le chat escluse; Fathom per interruttori e limite di spesa); Esporta e backup (Esporta CSV per la commercialista, Registro modifiche); Progetti (reparti e modelli). Il profilo personale (nome, foto) si apre dalla foto in fondo alla sidebar.',
  alfire: guidaAlfire('admin'),
  // «prodotti e prezzi compresi»: products_select_economics (20261009120200, confirmed by Dany on 09/10/2026)
  permessi:
    'Permessi: l’admin vede tutto. Il setter vede i suoi report, i suoi lead e le call col suo nome (quelle che ha fissato e le loro call di follow-up) con il loro esito; in I miei numeri (/my-numbers), dei clienti che ha portato (le vendite col suo nome: i clienti nuovi, più i rinnovi e gli upsell registrati col suo nome), revenue, rate pagate e la sua provvigione su ogni incasso, e i suoi totali di provvigioni. Nella pagina Closer (/setting/closer) legge i numeri del closer sulle call di tutti i setter, giorno per giorno, cash e revenue compresi, mai le call, i lead o le note degli altri. Mai contatti dei clienti né clienti di altri. Il closer vede le call assegnate a lui, le vendite chiuse da lui e la sua giornata. Nessun collaboratore vede costi, margine o compensi altrui. Coach, video editor, nutrizione e sviluppo vedono i progetti di cui sono membri, i loro task e il loro tempo, mai i soldi dei clienti. Il ruolo Marketing (e il video editor) vede l’area Marketing, il calendario dei contenuti, e i Progetti di cui fa parte; mai soldi, prodotti e prezzi compresi, lead, call, clienti o DM. Il tempo degli altri lo vede, oltre all’admin, chi gestisce un progetto, nella scheda Tempo del progetto; Alfire lo legge solo all’admin. La cartella Drive di un cliente la vedono e la cambiano solo l’admin e il coach del progetto di quel cliente: chi gestisce il progetto sceglie il coach, quindi anche chi la vede.',
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
    // his report, then the Closer page he reads (07/10/2026): never the admin's menu
    setting: `${SETTING.report} ${SETTING.menuSetter} ${SETTING.insight}`,
    provvigioni:
      'Le tue provvigioni (I miei numeri, /my-numbers): maturano sull’incasso, non sulla firma: su ogni rata incassata dei clienti nuovi che hai portato tu, rate successive comprese, nel mese in cui è incassata. Rinnovi e upsell nascono senza setter, quindi senza provvigione, a meno che nascano da una call fissata da te. Un rimborso toglie la provvigione nel mese del rimborso. Per mese vedi maturato, pagato e saldo; in «I tuoi clienti», la provvigione di ogni incasso. I pagamenti li registra l’admin.',
    permessi:
      'Permessi del setter: i suoi report, i suoi lead e le call col suo nome (quelle che ha fissato e le loro call di follow-up, che fissa il closer), con l’esito, il motivo di non chiusura e le note aggiuntive del closer (le legge, non le scrive). In I miei numeri (/my-numbers), dei clienti che ha portato (i clienti nuovi, più i rinnovi e gli upsell registrati col suo nome): revenue, rate pagate e la sua provvigione su ogni incasso, e i suoi totali di provvigioni. Nella pagina Closer (/setting/closer), in sola lettura, i numeri del closer sulle call di tutti i setter, giorno per giorno, cash e revenue compresi: mai le call, i lead o le note degli altri setter. Mai i contatti dei clienti, né clienti e provvigioni di altri. Alfire gli dà gli stessi numeri: i suoi, e quelli del closer come la pagina. Nei progetti: quelli di cui è membro, i suoi task e il suo tempo; il tempo degli altri solo nei progetti che gestisce, nella scheda Tempo del progetto (Alfire non lo legge).',
  },
  closer: {
    vendite:
      'Le tue vendite (Le mie vendite, /my-sales): quelle dove sei il closer, nuovi clienti, rinnovi e upsell. Con l’esito «Chiusa» di una call si apre «Nuova vendita» già compilata (cliente, setter, closer e la call), con la data di vendita nel giorno della call: prodotto del catalogo o "Personalizzato", piano a rate uguali o scritto rata per rata, e la somma delle rate deve coincidere col contratto. L’inizio del percorso è proposto una settimana dopo la data di vendita: controllalo. La prima rata incassata di una vendita nuova o di un rinnovo apre il progetto del cliente in Progetti. Una call chiusa senza vendita resta in Le mie call con «Vendita da registrare» e «Registra la vendita»; se la vendita è già stata registrata senza la call, chiedi all’admin di collegarla, perché «Registra la vendita» ne farebbe una seconda. Anche la vendita di una call di follow-up va al setter della prima call. Correggere la vendita, cambiare il piano rate ed eliminare restano all’admin.',
    incassi:
      'Gli incassi delle tue vendite: apri la vendita da Le mie vendite (/my-sales) e tocca «Segna incassata», con la data di oggi già messa; un incasso si corregge o si annulla, e una rata da incassare si segna fallita. Una rata è in ritardo se è da incassare e la scadenza è passata. Scadenze, importi delle rate, rate in più o in meno e rimborsi li cambia l’admin.',
    permessi:
      'Permessi del closer: le call assegnate a lui (esito, motivo di non chiusura e note aggiuntive li scrive lui; le note del setter le legge), le vendite chiuse da lui con le loro rate, di cui registra gli incassi, e la sua giornata (I miei numeri, /setting/closer, che si apre sulle sue call da registrare). Mai vendite o call di altri closer. Alfire gli dà le stesse vendite, rate e giornate, solo le sue. Nei progetti: quelli di cui è membro, i suoi task e il suo tempo; il tempo degli altri solo nei progetti che gestisce, nella scheda Tempo del progetto (Alfire non lo legge).',
  },
}

/** The Projects area's roles (coach, nutrition, development): no money, nothing that is not theirs. */
const PERMESSI_PROGETTI =
  'Permessi: vedi i progetti di cui sei membro, con liste, task e note; lavori i task assegnati a te o creati da te, e chi gestisce un progetto li lavora tutti. Il tempo è il tuo: lo registri, lo correggi e lo leggi. Quello degli altri lo vede chi gestisce un progetto, nella scheda Tempo del progetto; Alfire non lo legge. Nei progetti di cui sei il coach vedi anche la cartella Drive: la apri, la colleghi, la cambi o la togli; gli altri membri del progetto non la vedono. Le altre aree del gestionale non sono del tuo ruolo.'

/**
 * The video editor and marketing (1.32.0): the Marketing area, then the same
 * Projects permissions as PERMESSI_PROGETTI. No money, nothing that is not theirs.
 */
const PERMESSI_MARKETING =
  'Permessi: nell’area Marketing vedi, crei e modifichi il calendario dei contenuti di Instagram (reel e caroselli: proprietà, Status e testi); lo eliminano l’admin e il marketing. I messaggi diretti e i nomi di chi scrive all’account non li vedi. Nei Progetti vedi quelli di cui sei membro, con liste, task e note; lavori i task assegnati a te o creati da te, e chi gestisce un progetto li lavora tutti. Il tempo è il tuo: lo registri, lo correggi e lo leggi. Quello degli altri lo vede chi gestisce un progetto, nella scheda Tempo del progetto; Alfire non lo legge. Nei progetti di cui sei il coach vedi anche la cartella Drive: la apri, la colleghi, la cambi o la togli; gli altri membri del progetto non la vedono. L’area Economics non è del tuo ruolo.'

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
    // the content calendar first: the Marketing area (1.32.0)
    case 'editor':
    case 'marketing':
      return ['marketing', 'progetti', 'alfire', 'permessi']
    default:
      return ['progetti', 'alfire', 'permessi']
  }
}

/** A topic's text for who asks: the Alfire topic says what this role does, the others what concerns that role. */
export function testoGuida(argomento: ArgomentoGuida, ruolo: AppRole): string {
  if (argomento === 'alfire') return guidaAlfire(ruolo)
  if (argomento === 'permessi' && haMarketing(ruolo) && ruolo !== 'admin') return PERMESSI_MARKETING
  if (argomento === 'permessi' && !haEconomics(ruolo)) return PERMESSI_PROGETTI
  if (argomento === 'progetti' && ruolo !== 'admin') return PROGETTI_TEAM
  return PER_RUOLO[ruolo]?.[argomento] ?? GUIDA[argomento]
}
