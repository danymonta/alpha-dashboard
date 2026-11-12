# Onboarding · Rilascio B (1.78.0, 1.79.0 e 1.80.0): disegno tecnico

Contesto: `docs/onboarding/specifica-v7.md` (la richiesta di Dany), `docs/onboarding/piano.md` (il piano approvato il 12/11/2026 con le scelte consigliate), `docs/onboarding/rilascio-a.md` (il rilascio A, in produzione con la 1.77.0). Questo file è il contratto del rilascio B, il primo rilascio ai clienti. Dove dice una cosa diversa dal piano, vale questo file. `CLAUDE.md` resta la fonte di verità per convenzioni, sicurezza e test.

B tocca l'autenticazione: Dany ha detto di procedere il 12/11/2026. Prove tecniche fatte sullo stack locale il 12/11/2026, tutte su un utente creato prima: `auth.admin.createUser` con un id scelto dal server rispetta l'id; `auth.admin.generateLink({ type: 'magiclink' })` restituisce `email_otp` di 8 cifre senza spedire niente (Mailpit vuoto); `verifyOtp({ email, token, type: 'email' })` con quel codice apre la sessione. **Prove da fare come primo passo di B1a**, prima del resto: (a) `generateLink({ type: 'magiclink' })` su un'email senza utente prova a crearlo (GoTrue la tratta come un'iscrizione) e il trigger su `auth.users` la rifiuta, senza nessun utente nuovo; (b) la versione di Mailpit della CLI di Supabase ha `POST /api/v1/send`; (c) l'iframe di `youtube-nocookie.com` con `enablejsapi=1` risponde con `infoDelivery` ai messaggi che manda la pagina, senza `iframe_api` (sotto, «Player»); (d) un trigger `before update of encrypted_password` su `auth.users` ferma `updateUser({ password })`. Se una delle quattro non regge, ci si ferma e si torna da Dany.

## Divisione in tre rilasci

B è diviso in tre rilasci che si consegnano, si provano e si possono fermare da soli. `aperto_ai_clienti` resta spento fino alla fine di B2: prima di allora entra solo un **cliente di prova** (sotto).

| | **B1a · 1.78.0 · Accesso** | **B1b · 1.79.0 · Questionario** | **B2 · 1.80.0 · Il percorso fino al lancio** |
|---|---|---|---|
| Autenticazione | trigger su `auth.users` (ramo del cliente, email, password), `/join`, `/entra`, `destinazioneUtente`, proxy con la CSP, `requireCliente`, codici via Resend | niente di nuovo | niente di nuovo |
| Dati | `clienti_account`, registrazioni, limiti, `contenuti_blocchi`, consensi, video visti, pulizia degli account | questionario, allegati, bucket privato, età, revoca del consenso, pulizia dei dati sulla salute | `clienti_call`, `clienti_consegne`, impostazioni nuove, letture degli incaricati da funzioni |
| Cliente | `/percorso` con la timeline statica dei 7 nodi e la stima, step 1 (video) e 2 (regole e consenso), poi l'attesa | step 3, il questionario in 4 schermate con gli allegati, poi l'attesa | step 4 manuale, 6, 9, 10, 11, 12, attesa del team, pagina dopo il lancio, animazioni con `motion` |
| Team | admin: accesso, consensi e video visti nella scheda; CMS minimo; «Cliente di prova» | admin: questionario e allegati nella scheda, «Registra la revoca», consenso del genitore dopo la registrazione; sezione 15 e `/privacy` | coach incaricato: vista e azioni; revisore e responsabile: le loro code; avviso al cliente; scadenze dei task; apertura dell'area |
| Chi lo percorre | solo clienti di prova inventati, con un'email del team | come B1a | tutti, quando l'admin apre l'area |

**Perché tre e non due.** B1a contiene tutto ciò che tocca l'autenticazione ed è il rischio maggiore: si prova da solo, con i suoi test verdi, e se un punto non regge il questionario non lo aspetta. B1b porta i dati sulla salute: la sezione 15 di `CLAUDE.md` e `/privacy` entrano con lui, perché prima non c'è nessun dato sulla salute. B2 porta il lavoro del coach. Il player YouTube sta in B1a perché lo step 1 si completa solo con il video visto al 90%. Le animazioni restano in B2 («per ultime le animazioni», piano 9): la timeline di B1a e B1b è statica, solo CSS, già completa per accessibilità e stati.

**Fin dove arriva il percorso in ogni rilascio.** `onboarding_ultimo_passo_servito()` (interna, `immutable`, `search_path ''`) dice l'ultimo step che il rilascio sa servire: `'regole'` in B1a, `'questionario'` in B1b, null (tutti) in B2. `onboarding_sblocca` non porta a `disponibile` uno step che viene dopo quello (per `ordine`). La migration di B1b e quella di B2 ricreano la funzione e chiamano `onboarding_sblocca` per ogni percorso già registrato, così un cliente di prova fermo all'attesa riparte da solo. Quando nessuno step del cliente è disponibile e il percorso non è completato, il pannello dice il testo fisso di `lib/percorso/testi.ts`: «Il prossimo passo te lo apre il tuo team a breve.», con i link ai nodi completati; la stima resta `call_non_prenotata`.

**Cliente di prova (B1a, B1b e B2 prima dell'apertura).** Colonna nuova `onboarding_inviti.prova` (sotto). Solo un invito di prova funziona con l'area chiusa: `/join` lo apre, il trigger su `auth.users` lo accetta, la scheda mostra «Copia link» e i suoi giorni di validità partono. L'admin lo segna dalla scheda di onboarding con «Cliente di prova» (un interruttore, con la riga «Il link funziona anche con l'area clienti chiusa. Usalo solo con un cliente inventato, poi eliminalo da Clienti.»). Ogni altro invito, con l'area chiusa, mostra a `/join` la pagina «Il tuo accesso non è ancora attivo».

## Cosa consegna B1a (1.78.0)

