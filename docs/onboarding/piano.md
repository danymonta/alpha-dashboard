# Onboarding guidato: piano di lavoro

Risposta alla specifica `docs/onboarding/specifica-v7.md` (versione 7, 12/11/2026). Stato: **proposta, in attesa del sì di Dany**. Niente schema né autenticazione si tocca prima.

Come è nato: nove lettori in parallelo (repository alla 1.76.0, le 12 pagine Notion, i documenti di Ivan, il foglio, i calendari, la documentazione esterna), poi cinque revisori indipendenti che hanno attaccato la prima bozza (sicurezza, fedeltà alla specifica, fattibilità, privacy e regole, casi limite). Dei 60 rilievi, i 29 gravi delle prime quattro lenti sono stati verificati sul codice da un secondo agente: 28 hanno retto e sono in questa versione. La verifica dei rilievi sui casi limite non è girata (limite di utilizzo): li ho controllati io sulla specifica e incrociati con gli altri.

## 1. Cosa esiste già e si riusa

| Pezzo della specifica | Cosa c'è nel gestionale |
|---|---|
| Wizard, schermate Cliente e Vendita | «Nuova vendita» anche dalla call chiusa; `registra_vendita` in una transazione |
| Progetto del cliente | `pm_crea_progetto_cliente`, modello «Percorso cliente», `pm_scegli_coach`, coach e responsabile del progetto, timer e pausa |
| Codice via email | OTP di Supabase Auth per il team (8 cifre, 60 minuti) |
| Un'area chiusa per un solo tipo di utente | il recap del business coach: gruppo di route a parte, test «zero righe su ogni tabella» |
| Notifiche con campanella | tabella `notifiche`, già con il campo `canale`; ogni ruolo legge solo le sue |
| Lavori frequenti con nuovi tentativi | `pg_cron` + `pg_net` verso `/api/cron/*`, con lease e chiave nel Vault |
| Segreti incollati dall'admin | Vault e pagina Impostazioni › Chiavi e collegamenti |
| Email | Resend (`lib/email/invia.ts`) |
| Form con salvataggio automatico | Oggi del setter |
| Editor e pagine in Markdown | Tiptap e renderer del Piano editoriale |
| Board a colonne | I miei task a bacheca |

