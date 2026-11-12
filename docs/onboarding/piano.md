# Onboarding guidato: piano di lavoro

Risposta alla specifica `docs/onboarding/specifica-v7.md` (versione 7, 12/11/2026). Stato: **proposta, in attesa del sì di Dany**. Niente schema né autenticazione si tocca prima.

Fonti lette: il repository alla 1.76.0, le 12 pagine Notion della sezione 7-bis, il documento di Ivan, `MOD-Onboarding-e-Test`, le intestazioni del foglio del questionario, i calendari visibili dall'account di Dany, la documentazione di Google, Supabase, Vercel, Motion e Telegram.

## 1. Cosa esiste già e si riusa

| Pezzo della specifica | Cosa c'è nel gestionale |
|---|---|
| Wizard, schermate Cliente e Vendita | «Nuova vendita» anche dalla call chiusa, `registra_vendita` in una transazione (cliente, vendita con `call_id`, setter, closer, rate) |
| Progetto del cliente | `pm_crea_progetto_cliente`, modello «Percorso cliente», `pm_scegli_coach`, `pm_progetti.coach_id` e `responsabile_id`, timer e pausa |
| Login con codice via email | OTP di Supabase Auth, 8 cifre, 60 minuti, link `/auth/conferma` |
| Un ruolo chiuso in una sola area | il business coach: gruppo di route a parte, test «zero righe su ogni tabella» |
| Notifiche con campanella | tabella `notifiche`, già con il campo `canale`, RLS «ognuno le sue» valida per ogni ruolo |
| Lavori frequenti con nuovi tentativi | `pg_cron` + `pg_net` verso `/api/cron/*` con lease e chiave nel Vault (Insight, reel, call) |
| Segreti incollati dall'admin | Vault e pagina Impostazioni › Chiavi e collegamenti |
| Email | Resend (`lib/email/invia.ts`) |
| Form con salvataggio automatico | Oggi del setter (debounce, versione, ripresa) |
| Editor e pagine in Markdown | Tiptap e renderer del Piano editoriale |
| Board a colonne | I miei task a bacheca |