1. `/join/<slug>-<token>`: la pagina del link personale, una per stato; «Continua» apre la registrazione senza il token nell'indirizzo.
2. Registrazione con email e codice di 8 cifre mandato con Resend, con le nostre parole e nessun link; l'utente nasce solo dopo il codice giusto, con l'id riservato, e il suo account cliente nasce nella stessa transazione.
3. Rientro da `/entra`: email e codice, risposta neutra a tempo fisso. Da `/login` un cliente che chiede il codice riceve la mail del cliente, mai quella del team.
4. Un solo punto che decide dove va un utente autenticato (`destinazioneUtente`), usato dai ritorni dal login, da `requireProfilo` e da `requireCliente`; il proxy decide senza leggere il database. Niente più cicli di redirect per chi ha una sessione senza profilo.
5. Area `/percorso` senza shell, con una Content-Security-Policy a nonce: timeline dei 7 nodi con la stima dei giorni e le cose da fare, un solo pannello con il passo da fare (o l'attesa), riepilogo dei nodi completati, «Si sblocca dopo» sui futuri. Pagina «Il tuo accesso è sospeso».
6. Step 1 (benvenuto, team con foto e ruoli, video YouTube non in elenco con i secondi visti, senza script di Google nella pagina), step 2 (una spunta per ogni regola, consenso sulla salute versionato).
7. CMS minimo (`contenuti_blocchi`) in Impostazioni › Onboarding › Contenuti, con anteprima.
8. Scheda di onboarding dell'admin: accesso del cliente, consensi, video visti; «Cliente di prova».
9. Notifiche agli admin: registrazione, email diversa da quella della scheda, accesso da riattivare dopo un pagamento.
10. Pulizia notturna di registrazioni, limiti, token e account; utenti orfani tolti dal cron della sera.
11. «Elimina onboarding» nella scheda di onboarding dell'admin, per un onboarding avviato per prova o per errore, finché il cliente non si è registrato (Dany, 12/11/2026: «rimuovi questo, era un test che ho fatto»). Sotto, «Funzioni dell'admin».

## Cosa consegna B1b (1.79.0)

1. Step 3: questionario in 4 schermate con salvataggio automatico, ripresa da un altro dispositivo, allegati nel bucket privato controllati sui primi byte.
2. Età dalla data di nascita: sotto i 14 anni niente si salva oltre la data; tra 14 e 17 anni, senza il consenso del genitore registrato, le schermate 2-4 non si salvano.
3. Scheda dell'admin: questionario, allegati, «Registra la revoca» del consenso, consenso del genitore per un cliente già registrato.
4. Notifiche agli admin: questionario inviato, età da verificare, età sotto i 14 anni.
5. Sezione 15 di `CLAUDE.md` riscritta per i dati sulla salute; `/privacy` aggiornata; conservazione e pulizia dei dati sulla salute e dei file.

## Cosa consegna B2 (1.80.0)

1. Step 4 manuale: «Apri il calendario», poi «Ho prenotato» con giorno e ora; il coach (o l'admin) conferma con il link Meet; nasce la riga di `clienti_call`.
2. Step 6: username Telegram, «Entra nella community», «Ho inviato la richiesta», template di presentazione con «Copia», «Mi sono presentato»; code del team «Richieste di accesso» e «Presentazioni da controllare».
3. Step 9-12: call (svolta, non si è presentato, spostata), obiettivo (si apre quando il coach spunta il task), settimana test (voci dal CMS, conferma del coach), programma (consegne del coach, video della scheda da vedere, data del primo checkpoint).
4. Quando il cliente aspetta il team, il pannello lo dice: chi, cosa sta facendo, cosa può rileggere. Nessun pulsante.
5. Avviso al cliente quando tocca di nuovo a lui: email automatica, con «Copia il messaggio per Telegram» se non parte.
6. Pagina dopo il lancio: «Il tuo percorso è iniziato», link rapidi, prossimo checkpoint.
7. Vista dell'onboarding per gli incaricati (coach, revisore, responsabile) letta da funzioni dedicate, senza mai il pagamento; gruppi «Tocca a te», «Tocca al cliente», «In pausa», «Completati»; code, compresa «Preparazione incompleta»; azioni «Sblocca step» e «Riavvia onboarding» per admin e coach incaricato.
8. Scadenze dei task di onboarding scritte agli eventi; nessun allarme.
9. Animazioni con `motion` solo nell'area cliente.
10. Interruttore «Area clienti» in Impostazioni › Onboarding, con i controlli prima di aprire.

## Pronto per i moduli formativi (v2 e v3)

Dany, 12/11/2026: «oltre all'onboarding nella dashboard dell'allievo avrà accesso a tutti i contenuti multimediali formativi». I moduli per fase con l'avanzamento e la Libreria esercizi (specifica 9-bis) restano in v3, le guide di Notion e le registrazioni dei group coaching in v2. B non crea tabelle per loro, ma è disegnato perché entrino senza rifare lo schema né spostare dati:
- **Un solo modello di contenuto**: `contenuti_blocchi` è il blocco di ogni contenuto dell'allievo, onboarding e formazione. v3 aggiunge `contenuti_moduli` (`id`, `fase` in `parti_da_qui`, `settimana_test`, `mese_1`, `mesi_2_3`, `autonomia`, `group_coaching`, `pectus`; `titolo`, `ordine`, `sblocco` (`sempre`, `call_svolta`, `programma_consegnato`, `primo_checkpoint`, `terzo_mese`, `segnato_dal_team`), `pubblicato`), la colonna `contenuti_blocchi.modulo_id` (null per i blocchi degli step) e il valore `modulo` nel check di `pagina`. I blocchi di B restano dove sono.
- **Avanzamento per allievo**: v3 aggiunge `clienti_moduli` (`client_id`, `modulo_id`, `completato_il`), scritta solo da una funzione del cliente come `percorso_avanza` («Completato»), letta dall'admin e dal coach incaricato come percentuale per cliente (mai un confronto tra clienti o tra coach, sezione 17).
- **Video**: i secondi visti di un video di un modulo usano `onboarding_video_visti` con il `blocco_id`, come gli step: nessuna tabella nuova.
- **Fase 0 «Parti da qui»** è l'onboarding: nell'area dell'allievo la prima fase mostra gli step di `onboarding_passi` già fatti, da rileggere, insieme ai suoi moduli.
- **Vincoli per B**: `percorso_cliente()` e l'area `/percorso` leggono i blocchi per `id` e per `tipo`, mai per posizione; i tipi di blocco stanno in un'unione TypeScript che si allarga (`lib/percorso/blocchi.ts`) e i componenti dei blocchi (testo, video, avviso, pulsante, domande) sono quelli che userà un modulo; il CMS dell'admin ha i blocchi per «step» con un raggruppamento che v3 allarga a «modulo».
- **Libreria esercizi** (v3): tabella a sé (`esercizi`), letta dall'allievo da una funzione dedicata come ogni suo dato; i video sono blocchi YouTube con lo stesso player.

## Cosa resta fuori da B

| Della specifica | Dove va | Perché |
|---|---|---|
| Riga sul foglio Google per ogni questionario (sezione 6, criterio 6) | C | Service account e coda. I questionari inviati in B entrano nel foglio con C |
| Calendario dentro la dashboard, rilevamento automatico, copia sui calendari (sezione 5, criteri 7 e 8) | D | Step 4 manuale in B2 |
| Step 5, 7, 8 (video «Chi ottiene davvero risultati», attrezzatura, app) | v2, flusso versione 2 | Piano, sezione 7 |
| Dashboard ongoing con le guide di Notion, link condivisibile `/c/:token`, bacheca wins e i suoi consensi, group coaching | v2 | Piano, sezione 7; decisione 9 |
| Razzo con scia e particelle, contatore che scorre | v2 | B2 ha le animazioni base della specifica (MVP: «animazioni base») e un razzo che sale |
| Board a colonne, scadenze come allarmi, ore di fermo, «bloccato» dopo 5 giorni, metriche | v2, nei limiti della decisione 4 | Sezione 17 |
| Email al cliente il giorno 2 senza dati, task al coach il giorno 4 | v3 | Reminder automatici |
| Riepilogo email giornaliero al team | mai | Dany, 07/10/2026: «mi basta ogni venerdì» |
| Caricamento di file da parte del coach (PDF del modello alimentare) | v2 | In B2 le consegne sono link |
| Webhook dei pagamenti | v3 | |

## Deroghe alla lettera della specifica

1. **Nessun ruolo `client`** (specifica 3 e 10): il cliente è un utente senza riga in `profiles`, legato al suo `client_id` da `clienti_account` (piano 4.1, decisione 2).
2. **Il codice non arriva da Alpha Loom né da `auth@percorsoalpha.com`** (specifica 0.3): alla registrazione il codice è nostro (generato dal server, hash nel database, mandato con Resend); al rientro è l'OTP di Supabase generato con `generateLink` senza spedizione, mandato con Resend. Mai la mail del team con il pulsante «Entra».
3. **L'email precompilata non è nella pagina del token** (specifica 3): la pagina aperta dal link mostra solo il nome di battesimo e «Continua»; l'email compare dopo «Continua», nella pagina senza token. Telegram apre i link per l'anteprima.
4. **Step 2 con il solo consenso sulla salute**; le wins hanno il loro consenso facoltativo in v2 (decisione 9). Le foto del fisico restano su Coach Plus: il questionario non le chiede (decisione 1).
5. **Video solo YouTube non in elenco** (specifica 4.3 nomina anche Loom e Alpha Loom: decisione 17). La percentuale è quella dichiarata dal browser del cliente.
6. **Allegati nel bucket privato**, non nella cartella Drive del cliente (piano 3).
7. **Vendita rimborsata o annullata: account sospeso**, una pagina sola, non «in sola lettura» (piano 4.3). Un nuovo pagamento non lo riattiva da solo (sotto, «Ciclo di vita dell'account»): va contro la riga del piano 4.3, da confermare con Dany.
8. **Area cliente solo in italiano**, eccezione scritta alla sezione 32 (decisione 16).
9. **Il task «Leggi il questionario prima della call» non si chiude aprendo la scheda** (specifica 2.2): lo spunta il coach. Nessun task si chiude perché qualcuno ha aperto una pagina (decisione 4).
10. **Board del team come lista** (piano 4.9): la board a colonne è v2.
11. **Data di inizio stimata solo con le regole della specifica e durate dell'admin**, mai negativa; con la call non ancora prenotata vale «oggi + call + test + programma» (B1a e B1b sono sempre in questo caso).

## Regole che valgono sempre

Quelle di `rilascio-a.md` (nomi, RLS, `_mai_da_oauth`, view `security_invoker`, `search_path ''`, sezioni 6 e 17, nessun trigger blocca un incasso, testi senza trattino lungo e senza emoji, nessun dato vero, tipi generati grezzi), più:

- **Il cliente legge e scrive solo da funzioni dedicate.** Nessuna policy di lettura per il cliente su tabelle dell'onboarding, tranne la propria riga di `clienti_account`. Ogni lettura e scrittura del cliente passa da funzioni `security definer` con `search_path ''` che cominciano tutte con `v_cliente := public.cliente_corrente()` e rifiutano con 42501 se è null. *Minaccia chiusa:* una policy dimenticata o scritta male che apre una tabella del team a un utente autenticato qualsiasi; le colonne interne (`dati`, `nota`) di una riga che il cliente legge; il contenuto di uno step non ancora sbloccato letto con le Data API.
- **Gli incaricati leggono il cliente solo da funzioni dedicate** (B2). Nessuna policy nuova su `clients`, `v_onboarding`, `onboarding_inviti`, `onboarding_questionari`, `onboarding_allegati`, `onboarding_video_visti`, `clienti_call`, `clienti_consegne` per coach, revisore o responsabile. *Minaccia chiusa:* la strada più breve per mostrare un nome al coach (aprirgli `clients`, con email, telefono e note, o `v_onboarding`, con lo stato dell'invito e `pagamento_confermato`).
- Le funzioni del cliente e quelle del team di B2 sono le uniche `security definer` nuove eseguibili da `authenticated`, e vanno tutte nell'elenco di `00_schema.sql` e nel test `75_mcp_oauth.sql` (42501 per un token di Claude).
- `cliente_corrente()` non ha grant ad `authenticated`: la usano solo le funzioni sopra.
- I dati sulla salute (risposte del questionario, allegati) non escono mai da `onboarding_questionari` e dal bucket `onboarding-allegati`: mai in un'email, una notifica, un evento del registro, un log, il backup via email, Alfire, Claude collegato, Groq o Anthropic.
- **Nessuno script di terzi nell'origine dell'app.** I cookie di sessione di `@supabase/ssr` non sono `httpOnly` (li legge il client del browser): uno script esterno nella pagina leggerebbe access e refresh token del cliente e il DOM del questionario. Nell'area cliente, a `/join` e a `/entra` la CSP ammette solo gli script dell'app con il nonce della richiesta (sotto, «Autenticazione»); il video di YouTube è solo un iframe.
- **Testi rivolti al cliente**: solo italiano, in `lib/percorso/testi.ts` (non `bilingue`), tono da coach, frasi brevi, accenti, niente trattino lungo, niente emoji; un test lo controlla su tutti i testi del cliente e sui blocchi del CMS seminati.
- **Server action e route che lavorano col `service_role`** (`/join`, `/entra`, il ramo del cliente di `/login`, la conferma di un allegato): usano il client `service_role` solo per chiamare le funzioni `onboarding_join_*`, `cliente_accesso_*`, `allegato_conferma` e l'API admin di Auth e di Storage, con valori presi dal database o dalla sessione verificata dal server, mai dal browser (id, email verificata, `client_id`). *Minaccia chiusa:* una server action pubblica che, con la chiave segreta, diventa una porta generica sul database.
- **Nessun cliente ha una password.** Un trigger su `auth.users` rifiuta di scriverne una a un utente con `clienti_account` (sotto). *Minaccia chiusa:* con il provider Email acceso (serve ai codici) una sessione rubata, o il JavaScript della pagina, imposta una password con `updateUser` e apre un accesso parallelo che non passa dai limiti di `/entra` e sopravvive a «Esci».
- Nessuna tabella nuova in Realtime.

## Schema di B1a

Migration, dopo `20261108090200_onboarding_avvio_gate.sql`:

1. `20261109090000_clienti_account.sql`: account, registrazione, limiti, trigger su `auth.users` (ramo del cliente, cambio di email, password), trigger su `invites`, invito di prova, funzioni di `/join` e del rientro, bucket `avatari`, tipo di notifica.
2. `20261109090100_percorso_base.sql`: `onboarding_passi_def.sblocco`, CMS, consensi, video visti, backup, eliminazione, pulizia.
3. `20261109090200_percorso_funzioni.sql`: `cliente_corrente`, sblocco degli step, stima, funzioni del cliente.

`handle_new_user` (migration 1) chiama `onboarding_registra_cliente`, che usa `onboarding_sblocca` (migration 3): plpgsql risolve i nomi quando la funzione gira, e nessuna registrazione può avvenire prima che le tre migration e il deploy ci siano (l'area è chiusa e nessun invito è di prova).

### 1. Account e registrazione

```
clienti_account                  -- l'utente di accesso del cliente; nessuna riga in profiles
  user_id uuid pk -> auth.users on delete cascade,
  client_id uuid not null unique -> clients on delete cascade,
  stato text not null default 'attivo' check in ('attivo','sospeso','chiuso'),
  registrato_il timestamptz not null default now(),
  chiuso_il timestamptz null,                                  -- solo con stato 'chiuso'
  created_at, updated_at
  -- RLS: admin legge tutto (is_admin()); l'utente legge la propria riga (user_id = auth.uid(),
  --   not da_client_oauth()); nessuna scrittura da una sessione (policy _nessuna_sessione per insert,
  --   update, delete); _mai_da_oauth. Lo scrivono i trigger su auth.users e sull'invito e onboarding_pulizia.

onboarding_registrazioni         -- la registrazione in corso di un invito; nessuna sessione (deny-all), fuori dal backup
  invito_id uuid pk -> onboarding_inviti on delete cascade,
  utente_id uuid not null unique default gen_random_uuid(),   -- l'id riservato dell'utente che nascerà
  chiave_hash text not null unique (^[0-9a-f]{64}$),           -- sha256 della chiave nel cookie
  chiave_scade_il timestamptz not null,                        -- 30 minuti
  email text null (minuscolo, al massimo 320),                 -- l'indirizzo a cui è partito l'ultimo codice
  email_provate text[] not null default '{}',                  -- al massimo 3 indirizzi diversi, ammessi o no
  codice_hash text null, codice_scade_il timestamptz null,     -- sha256(invito_id || ':' || codice), 15 minuti
  invii_dal timestamptz null, invii int not null default 0,    -- finestra di un'ora: al massimo 5 richieste di codice
  errori int not null default 0,                               -- 5 codici sbagliati: il codice muore
  verificato_il timestamptz null,                              -- codice giusto: vale 10 minuti per creare l'utente
  created_at, updated_at

clienti_accesso_limiti           -- limiti del rientro; nessuna sessione, fuori dal backup, righe di al massimo un giorno
  chiave text pk,                                              -- 'email:' || sha256(email) oppure 'tutti'
  dal timestamptz not null, invii int not null default 0, errori int not null default 0,
  ultimo_invio_il timestamptz null                             -- solo per le chiavi 'email:': l'ultimo codice mandato

onboarding_inviti                -- colonna nuova
  prova boolean not null default false                         -- funziona anche con l'area chiusa
  -- grant update (prova) ad authenticated; il trigger di coerenza la lascia cambiare solo dalle funzioni dell'admin
```

- `v_onboarding`: aggiunge `prova`, `account_stato`, `registrato_il`. `lib/onboarding/stati.ts`: un invito di prova attivo è «in attesa di registrazione» anche con l'area chiusa.
- `notifiche_tipo_check`: aggiunge `onboarding_cliente` (canale `app`).

**`handle_new_user()` ricreata** (corpo di `20260928160000_foto_profilo.sql` più un ramo in testa):

1. Se esiste `onboarding_registrazioni` con `utente_id = new.id` (letta `for update`), è il ramo del cliente e **non scende mai al ramo del team**. Passa solo se: l'invito è `attivo`, `scade_il` null o futuro, `aperto_ai_clienti` oppure `prova`; `verificato_il` negli ultimi 10 minuti; `lower(new.email)` è l'email a cui è partito il codice; il cliente non ha già un `clienti_account`; l'email non è di un profilo, di un invito del team non revocato o di un altro utente con `clienti_account`. Altrimenti 42501 «Registrazione non valida». Se passa: `onboarding_registra_cliente(new.id, invito)` (interna, nessuna grant) scrive `clienti_account`, porta l'invito a `usato`, il percorso a `in_corso` con `giorno_zero = now()`, chiama `onboarding_sblocca`, aggiorna `clients.email` se è diversa (evento `email_cambiata` senza indirizzi, notifica «Email diversa da quella della scheda»), scrive l'evento `registrato` (attore `cliente`), avvisa gli admin, cancella la riga di `onboarding_registrazioni`. Mai una riga in `profiles`.
2. Altrimenti il ramo del team, identico a oggi (cerca l'email in `invites`).

*Minaccia chiusa:* una registrazione diretta alle API di Supabase (signup con password, magic link, OAuth, `generateLink` su un'email senza utente) con l'email di un cliente: non può scegliere il proprio id, quindi non entra mai nel ramo del cliente, e il ramo del team la rifiuta perché l'email non è invitata. Il ramo del cliente non guarda mai l'email per decidere chi è: la confronta solo con quella che il codice ha provato.

**Email e password in `auth.users`** (`security definer`, `search_path ''`, dentro la stessa migration):

- `auth_utenti_email_coerente` (`before update of email, email_change on auth.users`): per un utente con `clienti_account`, 42501 «Questo indirizzo non si può usare per il tuo accesso.» se la nuova email (o quella in attesa di conferma) è di un profilo, di un invito del team non revocato o di un altro cliente; per un utente con un profilo, la stessa frase se è di un utente con `clienti_account`. Mai sopra un update che non cambia l'email.
- `auth_utenti_senza_password_cliente` (`before update of encrypted_password on auth.users`): per un utente con `clienti_account` (o `raw_app_meta_data ->> 'tipo' = 'cliente'`), 42501 «L'accesso al percorso è solo con il codice via email.» se `encrypted_password` diventa non vuota. Gli inserimenti (il seed, con una password per il login di sviluppo) non passano di qui.
- `supabase/config.toml`: `secure_password_change = true` (reautenticazione per cambiare una password), come rete in più; resta `double_confirm_changes = true`.
- *Minacce chiuse:* un cliente che cambia la sua email in quella di un invito del team ancora da usare (il login con Google della persona del team verrebbe collegato all'utente del cliente e il profilo non nascerebbe mai), o il contrario; l'accesso parallelo con password. *Rischio residuo:* uno script che legge la sessione nel browser la usa finché vale; la CSP sotto lo tiene fuori dall'origine.

**Trigger su `invites`** (`invites_non_cliente`, `before insert or update`, ogni colonna, `security definer`): quando la riga non è revocata, 22023 «Questo indirizzo è di un cliente: usa un'altra email per il team.» se l'email è di un utente con `clienti_account`. Vale anche per un invito revocato che torna valido.

**Invito, ricreate da A con le aggiunte:**

- `onboarding_inviti_coerenza`: `prova` entra nella riga protetta dal segno `alpha.onboarding_admin` (un update diretto di una sessione resta 42501); i giorni del link partono se `aperto_ai_clienti` **o** `prova`: quando `prova` diventa vera su un invito `attivo` senza `scade_il`, la scadenza si scrive adesso (oggi + `giorni_validita_link`); l'invito passa a `scaduto` quando lo scrive una funzione senza sessione (vedi `onboarding_join_leggi`).
- `onboarding_inviti_stato`: verso `usato`, cancella la riga di `onboarding_inviti_token`; verso `revocato`, `clienti_account.stato = 'sospeso'` (se c'è e non è `chiuso`); da `revocato` verso `attivo` o `usato`, `clienti_account.stato = 'attivo'` (se non è `chiuso`). *Minaccia chiusa:* il token in chiaro che resta leggibile dopo l'uso; un cliente rimborsato che continua a entrare.
- `onboarding_segna_prova(p_invito uuid, p_prova boolean) returns jsonb` (`security invoker`, solo admin, mai OAuth, alza il segno, evento `prova` con l'autore): un invito già `usato` non cambia (22023 «Il cliente è già registrato.»).
- `onboarding_vendita_spostata` (A) ricreata: se l'invito della vendita spostata è `usato`, niente revoca, ma una notifica `onboarding_cliente` agli admin «La vendita di <Nome> è passata a un altro cliente: controlla il suo accesso.».
- Il trigger dei pagamenti di A (`payments_onboarding_gate`) ricreato con una riga in più, dentro il suo blocco che non ferma mai l'incasso: una rata incassata di una vendita `nuovo` o `rinnovo` di un cliente con `clienti_account.stato = 'sospeso'` manda agli admin «<Nome> ha pagato: se va riattivato, usa Riattiva nella sua scheda di onboarding.» (una volta per rata). L'account non cambia.

**Ciclo di vita dell'account** (scritto qui una volta; ogni riga ha il suo caso in pgTAP 111):

| Evento | Account | Chi lo scrive |
|---|---|---|
| Codice giusto e utente creato | nasce `attivo` | `onboarding_registra_cliente` |
| Invito `revocato` (a mano, rimborso totale di un invito non attivato a mano, vendita eliminata: regole di A) | `sospeso` | `onboarding_inviti_stato` |
| «Riattiva» dell'admin | `attivo` | `onboarding_inviti_stato` |
| Rimborso totale con l'invito attivato a mano | resta com'è (regola di A) | nessuno |
| Nuova rata incassata con l'account `sospeso` | resta `sospeso`, notifica agli admin | `payments_onboarding_gate` |
| Vendita spostata su un altro cliente con l'invito `usato` | resta com'è, notifica agli admin | `onboarding_vendita_spostata` |
| 12 mesi dopo la fine dell'ultimo percorso `nuovo` o `rinnovo` | `chiuso` (`chiuso_il`), i dati sulla salute si cancellano (B1b) | `onboarding_pulizia` |
| Cliente eliminato | la riga se ne va (cascade), l'utente lo toglie la server action | `elimina_cliente` e la server action |

Un account `chiuso` non torna mai `attivo`: per un cliente che rientra dopo 12 mesi si avvia un nuovo onboarding da un nuovo account (v2: la dashboard ongoing ne terrà conto).

**Funzioni di `/join`** (`security definer`, `search_path ''`, grant **solo** a `service_role`):

- `onboarding_join_leggi(p_token_hash text) returns jsonb`: `{ stato, nome }` con `stato` in `attivo`, `in_attesa`, `usato`, `scaduto`, `revocato`, `non_valido`; `nome` è il nome di battesimo, solo per `attivo` e `usato`. Un invito `attivo` con `scade_il` passato diventa `scaduto` qui. Un invito non di prova con l'area chiusa risponde `in_attesa`. Un cliente che ha già un account risponde `usato`.
- `onboarding_join_apri(p_token_hash text, p_chiave_hash text) returns jsonb`: solo un invito che `onboarding_join_leggi` direbbe `attivo`; crea o rinnova la riga di `onboarding_registrazioni` (nuova chiave, 30 minuti, codice azzerato; `utente_id`, `invii`, `invii_dal` ed `email_provate` restano) e risponde `{ esito: 'ok' }` o lo stato.
- `onboarding_join_stato(p_chiave_hash text) returns jsonb`: `{ nome, email_proposta, codice_inviato_a }` finché la chiave vale; `email_proposta` è `onboarding_inviti.email`.
- `onboarding_join_codice(p_chiave_hash text, p_email text, p_codice_hash text) returns jsonb`, in quest'ordine: (1) chiave scaduta: `scaduta`; (2) **ogni chiamata conta come una richiesta** nella finestra dell'ora, qualunque sia l'esito: oltre 5, `troppe_richieste`; (3) l'indirizzo entra in `email_provate` se non c'è; con più di 3 indirizzi diversi, `email_non_ammessa`, anche per un indirizzo ammesso; (4) un indirizzo di un profilo, di un invito del team non revocato o di un altro cliente: `email_non_ammessa`; (5) `invia`: salva email, hash e scadenza del codice, azzera gli errori e restituisce `nome` per l'email. Il codice in chiaro non arriva mai al database. *Minaccia chiusa:* chi ha un link qualsiasi prova email senza limite per sapere quali sono di un collaboratore o di un altro cliente; restano al massimo 3 indirizzi per invito, e l'invito è uno solo.
- `onboarding_join_verifica(p_chiave_hash text, p_codice text) returns jsonb`: `esito` in `ok` (con `utente_id` ed `email`), `errato`, `bloccato` (5 errori: serve un codice nuovo), `scaduto`. Con `ok` scrive `verificato_il`.

**Funzioni del rientro** (grant solo `service_role`):

- `cliente_accesso_per_email(p_email text) returns table (user_id uuid, stato text, nome text)`: l'account del cliente con quell'email in `auth.users`, se esiste (ogni stato).
- `cliente_accesso_conta(p_email text, p_tipo text) returns boolean`, `p_tipo` in:
  - `invio`: vero e conta se la chiave dell'indirizzo ha meno di 5 invii nell'ora e `tutti` meno di 200; scrive `ultimo_invio_il`. Si chiama solo per un account `attivo` o `sospeso`.
  - `verifica`: non conta niente; vero solo se la chiave dell'indirizzo ha `ultimo_invio_il` negli ultimi 60 minuti e meno di 5 errori nell'ora, e `tutti` meno di 100 errori nell'ora.
  - `errore`: conta un errore sulla chiave dell'indirizzo (se c'è) e su `tutti`.
- *Minaccia chiusa:* casella di un cliente inondata di codici, quota di Resend consumata; codici provati a forza con email a caso, che farebbero chiamare `verifyOtp` dal server e consumerebbero il limite di verifiche di Supabase per IP (`token_verifications`, 30 ogni 5 minuti), che dal server Vercel è uno solo per tutti: un'email che non ha ricevuto un codice nell'ultima ora non arriva mai a Supabase, e 100 errori l'ora in tutto fermano le verifiche per un'ora con la frase neutra. *Rischio residuo:* `/auth/v1/verify` si chiama anche direttamente con la chiave publishable, dove il contatore dell'app non arriva: lì protegge il limite per IP di Supabase sull'endpoint pubblico (che è per l'IP di chi chiama, non del server), più le 8 cifre e i 60 minuti del codice. Il codice del team su `/login` (`verificaCodice`) non ha il controllo `verifica` (il codice lo manda Supabase), come oggi.

**Bucket `avatari`**: le quattro policy di `20260928160000_foto_profilo.sql` ricreate con `and (select public.current_role()) is not null`. *Minaccia chiusa:* un cliente che carica file in un bucket pubblico.

### 2. Contenuti, consensi, video

```
onboarding_passi_def             -- colonna nuova
  sblocco text not null default 'automatico' check in ('automatico','team')
  -- versione 1: 'team' per obiettivo e programma, 'automatico' per gli altri

contenuti_blocchi                -- il CMS minimo; scrive l'admin, il cliente li riceve solo da percorso_cliente()
  id uuid pk, versione_flusso int not null default 1,
  pagina text not null check in ('passo','dopo_lancio'),
  passo text null,                 -- con pagina 'passo': la chiave dello step (fk composta con onboarding_passi_def)
  ordine int not null,
  tipo text not null check in ('testo','avviso','video','regola','voce','pulsante','domande'),
  titolo text null (al massimo 120), corpo text null (Markdown, al massimo 8.000),
  youtube_id text null (^[A-Za-z0-9_-]{11}$), url text null (^https://, al massimo 500),
  obbligatorio boolean not null default false,   -- un video obbligatorio va visto al 90%; regole e voci sono sempre obbligatorie
  pubblicato boolean not null default true,
  created_at, updated_at
  -- check per tipo: 'video' vuole youtube_id; 'pulsante' vuole url e titolo; 'regola' e 'voce' vogliono titolo
  -- RLS: admin tutto; nessun altro; _mai_da_oauth

clienti_consensi_testi           -- le versioni dei testi dei consensi; seminata dalle migration; admin legge
  tipo text, versione text, pk (tipo, versione), testo_sha256 text not null, in_vigore boolean
  -- una sola versione in vigore per tipo (indice unico parziale)

clienti_consensi                 -- i consensi dati; admin legge; il cliente da percorso_avanza e consenso_dai
  id uuid pk, client_id -> clients on delete cascade, tipo text check in ('salute'),
  versione text not null, fk (tipo, versione) -> clienti_consensi_testi,
  dato_il timestamptz not null default now(), revocato_il timestamptz null,
  revocato_da -> profiles null on delete set null           -- l'admin che ha registrato la revoca (B1b)
  -- un solo consenso non revocato per cliente e tipo (indice unico parziale)

onboarding_video_visti           -- i secondi visti di un video del CMS (B2: anche di una consegna)
  id uuid pk, client_id -> clients on delete cascade,
  blocco_id -> contenuti_blocchi null on delete cascade,
  durata int not null check between 1 and 10800,             -- la prima dichiarata dal player
  visti varbit not null,                                     -- un bit per secondo
  percentuale numeric(5,2) generated, visto_il timestamptz null (alla prima volta oltre il 90%),
  updated_at
  -- check (blocco_id is not null) in B1a; B2 lo sostituisce con num_nonnulls(blocco_id, consegna_id) = 1
  -- indice unico parziale (client_id, blocco_id) where blocco_id is not null
  -- RLS: admin legge; nessun'altra lettura (B2: il coach la riceve da onboarding_scheda_incaricato)
```

- Seme di `contenuti_blocchi`, versione 1, tutti pubblicati, con segnaposto evidenti dove manca il testo vero (specifica 13-bis.7: «[Da scrivere: …]»):
  - `benvenuto`: testo di benvenuto (callout «Benvenuto a bordo, [Nome]…» della specifica 7, firmato Dany); video di benvenuto (`youtube_id` segnaposto `XXXXXXXXXXX`, obbligatorio); testo «Il tuo team».
  - `regole`: le regole del percorso della specifica 4.1 (Telegram per imprevisti e dubbi, Coach Plus per i dati, call confermate, preavviso di 24-48 ore, notifiche Telegram attive) e le regole della community, una `regola` ciascuna.
  - B1b aggiunge i blocchi di `questionario`; B2 quelli di `prenotazione` («Cosa faremo in call», specifica 4.2), `community` (template di presentazione), `obiettivo`, `test` (le voci della settimana test), `programma` e `dopo_lancio`.
- Seme di `clienti_consensi_testi`: `('salute', '2026-11-12', <sha256 del testo>, true)`. Il testo è in `lib/percorso/consensi.ts`; un test verifica che lo sha256 del testo nel codice sia quello della migration. Una nuova versione del testo è una migration (la vecchia `in_vigore = false`) e chi l'ha accettata prima la vede di nuovo.
- **Backup**: `backup_completo()` ricreata identica alla A, aggiungendo alle escluse `onboarding_registrazioni`, `clienti_accesso_limiti`, `onboarding_questionari`, `onboarding_allegati` (le ultime due nascono con B1b: escluderle per nome già adesso non costa niente e non si dimentica). Gli account dei clienti (`auth.users`) finiscono nel file come gli altri: solo email e metadati.
- **Eliminazione**: `anteprima_eliminazione('cliente', …)` aggiunge `accesso_cliente`; `lib/eliminazione.ts` lo dice («Si perde anche il suo accesso al percorso.»). La server action che elimina un cliente legge prima `user_id`, poi chiama `elimina_cliente`, poi toglie l'utente (`auth.admin.deleteUser`) col `service_role`, senza mai fermare l'eliminazione se non riesce: la pulizia della sera cerca i resti. B1b aggiunge questionario e file.
- **Conservazione** (decisione 8): `onboarding_pulizia()` (`security definer`, solo `service_role`), con `pg_cron` ogni notte alle 02:50 UTC (`onboarding-pulizia`, sfasato da `notifiche-pulizia`): porta a `chiuso` (con `chiuso_il`) gli account dei clienti il cui ultimo percorso `nuovo` o `rinnovo` è finito da più di 12 mesi e cancella i loro video visti; cancella `onboarding_registrazioni` scadute da un giorno, `clienti_accesso_limiti` più vecchie di un giorno, le righe di `onboarding_inviti_token` di inviti `scaduto` o `revocato` da più di 30 giorni, `onboarding_eventi` di più di 24 mesi. Il cron della sera (`lib/percorso/pulizia.ts`) toglie gli utenti con `app_metadata.tipo = 'cliente'` senza `clienti_account`. B1b aggiunge questionario e file.

### 3. Funzioni del cliente

- `cliente_corrente() returns uuid` (`security definer`, `stable`, `search_path ''`, nessuna grant): il `client_id` di `clienti_account` con `user_id = auth.uid()` e `stato = 'attivo'`; null per un token OAuth (`da_client_oauth()`), per chi ha un profilo e per un account sospeso o chiuso.
- `onboarding_ultimo_passo_servito()` (sopra, `'regole'` in B1a).
- `onboarding_sblocca(p_client_id uuid)` (interna, nessuna grant): ogni step `bloccato` con `sblocco = 'automatico'`, i cui `sblocca_dopo` sono tutti `fatto` e che non viene dopo `onboarding_ultimo_passo_servito()`, diventa `disponibile`. **Non tocca mai uno step con `sblocco = 'team'`**: `obiettivo` lo apre `pm_task_onboarding_passo` (B2) quando il task `obiettivo_smart` è completato e `call` è `fatto`; `programma` lo portano `onboarding_test_ricevuti` a `in_attesa_team` e `onboarding_programma_consegnato` a `disponibile`.
- `onboarding_stima(p_client_id uuid)` (interna): `data` (o null con `quasi` vero), `giorni`, `base` (`call_non_prenotata`, `call_prenotata`, `settimana_test`, `iniziato`), `cose_da_fare` (step con attore `cliente` non `fatto` fino al razzo, più le voci obbligatorie della settimana test in B2), `video_mancanti` (titoli dei video obbligatori non visti). Regole della specifica 4.4 con `giorni_call`, `giorni_test`, `giorni_programma` delle impostazioni; mai un numero negativo.

Tutte quelle che seguono: `security definer`, `search_path ''`, grant ad `authenticated`, prima riga `v_cliente := public.cliente_corrente()` (null: 42501 «Accesso non valido: entra di nuovo.»). Nessuna restituisce un dato di un altro cliente, una persona del team oltre a nome, foto e ruolo, un importo o lo stato del pagamento.

- `percorso_cliente() returns jsonb`: il documento della pagina.
  - `cliente`: nome di battesimo. `percorso`: stato, `giorno_zero`, `completato_il`.
  - `nodi`: i 7 nodi della versione (`lib/percorso/nodi.ts` ha le etichette; il database l'ordine e la chiave), ognuno con `stato` in `completato`, `attuale`, `futuro` e `completato_il`. Completato: tutti i suoi step `fatto`. Attuale: il primo non completato con almeno uno step non `bloccato`. Gli altri futuri.
  - `passi`: tutti gli step con `chiave`, `titolo`, `nodo`, `attore`, `stato`; **solo** per gli step non `bloccato` anche `blocchi` (i pubblicati, già in ordine, con `id`, `tipo`, `titolo`, `corpo`, `youtube_id`, `url`, `obbligatorio`; mai `pubblicato`, `versione_flusso`, `ordine` né le date) e i loro `video` (percentuale, visto); per uno step `fatto` anche `completato_il`; mai `dati` né `nota`.
  - `team`: per coach, revisore e responsabile dell'incarico, `nome`, `foto_url` e il ruolo («Coach», «Revisione video», «Personal Success Manager»), da una lettura dedicata di `profiles`, mai l'email.
  - `stima`: da `onboarding_stima`.
  - `in_attesa`: vero quando nessuno step con attore `cliente` è `disponibile` o `in_corso` e il percorso non è completato (il pannello mostra l'attesa).
- `percorso_avanza(p_passo text, p_azione text, p_dati jsonb) returns jsonb`: l'unica strada per avanzare uno step con le azioni del cliente. Accetta **solo le coppie (passo, azione) di un elenco chiuso** scritto nella funzione, ognuna con gli stati da cui parte; una coppia che non c'è, o uno step in un altro stato (`bloccato`, `inviato`, `in_attesa_team`), 22023 «Questo passo non è ancora disponibile.»; uno step `fatto`, 22023 «Questo passo è già completato.». In B1a:
  - (`benvenuto`, `completa`) da `disponibile` o `in_corso`: ogni video obbligatorio dello step visto al 90% (22023 «Guarda il video fino in fondo prima di andare avanti.»).
  - (`regole`, `accetta`) da `disponibile` o `in_corso`, `p_dati = { regole: [id], consenso_salute: versione }`: tutti gli id delle `regola` pubblicate dello step (22023 «Spunta tutte le regole per andare avanti.») e la versione in vigore del consenso (22023 «Il testo del consenso è cambiato: rileggilo e accettalo di nuovo.»); scrive il consenso se non ce n'è uno in vigore.
  - Ogni completamento: step `fatto`, evento (attore `cliente`, dettagli con la sola chiave), `onboarding_sblocca`, restituisce `percorso_cliente()`.
- `consenso_dai(p_tipo text, p_versione text) returns jsonb`: per ridare il consenso dopo un cambio di testo.
- `video_progresso(p_blocco uuid, p_consegna uuid, p_durata int, p_intervalli int4range[]) returns jsonb`: esattamente uno tra `p_blocco` e `p_consegna`; in B1a `p_consegna` non null è 22023. Un blocco `video` di uno step del cliente in stato `disponibile` o `in_corso`; al massimo 50 intervalli, dentro la durata; unisce i secondi a quelli già visti, calcola la percentuale e `visto_il`. Restituisce `{ percentuale, visto }`. Lo stesso controllo degli stati vale in B2 per una consegna (step `programma` `disponibile` o `in_corso`).

### 4. Funzioni dell'admin

`security invoker`, solo admin, mai OAuth, evento con l'autore: `onboarding_segna_prova` (sopra). I blocchi del CMS si scrivono con la sessione dell'admin sotto RLS (nessuna funzione).

**Elimina onboarding** (Dany, 12/11/2026, dopo un onboarding di prova su Daniele D'Andrea: «rimuovi questo, era un test che ho fatto»).
- `onboarding_elimina(p_client_id uuid) returns jsonb` (`security invoker`, solo admin attivo, 42501 per ogni altro ruolo e per ogni token OAuth con `da_client_oauth()` esplicito; nessuna funzione `security definer` nuova). Alza il segno `alpha.onboarding_admin` per la sua transazione, come le altre azioni del link.
- **Solo prima della registrazione**: se il cliente ha una riga in `clienti_account` (qualunque stato) risponde 22023 «Il cliente si è già registrato: per fermare l'onboarding usa «Revoca».». Un cliente registrato ha consensi, video visti e, da B1b, dati sulla salute: quelli si fermano con la revoca e seguono la conservazione, mai cancellati da un tocco.
- **Cosa toglie**, in una transazione: l'invito (il token con lui, cascade), il percorso e i suoi passi, gli incarichi, il registro dell'onboarding di quel cliente, le registrazioni in sospeso (`onboarding_registrazioni` del suo invito), i task con `chiave_onboarding` del progetto del cliente (con i loro assegnatari, il tempo registrato su di loro resta senza task, come quando si elimina un task) e la lista «Onboarding» se resta vuota, le notifiche `onboarding_pagamento` di quel cliente (per chiave o per link alla sua scheda). Il trigger `pm_task_onboarding_guardia` non lo ferma: guarda solo insert e update.
- **Cosa resta**: cliente, vendita, rate e incassi, il progetto con «Percorso cliente», i suoi membri e il suo coach, `clienti_telegram`. La vendita torna in «Vendite nuove senza onboarding» e l'onboarding si può avviare di nuovo da lì.
- **Domanda prima**: `anteprima_eliminazione('onboarding', client_id)` conta task di onboarding, step e righe del registro; `lib/eliminazione.ts` lo dice con `components/form/elimina.tsx` («Si tolgono il link, gli step, il team incaricato, il registro e i 10 task della lista «Onboarding». Cliente, vendita, rate e progetto restano.»). Il bottone «Elimina onboarding» sta in fondo alla scheda di onboarding, solo per l'admin e solo senza account; con un account la scheda dice perché non c'è e rimanda a «Revoca».
- Server action `eliminaOnboarding` (`app/(app)/onboarding/actions.ts`, sessione dell'admin), che rivalida `/onboarding`, il progetto e la scheda del cliente, poi porta alla lista con il toast «Onboarding eliminato».
- Nessun evento resta nel registro (il registro se ne va con lui): l'eliminazione resta solo nella domanda e nel toast, come per le altre eliminazioni dell'admin (sezione 19).

## Schema di B1b

Migration 4: `20261109100000_questionario.sql`.

```
onboarding_questionari           -- le risposte; dati sulla salute; fuori dal backup
  client_id uuid pk -> clients on delete cascade,
  risposte jsonb not null default '{}' check (onboarding_risposte_valide(risposte)),
  versione int not null default 0,                           -- sale a ogni salvataggio
  schermata int not null default 1 check between 1 and 4,
  inviato_il timestamptz null,
  created_at, updated_at
  -- RLS: admin legge; nessun altro (B2: il coach le riceve da onboarding_scheda_incaricato); nessuna scrittura da una sessione

onboarding_allegati              -- i file del questionario; fuori dal backup
  id uuid pk, client_id -> clients on delete cascade,
  campo text not null check in ('attrezzatura','vecchia_scheda','piano_alimentare'),
  percorso text not null unique,                             -- '<client_id>/<id>'
  nome_file text not null (al massimo 120, senza / \ e caratteri di controllo),
  tipo text not null check in ('image/jpeg','image/png','image/webp','application/pdf'),
  byte int not null check between 1 and 10485760,
  stato text not null default 'in_caricamento' check in ('in_caricamento','caricato','da_cancellare'),
  caricato_il timestamptz null, created_at
  -- RLS come onboarding_questionari
```

- **Bucket `onboarding-allegati`**: privato, 10 MB a file, `allowed_mime_types` come la colonna `tipo`. **Nessuna policy su `storage.objects` per questo bucket**: caricamento con un indirizzo firmato creato dal server dopo `allegato_prepara`, lettura con un indirizzo firmato di 60 secondi creato dal server dopo un controllo di chi chiede. *Minaccia chiusa:* un file letto o sovrascritto da chiunque conosca il percorso; un cliente che legge i file di un altro.
- `onboarding_risposte_valide(jsonb) returns boolean` (`immutable`, `search_path ''`): solo le chiavi del questionario (sotto, «Codice»), ognuna del suo tipo, testi al massimo 2.000 caratteri, numeri nei loro intervalli. È la stessa regola di `lib/validation/questionario.ts`; un test Vitest e uno pgTAP usano gli stessi esempi. *Minaccia chiusa:* un `jsonb` qualsiasi salvato chiamando la funzione direttamente. `onboarding_risposte_complete(jsonb)` (le stesse regole di Zod per l'invio).
- `onboarding_eta(p_client_id uuid) returns int` (interna): gli anni compiuti dalla `data_nascita` salvata, oggi a Roma; null se manca.
- Seme di `contenuti_blocchi`: `questionario`, testo introduttivo e avviso «Niente foto del fisico qui: quelle vanno su Coach Plus.».
- `onboarding_ultimo_passo_servito()` ricreata (`'questionario'`) e `onboarding_sblocca` chiamata per ogni percorso già registrato.
- **Backup**: niente da ricreare (le due tabelle sono già escluse per nome da B1a).
- **Eliminazione**: `anteprima_eliminazione('cliente', …)` aggiunge `questionario`; `lib/eliminazione.ts`: «Si perdono anche il suo accesso al percorso, il questionario e i file caricati.». La server action legge anche i percorsi dei file e li toglie (API di Storage) dopo `elimina_cliente`, senza mai fermare l'eliminazione.
- **Conservazione**: `onboarding_pulizia()` ricreata: con gli account che passano a `chiuso` cancella anche il loro questionario e segna `da_cancellare` i loro allegati; segna `da_cancellare` gli allegati rimasti `in_caricamento` da più di un giorno. I file `da_cancellare` li toglie il cron della sera (`lib/percorso/pulizia.ts`: lista da `onboarding_allegati_da_togliere()`, `service_role`, poi API di Storage, poi la riga), insieme agli oggetti del bucket senza riga. Storage non si cancella da SQL.

**Età** (piano, decisione 7: «sotto i 14 anni nessun invito»; il consenso di un minore di 14 anni non vale). Le regole valgono in `questionario_salva`, `questionario_invia` e `allegato_prepara`, appena c'è una `data_nascita` (salvata o nel salvataggio):

- **Sotto i 14 anni**: niente si salva. Il salvataggio che porta la data cancella tutte le risposte già salvate (anche la data), segna `da_cancellare` gli allegati, scrive l'evento `eta_sotto_14` (senza la data), manda agli admin una volta «Età sotto i 14 anni: <Nome>. Le risposte non sono state salvate.» e rifiuta con 22023 «Per i minori di 14 anni il percorso non è disponibile: scrivi al tuo coach.». Il percorso resta com'è: decide l'admin (di solito «Revoca»).
- **Tra 14 e 17 anni con un invito non segnato minorenne e senza `consenso_genitore_il`**: si salva solo la schermata 1; un salvataggio con chiavi delle schermate 2-4, un allegato e l'invio rifiutano con 22023 «Per andare avanti serve il consenso di un tuo genitore: ti scrive il tuo coach.»; gli admin ricevono una volta «Età da verificare: <Nome>». Con il consenso registrato (sotto) si va avanti.
- Con un invito segnato minorenne il consenso del genitore è già registrato prima dell'attivazione (gate di A).
- *Rischio residuo:* l'età è quella dichiarata.

**Funzioni del cliente** (come in B1a; ognuna vuole lo step `questionario` `disponibile` o `in_corso`, altrimenti 22023 «Questo passo non è ancora disponibile.»):

- `questionario_cliente() returns jsonb`: risposte, versione, schermata, `inviato_il`, gli allegati (`id`, `campo`, `nome_file`, `tipo`, `byte`), `serve_genitore` (vero nel caso 14-17 sopra).
- `questionario_salva(p_risposte jsonb, p_schermata int, p_versione int) returns jsonb`: consenso sulla salute in vigore (22023 «Serve il consenso al trattamento dei dati sulla salute per compilare il questionario.»), non inviato (22023 «Il questionario è già stato inviato.»), regole dell'età. Scrive solo sopra la versione letta: con una versione diversa non scrive e risponde `{ esito: 'cambiato', risposte, versione }` (un altro dispositivo); altrimenti `{ esito: 'salvato', versione }`. Primo salvataggio: step `in_corso`.
- `questionario_invia(p_versione int) returns jsonb`: risposte complete (`onboarding_risposte_complete`: 22023 «Mancano delle risposte: completa le parti segnate.» con `mancanti` nei dettagli dell'errore, come elenco di chiavi), stessa versione, regole dell'età. Poi `inviato_il`, step `fatto`, sblocco, evento, notifica «Questionario inviato da <Nome>».
- `allegato_prepara(p_campo text, p_nome text, p_tipo text, p_byte int) returns jsonb`: questionario non inviato, consenso in vigore, regole dell'età, tipo e dimensione ammessi (22023 «File non valido: puoi caricare foto (JPG, PNG, WebP) o PDF fino a 10 MB.»), al massimo 3 file `in_caricamento` o `caricato` per campo (22023 «Hai già caricato 3 file qui: togline uno per aggiungerne un altro.»), al massimo 20 preparazioni e 100 MB dichiarati al giorno per cliente, contando ogni riga creata nel giorno di Roma in qualunque stato, `da_cancellare` comprese (22023 «Hai caricato troppi file oggi: riprova domani.»); crea la riga `in_caricamento` e restituisce `{ id, percorso }`. *Minaccia chiusa:* il giro prepara, carica, togli che riempie lo Storage fino alla pulizia della sera.
- `allegato_togli(p_id uuid) returns jsonb`: solo prima dell'invio; riga `da_cancellare`.
- `allegato_conferma(p_client_id uuid, p_id uuid, p_tipo_letto text) returns jsonb`: **grant solo `service_role`**, chiamata dalla route dopo aver verificato la sessione del cliente (`requireCliente` dà `p_client_id`) e letto i primi 16 byte dell'oggetto; la riga è di quel cliente e `in_caricamento`; l'oggetto c'è in `storage.objects` (bucket e nome) con dimensione ammessa; `p_tipo_letto` (dalla firma dei byte) è quello della riga. Riga `caricato`. Altrimenti 22023 «Il file non è arrivato: riprova.» (o «File non valido: …» se la firma non torna) e la riga diventa `da_cancellare`. *Minaccia chiusa:* un HTML o un PDF con script dichiarato `image/png`, che si aprirebbe in linea all'admin e al coach; un cliente che chiama la conferma direttamente con le Data API saltando la lettura dei byte.

**Funzioni dell'admin** (`security invoker`, solo admin, mai OAuth, evento con l'autore):

- `onboarding_revoca_consenso(p_client_id uuid, p_tipo text, p_motivo text) returns jsonb`: segna `revocato_il` e `revocato_da`, cancella le risposte del questionario, segna `da_cancellare` gli allegati, riporta `regole` e `questionario` a `disponibile` (e blocca ciò che ne dipende e non è `fatto`). Lo chiede il cliente al team (la pagina «I tuoi consensi» e `/privacy` lo dicono). Restituisce i percorsi dei file, che la server action toglie subito.
- `onboarding_consenso_genitore` (A) ricreata con un ramo in più: accetta anche un invito `usato`, non segnato minorenne, di un cliente con `onboarding_eta` tra 14 e 17; scrive `consenso_genitore_il` e la nota come in A (il segno dell'admin), evento.

## Schema di B2

Migration:

5. `20261110090000_percorso_call_consegne.sql`
6. `20261110090100_percorso_team.sql`

```
clienti_call                     -- call di onboarding e checkpoint; fuori dalle metriche di vendita (decisione 6)
  id uuid pk, client_id -> clients on delete cascade,
  tipo text check in ('onboarding','checkpoint'),
  inizio timestamptz not null, durata_minuti int not null default 30 check between 5 and 180,
  meet_url text null (^https://meet\.google\.com/),
  stato text not null default 'prenotata' check in ('da_confermare','prenotata','svolta','non_presentato','annullata'),
  coach_id -> profiles null on delete set null,
  created_by -> profiles null on delete set null, created_at, updated_at
  -- una sola call di onboarding non annullata per cliente (indice unico parziale)
  -- RLS: admin tutto; nessun'altra policy (gli incaricati da funzioni); scritture solo dalle funzioni

clienti_consegne                 -- i materiali del singolo cliente (step 12)
  id uuid pk, client_id -> clients on delete cascade,
  tipo text check in ('video','pdf','link'), titolo text (1-120),
  youtube_id text null, url text null (^https://), obbligatoria boolean default false,
  created_by -> profiles null on delete set null, created_at
  -- RLS come clienti_call

onboarding_impostazioni          -- colonne nuove
  link_prenotazione text null (^https://(calendar\.app\.google|calendar\.google\.com)/),
  avvisa_cliente_email boolean not null default true
  -- grant update (aperto_ai_clienti, link_prenotazione, avvisa_cliente_email) ad authenticated;
  -- trigger onboarding_impostazioni_coerenza: un cambio di aperto_ai_clienti da una sessione senza il segno
  --   alpha.onboarding_area (alzato solo da onboarding_apri_ai_clienti e onboarding_chiudi_ai_clienti) è 42501

onboarding_video_visti           -- colonna nuova
  consegna_id -> clienti_consegne null on delete cascade,
  -- check num_nonnulls(blocco_id, consegna_id) = 1 al posto di quello di B1a;
  -- indice unico parziale (client_id, consegna_id) where consegna_id is not null
```

- `onboarding_passi_def` versione 1: nessuna riga cambia. Il flusso v1 resta quello di A, con la colonna `sblocco` di B1a.
- `onboarding_ultimo_passo_servito()` ricreata (null).
- **Funzioni di B1a e B1b ricreate dalla migration 6**: `percorso_avanza` (le coppie nuove), `percorso_cliente` (i campi nuovi), `onboarding_registra_cliente` (le scadenze dei task alla registrazione), `video_progresso` (le consegne), `onboarding_ultimo_passo_servito`. `onboarding_sblocca` resta com'è. Recupero, nella stessa migration: per ogni account già registrato, le scadenze di `telegram_gruppo` e `community_accesso` (giorno zero + 1) sui task non completati, e `onboarding_sblocca` sul suo percorso.

**Letture degli incaricati** (piano 4.9: «Coach e revisore vedono un cliente da registrato in poi; un account sospeso per loro è In pausa, senza motivo»). Due funzioni (`security definer`, `search_path ''`, grant ad `authenticated`, nell'elenco di `00` e `75`, 42501 a un token OAuth; nessuna policy nuova):

- `onboarding_incaricati_elenco() returns table (...)`: per i soli clienti con percorso registrato (`giorno_zero` non null) di cui chi chiama ha un incarico attivo (o tutti per l'admin, che però usa la sua lista): `client_id`, nome e cognome, `incarico` (coach, revisore, responsabile), `gruppo` (`tocca_a_te`, `tocca_al_cliente`, `in_pausa` per un account `sospeso` o un percorso `sospeso`, mai il perché; `completati`), lo step attuale con il suo titolo, e i segni delle code che lo riguardano (`call_da_confermare`, `call_da_segnare`, `richiesta_community`, `presentazione_da_controllare`, `test_da_confermare`, `programma_da_consegnare`, `preparazione_incompleta`); ogni incaricato riceve solo le code del suo incarico (il revisore solo «Test da rivedere»). Mai email, telefono, note, invito, `sale_id`, `pagamento_confermato`, registro.
- `onboarding_scheda_incaricato(p_client_id uuid) returns jsonb`: lo stesso controllo, per un cliente: nome e cognome, gli step con titolo e stato, i titoli e le percentuali dei video, la call, le consegne, la community; al **coach** anche le risposte del questionario, gli allegati (`id`, `campo`, `nome_file`) e lo username e il gruppo privato di Telegram; al **responsabile** username e gruppo privato di Telegram; il revisore e il responsabile mai il questionario. Per un cliente in pausa solo nome e «In pausa».
- `onboarding_allegato_apri(p_id uuid) returns table (percorso text, tipo text, nome_file text)`: admin, o coach incaricato di quel cliente; altrimenti nessuna riga.
- **Preparazione incompleta** (specifica 4.1): call di onboarding `prenotata` entro 48 ore (o già passata e non segnata) e step `community` non `fatto`. La lista e la scheda del coach dicono «Preparazione incompleta: manca la community.»; nessuna notifica, nessun conteggio per persona.

**Funzioni del cliente** (come in B1a; ogni coppia con gli stati da cui parte):

- `percorso_avanza`, coppie nuove: (`prenotazione`, `prenotato`) da `disponibile` o `in_corso`, `{ giorno, ora }` da oggi a 60 giorni: nasce `clienti_call` `da_confermare`, step `inviato`, notifica al coach e agli admin; (`community`, `username`), (`community`, `richiesta_inviata`), (`community`, `presentato`) da `disponibile` o `in_corso` (`username` scrive `clienti_telegram.username` con le regole di A; `richiesta_inviata` e `presentato` scrivono le date in `onboarding_passi.dati` dello step, `presentato` porta lo step a `fatto`); (`obiettivo`, `visto`) da `disponibile`; (`test`, `spunta`) da `disponibile` o `in_corso`, `{ voce: id }` di una voce pubblicata dello step: la spunta si salva in `onboarding_passi.dati` dello step `test` (`{ voci: [id] }`, mai restituito grezzo: `percorso_cliente` dice per ogni voce se è spuntata), tutte spuntate: step `in_attesa_team`; (`programma`, `completa`) **solo da `disponibile`** (dopo la consegna): ogni video obbligatorio tra blocchi e consegne visto al 90%. Rifiutate, per esempio: (`programma`, `completa`) e (`test`, `spunta`) in `in_attesa_team`, (`prenotazione`, `prenotato`) in `inviato`.
- `percorso_cliente` aggiunge `call` (giorno, ora, durata, `meet_url` solo se `prenotata`), `consegne` (con `id`, titolo, tipo, link, obbligatoria e i secondi visti), `link_community` (solo con lo step `community` sbloccato), `link_prenotazione` (solo con lo step `prenotazione` sbloccato), `gruppo_privato_url`, `attesa_team` (per uno step `in_attesa_team` o `inviato`: chi, con nome di battesimo e ruolo, e cosa: «Ivan sta confermando la tua call.»).
- `video_progresso` per una consegna: lo step `programma` `disponibile` o `in_corso`.

**Funzioni del team** (`security definer`, `search_path ''`, grant ad `authenticated`, nell'elenco di `00` e `75`): rifiutano un token OAuth e chi non è admin o il coach incaricato (`onboarding_incaricato` e `coach_id = auth.uid()`), con 42501 «Questa azione è del coach del cliente e dell'admin.». Il responsabile ha solo le due della community.

- `onboarding_call_conferma(p_client_id, p_inizio timestamptz, p_meet_url text)`: la call `da_confermare` diventa `prenotata` (giorno e ora si possono correggere), step `prenotazione` `fatto`, sblocco, scadenze dei task `questionario_letto` e `call_onboarding` al giorno della call, avviso al cliente.
- `onboarding_call_esito(p_call_id, p_esito text, p_nuovo_inizio timestamptz)`: `svolta` (step `call` `fatto`, task `call_onboarding` completato, scadenze di `obiettivo_smart` e `coachplus_test` a +1 giorno, sblocco; se `obiettivo_smart` è già completato, `obiettivo` diventa `disponibile`); `non_presentato` e `spostata` (`p_nuovo_inizio` obbligatorio: la call resta `prenotata` col giorno nuovo, avviso al cliente). Una call non ancora passata non si segna svolta (22023).
- `onboarding_test_ricevuti(p_client_id)`: step `test` `in_attesa_team` → `fatto`, step `programma` `in_attesa_team`, scadenza di `prima_scheda` a +2 giorni, notifica al revisore («Test da rivedere»).
- `onboarding_consegna_aggiungi(p_client_id, p_tipo, p_titolo, p_url, p_obbligatoria)` e `onboarding_consegna_togli(p_id)`.
- `onboarding_programma_consegnato(p_client_id, p_primo_checkpoint timestamptz)`: almeno una consegna; nasce la `clienti_call` di tipo `checkpoint`; step `programma` `disponibile` per il cliente (deve vedere i video obbligatori); task `prima_scheda` completato; scadenza di `template_alimentare` a +5 giorni e di `primo_checkpoint` al giorno del checkpoint; avviso al cliente.
- `onboarding_community(p_client_id, p_azione text)`: `approvata` (`community_approvata_il` nei `dati` dello step, task `community_accesso` completato) e `controllata` (`presentazione_controllata_il`). Admin, coach e responsabile incaricati.
- `onboarding_sblocca_passo(p_client_id, p_passo, p_motivo)` (motivo obbligatorio, 300 caratteri) e `onboarding_riavvia(p_client_id, p_motivo)` (tutti gli step tornano `bloccato` tranne `regole` e `questionario`, che restano `fatto` con consenso e risposte; sblocco; il percorso torna `in_corso`): solo admin e coach incaricato, evento con l'autore, che legge solo l'admin.

**Task e step** (piano 4.4: «la verità è lo step, il task è lo specchio»): trigger `pm_task_onboarding_passo` (`after update of stato on pm_task`, `security definer`, dentro un blocco che non ferma mai il task): `obiettivo_smart` completato e step `call` `fatto` → step `obiettivo` `disponibile`; `telegram_gruppo` completato → evento. Riaprire il task non riporta indietro lo step. Le scadenze dei task si scrivono solo dalle funzioni sopra e alla registrazione (`telegram_gruppo` e `community_accesso` al giorno zero + 1), con `pm_task.scadenza`, mai su un task completato.

**Completamento**: quando tutti gli step sono `fatto` e i video obbligatori (blocchi e consegne) visti, `onboarding_percorsi.stato = 'completato'`, `completato_il`, evento, notifica agli admin e al coach «Onboarding completato».

**Apertura dell'area**: `onboarding_apri_ai_clienti()` e `onboarding_chiudi_ai_clienti()` (`security invoker`, solo admin, mai OAuth, alzano il segno `alpha.onboarding_area`, evento): aprire rifiuta (22023, con l'elenco in parole) se un blocco pubblicato contiene «[Da scrivere», se un video ha l'id segnaposto, se mancano `link_community` o `link_prenotazione`; aperta, gli inviti `attivo` senza `scade_il` ricevono i loro giorni. Chiudere ferma le nuove registrazioni (tranne quelle di prova); gli account che ci sono restano. *Minaccia chiusa:* un PATCH diretto dell'admin su `aperto_ai_clienti` che salta i controlli.

`notifiche_tipo_check`: niente di nuovo; le notifiche agli incaricati usano `notifiche_avviso(destinatari, 'onboarding_cliente', …)`, mai a chi non legge la pagina a cui porta.

## Autenticazione (B1a)

Ogni file toccato e cosa cambia:

| File | Cambio |
|---|---|
| `lib/auth/destinazione.ts` (nuovo) | `destinazioneUtente(supabase, user)`: legge la propria riga di `profiles` e di `clienti_account` con la sessione. Esiti: `team` (profilo attivo: `vai` = `percorsoIniziale(ruolo)` o il `da` sicuro), `disattivato`, `cliente` (`attivo` o `sospeso`: `vai` = `/percorso`, il `da` solo se comincia con `/percorso`), `chiuso`, `nessuno`, `errore` (il database non risponde). Il profilo vince se ci fossero tutti e due |
| `lib/auth/dopo-login.ts` | `verificaDopoLogin` restituisce `{ ok: true, vai }` da `destinazioneUtente`. `signOut` (sempre `scope: 'local'`) solo per `disattivato`, `chiuso`, `nessuno`; con `errore` niente uscita: la pagina mostra l'errore con «Riprova». Oggi un cliente che entra da `/login` verrebbe disconnesso da tutti i dispositivi (`signOut()` globale su un utente senza profilo) |
| `lib/auth/session.ts` | `requireProfilo`: utente senza profilo → `destinazioneUtente`: un cliente va a `/percorso`, `chiuso` e `nessuno` a `/auth/uscita?motivo=`, `errore` lancia l'errore della pagina (`error.tsx` con «Riprova»). Mai più `redirect('/login')` con una sessione viva (era il ciclo) |
| `lib/auth/cliente.ts` (nuovo) | `requireCliente()`: la riga di `clienti_account` (in `cache` per richiesta, come `profiloDellaRichiesta`); un profilo va alla sua pagina; `chiuso` a `/auth/uscita?motivo=percorso-concluso`; nessun account a `/auth/uscita?motivo=nessun-account`; `errore` lancia l'errore della pagina; restituisce `{ clientId, stato }`, e la pagina sospesa la disegna il layout |
| `app/auth/uscita/route.ts` (nuovo) | GET: `signOut({ scope: 'local' })`, cookie di sessione tolti, redirect a `/accesso-negato?motivo=`. `no-store` |
| `app/accesso-negato/page.tsx` (nuovo, pubblico) | «Questo account non ha accesso.» con «Sei del team? Accedi» (`/login`) e «Sei un cliente del Percorso Alpha? Entra da qui» (`/entra`); con `motivo=percorso-concluso`: «Il tuo percorso è concluso: per tornare scrivi al tuo coach.» |
| `app/auth/callback/route.ts`, `app/auth/conferma/route.ts` | usano il nuovo esito (`vai`) |
| `app/login/actions.ts` | `richiediCodice`: prima `cliente_accesso_per_email` col `service_role` (la stessa lettura per ogni email). Per un cliente `attivo` o `sospeso`: `cliente_accesso_conta(email, 'invio')` prima della risposta, poi `generateLink` e Resend in `after()` di Next (la stessa strada di `/entra`); per gli altri `signInWithOtp` come oggi. **Risposta a tempo fisso**, 2 secondi dall'inizio per ogni esito: il ramo del team aspetta `signInWithOtp` al massimo fino a quel momento (oltre, risponde la frase neutra e la richiesta finisce in `after()`) e mostra il limite per IP o il servizio non raggiungibile solo se arrivano prima. `verificaCodice`: il nuovo esito |
| `app/login/page.tsx` | sotto il riquadro, «Sei un cliente del Percorso Alpha? Entra da qui» (`/entra`) |
| `lib/supabase/middleware.ts` (il proxy) | `PERCORSI_PUBBLICI` += `/join`, `/entra`, `/accesso-negato`. L'eccezione che legge la sessione sui pubblici diventa `GET /login` **e** `GET /entra`. Il proxy **non legge mai il database**: decide da `app_metadata.tipo` (lo scrive solo il server alla creazione, l'utente non può cambiarlo), e ogni pagina ricontrolla col database. Con una sessione: su `/login` o `/entra` un cliente va a `/percorso`, un altro utente al `da` sicuro come oggi (`/entra` senza `da`: `/`); un cliente che apre una pagina fuori da `/percorso`, `/auth`, `/privacy`, `/entra`, `/join`, `/accesso-negato` va a `/percorso`, e una route `/api` fuori da `/api/percorso` riceve 403 JSON. Senza sessione: `/percorso/*` va a `/entra?da=`, `/api/percorso/*` riceve 401 JSON, il resto a `/login?da=` come oggi. Su `/percorso`, `/join`, `/entra` genera il nonce e scrive la CSP (sotto) |
| `app/layout.tsx` | lo script del tema («Sistema») riceve il nonce letto da `headers()` (`x-nonce`) quando c'è |
| `app/auth/actions.ts` | `esciCliente`: `signOut({ scope: 'local' })` e redirect a `/entra` |
| `next.config.ts` | intestazioni per `/join/:path*`, `/entra`, `/percorso/:path*`: `X-Robots-Tag: noindex`, `Referrer-Policy: same-origin`, `X-Frame-Options: DENY`; `Cache-Control: no-store` per `/join` ed `/entra`. La CSP sta nel proxy, perché il nonce cambia a ogni richiesta |
| `supabase/config.toml` | `secure_password_change = true` |
| `supabase/migrations` | `handle_new_user`, trigger su email e password di `auth.users`, `invites_non_cliente`, policy di `avatari` (sopra) |

**Content-Security-Policy** di `/percorso`, `/join`, `/entra` (la guida di Next per il nonce, `node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md`; le pagine sono già dinamiche): `default-src 'self'; script-src 'self' 'nonce-<n>' 'strict-dynamic'` (in sviluppo anche `'unsafe-eval'`); `style-src 'self' 'unsafe-inline'` (gli attributi `style`; nessuno script); `img-src 'self' data: blob: <host di Supabase> https://*.googleusercontent.com`; `connect-src 'self' <host di Supabase>` (il caricamento firmato degli allegati); `frame-src https://www.youtube-nocookie.com`; `frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'`. *Minaccia chiusa:* codice di terzi eseguito nell'origine dell'app, dove legge i cookie di sessione e il questionario.

*Minacce chiuse:* il ciclo `/login` ↔ `/` per una sessione senza profilo; un rimando a `/login` o a `/percorso` su un database lento (il proxy non legge il database, le pagine con `errore` mostrano l'errore); un cliente che apre una pagina, una route o una server action del team (il proxy lo rimanda, la server action trova `getProfilo()` null e rifiuta, la RLS gli dà zero righe); un collaboratore che apre `/percorso` (`requireCliente` lo rimanda alla sua pagina); il consenso di Claude (`/oauth/consent`) aperto da un cliente (il proxy lo rimanda a `/percorso` e `puo_usare_mcp` è falso).

### `/join` e registrazione

Pagine fuori da ogni gruppo con layout di sessione, in `app/join/`, nessuna risorsa esterna, nessuna query del browser.

1. `app/join/[segmento]/page.tsx` (GET, dinamica): `separaJoin` (A), sha256 del token, `onboarding_join_leggi` col `service_role`. Una pagina per stato, solo il nome di battesimo, mai l'email, mai dati del percorso:
   - `attivo`: «Ciao Mario.» «Da qui parte il tuo Percorso Alpha.» e **«Continua»** (un form con una server action: un'anteprima di Telegram, che fa solo GET, non consuma niente);
   - `in_attesa`: «Il tuo accesso si attiva appena il pagamento è confermato. Ti avvisiamo noi.»;
   - `usato`: «Hai già il tuo accesso.» con «Entra» (`/entra`);
   - `scaduto`: «Questo link è scaduto. Chiedi un nuovo link al tuo coach.»;
   - `revocato` e `non_valido` (anche uno slug che non corrisponde): «Questo link non è più valido. Chiedi un nuovo link al tuo coach.».
   `HEAD` rifiutato con 405.
2. «Continua» (`app/join/actions.ts`, `apriInvito(segmento)`): genera 32 byte casuali, chiama `onboarding_join_apri` con il loro sha256, scrive il cookie `alpha-registrazione` (httpOnly, `secure` su https, `sameSite: 'lax'`, `path: '/join'`, 30 minuti) e manda a `/join/registrati`. *Minaccia chiusa:* il token nell'indirizzo delle pagine successive (cronologia, intestazione Referer, schermate condivise).
3. `app/join/registrati/page.tsx`: con il cookie, `onboarding_join_stato`. Senza, o scaduto: «È passato troppo tempo: riapri il link che ti abbiamo mandato.». Con una sessione del team viva nel browser: «Sei già dentro come membro del team: apri il link in una finestra in incognito.» (la registrazione sostituirebbe la sessione). Poi «Con quale email vuoi entrare?» con l'email della scheda già scritta e modificabile, «Ti mandiamo un codice di 8 cifre.», **«Inviami il codice»**.
4. `inviaCodiceRegistrazione(email)`: Zod sull'email, codice di 8 cifre con `crypto.randomInt`, `onboarding_join_codice` col suo hash; con `invia`, email con Resend (`lib/email/cliente.ts`, `Idempotency-Key` = hash del codice, 8 secondi): oggetto «Il tuo codice per Percorso Alpha», corpo «Ciao Mario, il tuo codice è 1234 5678. Vale 15 minuti. Se non hai chiesto tu di entrare nel Percorso Alpha, ignora questa email.», il logo, nessun link. Qui l'attesa di Resend non rivela niente (l'invito è uno, la scheda è di chi ha il link). Risposte: «Ti abbiamo scritto a mario@…: inserisci il codice.»; `email_non_ammessa`: «Questa email non si può usare per il tuo accesso. Scrivine un'altra o chiedi al tuo coach.» (la stessa per ogni motivo); `troppe_richieste`: «Troppi tentativi. Aspetta qualche minuto e riprova.»; email non partita: «Non riusciamo a mandarti il codice adesso. Riprova tra poco o scrivi al tuo coach.» (nel log solo l'esito di Resend). «Invia di nuovo» dopo 60 secondi.
5. `verificaCodiceRegistrazione(codice)`: `onboarding_join_verifica`; `errato`: «Il codice non è corretto o è scaduto. Controlla le cifre o chiedine uno nuovo.»; `bloccato`: «Hai sbagliato il codice troppe volte: chiedine uno nuovo.». Con `ok`, col `service_role`: `auth.admin.createUser({ id: utente_id, email, email_confirm: true, app_metadata: { tipo: 'cliente' } })` (id ed email dal database, nessuna password); il trigger fa il resto nella stessa transazione. Poi `auth.admin.generateLink({ type: 'magiclink', email })`: l'id dell'utente che restituisce deve essere `utente_id`, altrimenti niente sessione e nel log solo il codice. Poi, col client dei cookie (`ignoraSessione`, `sessioneVecchia` e `togliSessioneVecchia` come oggi), `verifyOtp({ email, token: email_otp, type: 'email' })`. Cookie `alpha-registrazione` tolto, redirect a `/percorso`.
   - `createUser` rifiutato (il trigger, un'email già di un utente, una seconda scheda che ha appena creato lo stesso id): se l'invito risulta `usato`, «Il tuo accesso è pronto: entra con la tua email.» con «Entra»; altrimenti «Non riusciamo a completare la registrazione. Riapri il link o scrivi al tuo coach.» e nel log solo il codice dell'errore.
   - Utente creato ma sessione non aperta: «Il tuo accesso è pronto: entra con la tua email.» con «Entra».
6. Rischio accettato, perché è nella specifica: chi ha il link prima del cliente si registra con la propria email. Il link va mandato solo nel gruppo privato; la notifica «email diversa» lo fa vedere all'admin. Il percorso `/join/<token>` resta nei log di Vercel: il token vale una volta sola.

### `/entra`

`app/entra/page.tsx` (pubblica, solo italiano): «Entra nel tuo percorso», «Scrivi l'email con cui ti sei registrato: ti mandiamo un codice di 8 cifre.», poi il campo del codice, come `AccessoCodice` del team ma senza link nella mail.

- `chiediCodiceCliente(email)` (`app/entra/actions.ts`): risposta sempre «Se l'email è registrata, ti abbiamo scritto un codice di 8 cifre. Vale 60 minuti.» **dopo un tempo fisso di 1,2 secondi dall'inizio**, uguale per ogni esito (un cliente, uno sconosciuto, un collaboratore, un account chiuso). Prima della risposta: `cliente_accesso_per_email` e, solo per un account `attivo` o `sospeso`, `cliente_accesso_conta(email, 'invio')`. Dopo la risposta, in `after()`: `generateLink` magiclink, il confronto dell'id restituito con quello di `cliente_accesso_per_email` (se diverso, nessun invio e nel log solo il codice), l'email con l'`email_otp` («Il tuo codice per entrare nel Percorso Alpha»). `generateLink` non si chiama mai per un'email senza account: su un'email senza utente GoTrue la tratterebbe come un'iscrizione, che il trigger rifiuta comunque (la rete). Si mostra solo `troppe-richieste` per il limite di tutti (non dipende dall'indirizzo) e «Non riusciamo a completare la richiesta in questo momento» (database che non risponde). *Minaccia chiusa:* il tempo di risposta che distingue un cliente registrato da uno sconosciuto (`generateLink` più Resend fino a 8 secondi).
- `verificaCodiceCliente(email, codice)`: prima `cliente_accesso_conta(email, 'verifica')`; se falso, la risposta di un codice sbagliato («Il codice non è corretto o è scaduto.»), dopo lo stesso tempo minimo, **senza chiamare Supabase**, e un errore contato su `tutti`; altrimenti `verifyOtp({ email, token, type: 'email' })` col client dei cookie, poi `verificaDopoLogin`. Codice sbagliato: `cliente_accesso_conta(email, 'errore')`. Un collaboratore che usa qui un codice del team non passa (nessun invio registrato per lui): entra da `/login`.

## Codice

- `lib/percorso/`: `nodi.ts` (i 7 nodi con etichette brevi e lunghe, dal database l'ordine), `testi.ts` (tutti i testi del cliente, compreso il pannello d'attesa), `consensi.ts` (testi e versioni), `video.ts` (unione degli intervalli, campionamento dei secondi, lettura dei messaggi del player, puro), `stima.ts` (solo formattazione: «Mancano circa 9 giorni all'inizio del tuo percorso», «Ci siamo quasi»), `letture.ts` e `operazioni.ts` (`server-only`, il client come parametro), `pulizia.ts`; B1b: `questionario.ts` (le 4 schermate, le domande e le opzioni), `firme.ts` (le firme di JPEG, PNG, WebP e PDF dai primi byte, pura).
- `lib/validation/percorso.ts` (azioni, intervalli), `lib/validation/registrazione.ts` (email, codice di 8 cifre, segmento); B1b: `lib/validation/questionario.ts`, gli allegati in `percorso.ts`.
- `lib/auth/destinazione.ts`, `lib/auth/cliente.ts` (sopra).
- `lib/email/cliente.ts`: le email del cliente (codice di registrazione, codice di accesso; in B2 «Tocca a te»), testo semplice e HTML con il logo, mai un link nelle email del codice.
- `lib/email/mailpit.ts`: con `E2E_EMAIL_MAILPIT` (solo fuori da produzione, con `ENABLE_DEV_LOGIN=true`, solo `http` su 127.0.0.1, localhost o [::1]: le regole di `E2E_GRAPH_FINTO`) `inviaEmail` manda a Mailpit (`POST /api/v1/send`) invece che a Resend. Variabile nuova in `.env.example`.
- Questionario (B1b), campi (chiavi in italiano, tipi e limiti uguali in Zod e in SQL): schermata 1 «Chi sei» (`data_nascita`, `altezza_cm` 120-230, `peso_kg` 35-250, `occupazione`); 2 «Allenamento» (`storia_allenamento`, `giorni_settimana` 1-7 con `giorni_note`, `infortuni`, `attrezzatura` scelta multipla più `attrezzatura_altro` e allegati, `massimali` con `piegamenti`, `trazioni`, `dip` numero 0-200 o «non lo so», `esercizi_difficolta` con l'allegato della vecchia scheda, `importanza_tecnica` 1-5, `minuti_sessione`); 3 «Stile di vita» (`ore_sonno` 3-12, `livello_attivita`, `routine_giornaliera`, `seguito_alimentazione` sì/no con l'allegato del piano, `conoscenza_alimentazione`, `cattive_abitudini` scelta multipla più testo); 4 «Obiettivi» (`obiettivo_principale`, `perche_noi`, `obiettivi_3_6_mesi`, `successo`, `pronto` sì/no, `note`). Nome, email e telefono restano sulla scheda del cliente.
- Server action con la sessione del cliente (`app/(cliente)/percorso/actions.ts`): `avanzaPasso`, `daiConsenso`; B1b `salvaQuestionario`, `inviaQuestionario`, `togliAllegato`. Rivalidano solo `/percorso`.
- Route (la regola di «Fluidità»: letture e scritture frequenti fuori dalle server action):
  - `POST /api/percorso/video` (B1a): stessa origine (`lib/auth/stessa-origine.ts`), sessione del cliente, `video_progresso`; corpo `{ blocco }` (B2: o `{ consegna }`); `fetch` con `keepalive` ogni 10-15 secondi, alla pausa, alla fine e quando la pagina si nasconde.
  - `POST /api/percorso/allegati` e `POST /api/percorso/allegati/[id]/conferma` (B1b): la prima chiama `allegato_prepara` con la sessione e crea `createSignedUploadUrl` col `service_role` su quel solo percorso; il browser carica (foto ridotte nel browser a 2.000 px JPEG senza metadati del luogo, come gli allegati di Alfire); la seconda verifica la sessione (`requireCliente`), legge i primi 16 byte dell'oggetto col `service_role` (indirizzo firmato e `Range: bytes=0-15`), li confronta con le firme (`lib/percorso/firme.ts`) e chiama `allegato_conferma` col `service_role`.
  - `GET /api/onboarding/allegati/[id]` (B1b): con la sessione del team legge la riga sotto RLS (admin; in B2 il coach incaricato da `onboarding_allegato_apri`); se c'è, indirizzo firmato di 60 secondi col `service_role` e redirect 302, `no-store`; per un PDF l'indirizzo firmato ha `download: nome_file` (`Content-Disposition: attachment`). Mai un indirizzo pubblico.
- Admin, B1a: `app/(app)/onboarding/[clientId]/` aggiunge i riquadri «Accesso del cliente» (registrato il, stato dell'account), «Consensi» (tipo, versione, data), «Video visti» (titolo e percentuale); «Cliente di prova» nel riquadro Link; «Copia link» con l'area aperta **o** con l'invito di prova. `app/(app)/settings/onboarding/contenuti/` (`page`, `loading`, `error`): i blocchi per step e per pagina, con il modulo (tipo, titolo, testo, video, link, obbligatorio, pubblicato, ordine) e l'anteprima disegnata dagli stessi componenti dell'area cliente; un blocco con «[Da scrivere» ha l'avviso. Testi del team in `lib/i18n/testi/onboarding.ts` (italiano e inglese). B1b: il riquadro «Questionario» (le 4 schermate in sola lettura, gli allegati), «Registra la revoca» nei Consensi (motivo e seconda conferma), «Consenso del genitore» per un cliente registrato con età da verificare.
- B2: `app/(app)/onboarding/` per gli incaricati (stessa pagina: chi non è admin vede la lista da `onboarding_incaricati_elenco()` nei gruppi «Tocca a te», «Tocca al cliente», «In pausa», «Completati», e la scheda da `onboarding_scheda_incaricato`; mai inviti, pagamento, registro o pulsanti dell'admin); code in cima alla lista (admin e incaricati, ognuno le sue): «Call da confermare», «Call da segnare», «Richieste di accesso alla community», «Presentazioni da controllare», «Test da confermare», «Programma da consegnare», «Preparazione incompleta». `lib/nav.ts`: la voce «Onboarding» anche a chi ha almeno un incarico su un cliente registrato (una count `head` sotto RLS su `onboarding_incarichi` nel layout, che A gli fa leggere solo da quando il cliente si è registrato), mai nella barra in basso. Avviso al cliente: la server action, dopo la funzione, legge l'email del cliente col `service_role` (mai mandata al browser del coach) e manda «Tocca a te» con `Idempotency-Key`; se non parte o `avvisa_cliente_email` è spento, il toast offre «Copia il messaggio per Telegram».
- `package.json` (B2): `motion` **14.7.1** (pubblicata il 27/10/2026), versione esatta, importata solo da `components/percorso/` con `motion/react` e caricata dopo il primo disegno; nella tabella della sezione 4 di `CLAUDE.md`.
- `lib/changelog/versioni.ts`: 1.78.0, 1.79.0 e 1.80.0 con voci `admin` (B2 anche `progetti` per il lavoro del coach sui task), mai pagamento o gate; `package.json`; `CLAUDE.md` (sotto).

## Interfaccia del cliente

Gruppo `app/(cliente)/`: `layout.tsx` (`requireCliente`, `lang="it"`, nessuna shell, Alfire, campanella, timer, tutorial, intro o bandierina; in alto il logo, il tema e «Esci»), `percorso/page.tsx`, `percorso/consensi/page.tsx` e, da B1b, `percorso/questionario/page.tsx` (`?schermata=1..4`), ognuno con `loading.tsx` ed `error.tsx`. Componenti in `components/percorso/`. Mobile first a 390 px, tocco 44 px, temi chiaro e scuro con i token di sempre, un solo oro (il giorno stimato). Una sola azione primaria per schermata, con il verbo giusto («Ho guardato il video», «Accetto e vado avanti», «Invia il questionario»).

- **Timeline** (`timeline.tsx`): in cima «Mancano circa 9 giorni all'inizio del tuo percorso · Ti restano 6 cose da fare» (stima dal SQL; passata: «Ci siamo quasi»). Sette nodi: Benvenuto, Questionario, Call prenotata, Community, Call di onboarding, Settimana test, Inizio percorso (razzo, Lucide `Rocket`). Ogni nodo è un `button` con il nome accessibile «Questionario, completato» / «attuale» / «si sblocca dopo Benvenuto»; frecce sinistra e destra tra i nodi; futuri con `aria-disabled` (mai `disabled`, così il tocco dice «Si sblocca dopo: Benvenuto» in un tooltip con `aria-live`). Stati con icona e parole, mai solo colore: completato (spunta), attuale (anello), futuro (lucchetto, opacità ridotta). La linea piena fino al nodo attuale, tratteggiata dopo. Sul telefono scorre di lato dentro la sua cornice con `scroll-snap` e centra il nodo attuale; la pagina non scorre mai di lato. In B1a e B1b nessuna animazione; in B2 quelle della specifica 4.4 con `motion` (linea che si disegna, nodi in sequenza, respiro del nodo attuale, pop del nodo completato, lucchetto che si apre, razzo che sale al lancio), tutte ferme con «Riduci movimento» e in pausa fuori vista.
- **Pannello** (`pannello-passo.tsx`): sotto la timeline, solo il passo da fare (o il riepilogo di un nodo completato toccato: «Fatto il 14/11/2026»). Blocchi del CMS (Markdown con `react-markdown`, mai HTML), video con il player, spunte delle regole, il pulsante del passo. Un errore della funzione si dice in parole sopra il pulsante; il pulsante non resta mai fermo senza dire perché. Con `in_attesa` (B1a dopo le regole, B1b dopo il questionario): «Il prossimo passo te lo apre il tuo team a breve.» e i link ai nodi completati, nessun pulsante.
- **Player** (`player-youtube.tsx`): un riquadro locale con «Guarda il video» (nessuna richiesta a Google prima del tocco); al tocco incorpora `https://www.youtube-nocookie.com/embed/<id>?enablejsapi=1&rel=0&origin=<APP_URL>` e **nessuno script di YouTube** entra nella pagina: la pagina parla con l'iframe con `postMessage` scritto da noi (`lib/percorso/video.ts`), con il protocollo che usa `iframe_api` (manda `{"event":"listening"}`, ascolta `infoDelivery` con `currentTime` e `playerState` e `onStateChange`; accetta solo messaggi con `origin` `https://www.youtube-nocookie.com` e `source` uguale alla finestra dell'iframe). Ogni secondo, mentre il video va, segna il secondo se il tempo è avanzato di al massimo 2 secondi dall'ultimo campione (un salto in avanti non conta); sotto, «Visto al 64%» e, al 90%, «Video visto». Se il video non si carica, o se per 15 secondi dopo «Guarda il video» non arriva nessun messaggio: «Il video non si apre. Riprova o aprilo su YouTube.» con il link. *Rischio residuo:* il protocollo non è documentato da Google; se cambia, il video smette di contare (l'e2e con l'iframe finto non se ne accorge, la prova del passo 5 sì), e il cliente resta allo step 1 finché non si corregge (B2: «Sblocca step»).
- **Step 2**: le regole come caselle grandi, poi il consenso sulla salute con il testo intero (non un link), la versione e la casella; «Accetto e vado avanti» attivo solo con tutto spuntato.
- **Questionario** (B1b): 4 schermate con l'indicatore «2 di 4», «Avanti» e «Indietro»; salvataggio automatico 1 secondo dopo l'ultima modifica e al cambio di schermata («Salvato alle 18:42»); `cambiato` da un altro dispositivo: «Il questionario è cambiato da un altro dispositivo: ricarico le tue risposte.» e rilettura; con `serve_genitore` la schermata 1 dice la frase del consenso del genitore e «Avanti» non c'è; errori sotto ogni campo con icona e parole; allegati con «Aggiungi una foto o un PDF», l'elenco dei file e la X; «Invia il questionario» nell'ultima schermata, con «Mancano delle risposte» che porta alla prima.
- **Attesa del team** (B2): «Tocca a noi» con il nome di battesimo e la foto di chi lavora, cosa sta facendo e «Nel frattempo puoi rileggere…» con i link ai nodi completati. Nessun pulsante.
- **Dopo il lancio** (B2): «Il tuo percorso è iniziato», il prossimo checkpoint con giorno e ora, i link rapidi dal CMS (Coach Plus, Yazio, community, gruppo privato).
- **Sospeso**: una pagina sola, «Il tuo accesso è sospeso. Scrivi nel tuo gruppo Telegram.» ed «Esci».
- **I tuoi consensi**: tipo, versione, data; «Per revocarlo scrivi al tuo coach o a <email del titolare>: cancelliamo le risposte del questionario e i file.».
- Stati: scheletro con la forma della timeline e del pannello, errore con «Riprova», toast brevi («Salvato», «Passo completato»). Il vuoto non esiste per il cliente: c'è sempre un passo o l'attesa.

## Sezione 15 di `CLAUDE.md` riscritta (B1b)

Il punto **GDPR** diventa: dati dei clienti ridotti al minimo; regione EU. **Dati sulla salute** (dal 1.79.0, decisione 1 del piano): solo le risposte del questionario dell'onboarding (`onboarding_questionari`) e i file caricati con lui (bucket privato `onboarding-allegati`), con il consenso esplicito del cliente in una versione registrata (`clienti_consensi`); li legge l'admin e, dalla 1.80.0, il coach incaricato da una funzione dedicata; mai nel backup via email, in un'email, una notifica, il registro, i log, Alfire, Claude collegato, Groq o Anthropic; conservati 12 mesi dopo la fine dell'ultimo percorso del cliente e cancellati con lui o alla revoca del consenso; mai di un minore di 14 anni; un backup di questi dati c'è solo con Supabase Pro. Le foto del fisico restano su Coach Plus. Il resto (le call) resta com'è. Più: la riga del backup che dice le tabelle escluse (già da B1a), `onboarding-pulizia` tra i job di `pg_cron`, la pulizia dei file e degli utenti orfani nel cron della sera.

## `/privacy` (B1b)

Sezione nuova «Clienti del percorso»: l'account (email, codice via email, Resend come fornitore), il questionario e cosa contiene (anche dati sulla salute, con il consenso, base giuridica art. 9.2.a GDPR), i file, i video guardati (secondi visti; YouTube riceve l'indirizzo IP quando il video parte, da `youtube-nocookie.com`, e nessuno script di YouTube gira nelle nostre pagine), i consensi e come revocarli, chi legge (admin e coach incaricato), la conservazione (12 mesi dopo la fine del percorso), dove stanno (Supabase, UE), che niente va a un'intelligenza artificiale; i minori (consenso del genitore registrato dall'admin, sotto i 14 anni nessun percorso e nessun dato conservato). `ULTIMO_AGGIORNAMENTO` cambia. Da far vedere a chi segue la parte legale prima dell'apertura (piano 8.7). In B1a l'area la percorrono solo clienti di prova con un'email del team: nessun dato di terzi.

## Test

**B1a.**
- pgTAP `111_clienti_account.sql`: il ramo del cliente del trigger (passa solo con registrazione verificata da meno di 10 minuti, invito attivo, area aperta o invito di prova, email uguale a quella del codice; ogni condizione mancante 42501; un id riservato con una registrazione non valida non scende mai al ramo del team; nessuna riga in `profiles`); il ramo del team identico a prima; un utente creato con un'email senza riserva e senza invito del team (quello che farebbe `generateLink` su un'email nuova) rifiutato; `clienti_account`, invito `usato` con il token cancellato, percorso `in_corso`, primi step `disponibile`, email della scheda aggiornata con l'evento, notifiche; `invites_non_cliente` (insert, cambio di email, invito revocato che torna valido); cambio di email di un cliente verso l'email di un invito del team e di un collaboratore verso quella di un cliente, rifiutati; password scritta a un cliente rifiutata; ogni riga della tabella del ciclo di vita dell'account; `onboarding_join_*` (stati, scadenza, sei email non ammesse di fila danno `troppe_richieste`, il quarto indirizzo rifiutato anche se ammesso, errori, email non ammesse) e `cliente_accesso_*` solo per `service_role` (`verifica` falsa per un'email senza invio, 100 errori in tutto fermano ogni verifica); `onboarding_segna_prova` solo admin, e la scadenza scritta su un invito già attivo; un PATCH diretto di `prova` rifiutato.
- pgTAP `112_cliente_isolamento.sql`: come cliente attivo, come cliente sospeso e come utente senza profilo né account, per ogni tabella e view di `public` (contate leggendo il catalogo, come `101_business_coach.sql`): zero righe, tranne la propria riga di `clienti_account`; ogni scrittura rifiutata; ogni funzione `security definer` eseguibile da `authenticated` dell'elenco di `00` chiamata con argomenti nulli o finti: errore, null o vuoto, mai una riga di un altro; Storage: nessuna lettura o scrittura in `avatari`; nessuna tabella dell'onboarding o dei clienti nella pubblicazione `supabase_realtime`; un token OAuth di un cliente (se esistesse): `cliente_corrente()` null.
- pgTAP `113_percorso_cliente.sql`: `percorso_cliente` (i blocchi solo degli step non bloccati, con `id` e senza i campi di gestione, mai di un altro cliente, il team senza email, la stima con le regole della specifica e mai negativa, `in_attesa` dopo le regole); `onboarding_sblocca` (non oltre `onboarding_ultimo_passo_servito`; mai uno step con `sblocco = 'team'`: con `call` `fatto` e `obiettivo_smart` non completato, `obiettivo` resta `bloccato`); `percorso_avanza` (elenco chiuso: una coppia sconosciuta rifiutata, ordine, video al 90%, regole tutte, versione del consenso); video (unione, percentuale, intervalli fuori durata, `p_consegna` rifiutata in B1a); CMS (solo l'admin scrive); backup senza le quattro tabelle; `anteprima_eliminazione`; `onboarding_pulizia` (account `chiuso` dopo 12 mesi).
- `onboarding_elimina` in `113_percorso_cliente.sql`: solo admin (42501 per gli altri ruoli e per il token di Claude dell'admin), 22023 con un account del cliente, cosa toglie e cosa lascia (cliente, vendita, rate, progetto, «Percorso cliente», Telegram), la vendita di nuovo tra quelle senza onboarding, un nuovo avvio che funziona, `anteprima_eliminazione('onboarding', …)`. e2e: in `percorso-registrazione.spec.ts` l'admin elimina un onboarding mai usato e lo riavvia dalla vendita.
- Aggiornati: `00_schema.sql` (elenco delle definer, tabelle nuove con `_mai_da_oauth`), `66_ruolo_marketing.sql`, `75_mcp_oauth.sql` (le funzioni nuove con 42501 per il token di Claude), `91_notifiche.sql`, `101_business_coach.sql`, `109`, `110` (prova, scadenza, token cancellato all'uso, notifica del pagamento con account sospeso, vendita spostata con invito usato).
- Vitest: `destinazioneUtente` (ogni esito, `errore` senza uscita), `tests/proxy-accesso.test.ts` (cliente fuori da `/percorso`, `/login` ed `/entra` con sessione di un cliente e del team, `/percorso` e `/api/percorso` senza sessione, `/api` del team con una sessione di cliente, pubblici nuovi, CSP con il nonce sulle tre aree), `separaJoin` e il segmento, schemi di registrazione, i messaggi del player (origine e finestra sbagliate ignorate, salti in avanti non contati), unione degli intervalli, testi del cliente (accenti, nessun trattino lungo, nessuna emoji, nessun link nelle email del codice), sha256 del consenso uguale al seme, `lib/email/mailpit.ts` ignorata in produzione e fuori dal loopback, `chiediCodiceCliente` e `richiediCodice` che rispondono nello stesso tempo per cliente, team e sconosciuto senza attendere l'invio (Resend finto lento), `verificaCodiceCliente` che non chiama `verifyOtp` per un'email senza invio, nodi e stima in parole, `tests/changelog.test.ts`, `tests/i18n-chiavi.test.ts`.
- e2e (con `E2E_EMAIL_MAILPIT`, codici letti da Mailpit come `e2e/accesso-codice.spec.ts`): `percorso-registrazione.spec.ts` (l'admin crea un cliente inventato, lo segna di prova, conferma il pagamento e copia il link; in un altro contesto `/join` → «Continua» → email → codice → `/percorso`; il link riaperto dice «Hai già il tuo accesso»; rientro da un terzo contesto con `/entra`; un invito non di prova con l'area chiusa non si apre; il cliente che apre `/`, `/onboarding`, `/settings`, `/api/alfire` e `/oauth/consent` torna a `/percorso` o riceve 403; `/login` con l'email del cliente manda la mail del cliente; nessun ciclo di redirect; `updateUser({ password })` del cliente rifiutato; nessuno script con un'origine diversa da quella dell'app su `/percorso`, `/join`, `/entra`), `percorso-passi.spec.ts` (step 1 con l'iframe di YouTube finto: `page.route` serve sull'indirizzo di `youtube-nocookie.com` una pagina che parla lo stesso protocollo `postMessage`; step 2; poi il pannello d'attesa e la stima; 390 px senza scroll di lato; riduzione movimento). `e2e/utenti.ts`: il cliente di prova del seed per `npm run shots` (`percorso`).
- Seed `supabase/seeds/61_percorso.sql` (senza sessione, come `60_onboarding.sql`, idempotente sull'`utente_id` fisso): (1) cliente e vendita `nuovo` inventati, incarichi; (2) l'invito con `prova = true`, attivato senza sessione (il trigger di coerenza lascia passare chi non ha sessione); (3) la riga di `onboarding_registrazioni` con `utente_id` fisso, l'email, una chiave finta e `verificato_il = now()`; (4) l'inserimento in `auth.users` con quell'id, `raw_app_meta_data` con `tipo = 'cliente'` e una password (solo per il login di sviluppo: è un inserimento, il trigger delle password guarda gli update), che passa dal ramo del cliente; (5) gli step `benvenuto` e `regole` `fatto` e il consenso scritti direttamente; (6) un secondo cliente con gli stessi passi e poi l'invito `revocato`, quindi l'account `sospeso`. Blocchi del CMS già nella migration.

**B1b.**
- pgTAP `114_questionario.sql`: consenso, versione, `cambiato`, invio completo, `onboarding_risposte_valide` con gli esempi condivisi; età: un salvataggio con una data sotto i 14 anni non lascia nessuna riga sanitaria né allegati vivi e manda una notifica, tra 14 e 17 anni senza consenso del genitore le chiavi delle schermate 2-4, un allegato e l'invio rifiutati, con il consenso registrato su un invito `usato` accettati; allegati (3 per campo, 20 preparazioni e 100 MB al giorno contando anche le `da_cancellare`, conferma solo `service_role`, conferma senza oggetto o con firma diversa rifiutata, togli dopo l'invio rifiutato); questionario e allegati letti solo dall'admin; revoca del consenso; `onboarding_pulizia` (dati sulla salute cancellati con l'account `chiuso`); `onboarding_ultimo_passo_servito` e il recupero dei percorsi fermi.
- Aggiornati `00`, `75`, `112` (Storage di `onboarding-allegati`).
- Vitest: schemi del questionario (gli stessi esempi del pgTAP), firme dei file (`lib/percorso/firme.ts`: JPEG, PNG, WebP, PDF, e un HTML rinominato rifiutato).
- e2e `percorso-questionario.spec.ts`: questionario con salvataggio, ripresa da un altro contesto, allegato caricato nello Storage locale e confermato, invio; una data di nascita sotto i 14 anni; l'admin legge risposte e file; 390 px. Seed: il primo cliente con il questionario a metà (risposte inventate, nessuna salute vera).

**B2.**
- pgTAP `115_percorso_team.sql`: step 4 manuale e conferma, esiti della call, community e code, task → step e step → task (obiettivo che si apre solo col task e la call svolta, in tutti e due gli ordini), scadenze dei task e il recupero per gli account già registrati, test e programma, consegne e video obbligatori, completamento, sblocca e riavvia, apertura dell'area con i controlli e un PATCH diretto di `aperto_ai_clienti` rifiutato; `percorso_avanza` rifiuta (`programma`, `completa`) e (`test`, `spunta`) in `in_attesa_team`, (`prenotazione`, `prenotato`) in `inviato`, un'azione inesistente; `video_progresso` su una consegna con `programma` non disponibile rifiutato; letture degli incaricati (il coach legge zero righe da `v_onboarding`, `clients`, `onboarding_inviti`, `onboarding_questionari`, `sales`, `payments`, e riceve dalle funzioni solo i suoi clienti registrati; revisore e responsabile mai il questionario; nessuno l'invito o il pagamento; un cliente sospeso è «In pausa» senza motivo; «Preparazione incompleta»); funzioni del team rifiutate a setter, closer, coach non incaricato, marketing, business coach e token di Claude.
- Aggiornati `00`, `75`, `109`, `112`.
- Vitest: stati della lista per gli incaricati, code, nav con la voce per chi ha un incarico, email «Tocca a te», animazioni ferme con riduzione movimento.
- e2e: `percorso-team.spec.ts` (il cliente di prova prenota, il coach conferma con il Meet, segna la call svolta, spunta l'obiettivo, il cliente conferma, spunta i test, il coach conferma e consegna il programma, il cliente guarda il video e vede «Il tuo percorso è iniziato»; il coach non vede mai il pagamento; il revisore vede «Test da rivedere» e non il questionario; un cliente sospeso è «In pausa»), `percorso-apertura.spec.ts` (l'admin non apre l'area con un segnaposto, poi apre e un invito normale funziona).

Tutto verde a ogni rilascio: `npm run typecheck`, `npm run lint`, `npm run test`, `npx supabase test db`.

## `CLAUDE.md` da aggiornare

B1a: sezioni 3 (l'area cliente), 5 (`E2E_EMAIL_MAILPIT`), 6 (il cliente nella tabella dei permessi e un paragrafo «Clienti del percorso»), 7 (accesso dei clienti: `/join`, `/entra`, `destinazioneUtente`, trigger, nessuna password, CSP), 8 (tabelle nuove), 10 (area cliente e riquadri dell'admin), 13 (seed), 15 (le tabelle escluse dal backup), 17 (niente di nuovo sulle persone: i video visti sono del cliente, mai del team), 19, 20 e 28 (Alfire e Claude non leggono niente del cliente), 23, 32 (eccezione: area cliente solo in italiano), 34. B1b: 8, 10, 15 (riscritta, sopra), 22 (privacy), 34. B2: 4 (`motion`), 6 (letture degli incaricati da funzioni), 8, 10, 11 (animazioni dell'area cliente come momento di brand), 18 (task e step, scadenze), 34.

## Decisioni prese in questo contratto, da confermare con Dany

1. Il cliente legge e scrive solo da funzioni dedicate; nessuna policy di lettura per lui oltre al suo account (più stretto del piano 5.1, che diceva «il cliente» tra chi legge). Lo stesso per gli incaricati in B2: leggono il cliente da due funzioni, nessuna policy nuova.
2. Codice di registrazione: 8 cifre, 15 minuti, 5 richieste l'ora (anche quelle con un'email non ammessa), al massimo 3 indirizzi diversi per invito, 5 errori poi un codice nuovo; la pagina di registrazione vale 30 minuti. Rientro: codice di Supabase da 60 minuti, 5 invii e 5 errori l'ora per indirizzo, 200 invii e 100 errori l'ora in tutto; un codice si verifica solo per un indirizzo a cui è partito nell'ultima ora.
3. «Cliente di prova» come interruttore sull'invito, al posto di un'area aperta solo all'admin.
4. L'area si apre con un interruttore dell'admin in B2, con i controlli (nessun segnaposto, link della community e della prenotazione), invece che con una migration. Si richiude senza spegnere gli account.
5. Le opzioni del questionario (giorni, attrezzatura, livello di attività, conoscenza dell'alimentazione, cattive abitudini, minuti) sono scritte nel codice dal Google Form come lo descrive la specifica: da controllare con Ivan.
6. Si chiede la data di nascita (come la specifica): sotto i 14 anni non si salva niente e gli admin lo sanno; tra 14 e 17 anni, con un invito non segnato minorenne, il questionario si ferma alla schermata 1 finché l'admin non registra il consenso del genitore.
7. La revoca del consenso sulla salute la registra l'admin su richiesta del cliente, e cancella risposte e file; nessun pulsante nell'area cliente.
8. Avviso al cliente quando tocca a lui (decisione 14, senza una scelta consigliata): email automatica con un interruttore in Impostazioni, acceso di base, e «Copia il messaggio per Telegram» quando non parte.
9. Le voci della settimana test sono blocchi del CMS: 2 sessioni o 3 giorni (decisione 12) si decide scrivendole, senza codice. Il lancio è alla consegna del programma; il modello alimentare arriva dopo, come consegna.
10. Le consegne del coach sono link (video YouTube, PDF condiviso), non file caricati.
11. In B2 il razzo sale senza scia né particelle; quelle restano a v2.
12. La conservazione (decisione 8: 12 mesi, 30 giorni, 24 mesi) parte già con B1a per account e video, con B1b per i dati sulla salute.
13. Fino a B1b le notifiche dei clienti vanno solo agli admin; dalla B2 anche agli incaricati, ognuno le sue.
14. La vista degli incaricati è la stessa pagina `/onboarding`, con la voce del menu per chi ha almeno un incarico su un cliente registrato.
15. Un cliente può cambiare la propria email da Supabase Auth (con la conferma su tutte e due le caselle), ma mai verso l'email di un collaboratore, di un invito del team o di un altro cliente (trigger); la scheda si riallinea solo alla registrazione.
16. La pagina di prenotazione è la stessa dei checkpoint, un indirizzo in Impostazioni (decisione 13).
17. B diviso in tre rilasci (1.78.0 accesso, 1.79.0 questionario, 1.80.0 il resto) invece di due.
18. Un account sospeso dopo un rimborso **non** torna attivo da solo con un nuovo pagamento: gli admin ricevono una notifica e decidono con «Riattiva». Il piano 4.3 diceva il contrario; così vale la regola di A sui link revocati.
19. Un account diventa `chiuso` 12 mesi dopo la fine dell'ultimo percorso, insieme alla cancellazione dei dati sulla salute; da chiuso non rientra più (un nuovo onboarding fa un nuovo account).
20. Nessun cliente ha una password: un trigger la rifiuta, oltre a `secure_password_change`.
21. Il video si conta con il protocollo `postMessage` dell'iframe di YouTube, senza caricare `iframe_api`: non è documentato da Google; se smette di funzionare si torna a parlarne (un'alternativa è un player su un'altra origine).
22. Le risposte a `/login` e `/entra` arrivano dopo un tempo fisso (2 e 1,2 secondi) e l'invio del codice del cliente parte dopo la risposta: il cliente non sa subito se Resend ha accettato.
23. «Elimina onboarding» solo prima che il cliente si registri; dopo, solo «Revoca». Toglie link, step, incarichi, registro, task e lista «Onboarding»; lascia cliente, vendita, rate, progetto e Telegram.
24. Nessuna tabella dei moduli formativi in B: B tiene un solo modello di contenuto e v3 aggiunge moduli, fasi e avanzamento sopra di lui (sezione «Pronto per i moduli formativi»).

## Passi per Dany

**Prima di B1a (in produzione).**
1. Supabase › Authentication › Sign In / Providers › Email: dimmi se «Confirm email» è acceso (piano, sezione 2) e lascia acceso il provider Email (serve ai codici del team e dei clienti); Secure email change acceso, **Secure password change acceso**, manual linking spento.
2. Resend: dominio di `EMAIL_MITTENTE` verificato. Senza, nessun cliente riceve il codice.
3. Applica in ordine `20261109090000_clienti_account.sql`, `20261109090100_percorso_base.sql`, `20261109090200_percorso_funzioni.sql`, poi il deploy della 1.78.0. Controllo: `select jobname from cron.job` mostra `onboarding-pulizia`.
4. Impostazioni › Onboarding › Contenuti: sostituisci ogni «[Da scrivere: …]» di benvenuto e regole e l'id del video di benvenuto (YouTube, «Non in elenco»).
5. Prova con un cliente inventato e un'email tua diversa da quella del team: «Nuovo cliente», «Cliente di prova», «Conferma pagamento», «Copia link». Da un telefono: apri il link, registrati, guarda il video fino in fondo (la percentuale deve salire), accetta regole e consenso, poi l'attesa. Esci e rientra da `/entra`. Prova anche `/login` con quella email: deve arrivare la mail del cliente.

**Prima di B1b.**
6. Fai vedere il testo del consenso sulla salute e la nuova `/privacy` a chi segue la parte legale.
7. Applica `20261109100000_questionario.sql`, poi il deploy della 1.79.0. Controllo: Storage ha il bucket privato `onboarding-allegati`.
8. Con lo stesso cliente di prova: compila e invia il questionario con una foto dell'attrezzatura; nella scheda leggi risposte e foto. Poi elimina il cliente da Clienti: la domanda dice accesso e questionario.

**Prima di aprire l'area (fine B2).**
9. Supabase Pro (backup dei questionari) e Vercel Pro (uso commerciale): piano, decisione 8.
10. Impostazioni › Onboarding: link della community, indirizzo della pagina di prenotazione, incarichi predefiniti; i contenuti di prenotazione, community, obiettivo, test, programma e dopo il lancio.
11. Applica `20261110090000_percorso_call_consegne.sql` e `20261110090100_percorso_team.sql`, poi il deploy della 1.80.0.
12. Prova tutto il flusso con il cliente di prova, Ivan come coach e Lorenzo come revisore: Ivan vede il cliente in Onboarding, conferma la call, la segna svolta, spunta l'obiettivo, conferma i test, consegna il programma; Lorenzo vede «Test da rivedere».
13. Impostazioni › Onboarding › «Area clienti» › «Apri ai clienti». Da qui «Copia link» c'è per tutti e i 14 giorni partono.

## Rilievi della revisione

Sicurezza:
1. Limite sugli errori solo per indirizzo, `verifyOtp` per email qualsiasi (alta): accolto. Tetto globale di 100 errori, `verifica` solo con un invio nell'ultima ora, rischio residuo scritto, test.
2. Età controllata solo all'invio (alta): accolto. Regole dell'età in `questionario_salva`, allegati e invio; sotto 14 si cancella tutto; 14-17 fermo alla schermata 1 senza consenso del genitore.
3. `iframe_api` nell'origine dell'app (alta): accolto. Solo l'iframe con `postMessage` nostro, CSP a nonce su `/percorso`, `/join`, `/entra`, e2e senza script esterni.
4. `percorso_avanza` su step `in_attesa_team` o `inviato` (media): accolto. Elenco chiuso di coppie con i loro stati di partenza; lo stesso in `video_progresso`.
5. Tempo di risposta che rivela un cliente (media): accolto. Tempo fisso e invio in `after()` su `/entra` e `/login`.
6. `email_non_ammessa` come oracolo (media): accolto. Ogni chiamata conta, ogni indirizzo entra in `email_provate` prima del controllo.
7. Email del team e del cliente che si incrociano (media): accolto. `invites_non_cliente` su ogni update non revocato e trigger sul cambio di email in `auth.users`.
8. Lista del coach senza fonte dati (media): accolto. `onboarding_incaricati_elenco` e `onboarding_scheda_incaricato`, nessuna policy nuova.
9. Allegati: giro prepara-togli e tipo solo dichiarato (media): accolto. Limiti giornalieri su ogni stato, firma dei primi byte letta dalla route, conferma solo `service_role`, PDF scaricati come allegato.
10. Proxy, esito `errore` e stato `chiuso` (bassa): accolto. `GET /entra` come `GET /login`, proxy senza database, `errore` mostra l'errore, `chiuso` scritto dalla pulizia.
11. `generateLink` che crea utenti (bassa): accolto. Solo dopo `cliente_accesso_per_email`, confronto dell'id, trigger come rete, prova tecnica da fare.
12. Password parallela con il provider Email acceso (bassa): accolto, più stretto. `secure_password_change` e un trigger che rifiuta ogni password a un cliente, con e2e.

Fedeltà:
13. Sblocco generico che apre `obiettivo` e `programma` (alta): accolto. Colonna `sblocco` in B1a, `onboarding_sblocca` non tocca gli step `team`, test pgTAP.
14. Fine di B1 indefinita (alta): accolto. `onboarding_ultimo_passo_servito` e il pannello d'attesa; recupero dei percorsi fermi in B1b e B2.
15. Letture degli incaricati non costruibili (alta): accolto, come il rilievo 8.
16. Chiave primaria di `onboarding_video_visti` incompatibile con B2 (media): accolto. `id` come chiave, indici unici parziali, firma di `video_progresso` con `p_consegna` già da B1a.
17. Grant e guardie di `prova` e `aperto_ai_clienti`, scadenza del link di prova (media): accolto. Grant di colonna, segni, trigger di coerenza delle impostazioni, scadenza scritta su un invito già attivo.
18. Ciclo di vita dell'account incompleto (media): accolto. Tabella delle transizioni; il nuovo pagamento non riattiva da solo (decisione 18 da confermare); vendita spostata con invito usato: notifica.
19. Proxy non costruibile come scritto (media): accolto, come il rilievo 10, con `/entra?da=` e 401 per `/api/percorso`.
20. Limite di verifiche di Supabase per IP (media): accolto, come il rilievo 1.
21. «Preparazione incompleta» e «In pausa» mancanti (media): accolto, in B2.
22. Ricetta del seed (media): accolto. Sei passi scritti, idempotente sull'`utente_id` fisso.
23. B1 troppo grande (media): accolto. B1 diviso in B1a (1.78.0, accesso) e B1b (1.79.0, questionario e dati sulla salute); B2 diventa 1.80.0.
24. Dipendenze tra B1 e B2 da indovinare (bassa): accolto. Funzioni ricreate dalla migration 6 elencate, recupero delle scadenze, spunte del test in `onboarding_passi.dati`, blocchi con `id` e senza i campi di gestione.