Non esistono: Alpha Loom e `auth@percorsoalpha.com` (qui l'unico OTP è quello di Supabase), API Google lato server, un player video, un CMS, bucket privati, la libreria `motion`, uno stato «vendita annullata», un campo Telegram sul cliente, un ruolo cliente o revisore.

## 2. Dove la specifica contraddice `CLAUDE.md` o i dati

`CLAUDE.md` chiede di fermarsi e segnalare.

| # | Punto | Specifica | Oggi | Proposta |
|---|---|---|---|---|
| 1 | Dati sanitari | Questionario con infortuni, peso, sonno; consenso | Sezione 15: «Nessun dato sanitario in questa app» | Sezione 15 riscritta: i dati sulla salute stanno solo in `onboarding_questionari` e nel bucket privato; mai in backup via email, Alfire, Claude collegato, notifiche, log |
| 2 | Chi può entrare | I clienti si registrano da un link | Sezione 7: solo su invito del team | Sezione 4.1 e 4.2 di questo piano |
| 3 | Ruolo `client` | Un ruolo nuovo | Un valore nuovo in `app_role` leggerebbe la rubrica del team e potrebbe collegare Claude e usare Alfire | Nessun ruolo: tabella `clienti_account`, nessuna riga in `profiles` |
| 4 | Sorveglianza | Ore di fermo, allarme «programma oltre 48 ore», tempo medio alla prima scheda | Sezione 17: nessun avviso su ciò che un collaboratore non ha fatto. Le eccezioni sono elencate come «le sole» | Serve una terza eccezione scritta: decisione 4 |
| 5 | Quando nasce il progetto | Alla conferma, prima del pagamento | Sezione 8: alla prima rata incassata | Il wizard apre il progetto subito; i trigger di oggi restano. Il coach entra nel progetto solo quando il link si attiva |
| 6 | Call di onboarding | «Call nel gestionale, tipo onboarding» | `calls` vuole un lead e ogni metrica di vendita conta ogni call | Tabella a parte `clienti_call` |
| 7 | Revisore | Ruolo revisore | Ivan e Lorenzo sono tutti e due coach | Nessun ruolo: gli incarichi stanno in `onboarding_incarichi`, scritti solo dall'admin |
| 8 | OAuth sul calendario | OAuth con `events.watch` | Sezione 33: in un'app «In test» il permesso scade ogni 7 giorni | Service account |
| 9 | B.4: call sul calendario di Dany | Dany invitato con `events.patch` | Un service account non può aggiungere invitati | Copia sul calendario condiviso: decisione 5 |
| 10 | Polling ogni 2 minuti | Cron | Vercel Hobby: un cron al giorno | `pg_cron` |
| 11 | Stack e design | Motion, contatore che scorre, glow, razzo | Sezione 4: stack deciso; sezione 11: nessun numero animato | `motion` con versione esatta, solo nell'area cliente, nuovo «momento di brand» |
| 12 | Nomi | Inglese, camelCase | Sezione 8: italiano, `snake_case` | Italiano |
| 13 | Lingua | Solo italiano | Sezione 32: italiano e inglese | Area cliente solo in italiano, eccezione scritta |
| 14 | Segreti | Variabili d'ambiente | Vault | Sezione 5.2 |
| 15 | Riepilogo email giornaliero | Facoltativo | 07/10: «mi basta ogni venerdì» | Non costruito |

Tre deroghe alla lettera della specifica che ti chiedo di confermare (sezione 6): la call non arriva come invito sul tuo calendario (B.4); i consensi alle wins non stanno nello step 2 e non sono obbligatori; le colonne sulla salute non vanno sul foglio finché chi segue la parte legale non ha visto il consenso (B.2).

Differenze tra la specifica e le fonti:

- **Test:** il template dice 3 giorni (13 esercizi, 14 video YouTube pronti), Ivan a voce dice 2 sessioni.
- **Fine dell'onboarding:** per Ivan «ongoing» scatta al template alimentare, per la specifica al programma. Il PDF alimentare arriva dopo 5 giorni di dati, quindi dopo la scheda.
- **Pagina di prenotazione:** l'unica vista è «Checkpoint Periodico Con Il Coach», 15 minuti, usata anche per l'onboarding. Un account Google gratuito ha una sola pagina.
- **Calendario condiviso:** non esiste. Il calendario di Ivan non è visibile dal tuo account.
- **Foglio:** la colonna F nello storico ha l'età, non la data di nascita. Le colonne AD-AF hanno pagamenti e somme, e Ivan modifica il foglio: il requisito «il coach non vede quanto paga un cliente» è già violato lì, fuori dall'app.
- **Guide Notion:** sono copie dentro la dashboard di un cliente, non un modello. Parlano in prima persona, dicono sia «Yazio gratuito basta» sia «acquista Yazio premium», e 9 immagini su 11 ritraggono una persona, 5 in intimo.
- **Minori:** il flusso commerciale prevede anche clienti tra 14 e 17 anni; la specifica non ne parla.
- **38 passaggi, 18 manuali:** nel documento di Ivan non ci sono.

**Da controllare subito, a prescindere da questo lavoro.** In locale Supabase accetta una registrazione diretta con password senza conferma dell'email. Se nel cloud è lo stesso, chi conosce l'email di un invito del team ancora in attesa può creare l'account al posto della persona invitata. Controlla in Supabase › Authentication › Sign In / Providers › Email che «Confirm email» sia acceso, e dimmi cosa trovi.

## 3. Cosa non è fattibile come scritto

| Richiesta | Perché | Alternativa |
|---|---|---|
| Dany invitato a ogni call | Limite del service account | Copia sul calendario condiviso, a cui ti iscrivi |
| Precompilare nome ed email nell'iframe di Google | Nessun parametro; da Telegram il cliente risulta non loggato | «Usa questa email», riscontro nello step e coda «da collegare» |
| Video al 90% su Loom | Loom non dà la percentuale | Video obbligatori su YouTube non in elenco |
| Video di Notion nello Storage | Supabase Free: 1 GB, 50 MB a file | YouTube non in elenco; nello Storage solo immagini |
| Upload nella cartella Drive del cliente | Un service account non ha spazio su un Drive personale | Bucket privato |
| Calendario libero per Ivan e Dany insieme | Piani Google a pagamento | Vale la disponibilità di Ivan |
| Riuso della mail del codice del team | Ha il pulsante «Entra», che per un cliente consuma il codice e lo butta fuori | Mail propria con il solo codice (4.2) |

Da provare come primo passo, perché la documentazione non era raggiungibile da qui: l'embed `?gv=true`; un service account su un calendario Gmail condiviso; se la pagina di prenotazione può scrivere su un calendario secondario; `auth.admin.generateLink` che restituisce il codice senza spedire; `admin.createUser` con un id scelto dal server.

## 4. Architettura proposta

### 4.1 Account del cliente

- `clienti_account`: utente → cliente, uno a uno, stato `attivo`, `sospeso`, `chiuso`. Nessuna riga in `profiles`, nessun valore nuovo in `app_role`.
- `current_role()` per un cliente è null: policy, RPC, Alfire e server MCP esistenti lo rifiutano. Due cose restano aperte e si chiudono nella stessa migration: il bucket pubblico `avatari` (oggi accetta qualsiasi utente autenticato) e nessuna tabella dell'onboarding in Realtime.
- `cliente_corrente()`: l'id del cliente, o null per un token di Claude, per chi ha un profilo e per un account chiuso. Letture del cliente con RLS su `client_id`; scritture solo da RPC che controllano account attivo e step.
- **Un solo punto decide dove va un utente autenticato** (`destinazioneUtente`): profilo attivo → la sua pagina; account cliente → `/percorso`; nessuno dei due → uscita e pagina ferma, mai un rimando a `/login`. Lo usano il controllo dopo il login, `requireProfilo`, il nuovo `requireCliente` e il proxy. Senza questo, oggi un cliente con la sessione viva entra in un ciclo di redirect.
- Pagine: `app/(cliente)/percorso`, senza shell, Alfire, campanella e tutorial. `/join` e `/entra` pubblici.
- Nome, foto e ruolo del team arrivano al cliente da una funzione dedicata, mai allargando `profiles` e mai con l'email.
- Test: un cliente e un utente senza niente provano ogni tabella, view, funzione eseguibile e lo Storage; passano solo le righe dell'onboarding del cliente.

### 4.2 Link, registrazione e rientro

- `/join/nome-cognome-<token>`. In tabella l'hash sha256. Il token in chiaro resta leggibile dall'admin, in una tabella a parte fuori dal backup, finché l'invito non è usato: così «Copia link» funziona anche quando il pagamento arriva giorni dopo, e il link già incollato nel gruppo resta valido. «Rigenera link» revoca il precedente.
- Apertura con GET: solo il nome di battesimo e «Continua». Telegram apre i link per l'anteprima: il token non si consuma e l'email non è nell'HTML.
- «Continua» scambia il token con un cookie di 30 minuti e porta a una pagina senza token nell'indirizzo. Intestazioni `no-store`, `noindex`, `Referrer-Policy: same-origin`.
- **Nessun utente nasce prima che l'email sia provata.** Il server manda con Resend una mail con il solo codice, parole di Percorso Alpha e nessun link; hash del codice, scadenza e tentativi stanno sull'invito (3 email e 5 invii all'ora, 5 codici sbagliati). Con token e codice giusti il server crea l'utente con un id riservato sull'invito, scrive `clienti_account` nella stessa operazione e apre la sessione.
- Il trigger su `auth.users` ammette un cliente solo se l'id è quello riservato da un invito attivo. Non guarda mai l'email, non crea mai `profiles`. Una registrazione diretta alle API di Supabase non può scegliere il proprio id.
- `/join` rifiuta, con la stessa frase neutra, un'email che è già di un collaboratore o di un invito del team. Un collaboratore non diventa cliente con lo stesso utente.
- Stati del link: `in_attesa_pagamento`, `attivo`, `usato`, `scaduto`, `revocato`. Scade 14 giorni dopo l'attivazione. Una pagina per ogni stato, con i testi della specifica.
- **Rientro:** `/join` con link usato dice «Hai già il tuo accesso» con «Entra». Pagina `/entra` per i clienti, raggiungibile anche da `/login`: email e codice, risposta neutra come oggi.
- Se l'email scelta è diversa da quella della scheda: la scheda si aggiorna, evento nel registro, notifica al team senza l'indirizzo nel testo.
- Rischio da accettare, perché è nella specifica: chi ha il link prima del cliente si registra con la propria email. Il link va mandato solo nel gruppo privato.

### 4.3 «Nuovo cliente», avvio e gate pagamento

- Due funzioni. `avvia_onboarding(vendita, incarichi, contatti, telegram)`: fa tutto tranne la vendita; vale solo per una vendita `nuovo` senza un invito vivo; se la vendita ha già un incasso, il link nasce attivo. `nuovo_cliente(...)` = `registra_vendita` + `avvia_onboarding`, in una transazione.
- Ingressi: il wizard in 3 schermate dalla call chiusa senza vendita e dal menu Clienti; «Avvia onboarding» sulla scheda della vendita, del cliente e della call che ha già la sua vendita (solo le schermate Cliente e Team). Nella sezione Onboarding l'elenco «Vendite nuove senza onboarding»: copre le vendite registrate da «Nuova vendita», da Alfire e da Claude.
- Un rinnovo non crea mai un invito. Un cliente che ha già un account non ne riceve un secondo.
- Schermata finale e schede: stato del link, «Copia link», messaggio pronto, «Conferma pagamento», «Rigenera link».

Gate e revoca, per transizione. Nessun trigger blocca mai un incasso, un rimborso o un'eliminazione.

| Evento | Effetto |
|---|---|
| Una rata della vendita passa a incassata (da qualunque strada: pagina, closer, Alfire, Claude) | Invito `attivo`, scadenza a 14 giorni, evento, notifica agli admin, il coach entra nel progetto |
| «Conferma pagamento» dell'admin | Come sopra, con riga nel registro. Non registra nessun incasso |
| Rimborso totale dell'unico percorso pagato | Invito `revocato`, account `sospeso` |
| Vendita eliminata e nessun altro percorso incassato | Come sopra; il progetto si archivia (decisione 7) |
| Incasso annullato o corretto | Niente in automatico: un'annotazione per l'admin. Un errore di data non toglie l'accesso a nessuno |
| Vendita spostata su un altro cliente | Invito non usato revocato; se l'account esiste, segnalazione all'admin |
| «Revoca» e «Riattiva» dell'admin | Sempre possibili, con riga nel registro |
| Nuova rata incassata di un percorso del cliente | Account di nuovo `attivo` |

Un account sospeso vede una pagina sola: «Il tuo accesso è sospeso. Scrivi nel tuo gruppo Telegram».

### 4.4 Incarichi, progetto e task

- `onboarding_incarichi` (cliente, coach, revisore, responsabile): la scrive solo l'admin dell'app. È l'unica fonte per chi legge questionario, allegati e video visti. Oggi il coach di un progetto lo può cambiare un manager, anche nominando sé stesso e anche da Claude: per questo l'accesso ai dati sulla salute non si appoggia lì.
- Il wizard allinea il coach del progetto all'incarico; il contrario non vale. Se divergono, la scheda dell'admin lo dice con un tocco per riallinearli.
- Modello «Onboarding cliente», applicato come lista «Onboarding» nel progetto del cliente. Gli 8 contenitori di «Percorso cliente» restano.
- Sui task: `per_incarico`, `regola_scadenza`, `chiave_onboarding`, non modificabili da una sessione. `pm_scegli_coach` non tocca i task con un incarico; un task il cui incarico è vuoto resta senza assegnatari.
- `pm_apri_progetto_cliente` esclude i task di onboarding: non si riaprono al rinnovo.
- **La verità è lo step, il task è lo specchio.** Evento → task (call svolta, programma consegnato) e task → step (un trigger su `pm_task` fa avanzare lo step quando il coach spunta «Imposta obiettivo SMART», anche da I miei task, Alfire o Claude). Riaprire il task non riporta indietro lo step. Uno step non dipende mai dall'esistenza del task.
- Fonti delle scadenze, senza integrazione con Coach Plus: «ultimo test» è la spunta dell'ultima sessione nello step 11, confermata dal coach; «quinto giorno» è la quinta spunta di tracciamento.
- Task che il modello della specifica non ha e Ivan fa oggi: messaggio dopo la call con la data del checkpoint, controllo dei dati nella settimana test, video della scheda. Li aggiungo se dici sì.
- Il nome del progetto resta il nome del cliente.

### 4.5 Step, blocco lato server e timeline

- `onboarding_passi_def` per versione del flusso: chiave, nodo, tipo, `sblocca_dopo`. Non è una fila: gli step 5-8 dipendono dal 4 e corrono accanto all'attesa della call; il 9 dipende solo dal 4. La call si fa anche se 5-8 non sono finiti.
- Una riga per cliente e step. Stati: `bloccato`, `disponibile`, `in_corso`, `inviato`, `in_attesa_team`, `fatto`.
- Una sola RPC per avanzare. I contenuti degli step non ancora sbloccati non arrivano al browser.
- Quando il cliente aspetta il team, il pannello lo dice: cosa sta facendo il coach, entro quando, cosa può rileggere. Nessun pulsante.
- **Il cliente va avvisato quando tocca di nuovo a lui** (call confermata, obiettivo pronto, programma consegnato): email con Resend, oppure «Copia il messaggio per Telegram» per il coach. Decisione 14.
- `onboarding_stima` in SQL: data stimata, azioni del cliente rimaste («Ti restano N cose da fare» conta solo le sue), elenco dei video obbligatori non visti. Riparte da oggi a ogni stadio; mai un numero negativo; «Ci siamo quasi» solo quando manca la consegna del programma.
- Timeline: 7 nodi definiti per versione; nodi come pulsanti con etichetta, frecce, `aria-disabled`; Motion caricata dopo il primo disegno; rami statici con riduzione movimento, con un test.
- Azioni del team: «Sblocca step» con motivo, «Riavvia onboarding» (tiene questionario e consensi), solo admin e coach incaricato, con riga nel registro.

### 4.6 Prenotazione e calendari

- Nel primo rilascio ai clienti lo step 4 è manuale: «Apri il calendario», poi il cliente tocca «Ho prenotato» e indica giorno e ora; il coach conferma e mette il link Meet. Nasce la riga di `clienti_call`.
- Poi il rilevamento automatico sostituisce la conferma, senza cambiare il flusso.
- **Service account in sola lettura sul calendario di Ivan.** La scrittura serve solo sul calendario condiviso. Meglio ancora, se Google lo consente: la pagina di prenotazione scrive su un calendario dedicato e Ivan condivide solo quello. Gli eventi che non sono prenotazioni si scartano in memoria, mai salvati né nei log.
- Lettura con `syncToken` da `pg_cron`: ogni minuto finché un cliente ha lo step 4 aperto da meno di 24 ore; ogni 15 minuti per spostamenti e cancellazioni delle call future.
- Marcatore: organizzatore = coach, titolo della pagina, descrizione che inizia con «Prenotato da» o «Booked by».
- Collegamento per email, solo per un cliente con lo step 4 aperto e senza una call futura. Il cliente vede giorno e ora collegati, con «Non sono stato io». Senza riscontro dopo 3 minuti: «Hai prenotato ma non vedi la conferma?».
- Tipo: onboarding se lo step 9 non è fatto, checkpoint altrimenti. Un checkpoint non tocca mai gli step. Le prenotazioni di chi non ha un account si ignorano.
- Una cancellazione riapre lo step 4 solo se la call non è svolta ed è nel futuro. Gli step 5-8 già fatti restano fatti.
- Coda «Call da segnare»: call passate ancora prenotate, con «Svolta», «Non si è presentato», «Spostata».
- La copia sul calendario condiviso porta nome del cliente e link Meet. Mai email, telefono o testo scritto da chi prenota.
- Link di prenotazione e calendario sono per coach. Con un coach senza calendario collegato lo step 4 resta manuale.

### 4.7 Questionario, file e foglio

- 4 schermate, salvataggio automatico con versione, ripresa da un altro dispositivo.
- Il server rifiuta di salvare senza il consenso sulla salute in vigore.
- File: upload diretto dal browser al bucket privato con un indirizzo firmato creato dal server; cartella per cliente; limiti di tipo e dimensione; foto ridotte nel browser. Lettura con indirizzi firmati a scadenza breve.
- Email e telefono non si copiano nel questionario: restano sulla scheda del cliente. Al coach arriva lo username Telegram.
- Foglio: coda con nuovi tentativi; la coda tiene solo l'id del questionario. L'app salva l'intervallo scritto e non legge mai il foglio. Testo del cliente scritto come testo semplice, mai come formula. Colonna F: l'età, come lo storico. Una colonna in fondo con un identificativo opaco, per ritrovare la riga a una cancellazione.
- Quali colonne sulla salute vanno sul foglio: decisione 3.

### 4.8 Contenuti e video

- `contenuti_blocchi` con blocchi tipizzati: testo, avviso, video, immagine, galleria con esito, domande espandibili, pulsante, pdf.
- I testi dei consensi stanno nel codice, con una versione: non si cambiano dopo che qualcuno li ha accettati.
- `clienti_consegne`: i materiali del singolo cliente (video della sua scheda, il suo modello alimentare), che il CMS globale non può contenere.
- Player YouTube: conta i secondi davvero visti, salva ogni 10-15 secondi con una route, dominio senza cookie, caricamento al tocco.

### 4.9 Vista team e notifiche

- Vista predefinita: una lista in tre gruppi, «Tocca a noi», «Tocca al cliente», «In attesa di pagamento o di registrazione». La board a colonne è la seconda vista, da computer.
- Code: richieste di accesso alla community, presentazioni da controllare, prenotazioni da confermare o da collegare, call da segnare, preparazione incompleta.
- Lo stato del pagamento vive solo nell'invito, che legge l'admin. Coach e revisore vedono un cliente da «registrato» in poi; un account sospeso per loro è «In pausa», senza motivo.
- Notifiche per incarico: all'admin tutte; al coach registrazione, questionario, call e ciò che aspetta lui; al revisore solo «test da rivedere». Nessuna notifica porta a una pagina che il destinatario non può leggere. Mai importi, mai email nei testi.

### 4.10 Cancellazione, conservazione, backup

- Ogni tabella dell'onboarding segue il cliente (`on delete cascade`). Eliminare un cliente mette in coda un lavoro che toglie file, utente di accesso e copia sul calendario; una pulizia notturna cerca i resti. La riga sul foglio resta, e la domanda prima dell'eliminazione lo dice.
- Il backup via email esclude questionari, allegati e token dei link. Il resto ci sta, così un ripristino non perde chi è invitato e a che punto è.
- Conseguenza: senza Supabase Pro i questionari non hanno nessuna copia. Pro diventa una condizione del primo rilascio ai clienti.
- Durate di conservazione: decisione 8.

## 5. Modello dati

### 5.1 Tabelle

Nomi in italiano. Ogni tabella con RLS, `_mai_da_oauth` e `revoke all` da `anon`. Niente `created_by → profiles` sulle righe scritte dal cliente.

| Tabella | Contenuto | Chi legge | Rilascio |
|---|---|---|---|
| `onboarding_inviti` | cliente, vendita, slug, hash del token, stato, attivazione, scadenza, id riservato, codice | admin | A |
| `onboarding_inviti_token` | il token in chiaro finché l'invito non è usato | admin | A |
| `onboarding_incarichi` | coach, revisore, responsabile del cliente | admin; gli incaricati la propria riga | A |
| `onboarding_percorsi` | versione del flusso, stato, giorno zero | admin, incaricati (da «registrato»), il cliente | A |
| `onboarding_passi_def` | step e nodi per versione | chi ha un percorso | A |
| `onboarding_passi` | stato e date per cliente e step; mai risposte | come `onboarding_percorsi` | A |
| `onboarding_eventi` | registro; attore come testo (`cliente`, `team`, `sistema`); mai email o risposte | admin | A |
| `onboarding_impostazioni` | durate, link, incarichi predefiniti, `aperto_ai_clienti` | admin | A |
| `clienti_telegram` | username, community, presentazione, gruppo privato | admin, coach, il cliente | A |
| `clienti_account` | utente → cliente, stato | admin; il cliente la sua | B |
| `clienti_consensi` | tipo, versione del testo, dato il, revocato il | admin, il cliente | B |
| `onboarding_questionari` | risposte | admin, coach incaricato, il cliente | B |
| `onboarding_allegati` | file del questionario | come sopra | B |
| `onboarding_video_visti` | secondi visti per blocco | admin, coach, il cliente | B |
| `clienti_call` | onboarding e checkpoint: quando, Meet, stato | admin, coach, il cliente | B |
| `clienti_consegne` | materiali del singolo cliente | admin, coach, il cliente | B |
| `contenuti_blocchi` | il CMS | admin scrive; il cliente i pubblicati del suo step | B |
| `onboarding_lavori`, `onboarding_lavori_stato` | coda e lease | nessuna sessione | C |
| `google_collegamento`, `coach_prenotazioni` | stato del service account; pagina e calendario per coach | admin | C, D |

Modifiche all'esistente: colonne su `pm_modelli`, `pm_modelli_voci`, `pm_task`; funzioni ricreate `pm_scegli_coach`, `pm_apri_progetto_cliente`, `handle_new_user`, `backup_completo`, `anteprima_eliminazione`, `elimina_cliente`, `elimina_persona`, `unisci_profili`; policy del bucket `avatari`; check dei tipi di `notifiche`.

### 5.2 Dove vanno gli identificativi della specifica

| Specifica | Dove |
|---|---|
| `ADMIN_EMAIL`, `COACH_EMAIL` | `onboarding_impostazioni`: incarichi predefiniti, scelti tra i profili |
| `SHARED_CALENDAR_ID`, `BOOKING_SCHEDULE_URL`, `INTAKE_SHEET_ID`, `COMMUNITY_INVITE_URL` | `onboarding_impostazioni` e `coach_prenotazioni`, modificabili dall'admin senza deploy |
| Credenziali SMTP | Non servono: i codici ai clienti partono da Resend |
| Chiave del service account | Vault, incollata dalla pagina Chiavi |
| Variabili nuove in `.env.example` | Solo quelle dei server finti e dell'indirizzo dei passi in locale |

## 6. Decisioni che servono da te

Le prime otto bloccano l'inizio. Per ognuna la scelta che consiglio.

1. **Dati sanitari nel gestionale**, con la sezione 15 riscritta. Foto del fisico solo su Coach Plus. Sì.
2. **Account cliente senza ruolo e accesso come in 4.1 e 4.2.** È la modifica all'autenticazione: nuovo ramo nel trigger degli utenti, controllo dopo il login, proxy, pagina `/entra`, policy delle foto profilo. Sì.
3. **Foglio e salute.** Consiglio: fino al parere legale sul consenso, sul foglio vanno le colonne non sanitarie; restano vuote K (infortuni), E, R, T, V, X. Poi K ci va solo con un consenso separato e facoltativo per l'uso di marketing. È una deroga alla tua decisione B.2: dimmi se preferisci la riga completa da subito.
4. **Sorveglianza: terza eccezione alla sezione 17.** Due testi pronti.
   - *Opzione A, consigliata:* la board mostra l'attesa come stato del cliente; l'allarme delle 48 ore e «bloccato» sui passi del team sono una notifica solo per chi ha l'incarico; nessuna media, storico o filtro per collaboratore; non si mostra chi ha verificato.
   - *Opzione B:* come A, più la notifica a te e il tempo medio alla prima scheda.
   - In tutti e due i casi: con un coach solo ogni attesa è riconoscibile, e Ivan e Lorenzo lo sanno prima del rilascio. Nessun task si chiude perché qualcuno ha aperto una pagina.
5. **Calendario con service account.** Sul tuo calendario la call non arriva come invito: la vedi dal calendario condiviso. Va bene?
6. **Call di onboarding e checkpoint in `clienti_call`**, fuori dalle metriche di vendita. Sì.
7. **Minori.** Consiglio: il wizard chiede se il cliente è maggiorenne; per un minore il link resta fermo finché non registri il consenso del genitore; sotto i 14 anni nessun invito; niente wins.
8. **Piani e conservazione.** Supabase Pro prima del primo cliente vero (backup dei questionari). Vercel Hobby è per uso non commerciale: consiglio Pro. Durate proposte: questionario, allegati e video visti 12 mesi dopo la fine dell'ultimo percorso; inviti non usati 30 giorni; registro 24 mesi.

Servono prima del rilascio in cui compaiono:

9. Consensi: nello step 2 solo quello sulla salute; le wins con un consenso facoltativo, chiesto in v2 con la bacheca. Deroga alla specifica.
10. Se la vendita si elimina, il progetto si archivia.
11. «Giorno 0»: registrazione del cliente o ingresso nel gruppo Telegram? Consiglio: registrazione.
12. Test in 2 sessioni o 3 giorni. Il lancio alla scheda, con il modello alimentare «in arrivo» sulla pagina successiva?
13. Pagina di prenotazione dedicata da 30 minuti (serve un piano Google a pagamento) o la stessa dei checkpoint?
14. Avviso al cliente quando tocca a lui: email, o messaggio da copiare per Telegram.
15. Chi usa «Nuovo cliente»: solo tu (consiglio), con il closer che resta su «Nuova vendita».
16. Area cliente: `motion`, tema di base, solo italiano.
17. Video obbligatori tutti su YouTube non in elenco.
18. Guide: quale copia è il modello, chi parla in prima persona, Yazio premium, consenso scritto di chi è ritratto nelle foto d'esempio.
19. Il foglio: togliere a Ivan l'accesso (il questionario lo legge nell'app) o spostare le colonne dei pagamenti.
20. Fino a v2 le guide complete non sono in dashboard: nel frattempo il team manda ancora la pagina Notion?

Domande aperte della specifica (sezione 14):

| # | Domanda | Stato |
|---|---|---|
| 1 | Di chi è la pagina di prenotazione | Di Ivan. Serve a D |
| 2 | Calendario condiviso | Non esiste: va creato. Serve a D |
| 3 | Partecipi sempre alla call | Aperta. Blocca D |
| 4 | Group coaching | Aperta. Serve a v2 |
| 5 | Foto del fisico | Proposta: solo Coach Plus. Serve a B |
| 6 | Consenso verificato da un legale | Aperta. Blocca B |
| 7 | Orari di supporto | Aperta. Serve a v2 |

## 7. Piano di rilascio

Un valore, `aperto_ai_clienti`, resta spento finché B non è pronto: fino ad allora «Copia link» e messaggio pronto non compaiono e i 14 giorni non partono. Il flusso dell'MVP è una sola versione (step 1-4, 6, 9-12), fissata prima del primo cliente vero.

### MVP

| Rilascio | Contenuto | Criteri della specifica |
|---|---|---|
| **A · Team** | Wizard, «Avvia onboarding», progetto con lista Onboarding e incarichi, invito, gate e revoca, notifiche, sezione Onboarding con lista e scheda, «Vendite nuove senza onboarding». Il test «un utente senza profilo non legge niente» nasce qui | 1; 2, 3 e 16 in parte; 18 |
| **B · Clienti** (primo rilascio ai clienti) | `/join`, accesso e rientro, area `/percorso`, timeline con stima, step 1, 2, 3 (questionario e allegati nel database), 4 manuale, 6, 9-12 con le azioni del coach, stato di attesa del team, avviso al cliente, pagina dopo il lancio («Il tuo percorso è iniziato», link rapidi, checkpoint), player con percentuale, CMS minimo, consensi, code del team, `/privacy` aggiornata | 2 e 3 completi; 4, 5, 9, 10, 14; 11, 12 e 17 in parte |
| **C · Foglio** | Service account, coda, riga sul foglio anche per i questionari inviati durante B. Il Google Form si chiude a B | 6 |
| **D · Calendari** | Embed, rilevamento automatico al posto della conferma manuale, copia sul calendario condiviso, spostamenti e cancellazioni | 7, 8 |

A va in produzione e si prova con un cliente di prova. I clienti veri entrano con B.

### v2

- Step 5, 7, 8 (flusso versione 2: chi non ha superato lo step 4 passa alla nuova, gli altri restano).
- Dashboard ongoing con le guide migrate da Notion; «Invita alla dashboard» per i clienti già attivi, senza onboarding.
- Bacheca wins con i suoi consensi; group coaching con le registrazioni come blocchi video.
- Link condivisibile `/c/:token`: solo testi e video delle guide, nessun dato personale e nessuna immagine con persone senza login. È più stretto della specifica.
- Animazioni complete e razzo; editor completo del CMS.
- Scadenze, allarmi e metriche, nei limiti della decisione 4.
- Criteri 11, 12, 13, 15, 17 completi.

### v3

- Reminder automatici al cliente; moduli formativi con avanzamento; Libreria esercizi (i 14 video dei test sono i primi semi).
- Seconda call di revisione dei test; classifica della costanza.
- Migrazione completa di Notion; chiusura del canale broadcast (la fai tu).
- Webhook dei pagamenti; `events.watch` se il minuto non basta.

### File e migration per rilascio

Indicativo: i nomi definitivi nel riepilogo di ogni rilascio.

**A.** Migration: dati dell'onboarding; progetto (colonne `pm_*`, modello, `pm_scegli_coach`, `pm_apri_progetto_cliente`, `elimina_persona`, `unisci_profili`); `nuovo_cliente`, `avvia_onboarding`, gate e revoca; tipi di `notifiche`. File toccati: `app/(app)/sales/new/*`, `lib/vendite/operazioni.ts`, `lib/validation/vendita.ts`, `app/(app)/calls/{scheda-call,registra-esito}.tsx`, schede cliente e vendita, `lib/nav.ts`, `lib/notifiche/*`, Impostazioni › Progetti. Nuovi: `app/(app)/onboarding/`, `lib/onboarding/`, seed `60_onboarding.sql`.

**B.** Migration: `clienti_account`, `cliente_corrente()`, `handle_new_user`, policy del cliente e del bucket `avatari`; RPC degli step; questionario, allegati, consensi, call, consegne; CMS e bucket privato; `backup_completo`, `anteprima_eliminazione`, `elimina_cliente`. **Autenticazione toccata:** `lib/auth/{dopo-login,session,roles}.ts`, `app/login/{page.tsx,actions.ts}`, `app/auth/{conferma,callback}/route.ts`, `lib/supabase/middleware.ts`. Altri: `package.json` (`motion`), `next.config.ts`, `app/globals.css`, `app/privacy/page.tsx`, `lib/eliminazione.ts`. Nuovi: `app/join/`, `app/entra/`, `app/(cliente)/percorso/`, `components/percorso/`, `lib/email/cliente.ts`.

**C.** Migration: coda, `google_collegamento`, job `pg_cron`. Nuovi: `lib/google/{service-account,sheets}.ts`, `app/api/cron/onboarding/`, Google finto per i test. Toccati: pagina Chiavi, `.env.example`.

**D.** Migration: `coach_prenotazioni`, stato della sincronizzazione. Nuovi: `lib/google/prenotazioni.ts`.

Test in ogni rilascio: pgTAP nuovi (dati e gate, «il cliente legge solo il suo», step bloccati, stati del link, questionario, prenotazioni) e gli aggiornati `00_schema`, `66`, `75`, `91`, `101`; Vitest; e2e con Mailpit (registrazione, rientro da un altro browser, cliente che apre una pagina del team). Nessun test chiama Google.

## 8. Cosa serve da te fuori dal codice

1. Il controllo di «Confirm email» in Supabase (sezione 2).
2. Google Cloud: un service account, con Calendar API e Sheets API accese. La chiave si incolla in Impostazioni › Chiavi e collegamenti, mai in chat.
3. Ivan condivide il suo calendario in sola lettura con il service account, e lo sa. Tu crei il calendario condiviso.
4. Il foglio condiviso come editor con il service account.
5. L'indirizzo completo della pagina di prenotazione.
6. I video su YouTube non in elenco: benvenuto, «Chi ottiene davvero risultati», il tour della nuova dashboard, il video del questionario oggi su Notion.
7. Il testo dei consensi, e il trattamento dei dati sulla salute, visti da chi segue la parte legale (valutazione d'impatto, registro dei trattamenti, incarico scritto a coach e revisore).
8. Il sì alle decisioni 1-8.

## 9. Come lavoro

- Un rilascio alla volta. Prima dati e regole, poi interfaccia, per ultime le animazioni.
- Primo passo di B: le cinque prove tecniche della sezione 3, sullo stack locale, prima di scrivere il resto.
- `CLAUDE.md` si aggiorna nello stesso rilascio che cambia una regola (sezioni 3, 4, 6, 7, 8, 10, 11, 15, 17, 18, 19, 20, 22, 23, 28, 32 e una sezione nuova).
- Changelog: voci `admin`, e `progetti` per il lavoro del coach, senza mai nominare pagamento o gate. I clienti non hanno Novità.
- Alfire e Claude collegato: nessuno strumento nuovo; onboarding, questionario, consensi e wins restano fuori.
- A fine rilascio: cosa è fatto, come provarlo, cosa manca e le decisioni che servono.