Non esistono: Alpha Loom e `auth@percorsoalpha.com` (in questo repository l'unico OTP è quello di Supabase), API Google lato server, un player video, un CMS, bucket privati, la libreria `motion`, uno stato «vendita annullata», un campo Telegram sul cliente, un ruolo cliente o revisore.

## 2. Dove la specifica contraddice `CLAUDE.md` o i dati

`CLAUDE.md` chiede di fermarsi e segnalare. In ordine di peso.

| # | Punto | Specifica | Oggi | Proposta |
|---|---|---|---|---|
| 1 | Dati sanitari | Questionario con infortuni, peso, sonno; consenso sanitario | Sezione 15: «Nessun dato sanitario in questa app» | Si riscrive la sezione 15: tabella a parte, letta solo da admin, coach del cliente e dal cliente stesso; fuori da Alfire e da Claude collegato; `/privacy` aggiornata prima del rilascio. Le foto del fisico restano su Coach Plus |
| 2 | Chi può entrare | I clienti si registrano da un link | Sezione 7: accesso solo su invito del team; il trigger su `auth.users` rifiuta ogni altra email | Il trigger accetta anche un invito di onboarding attivo. L'utente lo crea solo il server dopo aver verificato il token del link |
| 3 | Ruolo `client` | Un ruolo nuovo | Un valore nuovo in `app_role` leggerebbe la rubrica del team, reparti e modelli, potrebbe collegare Claude e usare Alfire | Nessun ruolo nuovo: tabella `clienti_account` (utente → cliente), nessuna riga in `profiles`. Tutto quello che esiste resta chiuso da solo |
| 4 | Sorveglianza | Ore di fermo, allarme «programma oltre 48 ore», task chiuso «quando il coach apre il questionario», tempo medio alla prima scheda | Sezione 17: nessun avviso su ciò che un collaboratore non ha fatto, nessun tracciamento automatico | Serve una tua decisione scritta (sezione 6, decisione 4) |
| 5 | Quando nasce il progetto | Alla conferma di «Nuovo cliente», prima del pagamento | Sezione 8: alla prima rata incassata | Il wizard apre il progetto subito; i trigger di oggi restano per «Nuova vendita» semplice, rinnovi e import |
| 6 | Call di onboarding | «Call nel gestionale, tipo onboarding» | `calls` vuole un lead, ha solo discovery e strategy, e ogni metrica conta ogni call (show rate, close rate, esiti da registrare, analisi di Claude) | Tabella a parte `clienti_call` (onboarding e checkpoint), fuori dalle metriche di vendita |
| 7 | Revisore | Ruolo revisore (Lorenzo) | Ivan e Lorenzo hanno tutti e due il ruolo coach | Nessun ruolo nuovo: `revisore_id` sul progetto, accanto a coach e responsabile (il Personal Success Manager) |
| 8 | OAuth sul calendario | OAuth con `events.watch` | Sezione 33: in un'app Google «In test» il permesso scade ogni 7 giorni | Service account a cui Ivan condivide il calendario (sezione 4.6) |
| 9 | Polling ogni 2 minuti | Cron | Vercel Hobby: un cron al giorno | `pg_cron`, solo quando c'è qualcuno allo step 4 o una call da seguire |
| 10 | Stack e design | Motion, contatore che scorre, glow che respira, razzo | Sezione 4: stack deciso; sezione 11: nessun numero animato, un solo oro | `motion` con versione esatta, solo nell'area cliente, dichiarata nuovo «momento di brand» |
| 11 | Nomi | Tabelle in inglese e camelCase, stati inglesi | Sezione 8: italiano, `snake_case` | Italiano (sezione 5 di questo piano) |
| 12 | Lingua | Solo italiano | Sezione 32: ogni testo in italiano e inglese | Area cliente solo in italiano, eccezione scritta; schermate del team nelle due lingue |
| 13 | Segreti | Variabili d'ambiente | Token e chiavi nel Vault, incollati dalla pagina Chiavi | Vault per la chiave del service account; variabili solo per i valori pubblici |
| 14 | Riepilogo email giornaliero | Facoltativo | Decisione del 07/10: «mi basta ogni venerdì» | Non costruito finché non lo chiedi |

Differenze tra la specifica e le fonti (da sistemare nei testi, non bloccano):

- **Test:** il template dice 3 giorni di test (13 esercizi, 14 video YouTube pronti), Ivan a voce dice 2 sessioni. Da qui dipendono la stima della timeline e la scadenza delle 48 ore.
- **Fine dell'onboarding:** per Ivan «ongoing» scatta al template alimentare, per la specifica al programma. Il PDF alimentare dello step 12 arriva dopo 5 giorni di dati, quindi può arrivare dopo la scheda.
- **Pagina di prenotazione:** l'unica pagina di Ivan vista è «Checkpoint Periodico Con Il Coach», 15 minuti, usata anche per l'onboarding. Un account Google gratuito ha una sola pagina di prenotazione.
- **Calendario condiviso del team:** non esiste. Il calendario di Ivan non è visibile dal tuo account.
- **Foglio:** la colonna F nello storico contiene l'età, non la data di nascita. Le colonne AD-AF hanno pagamenti e somme, e Ivan modifica il foglio.
- **Guide Notion:** sono le copie dentro la dashboard di un cliente, non un modello. Parlano in prima persona («io li guardo tutti»), dicono sia «Yazio gratuito basta» sia «acquista Yazio premium», e 9 immagini su 11 ritraggono una persona, 5 in intimo.
- **38 passaggi, 18 manuali:** nel documento di Ivan non ci sono. Vengono dall'artifact, che non ho letto.

## 3. Cosa non è fattibile come scritto

| Richiesta | Perché | Alternativa |
|---|---|---|
| `events.patch` per aggiungere Dany come invitato | Un service account non può aggiungere invitati senza delega di dominio | Copia dell'evento sul calendario condiviso, a cui ti iscrivi. Nell'unico evento reale trovato eri già tra gli invitati: se lo fa la pagina di prenotazione, il problema non c'è |
| Precompilare nome ed email nell'iframe di Google | Nessun parametro documentato; nell'iframe da telefono il cliente risulta non loggato | Riga «Usa questa email» sopra l'iframe, più la coda «Prenotazioni da collegare» |
| Video al 90% su Loom | Loom non dà la percentuale | Video obbligatori su YouTube non in elenco; per gli altri embed il pulsante «Ho guardato il video» |
| Video caricati da Notion nello Storage | Supabase Free: 1 GB, 50 MB a file, 5 GB di traffico | I video vanno su YouTube non in elenco. Nello Storage solo le immagini |
| Upload nella cartella Drive del cliente | Un service account non ha spazio su un Drive personale | Bucket privato della dashboard |
| Calendario libero per Ivan e Dany insieme | Funzione dei piani Google a pagamento | Rimandata: vale solo la disponibilità di Ivan |

Da verificare alla prima prova, perché la documentazione non era raggiungibile da qui: il formato `?gv=true` dell'embed, e un service account su un calendario Gmail personale condiviso.

## 4. Architettura proposta

### 4.1 Account del cliente

- Tabella `clienti_account`: `user_id` → `auth.users`, `client_id` → `clients`, stato (`attivo`, `sola_lettura`, `chiuso`). Nessuna riga in `profiles`, nessun valore nuovo in `app_role`.
- `current_role()` per un cliente è null: ogni policy, RPC, Alfire e il server MCP lo rifiutano senza toccarli. Un test pgTAP nuovo conta ogni tabella e view come cliente e accetta solo le sue righe dell'onboarding.
- Helper `cliente_corrente()` (`security definer`): l'id del cliente dell'utente, o null. Le letture del cliente passano da RLS su `client_id`; le scritture da poche RPC che controllano l'ordine degli step.
- Pagine: gruppo `app/(cliente)/` (indirizzo `/percorso`), senza shell, Alfire, campanella e tutorial. `/join/[codice]` pubblico nel proxy.
- Un collaboratore non diventa mai cliente con lo stesso utente: `/join` lo rifiuta con la stessa frase neutra.

### 4.2 Link di registrazione

- `/join/nome-cognome-<token>`: token di 32 byte, in tabella solo l'hash sha256.
- La pagina aperta con GET mostra solo il nome e un pulsante. Telegram apre i link per l'anteprima: il token non si consuma lì e l'email non compare nell'HTML.
- Dopo «Continua»: email precompilata e modificabile, codice OTP. Il server verifica il token, crea l'utente (`admin.createUser`), manda il codice con `signInWithOtp` come oggi. Il legame con il cliente si scrive solo quando ci sono insieme il codice verificato e il token.
- Il link si consuma alla verifica del codice. Stati: `in_attesa_pagamento`, `attivo`, `usato`, `scaduto`, `revocato`. Scade 14 giorni dopo l'attivazione.
- Rischio da accettare: chi ha il link prima del cliente può registrarsi con la propria email. Il link va mandato solo nel gruppo privato; se l'email è diversa da quella della scheda, il team riceve una notifica.

### 4.3 «Nuovo cliente» e gate pagamento

- Wizard in 3 schermate, costruito sopra «Nuova vendita»: aggiunge i contatti aggiornati del cliente, lo username Telegram e la schermata Team.
- RPC `nuovo_cliente(...)` (`security invoker`, admin): chiama `registra_vendita`, aggiorna il cliente, crea l'invito. Un trigger sull'invito apre il progetto, applica il modello di onboarding e scrive coach, revisore e responsabile.
- Gate: trigger su `payments` (rata incassata della vendita dell'invito) che attiva il link, scrive l'evento e manda la notifica. Non blocca mai l'incasso.
- «Conferma pagamento» manuale resta, come deciso: RPC dell'admin, con riga nel log. Non registra nessun incasso.
- Revoca: vendita eliminata, o incassato netto tornato a zero dopo un rimborso. L'account passa in sola lettura.

### 4.4 Progetto, incarichi e task

- Un secondo modello, «Onboarding cliente», applicato come lista «Onboarding» nel progetto del cliente. Gli 8 contenitori di «Percorso cliente» restano: servono al tempo.
- Colonne nuove: `pm_progetti.revisore_id`; sulle voci del modello e sui task `per_incarico` (coach, revisore, responsabile), `regola_scadenza` e `chiave_onboarding`.
- Scadenze: una funzione scrive la scadenza del task quando arriva l'evento (registrazione, call prenotata, ultimo test, quinto giorno di tracciamento).
- Chiusura automatica: `onboarding_chiudi_task(cliente, chiave)` chiamata dagli eventi.
- I task di onboarding non si riaprono al rinnovo.
- Il nome del progetto resta il nome del cliente: ci contano la rinomina automatica, Alfire e la timeline dei progetti.

### 4.5 Step, blocco lato server e timeline

- Definizione degli step in una tabella seminata dalla migration (`onboarding_passi_def`: chiave, ordine, nodo della timeline, tipo, se chiede la verifica del team, versione del flusso).
- Una riga per cliente e step (`onboarding_passi`), mai un JSON unico: RLS e test per riga.
- Una sola RPC per avanzare, che rifiuta uno step bloccato. Le pagine leggono solo lo step disponibile: i contenuti degli step futuri non arrivano al browser.
- Stima dei giorni e «Ti restano N cose da fare» calcolati in SQL (`onboarding_stima`), con le durate in `onboarding_impostazioni`.
- Timeline: componente client con 7 nodi; Motion caricata dopo il primo disegno; rami statici con riduzione movimento, con un test.

### 4.6 Prenotazione e calendari

- Embed della pagina di prenotazione nello step 4, con il ripiego «Apri il calendario».
- Lettura con un **service account**: Ivan condivide il suo calendario con l'email del service account, con permesso di modifica. Niente consenso che scade, niente token da rinnovare.
- Rilevamento: `events.list` con `syncToken`, lanciato da `pg_cron` ogni minuto solo se c'è un cliente allo step 4 o una call futura da seguire. Il webhook `events.watch` non serve nell'MVP: si aggiunge dopo se il minuto non basta.
- Marcatore della prenotazione: organizzatore = coach, titolo che inizia con il titolo della pagina, descrizione che inizia con «Prenotato da» (o «Booked by»).
- Collegamento per email tra gli invitati; se non si trova, coda «Prenotazioni da collegare».
- Ogni call collegata diventa una riga di `clienti_call` e una copia sul calendario condiviso. Spostamenti e cancellazioni aggiornano riga, copia e step.
- Alternativa se preferisci l'OAuth: pubblicare l'app Google «In produzione» senza verifica. Toglie la scadenza dei 7 giorni, ma mostra la schermata «app non verificata» e il client è lo stesso del login: la sconsiglio.

### 4.7 Questionario e foglio

- 4 schermate, salvataggio automatico con versione, ripresa dallo stesso punto.
- Risposte in `onboarding_questionari`. File in un bucket privato.
- Riga sul foglio scritta da una coda con nuovi tentativi. Prima di riprovare si rilegge l'ultima riga, per non duplicare.
- Testo del cliente scritto come testo semplice, mai come formula (telefono con `+`, risposte che iniziano con `=`). L'app scrive solo A-AC e non legge mai AD-AG.
- La colonna K (infortuni) va sul foglio come oggi, per la tua decisione 2: il testo del consenso deve dirlo.

### 4.8 Contenuti

- Tabella `contenuti_blocchi` con blocchi tipizzati: testo, avviso, video, immagine, galleria con esito giusto o sbagliato, domande espandibili, pulsante, pdf. Il solo Markdown non rappresenta 4 guide su 6.
- Editor nella sezione admin, con anteprima.
- Player YouTube con conteggio dei secondi davvero visti (il cursore trascinato non conta), salvataggio ogni 10-15 secondi con una route, dominio `youtube-nocookie`.

### 4.9 Notifiche e vista team

- Tipi nuovi di notifica; destinatari admin, coach del cliente e revisore, in una sola scrittura. «Pagamento confermato» solo agli admin. Mai importi, mai email nei testi.
- Sezione Onboarding nel menu: board a colonne derivate dallo stato (niente trascinamento), code di lavoro, scheda del cliente.
- Coach e revisore non leggono `clients`, vendite o rate: la board mostra nome, step e date da una funzione dedicata.

## 5. Modello dati

Nomi in italiano. Ogni tabella con RLS, `_mai_da_oauth` e `revoke all` da `anon`.

| Tabella | Contenuto | Chi legge |
|---|---|---|
| `onboarding_inviti` | cliente, vendita, call, slug, hash del token, email proposta, stato, attivazione, scadenza | admin |
| `clienti_account` | utente → cliente, stato | admin; il cliente la sua |
| `onboarding_passi_def` | i 12 step e i 7 nodi | tutti gli autenticati dell'onboarding |
| `onboarding_percorsi` | una riga per cliente: versione del flusso, stato, giorno zero | admin, coach e revisore del cliente, il cliente |
| `onboarding_passi` | una riga per cliente e step: stato, date, dati non sanitari | come sopra |
| `onboarding_questionari` | risposte, invio, riga del foglio | admin, coach del cliente, il cliente |
| `onboarding_allegati` | file del questionario | come sopra |
| `onboarding_video_visti` | secondi visti e percentuale per blocco | admin, coach, il cliente |
| `clienti_call` | call di onboarding e checkpoint: quando, link Meet, stato, id degli eventi | admin, coach del cliente, il cliente la sua |
| `clienti_telegram` | username, community, presentazione, link del gruppo privato | admin, coach del cliente, il cliente |
| `onboarding_eventi` | registro immutabile dei passaggi | admin |
| `onboarding_lavori`, `onboarding_lavori_stato` | coda e lease | nessuna sessione |
| `onboarding_impostazioni` | durate, scadenze, link, incarichi predefiniti | admin |
| `contenuti_blocchi` | il CMS | admin scrive; il cliente legge i pubblicati del suo step |
| `google_collegamento` | stato del service account (la chiave sta nel Vault) | admin |

Modifiche a tabelle esistenti: `pm_progetti.revisore_id`; `pm_modelli.per_onboarding`; `pm_modelli_voci` e `pm_task` con `per_incarico`, `regola_scadenza`, `chiave_onboarding`; il check dei tipi di `notifiche`; il trigger `handle_new_user`.

In v2 e v3: `clienti_wins`, `coaching_sessioni`, `clienti_link_condivisi`, `contenuti_pagine`, `esercizi`, `moduli_completati`.

## 6. Decisioni che servono da te

Le prime sei bloccano l'inizio. Per ognuna la scelta che consiglio.

1. **Dati sanitari nel gestionale.** Sì, con la sezione 15 riscritta come al punto 1 della sezione 2. Foto del fisico solo su Coach Plus.
2. **Account cliente senza ruolo** (`clienti_account`, nessuna riga in `profiles`). Sì.
3. **Call di onboarding e checkpoint in `clienti_call`**, fuori da `calls` e dalle metriche di vendita. Sì.
4. **Sorveglianza.** Consiglio: i giorni di fermo e gli allarmi parlano del cliente («aspetta il programma da 48 ore») e arrivano a te e al coach di quel cliente; nessuna media, classifica o elenco per persona; i task si chiudono con la spunta o con un evento del cliente, mai «quando il coach apre una pagina». Se vuoi anche i tempi del coach come metrica, va scritto come deroga alla sezione 17.
5. **Calendario con service account.** Sì. Serve che Ivan condivida il suo calendario e che tu crei il calendario condiviso.
6. **Piani.** Supabase Free non ha backup e ha 1 GB; Vercel Hobby è per uso non commerciale. Con clienti e dati sanitari dentro consiglio Supabase Pro e Vercel Pro prima del rilascio ai clienti.

Servono prima del rilascio in cui compaiono:

7. Progetto alla conferma del wizard anche senza pagamento: se la vendita si elimina, il progetto resta, si archivia o si elimina? Consiglio: si archivia.
8. «Giorno 0» delle scadenze: registrazione del cliente (specifica) o ingresso nel gruppo Telegram (Ivan)? Consiglio: registrazione.
9. Cosa revoca il link: vendita eliminata e rimborso totale (consiglio). Rimborso parziale e percorso interrotto: no.
10. Doppioni tra i due modelli: «Call di onboarding» e «Revisione video» esistono già come contenitori. Consiglio: restano i contenitori per il tempo, i task di onboarding hanno le scadenze.
11. Test: 2 sessioni o 3 giorni? Il razzo parte alla scheda o al template alimentare?
12. Pagina di prenotazione: una pagina dedicata «Call di onboarding» da 30 minuti (serve un piano Google a pagamento per la seconda pagina) o la stessa dei checkpoint?
13. Mittente e invio dei codici ai clienti: SMTP proprio in Supabase con `auth@percorsoalpha.com`? Cos'è Alpha Loom?
14. Area cliente: nuovo momento di brand con `motion`, tema di base chiaro, scuro o del dispositivo, testi solo in italiano.
15. Tutti i video obbligatori su YouTube non in elenco, compreso il video caricato su Notion.
16. Guide: quale copia è il modello, chi parla in prima persona, Yazio premium sì o no, le foto d'esempio si possono riusare.
17. Chi usa «Nuovo cliente»: solo tu, o anche un closer assunto?
18. Le domande aperte della sezione 14 della specifica restano tutte valide.

## 7. Piano di rilascio

Ogni rilascio è un deploy a sé, con migration, test pgTAP e Vitest, e2e, changelog e i passi per provarlo.

### MVP

| Rilascio | Contenuto | Schema | Criteri della specifica coperti |
|---|---|---|---|
| **A · Fondamenta e «Nuovo cliente»** | Wizard in 3 schermate; progetto con lista Onboarding, incarichi e scadenze; invito in attesa di pagamento; gate pagamento e «Conferma pagamento»; revoca; notifiche al team; sezione Onboarding con board e scheda (solo le prime colonne piene) | `onboarding_inviti`, `onboarding_percorsi`, `onboarding_passi_def`, `onboarding_passi`, `onboarding_eventi`, `onboarding_impostazioni`, `clienti_telegram`, colonne su `pm_*`, tipi di `notifiche` | 1, 2, 3, 16, 18 |
| **B · Accesso del cliente e timeline** | `/join`, registrazione con codice, area `/percorso`, timeline con stati e stima, pannello del prossimo step; step 1, 2, 6 e gli step 9-12 con le azioni del coach; player con percentuale vista; CMS minimo per i contenuti degli step | `clienti_account`, trigger `handle_new_user`, `contenuti_blocchi`, `onboarding_video_visti`, bucket privato | 4, 5, 9, 10, 11 (animazioni base), 12, 14 |
| **C · Questionario e foglio** | Step 3 in 4 schermate, upload, scheda del questionario per il coach, coda con nuovi tentativi, riga sul foglio | `onboarding_questionari`, `onboarding_allegati`, `onboarding_lavori`, `google_collegamento` | 6 |
| **D · Prenotazione e calendari** | Step 4 con embed, rilevamento, `clienti_call`, copia sul calendario condiviso, spostamenti e cancellazioni, coda «da collegare» | `clienti_call`, stato della sincronizzazione | 7, 8 |

Ordine: A, B, C, D. Con A da sola il team lavora già: wizard, progetto e gate sostituiscono i passaggi manuali tra vendita e coach. C e D si possono scambiare.

Finché D non c'è, lo step 4 mostra il link di prenotazione e si chiude quando il coach conferma la data.

### v2

- Step 5, 7, 8 (video, attrezzatura dalle risposte del questionario, app con verifica del coach). Flusso versione 2: chi è già a metà resta sulla sua versione.
- Dashboard ongoing del cliente con le guide migrate da Notion (blocchi tipizzati, immagini nello Storage).
- Bacheca wins, group coaching, link condivisibile `/c/:token` (solo guide e risorse, nessun dato personale senza login).
- Animazioni complete e razzo.
- Scadenze, allarmi e metriche, nei limiti della decisione 4.
- Editor completo del CMS con anteprima.

### v3

- Reminder automatici al cliente per email.
- Moduli formativi per fase, Libreria esercizi (i 14 video dei test sono i primi semi).
- Seconda call di revisione dei test, classifica della costanza.
- Webhook dei pagamenti, `events.watch` se serve.

## 8. Cosa serve da te fuori dal codice

1. Google Cloud, nel progetto del login: un service account, con Calendar API e Sheets API accese. La chiave si incolla in Impostazioni › Chiavi e collegamenti, mai in chat.
2. Ivan condivide il suo calendario con l'email del service account («Apportare modifiche agli eventi»). Tu crei il calendario condiviso e lo condividi allo stesso modo.
3. Il foglio del questionario condiviso come editor con il service account; il Google Form chiuso al rilascio di C.
4. L'indirizzo completo della pagina di prenotazione (il link breve non si apre da qui).
5. SMTP proprio in Supabase Auth per i codici ai clienti.
6. I video: benvenuto, «Chi ottiene davvero risultati», il tour della nuova dashboard, e il video del questionario oggi caricato su Notion, tutti su YouTube non in elenco.
7. Il testo dei consensi verificato da chi segue la parte legale.
8. Il sì alle decisioni 1-6.

## 9. Come lavoro

- Un rilascio alla volta, nell'ordine A, B, C, D. Prima i dati e le regole, poi l'interfaccia, per ultime le animazioni.
- Test automatici su: blocco degli step, gate pagamento, stati del link, cliente che non legge niente del team, collegamento delle prenotazioni, riga del foglio, notifiche.
- Nessun test chiama Google: server finti come per Instagram, Fathom e il calendario.
- `CLAUDE.md` si aggiorna nello stesso rilascio che cambia una regola (sezioni 3, 4, 6, 7, 8, 11, 15, 17, 18, 22, 32 e una sezione nuova per l'onboarding).
- A fine rilascio: cosa è fatto, come provarlo, cosa manca e le decisioni che servono.
