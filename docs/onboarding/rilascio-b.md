# Onboarding · Rilascio B (1.78.0 e 1.79.0): disegno tecnico

Contesto: `docs/onboarding/specifica-v7.md` (la richiesta di Dany), `docs/onboarding/piano.md` (il piano approvato il 12/11/2026 con le scelte consigliate), `docs/onboarding/rilascio-a.md` (il rilascio A, in produzione con la 1.77.0). Questo file è il contratto del rilascio B, il primo rilascio ai clienti. Dove dice una cosa diversa dal piano, vale questo file. `CLAUDE.md` resta la fonte di verità per convenzioni, sicurezza e test.

B tocca l'autenticazione: Dany ha detto di procedere il 12/11/2026. Le prove tecniche del piano (sezione 3) sono fatte sullo stack locale il 12/11/2026: `auth.admin.createUser` con un id scelto dal server rispetta l'id; `auth.admin.generateLink({ type: 'magiclink' })` restituisce `email_otp` di 8 cifre senza spedire niente (Mailpit vuoto); `verifyOtp({ email, token, type: 'email' })` con quel codice apre la sessione.

## Divisione in due sottorilasci

B è diviso in due rilasci che si consegnano e si provano da soli. `aperto_ai_clienti` resta spento per tutto B1 e lo accende l'admin solo a B2 finito.

| | **B1 · 1.78.0 · Accesso e primi passi** | **B2 · 1.79.0 · Il percorso fino al lancio** |
|---|---|---|
| Autenticazione | trigger su `auth.users` con il ramo del cliente, `/join`, `/entra`, `destinazioneUtente`, proxy, `requireCliente`, codice via Resend | niente di nuovo |
| Dati | `clienti_account`, registrazioni, limiti, consensi, questionario, allegati, video visti, `contenuti_blocchi`, bucket privato, pulizia | `clienti_call`, `clienti_consegne`, impostazioni nuove, letture degli incaricati |
| Cliente | area `/percorso` con la timeline statica dei 7 nodi e la stima, step 1 (video), 2 (regole e consenso), 3 (questionario con allegati); gli step dopo si vedono bloccati | step 4 manuale, 6, 9, 10, 11, 12, attesa del team, pagina dopo il lancio, animazioni con `motion` |
| Team | admin: questionario, allegati, consensi, video visti nella scheda; CMS minimo; «Cliente di prova» | coach incaricato: vista e azioni; revisore e responsabile: le loro code; avviso al cliente; scadenze dei task; apertura dell'area |
| Chi lo percorre | solo un cliente di prova (sotto) | tutti, quando l'admin apre l'area |

**Perché questa divisione e non quella proposta.** La proposta metteva il player YouTube in B2, ma lo step 1 si completa solo con il video visto al 90%: senza player B1 non si prova da solo. Il player passa quindi in B1. Restano in B2 le animazioni (la timeline di B1 è statica, solo CSS, e già completa per accessibilità e stati), perché il piano chiede «per ultime le animazioni». Il resto della proposta regge: B1 contiene tutto ciò che tocca l'autenticazione e i dati sulla salute (il rischio maggiore, provato da solo), B2 tutto ciò che coinvolge il lavoro del coach.

**Cliente di prova (B1 e B2 prima dell'apertura).** Colonna nuova `onboarding_inviti.prova` (sotto). Solo un invito di prova funziona con l'area chiusa: `/join` lo apre, il trigger su `auth.users` lo accetta, la scheda mostra «Copia link» e i suoi giorni di validità partono. L'admin lo segna dalla scheda di onboarding con «Cliente di prova» (un interruttore, con la riga «Il link funziona anche con l'area clienti chiusa. Usalo solo con un cliente inventato, poi eliminalo da Clienti.»). Ogni altro invito, con l'area chiusa, mostra a `/join` la pagina «Il tuo accesso non è ancora attivo».

## Cosa consegna B1

1. `/join/<slug>-<token>`: la pagina del link personale, una per stato; «Continua» apre la registrazione senza il token nell'indirizzo.
2. Registrazione con email e codice di 8 cifre mandato con Resend, con le nostre parole e nessun link; l'utente nasce solo dopo il codice giusto, con l'id riservato, e il suo account cliente nasce nella stessa transazione.
3. Rientro da `/entra`: email e codice, risposta neutra. Da `/login` un cliente che chiede il codice riceve la mail del cliente, mai quella del team.
4. Un solo punto che decide dove va un utente autenticato (`destinazioneUtente`), usato da proxy, ritorni dal login, `requireProfilo` e `requireCliente`: niente più cicli di redirect per chi ha una sessione senza profilo.
5. Area `/percorso` senza shell: timeline dei 7 nodi con la stima dei giorni e le cose da fare, un solo pannello con il passo da fare, riepilogo dei nodi completati, «Si sblocca dopo» sui futuri. Pagina «Il tuo accesso è sospeso».
6. Step 1 (benvenuto, team con foto e ruoli, video YouTube non in elenco con i secondi visti), step 2 (una spunta per ogni regola, consenso sulla salute versionato), step 3 (questionario in 4 schermate con salvataggio automatico, ripresa da un altro dispositivo, allegati nel bucket privato).
7. CMS minimo (`contenuti_blocchi`) in Impostazioni › Onboarding › Contenuti, con anteprima.
8. Scheda di onboarding dell'admin: accesso del cliente, consensi, questionario, allegati, video visti; «Cliente di prova»; «Registra la revoca del consenso».
9. Notifiche agli admin: registrazione, questionario inviato, email diversa da quella della scheda, età da verificare.
10. Sezione 15 di `CLAUDE.md` riscritta per i dati sulla salute; `/privacy` aggiornata; conservazione e pulizia notturna.

## Cosa consegna B2

1. Step 4 manuale: «Apri il calendario», poi «Ho prenotato» con giorno e ora; il coach (o l'admin) conferma con il link Meet; nasce la riga di `clienti_call`.
2. Step 6: username Telegram, «Entra nella community», «Ho inviato la richiesta», template di presentazione con «Copia», «Mi sono presentato»; code del team «Richieste di accesso» e «Presentazioni da controllare».
3. Step 9-12: call (svolta, non si è presentato, spostata), obiettivo (si apre quando il coach spunta il task), settimana test (voci dal CMS, conferma del coach), programma (consegne del coach, video della scheda da vedere, data del primo checkpoint).
4. Quando il cliente aspetta il team, il pannello lo dice: chi, cosa sta facendo, cosa può rileggere. Nessun pulsante.
5. Avviso al cliente quando tocca di nuovo a lui: email automatica, con «Copia il messaggio per Telegram» se non parte.
6. Pagina dopo il lancio: «Il tuo percorso è iniziato», link rapidi, prossimo checkpoint.
7. Vista dell'onboarding per gli incaricati (coach, revisore, responsabile) senza mai il pagamento; azioni «Sblocca step» e «Riavvia onboarding» per admin e coach incaricato.
8. Scadenze dei task di onboarding scritte agli eventi; nessun allarme.
9. Animazioni con `motion` solo nell'area cliente.
10. Interruttore «Area clienti» in Impostazioni › Onboarding, con i controlli prima di aprire.

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
7. **Vendita rimborsata o annullata: account sospeso**, una pagina sola, non «in sola lettura» (piano 4.3).
8. **Area cliente solo in italiano**, eccezione scritta alla sezione 32 (decisione 16).
9. **Il task «Leggi il questionario prima della call» non si chiude aprendo la scheda** (specifica 2.2): lo spunta il coach. Nessun task si chiude perché qualcuno ha aperto una pagina (decisione 4).
10. **Board del team come lista** (piano 4.9): la board a colonne è v2.
11. **Data di inizio stimata solo con le regole della specifica e durate dell'admin**, mai negativa; con la call non ancora prenotata vale «oggi + call + test + programma» (B1 è sempre in questo caso).

## Regole che valgono sempre

Quelle di `rilascio-a.md` (nomi, RLS, `_mai_da_oauth`, view `security_invoker`, `search_path ''`, sezioni 6 e 17, nessun trigger blocca un incasso, testi senza trattino lungo e senza emoji, nessun dato vero, tipi generati grezzi), più:

- **Il cliente legge e scrive solo da funzioni dedicate.** Nessuna policy di lettura per il cliente su tabelle dell'onboarding, tranne la propria riga di `clienti_account`. Ogni lettura e scrittura del cliente passa da funzioni `security definer` con `search_path ''` che cominciano tutte con `v_cliente := public.cliente_corrente()` e rifiutano con 42501 se è null. *Minaccia chiusa:* una policy dimenticata o scritta male che apre una tabella del team a un utente autenticato qualsiasi; le colonne interne (`dati`, `nota`) di una riga che il cliente legge; il contenuto di uno step non ancora sbloccato letto con le Data API.
- Queste funzioni, e quelle del team di B2 (che scrivono gli step, dove il coach non ha policy di scrittura), sono le uniche `security definer` nuove eseguibili da `authenticated`, e vanno tutte nell'elenco di `00_schema.sql` e nel test `75_mcp_oauth.sql` (42501 per un token di Claude).
- `cliente_corrente()` non ha grant ad `authenticated`: la usano solo le funzioni sopra.
- I dati sulla salute (risposte del questionario, allegati) non escono mai da `onboarding_questionari` e dal bucket `onboarding-allegati`: mai in un'email, una notifica, un evento del registro, un log, il backup via email, Alfire, Claude collegato, Groq o Anthropic.
- **Testi rivolti al cliente**: solo italiano, in `lib/percorso/testi.ts` (non `bilingue`), tono da coach, frasi brevi, accenti, niente trattino lungo, niente emoji; un test lo controlla su tutti i testi del cliente e sui blocchi del CMS seminati.
- **Server action che lavorano senza sessione** (`/join`, `/entra`): usano il client `service_role` solo per chiamare le funzioni `onboarding_join_*`, `cliente_accesso_*` e l'API admin di Auth, con valori presi dal database e mai dal browser (id, email verificata). *Minaccia chiusa:* una server action pubblica che, con la chiave segreta, diventa una porta generica sul database.
- Nessuna tabella nuova in Realtime.

## Schema di B1

Migration, dopo `20261108090200_onboarding_avvio_gate.sql`:

1. `20261109090000_clienti_account.sql`: account, registrazione, limiti, trigger su `auth.users`, invito di prova, bucket `avatari`.
2. `20261109090100_percorso_dati.sql`: CMS, consensi, questionario, allegati, video visti, bucket privato, backup, eliminazione, pulizia.
3. `20261109090200_percorso_funzioni.sql`: funzioni del cliente e dell'admin, sblocco degli step, stima.

### 1. Account e registrazione

```
clienti_account                  -- l'utente di accesso del cliente; nessuna riga in profiles
  user_id uuid pk -> auth.users on delete cascade,
  client_id uuid not null unique -> clients on delete cascade,
  stato text not null default 'attivo' check in ('attivo','sospeso','chiuso'),
  registrato_il timestamptz not null default now(),
  created_at, updated_at
  -- RLS: admin legge tutto (is_admin()); l'utente legge la propria riga (user_id = auth.uid(),
  --   not da_client_oauth()); nessuna scrittura da una sessione (policy _nessuna_sessione per insert,
  --   update, delete); _mai_da_oauth. Lo scrivono il trigger su auth.users e i trigger dell'invito.

onboarding_registrazioni         -- la registrazione in corso di un invito; nessuna sessione (deny-all), fuori dal backup
  invito_id uuid pk -> onboarding_inviti on delete cascade,
  utente_id uuid not null unique default gen_random_uuid(),   -- l'id riservato dell'utente che nascerà
  chiave_hash text not null unique (^[0-9a-f]{64}$),           -- sha256 della chiave nel cookie
  chiave_scade_il timestamptz not null,                        -- 30 minuti
  email text null (minuscolo, al massimo 320),                 -- l'indirizzo a cui è partito l'ultimo codice
  email_provate text[] not null default '{}',                  -- al massimo 3 indirizzi diversi
  codice_hash text null, codice_scade_il timestamptz null,     -- sha256(invito_id || ':' || codice), 15 minuti
  invii_dal timestamptz null, invii int not null default 0,    -- finestra di un'ora: al massimo 5 invii
  errori int not null default 0,                               -- 5 codici sbagliati: il codice muore
  verificato_il timestamptz null,                              -- codice giusto: vale 10 minuti per creare l'utente
  created_at, updated_at

clienti_accesso_limiti           -- limiti del rientro; nessuna sessione, fuori dal backup, righe di al massimo un giorno
  chiave text pk,                                              -- 'email:' || sha256(email) oppure 'tutti'
  dal timestamptz not null, invii int not null default 0, errori int not null default 0

onboarding_inviti                -- colonna nuova
  prova boolean not null default false                         -- funziona anche con l'area chiusa
```

- `cliente_corrente() returns uuid` (`security definer`, `stable`, `search_path ''`, nessuna grant): il `client_id` di `clienti_account` con `user_id = auth.uid()` e `stato = 'attivo'`; null per un token OAuth (`da_client_oauth()`), per chi ha un profilo e per un account sospeso o chiuso.
- **`handle_new_user()` ricreata** (corpo di `20260928160000_foto_profilo.sql` più un ramo in testa):
  1. Se esiste `onboarding_registrazioni` con `utente_id = new.id` (letta `for update`), è il ramo del cliente e **non scende mai al ramo del team**. Passa solo se: l'invito è `attivo`, `scade_il` null o futuro, `aperto_ai_clienti` oppure `prova`; `verificato_il` negli ultimi 10 minuti; `lower(new.email)` è l'email a cui è partito il codice; il cliente non ha già un `clienti_account`; l'email non è di un profilo né di un invito del team non revocato. Altrimenti 42501 «Registrazione non valida». Se passa: `onboarding_registra_cliente(new.id, invito)` (interna, nessuna grant) scrive `clienti_account`, porta l'invito a `usato`, il percorso a `in_corso` con `giorno_zero = now()`, sblocca gli step, aggiorna `clients.email` se è diversa (evento `email_cambiata` senza indirizzi, notifica), scrive l'evento `registrato` (attore `cliente`), avvisa gli admin, cancella la riga di `onboarding_registrazioni`. Mai una riga in `profiles`.
  2. Altrimenti il ramo del team, identico a oggi (cerca l'email in `invites`).
  - *Minaccia chiusa:* una registrazione diretta alle API di Supabase (signup con password, magic link, OAuth) con l'email di un cliente: non può scegliere il proprio id, quindi non entra mai nel ramo del cliente, e il ramo del team la rifiuta perché l'email non è invitata. Il ramo del cliente non guarda mai l'email per decidere chi è: la confronta solo con quella che il codice ha provato.
- **Trigger su `invites`** (`invites_non_cliente`, `before insert or update of email`, `security definer`): 22023 «Questo indirizzo è di un cliente: usa un'altra email per il team.» se l'email è di un utente con `clienti_account`. *Minaccia chiusa:* un utente che è insieme cliente e collaboratore (il login con Google collegherebbe l'identità all'utente del cliente e il profilo non nascerebbe mai).
- **Invito, ricreate da A con le aggiunte:**
  - `onboarding_inviti_coerenza`: `prova` si cambia solo dalle funzioni dell'admin (entra nella riga protetta); i giorni del link partono se `aperto_ai_clienti` **o** `prova`; l'invito passa a `scaduto` quando lo scrive una funzione senza sessione (vedi `onboarding_join_leggi`).
  - `onboarding_inviti_stato`: verso `usato`, cancella la riga di `onboarding_inviti_token`; verso `revocato`, `clienti_account.stato = 'sospeso'` (se c'è); da `revocato` verso `attivo` o `usato`, `clienti_account.stato = 'attivo'`. *Minaccia chiusa:* il token in chiaro che resta leggibile dopo l'uso; un cliente rimborsato che continua a entrare.
  - `onboarding_segna_prova(p_invito uuid, p_prova boolean) returns jsonb` (`security invoker`, solo admin, mai OAuth, evento `prova` con l'autore): un invito già `usato` non cambia (22023 «Il cliente è già registrato.»).
  - `v_onboarding`: aggiunge `prova`, `account_stato`, `registrato_il`. `lib/onboarding/stati.ts`: un invito di prova attivo è «in attesa di registrazione» anche con l'area chiusa.
- **Funzioni di `/join`** (`security definer`, `search_path ''`, grant **solo** a `service_role`):
  - `onboarding_join_leggi(p_token_hash text) returns jsonb`: `{ stato, nome }` con `stato` in `attivo`, `in_attesa`, `usato`, `scaduto`, `revocato`, `non_valido`; `nome` è il nome di battesimo, solo per `attivo` e `usato`. Un invito `attivo` con `scade_il` passato diventa `scaduto` qui. Un invito non di prova con l'area chiusa risponde `in_attesa`. Un cliente che ha già un account risponde `usato`.
  - `onboarding_join_apri(p_token_hash text, p_chiave_hash text) returns jsonb`: solo un invito che `onboarding_join_leggi` direbbe `attivo`; crea o rinnova la riga di `onboarding_registrazioni` (nuova chiave, 30 minuti, codice azzerato; `utente_id` resta quello di prima) e risponde `{ esito: 'ok' }` o lo stato.
  - `onboarding_join_stato(p_chiave_hash text) returns jsonb`: `{ nome, email_proposta, codice_inviato_a }` finché la chiave vale; `email_proposta` è `onboarding_inviti.email`.
  - `onboarding_join_codice(p_chiave_hash text, p_email text, p_codice_hash text) returns jsonb`: `esito` in `invia`, `email_non_ammessa` (di un profilo, di un invito del team non revocato, di un altro cliente, o quarto indirizzo diverso), `troppe_richieste` (più di 5 invii nell'ora), `scaduta`. Con `invia` salva hash e scadenza del codice, azzera gli errori e restituisce `nome` per l'email. Il codice in chiaro non arriva mai al database.
  - `onboarding_join_verifica(p_chiave_hash text, p_codice text) returns jsonb`: `esito` in `ok` (con `utente_id` ed `email`), `errato`, `bloccato` (5 errori: serve un codice nuovo), `scaduto`. Con `ok` scrive `verificato_il`.
- **Funzioni del rientro** (grant solo `service_role`):
  - `cliente_accesso_per_email(p_email text) returns table (user_id uuid, stato text, nome text)`: l'account del cliente con quell'email in `auth.users`, se esiste.
  - `cliente_accesso_conta(p_email text, p_tipo text) returns boolean`: `p_tipo` in `invio` e `errore`; vero se si può procedere (al massimo 5 invii e 5 errori l'ora per indirizzo, 200 invii l'ora in tutto). *Minaccia chiusa:* casella di un cliente inondata di codici, quota di Resend consumata, codici provati a forza (8 cifre, 60 minuti, 5 errori l'ora), e il limite di verifiche di Supabase per IP, che dal server è unico per tutti, consumato da un solo attaccante.
- **Bucket `avatari`**: le quattro policy di `20260928160000_foto_profilo.sql` ricreate con `and (select public.current_role()) is not null`. *Minaccia chiusa:* un cliente che carica file in un bucket pubblico.
- `notifiche_tipo_check`: aggiunge `onboarding_cliente` (canale `app`).

### 2. Contenuti, consensi, questionario, allegati, video

```
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

clienti_consensi                 -- i consensi dati; admin legge; il cliente da consenso_dai()
  id uuid pk, client_id -> clients on delete cascade, tipo text check in ('salute'),
  versione text not null, fk (tipo, versione) -> clienti_consensi_testi,
  dato_il timestamptz not null default now(), revocato_il timestamptz null,
  revocato_da -> profiles null on delete set null           -- l'admin che ha registrato la revoca
  -- un solo consenso non revocato per cliente e tipo (indice unico parziale)

onboarding_questionari           -- le risposte; dati sulla salute; fuori dal backup
  client_id uuid pk -> clients on delete cascade,
  risposte jsonb not null default '{}' check (onboarding_risposte_valide(risposte)),
  versione int not null default 0,                           -- sale a ogni salvataggio
  schermata int not null default 1 check between 1 and 4,
  inviato_il timestamptz null,
  created_at, updated_at
  -- RLS: admin legge (B2: anche il coach incaricato); nessuna scrittura da una sessione

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

onboarding_video_visti           -- i secondi visti di un video del CMS
  client_id -> clients on delete cascade, blocco_id -> contenuti_blocchi on delete cascade, pk (client_id, blocco_id),
  durata int not null check between 1 and 10800,             -- la prima dichiarata dal player
  visti varbit not null,                                     -- un bit per secondo
  percentuale numeric(5,2) generated, visto_il timestamptz null (alla prima volta oltre il 90%),
  updated_at
  -- RLS: admin legge (B2: anche il coach incaricato)
```

- **Bucket `onboarding-allegati`**: privato, 10 MB a file, `allowed_mime_types` come la colonna `tipo`. **Nessuna policy su `storage.objects` per questo bucket**: caricamento con un indirizzo firmato creato dal server dopo `allegato_prepara`, lettura con un indirizzo firmato di 60 secondi creato dal server dopo un controllo RLS con la sessione di chi chiede. *Minaccia chiusa:* un file letto o sovrascritto da chiunque conosca il percorso; un cliente che legge i file di un altro; un file HTML servito come pagina (solo immagini e PDF, sul dominio di Storage).
- `onboarding_risposte_valide(jsonb) returns boolean` (`immutable`, `search_path ''`): solo le chiavi del questionario (sotto), ognuna del suo tipo, testi al massimo 2.000 caratteri, numeri nei loro intervalli. È la stessa regola di `lib/validation/questionario.ts`; un test Vitest e uno pgTAP usano gli stessi esempi. *Minaccia chiusa:* un `jsonb` qualsiasi salvato chiamando la funzione direttamente.
- Seme di `contenuti_blocchi`, versione 1, tutti pubblicati, con segnaposto evidenti dove manca il testo vero (specifica 13-bis.7: «[Da scrivere: …]»):
  - `benvenuto`: testo di benvenuto (callout «Benvenuto a bordo, [Nome]…» della specifica 7, firmato Dany); video di benvenuto (`youtube_id` segnaposto `XXXXXXXXXXX`, obbligatorio); testo «Il tuo team».
  - `regole`: le regole del percorso della specifica 4.1 (Telegram per imprevisti e dubbi, Coach Plus per i dati, call confermate, preavviso di 24-48 ore, notifiche Telegram attive) e le regole della community, una `regola` ciascuna.
  - `questionario`: testo introduttivo e avviso «Niente foto del fisico qui: quelle vanno su Coach Plus.».
  - B2 aggiunge i blocchi di `prenotazione` («Cosa faremo in call», specifica 4.2), `community` (template di presentazione), `obiettivo`, `test` (le voci della settimana test), `programma` e `dopo_lancio`.
- Seme di `clienti_consensi_testi`: `('salute', '2026-11-12', <sha256 del testo>, true)`. Il testo è in `lib/percorso/consensi.ts`; un test verifica che lo sha256 del testo nel codice sia quello della migration. Una nuova versione del testo è una migration (la vecchia `in_vigore = false`) e chi l'ha accettata prima la vede di nuovo.
- **Backup**: `backup_completo()` ricreata identica alla A, aggiungendo alle escluse `onboarding_questionari`, `onboarding_allegati`, `onboarding_registrazioni`, `clienti_accesso_limiti`. Gli account dei clienti (`auth.users`) finiscono nel file come gli altri: solo email e metadati.
- **Eliminazione**: `anteprima_eliminazione('cliente', …)` aggiunge `accesso_cliente` e `questionario`; `lib/eliminazione.ts` le dice («Si perdono anche il suo accesso al percorso, il questionario e i file caricati.»). La server action che elimina un cliente legge prima `user_id` e i percorsi dei file, poi chiama `elimina_cliente`, poi toglie i file (API di Storage) e l'utente (`auth.admin.deleteUser`) col `service_role`, senza mai fermare l'eliminazione se una delle due non riesce: la pulizia notturna cerca i resti.
- **Conservazione** (decisione 8): `onboarding_pulizia()` (`security definer`, solo `service_role`), con `pg_cron` ogni notte alle 02:50 UTC (`onboarding-pulizia`, sfasato da `notifiche-pulizia`): cancella questionario e video visti, e segna `da_cancellare` gli allegati, dei clienti il cui ultimo percorso `nuovo` o `rinnovo` è finito da più di 12 mesi; cancella `onboarding_registrazioni` scadute da un giorno, `clienti_accesso_limiti` più vecchie di un giorno, le righe di `onboarding_inviti_token` di inviti `scaduto` o `revocato` da più di 30 giorni, `onboarding_eventi` di più di 24 mesi; segna `da_cancellare` gli allegati rimasti `in_caricamento` da più di un giorno. I file `da_cancellare` li toglie il cron della sera (`lib/percorso/pulizia.ts`: lista da `onboarding_allegati_da_togliere()`, `service_role`, poi API di Storage, poi la riga), insieme agli oggetti del bucket senza riga e agli utenti con `app_metadata.tipo = 'cliente'` senza `clienti_account`. Storage non si cancella da SQL.

### 3. Funzioni del cliente

Tutte `security definer`, `search_path ''`, grant ad `authenticated`, prima riga `v_cliente := public.cliente_corrente()` (null: 42501 «Accesso non valido: entra di nuovo.»). Nessuna restituisce un dato di un altro cliente, una persona del team oltre a nome, foto e ruolo, un importo o lo stato del pagamento.

- `percorso_cliente() returns jsonb`: il documento della pagina.
  - `cliente`: nome di battesimo. `percorso`: stato, `giorno_zero`, `completato_il`.
  - `nodi`: i 7 nodi della versione (`lib/percorso/nodi.ts` ha le etichette; il database l'ordine e la chiave), ognuno con `stato` in `completato`, `attuale`, `futuro` e `completato_il`. Completato: tutti i suoi step `fatto`. Attuale: il primo non completato con almeno uno step non `bloccato`. Gli altri futuri.
  - `passi`: tutti gli step con `chiave`, `titolo`, `nodo`, `attore`, `stato`; **solo** per gli step non `bloccato` anche `blocchi` (i pubblicati, in ordine, senza `id` interni oltre a quello che serve al player) e i loro `video` (percentuale, visto); per uno step `fatto` anche `completato_il`.
  - `team`: per coach, revisore e responsabile dell'incarico, `nome`, `foto_url` e il ruolo («Coach», «Revisione video», «Personal Success Manager»), da una lettura dedicata di `profiles`, mai l'email.
  - `stima`: da `onboarding_stima(p_client_id)` (interna): `data` (o null con `quasi` vero), `giorni`, `base` (`call_non_prenotata`, `call_prenotata`, `settimana_test`, `iniziato`), `cose_da_fare` (step con attore `cliente` non `fatto` fino al razzo, più le voci obbligatorie della settimana test in B2), `video_mancanti` (titoli dei video obbligatori non visti). Regole della specifica 4.4 con `giorni_call`, `giorni_test`, `giorni_programma` delle impostazioni; mai un numero negativo.
- `percorso_avanza(p_passo text, p_azione text, p_dati jsonb) returns jsonb`: l'unica strada per avanzare. Rifiuta uno step `bloccato` (22023 «Questo passo non è ancora disponibile.») o già `fatto` (22023 «Questo passo è già completato.»). In B1:
  - `benvenuto` / `completa`: ogni video obbligatorio dello step visto al 90% (22023 «Guarda il video fino in fondo prima di andare avanti.»).
  - `regole` / `accetta`, `p_dati = { regole: [id], consenso_salute: versione }`: tutti gli id delle `regola` pubblicate dello step (22023 «Spunta tutte le regole per andare avanti.») e la versione in vigore del consenso (22023 «Il testo del consenso è cambiato: rileggilo e accettalo di nuovo.»); scrive il consenso se non ce n'è uno in vigore.
  - Ogni completamento: step `fatto`, evento (attore `cliente`, dettagli con la sola chiave), `onboarding_sblocca(p_client_id)` (interna: ogni step `bloccato` i cui `sblocca_dopo` sono tutti `fatto` diventa `disponibile`), restituisce `percorso_cliente()`.
- `consenso_dai(p_tipo text, p_versione text) returns jsonb`: per ridare il consenso dopo un cambio di testo.
- `questionario_cliente() returns jsonb`: risposte, versione, schermata, `inviato_il`, gli allegati (`id`, `campo`, `nome_file`, `tipo`, `byte`).
- `questionario_salva(p_risposte jsonb, p_schermata int, p_versione int) returns jsonb`: step `questionario` disponibile o in corso, consenso sulla salute in vigore (22023 «Serve il consenso al trattamento dei dati sulla salute per compilare il questionario.»), non inviato (22023 «Il questionario è già stato inviato.»). Scrive solo sopra la versione letta: con una versione diversa non scrive e risponde `{ esito: 'cambiato', risposte, versione }` (un altro dispositivo); altrimenti `{ esito: 'salvato', versione }`. Primo salvataggio: step `in_corso`.
- `questionario_invia(p_versione int) returns jsonb`: risposte complete (`onboarding_risposte_complete`, le stesse regole di Zod: 22023 «Mancano delle risposte: completa le parti segnate.» con `mancanti` nei dettagli dell'errore, come elenco di chiavi), stessa versione; età dalla data di nascita: sotto 14 anni 22023 «Per i minori di 14 anni il percorso non è disponibile: scrivi al tuo coach.» con notifica agli admin; sotto 18 con un invito non segnato minorenne, l'invio passa e gli admin ricevono «Età da verificare». Poi `inviato_il`, step `fatto`, sblocco, evento, notifica «Questionario inviato da <Nome>».
- `allegato_prepara(p_campo text, p_nome text, p_tipo text, p_byte int) returns jsonb`: questionario non inviato, consenso in vigore, tipo e dimensione ammessi (22023 «File non valido: puoi caricare foto (JPG, PNG, WebP) o PDF fino a 10 MB.»), al massimo 3 file per campo (22023 «Hai già caricato 3 file qui: togline uno per aggiungerne un altro.»); crea la riga `in_caricamento` e restituisce `{ id, percorso }`.
- `allegato_conferma(p_id uuid) returns jsonb`: l'oggetto c'è in `storage.objects` (bucket e nome), con dimensione e tipo ammessi; riga `caricato`. Altrimenti 22023 «Il file non è arrivato: riprova.» e la riga diventa `da_cancellare`.
- `allegato_togli(p_id uuid) returns jsonb`: solo prima dell'invio; riga `da_cancellare`.
- `video_progresso(p_blocco uuid, p_durata int, p_intervalli int4range[]) returns jsonb`: un blocco `video` di uno step non `bloccato` del cliente; al massimo 50 intervalli, dentro la durata; unisce i secondi a quelli già visti, calcola la percentuale e `visto_il`. Restituisce `{ percentuale, visto }`.

### 4. Funzioni dell'admin

`security invoker`, solo admin, mai OAuth, evento con l'autore:

- `onboarding_segna_prova` (sopra).
- `onboarding_revoca_consenso(p_client_id uuid, p_tipo text, p_motivo text) returns jsonb`: segna `revocato_il` e `revocato_da`, cancella le risposte del questionario, segna `da_cancellare` gli allegati, riporta `regole` e `questionario` a `disponibile` (e blocca ciò che ne dipende e non è `fatto`). Lo chiede il cliente al team (la pagina «I tuoi consensi» e `/privacy` lo dicono). Restituisce i percorsi dei file, che la server action toglie subito.
- I blocchi del CMS si scrivono con la sessione dell'admin sotto RLS (nessuna funzione).

## Schema di B2

Migration:

4. `20261110090000_percorso_call_consegne.sql`
5. `20261110090100_percorso_team.sql`

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
  -- RLS: admin tutto; coach incaricato legge; scritture solo dalle funzioni

clienti_consegne                 -- i materiali del singolo cliente (step 12)
  id uuid pk, client_id -> clients on delete cascade,
  tipo text check in ('video','pdf','link'), titolo text (1-120),
  youtube_id text null, url text null (^https://), obbligatoria boolean default false,
  created_by -> profiles null on delete set null, created_at
  -- RLS come clienti_call; i video obbligatori contano per il completamento (onboarding_video_visti.consegna_id)

onboarding_impostazioni          -- colonne nuove
  link_prenotazione text null (^https://(calendar\.app\.google|calendar\.google\.com)/),
  avvisa_cliente_email boolean not null default true
  -- e la grant di update di aperto_ai_clienti all'admin, solo tramite le due funzioni sotto

onboarding_video_visti           -- colonna nuova
  consegna_id -> clienti_consegne null on delete cascade (uno tra blocco_id e consegna_id)
```

- **Letture degli incaricati** (policy nuove, tutte con `onboarding_incaricato(client_id)` e il ruolo dell'incarico, mai lo stato del pagamento): questionario, allegati e video visti al **coach**; `clienti_call` e `clienti_consegne` al coach; i passi e il percorso a tutti e tre (già da A). Il revisore e il responsabile non leggono mai il questionario.
- `onboarding_passi_def` versione 1: nessuna riga cambia. Il flusso v1 resta quello di A.
- **Funzioni del cliente** (come in B1):
  - `percorso_avanza` aggiunge: `prenotazione` / `prenotato` (`{ giorno, ora }` da oggi a 60 giorni: nasce `clienti_call` `da_confermare`, step `inviato`, notifica al coach e agli admin); `community` / `username` (scrive `clienti_telegram.username` con le regole di A), `richiesta_inviata` (`community_richiesta_il`), `presentato` (`presentato_il`, step `fatto`); `obiettivo` / `visto`; `test` / `spunta` (`{ voce: id }`, la voce del CMS; tutte spuntate: step `in_attesa_team`); `programma` / `completa` (ogni video obbligatorio tra blocchi e consegne visto al 90%).
  - `percorso_cliente` aggiunge `call` (giorno, ora, durata, `meet_url` solo se `prenotata`), `consegne`, `link_community` (solo con lo step `community` sbloccato), `link_prenotazione` (solo con lo step `prenotazione` sbloccato), `gruppo_privato_url`, `attesa_team` (per uno step `in_attesa_team` o `inviato`: chi, con nome di battesimo e ruolo, e cosa: «Ivan sta confermando la tua call.»).
- **Funzioni del team** (`security definer`, `search_path ''`, grant ad `authenticated`, nell'elenco di `00` e `75`): rifiutano un token OAuth e chi non è admin o il coach incaricato (`onboarding_incaricato` e `coach_id = auth.uid()`), con 42501 «Questa azione è del coach del cliente e dell'admin.». Il responsabile ha solo le due della community.
  - `onboarding_call_conferma(p_client_id, p_inizio timestamptz, p_meet_url text)`: la call `da_confermare` diventa `prenotata` (giorno e ora si possono correggere), step `prenotazione` `fatto`, sblocco, scadenze dei task `questionario_letto` e `call_onboarding` al giorno della call, avviso al cliente.
  - `onboarding_call_esito(p_call_id, p_esito text, p_nuovo_inizio timestamptz)`: `svolta` (step `call` `fatto`, task `call_onboarding` completato, scadenze di `obiettivo_smart` e `coachplus_test` a +1 giorno, sblocco); `non_presentato` e `spostata` (`p_nuovo_inizio` obbligatorio: la call resta `prenotata` col giorno nuovo, avviso al cliente). Una call non ancora passata non si segna svolta (22023).
  - `onboarding_test_ricevuti(p_client_id)`: step `test` `in_attesa_team` → `fatto`, step `programma` `in_attesa_team`, scadenza di `prima_scheda` a +2 giorni, notifica al revisore («Test da rivedere»).
  - `onboarding_consegna_aggiungi(p_client_id, p_tipo, p_titolo, p_url, p_obbligatoria)` e `onboarding_consegna_togli(p_id)`.
  - `onboarding_programma_consegnato(p_client_id, p_primo_checkpoint timestamptz)`: almeno una consegna; nasce la `clienti_call` di tipo `checkpoint`; step `programma` `disponibile` per il cliente (deve vedere i video obbligatori); task `prima_scheda` completato; scadenza di `template_alimentare` a +5 giorni e di `primo_checkpoint` al giorno del checkpoint; avviso al cliente.
  - `onboarding_community(p_client_id, p_azione text)`: `approvata` (`community_approvata_il`, task `community_accesso` completato) e `controllata` (`presentazione_controllata_il`). Admin, coach e responsabile incaricati.
  - `onboarding_sblocca_passo(p_client_id, p_passo, p_motivo)` (motivo obbligatorio, 300 caratteri) e `onboarding_riavvia(p_client_id, p_motivo)` (tutti gli step tornano `bloccato` tranne `regole` e `questionario`, che restano `fatto` con consenso e risposte; sblocco; il percorso torna `in_corso`): solo admin e coach incaricato, evento con l'autore, che legge solo l'admin.
- **Task e step** (piano 4.4: «la verità è lo step, il task è lo specchio»): trigger `pm_task_onboarding_passo` (`after update of stato on pm_task`, `security definer`, dentro un blocco che non ferma mai il task): `obiettivo_smart` completato → step `obiettivo` `disponibile`; `telegram_gruppo` completato → evento. Riaprire il task non riporta indietro lo step. Le scadenze dei task si scrivono solo dalle funzioni sopra e alla registrazione (`telegram_gruppo` e `community_accesso` al giorno zero, `+1`), con `pm_task.scadenza`, mai su un task completato.
- **Completamento**: quando tutti gli step sono `fatto` e i video obbligatori (blocchi e consegne) visti, `onboarding_percorsi.stato = 'completato'`, `completato_il`, evento, notifica agli admin e al coach «Onboarding completato».
- **Apertura dell'area**: `onboarding_apri_ai_clienti()` e `onboarding_chiudi_ai_clienti()` (`security invoker`, solo admin, evento): aprire rifiuta (22023, con l'elenco in parole) se un blocco pubblicato contiene «[Da scrivere», se un video ha l'id segnaposto, se mancano `link_community` o `link_prenotazione`; aperta, gli inviti `attivo` senza `scade_il` ricevono i loro giorni. Chiudere ferma le nuove registrazioni (tranne quelle di prova); gli account che ci sono restano.
- `notifiche_tipo_check`: niente di nuovo; le notifiche agli incaricati usano `notifiche_avviso(destinatari, 'onboarding_cliente', …)`, mai a chi non legge la pagina a cui porta.

## Autenticazione

Ogni file toccato e cosa cambia:

| File | Cambio |
|---|---|
| `lib/auth/destinazione.ts` (nuovo) | `destinazioneUtente(supabase, user)`: legge la propria riga di `profiles` e di `clienti_account` con la sessione. Esiti: `team` (profilo attivo: `vai` = `percorsoIniziale(ruolo)` o il `da` sicuro), `disattivato`, `cliente` (`attivo` o `sospeso`: `vai` = `/percorso`, il `da` solo se comincia con `/percorso`), `chiuso`, `nessuno`, `errore` (il database non risponde). Il profilo vince se ci fossero tutti e due |
| `lib/auth/dopo-login.ts` | `verificaDopoLogin` restituisce `{ ok: true, vai }` da `destinazioneUtente`. `signOut` (sempre `scope: 'local'`) solo per `disattivato`, `chiuso`, `nessuno`. Oggi un cliente che entra da `/login` verrebbe disconnesso da tutti i dispositivi (`signOut()` globale su un utente senza profilo) |
| `lib/auth/session.ts` | `requireProfilo`: utente senza profilo → `destinazioneUtente`: un cliente va a `/percorso`, nessuno dei due a `/auth/uscita?motivo=nessun-account`. Mai più `redirect('/login')` con una sessione viva (era il ciclo) |
| `lib/auth/cliente.ts` (nuovo) | `requireCliente()`: la riga di `clienti_account` (in `cache` per richiesta, come `profiloDellaRichiesta`); un profilo va alla sua pagina; nessun account a `/auth/uscita`; restituisce `{ clientId, stato }`, e la pagina sospesa la disegna il layout |
| `app/auth/uscita/route.ts` (nuovo) | GET: `signOut({ scope: 'local' })`, cookie di sessione tolti, redirect a `/accesso-negato?motivo=`. `no-store` |
| `app/accesso-negato/page.tsx` (nuovo, pubblico) | «Questo account non ha accesso.» con «Sei del team? Accedi» (`/login`) e «Sei un cliente del Percorso Alpha? Entra da qui» (`/entra`) |
| `app/auth/callback/route.ts`, `app/auth/conferma/route.ts` | usano il nuovo esito (`vai`) |
| `app/login/actions.ts` | `richiediCodice`: prima di `signInWithOtp`, `cliente_accesso_per_email` col `service_role`; per un cliente si manda la mail del cliente (stessa strada di `/entra`), stessa risposta, stessa durata minima. `verificaCodice`: il nuovo esito |
| `app/login/page.tsx` | sotto il riquadro, «Sei un cliente del Percorso Alpha? Entra da qui» (`/entra`) |
| `lib/supabase/middleware.ts` | `PERCORSI_PUBBLICI` += `/join`, `/entra`, `/accesso-negato`. Con una sessione: un utente con `app_metadata.tipo = 'cliente'` (lo scrive solo il server alla creazione, l'utente non può cambiarlo) che apre un percorso fuori da `/percorso`, `/api/percorso`, `/auth`, `/privacy`, `/entra`, `/join`, `/accesso-negato` va a `/percorso`; `/login` e `/entra` con una sessione vanno a `destinazioneUtente` (un cliente a `/percorso`). Il suggerimento in `app_metadata` decide solo dove mandare: ogni pagina ricontrolla col database |
| `app/auth/actions.ts` | `esciCliente`: `signOut({ scope: 'local' })` e redirect a `/entra` |
| `next.config.ts` | intestazioni per `/join/:path*`, `/entra`, `/percorso/:path*`: `X-Robots-Tag: noindex`, `Referrer-Policy: same-origin`, `X-Frame-Options: DENY`, `Content-Security-Policy: frame-ancestors 'none'`; `Cache-Control: no-store` per `/join` ed `/entra` |
| `supabase/migrations` | `handle_new_user`, `invites_non_cliente`, policy di `avatari` (sopra) |

*Minacce chiuse:* il ciclo `/login` ↔ `/` per una sessione senza profilo; un cliente che apre una pagina, una route o una server action del team (la pagina lo rimanda, la server action trova `getProfilo()` null e rifiuta, la RLS gli dà zero righe); un collaboratore che apre `/percorso` (`requireCliente` lo rimanda alla sua pagina); il consenso di Claude (`/oauth/consent`) aperto da un cliente (il proxy lo rimanda a `/percorso` e `puo_usare_mcp` è falso).

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
4. `inviaCodiceRegistrazione(email)`: Zod sull'email, codice di 8 cifre con `crypto.randomInt`, `onboarding_join_codice` col suo hash; con `invia`, email con Resend (`lib/email/cliente.ts`, `Idempotency-Key` = hash del codice, 8 secondi): oggetto «Il tuo codice per Percorso Alpha», corpo «Ciao Mario, il tuo codice è 1234 5678. Vale 15 minuti. Se non hai chiesto tu di entrare nel Percorso Alpha, ignora questa email.», il logo, nessun link. Risposte: «Ti abbiamo scritto a mario@…: inserisci il codice.»; `email_non_ammessa`: «Questa email non si può usare per il tuo accesso. Scrivine un'altra o chiedi al tuo coach.» (la stessa per ogni motivo); `troppe_richieste`: «Troppi tentativi. Aspetta qualche minuto e riprova.»; email non partita: «Non riusciamo a mandarti il codice adesso. Riprova tra poco o scrivi al tuo coach.» (nel log solo l'esito di Resend). «Invia di nuovo» dopo 60 secondi.
5. `verificaCodiceRegistrazione(codice)`: `onboarding_join_verifica`; `errato`: «Il codice non è corretto o è scaduto. Controlla le cifre o chiedine uno nuovo.»; `bloccato`: «Hai sbagliato il codice troppe volte: chiedine uno nuovo.». Con `ok`, col `service_role`: `auth.admin.createUser({ id: utente_id, email, email_confirm: true, app_metadata: { tipo: 'cliente' } })` (id ed email dal database); il trigger fa il resto nella stessa transazione. Poi `auth.admin.generateLink({ type: 'magiclink', email })` e, col client dei cookie (`ignoraSessione`, `sessioneVecchia` e `togliSessioneVecchia` come oggi), `verifyOtp({ email, token: email_otp, type: 'email' })`. Cookie `alpha-registrazione` tolto, redirect a `/percorso`.
   - `createUser` rifiutato (il trigger, un'email già di un utente, una seconda scheda che ha appena creato lo stesso id): se l'invito risulta `usato`, «Il tuo accesso è pronto: entra con la tua email.» con «Entra»; altrimenti «Non riusciamo a completare la registrazione. Riapri il link o scrivi al tuo coach.» e nel log solo il codice dell'errore.
   - Utente creato ma sessione non aperta: «Il tuo accesso è pronto: entra con la tua email.» con «Entra».
6. Rischio accettato, perché è nella specifica: chi ha il link prima del cliente si registra con la propria email. Il link va mandato solo nel gruppo privato; la notifica «email diversa» lo fa vedere all'admin. Il percorso `/join/<token>` resta nei log di Vercel: il token vale una volta sola.

### `/entra`

`app/entra/page.tsx` (pubblica, solo italiano): «Entra nel tuo percorso», «Scrivi l'email con cui ti sei registrato: ti mandiamo un codice di 8 cifre.», poi il campo del codice, come `AccessoCodice` del team ma senza link nella mail.

- `chiediCodiceCliente(email)` (`app/entra/actions.ts`): risposta sempre «Se l'email è registrata, ti abbiamo scritto un codice di 8 cifre. Vale 60 minuti.» in almeno 1,2 secondi, per un cliente, uno sconosciuto, un collaboratore o un account chiuso. Solo per un account `attivo` o `sospeso` e con `cliente_accesso_conta(email, 'invio')`: `generateLink` magiclink, email con l'`email_otp` («Il tuo codice per entrare nel Percorso Alpha»). Si mostra solo `troppe-richieste` per il limite di tutti (non dipende dall'indirizzo) e «Non riusciamo a completare la richiesta in questo momento».
- `verificaCodiceCliente(email, codice)`: prima `cliente_accesso_conta(email, 'errore')` (oltre: «Troppi tentativi. Aspetta qualche minuto e riprova.» senza chiamare Supabase), poi `verifyOtp({ email, token, type: 'email' })` col client dei cookie, poi `verificaDopoLogin`. Codice sbagliato: conta un errore. Un collaboratore che usa qui un codice del team entra lo stesso e va alla sua pagina.

## Codice

- `lib/percorso/`: `nodi.ts` (i 7 nodi con etichette brevi e lunghe, dal database l'ordine), `testi.ts` (tutti i testi del cliente), `consensi.ts` (testi e versioni), `questionario.ts` (le 4 schermate, le domande e le opzioni), `video.ts` (unione degli intervalli, campionamento dei secondi, puro), `stima.ts` (solo formattazione: «Mancano circa 9 giorni all'inizio del tuo percorso», «Ci siamo quasi»), `letture.ts` e `operazioni.ts` (`server-only`, il client come parametro), `pulizia.ts`.
- `lib/validation/questionario.ts`, `lib/validation/percorso.ts` (azioni, allegati, intervalli), `lib/validation/registrazione.ts` (email, codice di 8 cifre, segmento).
- `lib/auth/destinazione.ts`, `lib/auth/cliente.ts` (sopra).
- `lib/email/cliente.ts`: le email del cliente (codice di registrazione, codice di accesso; in B2 «Tocca a te»), testo semplice e HTML con il logo, mai un link nelle email del codice.
- `lib/email/mailpit.ts`: con `E2E_EMAIL_MAILPIT` (solo fuori da produzione, con `ENABLE_DEV_LOGIN=true`, solo `http` su 127.0.0.1, localhost o [::1]: le regole di `E2E_GRAPH_FINTO`) `inviaEmail` manda a Mailpit (`POST /api/v1/send`) invece che a Resend. Variabile nuova in `.env.example`. Da controllare come primo passo: la versione di Mailpit della CLI di Supabase ha `/api/v1/send`.
- Questionario, campi (chiavi in italiano, tipi e limiti uguali in Zod e in SQL): schermata 1 «Chi sei» (`data_nascita`, `altezza_cm` 120-230, `peso_kg` 35-250, `occupazione`); 2 «Allenamento» (`storia_allenamento`, `giorni_settimana` 1-7 con `giorni_note`, `infortuni`, `attrezzatura` scelta multipla più `attrezzatura_altro` e allegati, `massimali` con `piegamenti`, `trazioni`, `dip` numero 0-200 o «non lo so», `esercizi_difficolta` con l'allegato della vecchia scheda, `importanza_tecnica` 1-5, `minuti_sessione`); 3 «Stile di vita» (`ore_sonno` 3-12, `livello_attivita`, `routine_giornaliera`, `seguito_alimentazione` sì/no con l'allegato del piano, `conoscenza_alimentazione`, `cattive_abitudini` scelta multipla più testo); 4 «Obiettivi» (`obiettivo_principale`, `perche_noi`, `obiettivi_3_6_mesi`, `successo`, `pronto` sì/no, `note`). Nome, email e telefono restano sulla scheda del cliente.
- Server action con la sessione del cliente (`app/(cliente)/percorso/actions.ts`): `avanzaPasso`, `salvaQuestionario`, `inviaQuestionario`, `daiConsenso`, `togliAllegato`. Rivalidano solo `/percorso`.
- Route (la regola di «Fluidità»: letture e scritture frequenti fuori dalle server action):
  - `POST /api/percorso/video`: stessa origine (`lib/auth/stessa-origine.ts`), sessione del cliente, `video_progresso`; `fetch` con `keepalive` ogni 10-15 secondi, alla pausa, alla fine e quando la pagina si nasconde.
  - `POST /api/percorso/allegati`: `allegato_prepara` con la sessione, poi `createSignedUploadUrl` col `service_role` su quel solo percorso; il browser carica (foto ridotte nel browser a 2.000 px JPEG senza metadati del luogo, come gli allegati di Alfire), poi `allegato_conferma`.
  - `GET /api/onboarding/allegati/[id]`: con la sessione del team legge la riga sotto RLS (admin; in B2 il coach incaricato); se c'è, indirizzo firmato di 60 secondi col `service_role` e redirect 302, `no-store`. Mai un indirizzo pubblico.
- Admin, B1: `app/(app)/onboarding/[clientId]/` aggiunge i riquadri «Accesso del cliente» (registrato il, stato dell'account), «Consensi» (tipo, versione, data, «Registra la revoca» con motivo e seconda conferma), «Questionario» (le 4 schermate in sola lettura, gli allegati), «Video visti» (titolo e percentuale); «Cliente di prova» nel riquadro Link; «Copia link» con l'area aperta **o** con l'invito di prova. `app/(app)/settings/onboarding/contenuti/` (`page`, `loading`, `error`): i blocchi per step e per pagina, con il modulo (tipo, titolo, testo, video, link, obbligatorio, pubblicato, ordine) e l'anteprima disegnata dagli stessi componenti dell'area cliente; un blocco con «[Da scrivere» ha l'avviso. Testi del team in `lib/i18n/testi/onboarding.ts` (italiano e inglese).
- B2: `app/(app)/onboarding/` per gli incaricati (stessa pagina: chi non è admin vede solo i clienti registrati di cui ha un incarico, nei gruppi «Tocca a te», «Tocca al cliente», «Completati», mai inviti, pagamento, registro o pulsanti dell'admin); code in cima alla lista (admin e incaricati, ognuno le sue): «Call da confermare», «Call da segnare», «Richieste di accesso alla community», «Presentazioni da controllare», «Test da confermare», «Programma da consegnare». `lib/nav.ts`: la voce «Onboarding» anche a chi ha almeno un incarico su un cliente registrato (una count `head` sotto RLS nel layout, come i promemoria), mai nella barra in basso. Avviso al cliente: la server action, dopo la funzione, legge l'email del cliente col `service_role` (mai mandata al browser del coach) e manda «Tocca a te» con `Idempotency-Key`; se non parte o `avvisa_cliente_email` è spento, il toast offre «Copia il messaggio per Telegram».
- `package.json` (B2): `motion` **14.7.1** (pubblicata il 27/10/2026), versione esatta, importata solo da `components/percorso/` con `motion/react` e caricata dopo il primo disegno; nella tabella della sezione 4 di `CLAUDE.md`.
- `lib/changelog/versioni.ts`: 1.78.0 e 1.79.0 con voci `admin` (B2 anche `progetti` per il lavoro del coach sui task), mai pagamento o gate; `package.json`; `CLAUDE.md` (sotto).

## Interfaccia del cliente

Gruppo `app/(cliente)/`: `layout.tsx` (`requireCliente`, `lang="it"`, nessuna shell, Alfire, campanella, timer, tutorial, intro o bandierina; in alto il logo, il tema e «Esci»), `percorso/page.tsx`, `percorso/questionario/page.tsx` (`?schermata=1..4`), `percorso/consensi/page.tsx`, ognuno con `loading.tsx` ed `error.tsx`. Componenti in `components/percorso/`. Mobile first a 390 px, tocco 44 px, temi chiaro e scuro con i token di sempre, un solo oro (il giorno stimato). Una sola azione primaria per schermata, con il verbo giusto («Ho guardato il video», «Accetto e vado avanti», «Invia il questionario»).

- **Timeline** (`timeline.tsx`): in cima «Mancano circa 9 giorni all'inizio del tuo percorso · Ti restano 6 cose da fare» (stima dal SQL; passata: «Ci siamo quasi»). Sette nodi: Benvenuto, Questionario, Call prenotata, Community, Call di onboarding, Settimana test, Inizio percorso (razzo, Lucide `Rocket`). Ogni nodo è un `button` con il nome accessibile «Questionario, completato» / «attuale» / «si sblocca dopo Benvenuto»; frecce sinistra e destra tra i nodi; futuri con `aria-disabled` (mai `disabled`, così il tocco dice «Si sblocca dopo: Benvenuto» in un tooltip con `aria-live`). Stati con icona e parole, mai solo colore: completato (spunta), attuale (anello), futuro (lucchetto, opacità ridotta). La linea piena fino al nodo attuale, tratteggiata dopo. Sul telefono scorre di lato dentro la sua cornice con `scroll-snap` e centra il nodo attuale; la pagina non scorre mai di lato. In B1 nessuna animazione; in B2 quelle della specifica 4.4 con `motion` (linea che si disegna, nodi in sequenza, respiro del nodo attuale, pop del nodo completato, lucchetto che si apre, razzo che sale al lancio), tutte ferme con «Riduci movimento» e in pausa fuori vista.
- **Pannello** (`pannello-passo.tsx`): sotto la timeline, solo il passo da fare (o il riepilogo di un nodo completato toccato: «Fatto il 14/11/2026»). Blocchi del CMS (Markdown con `react-markdown`, mai HTML), video con il player, spunte delle regole, il pulsante del passo. Un errore della funzione si dice in parole sopra il pulsante; il pulsante non resta mai fermo senza dire perché.
- **Player** (`player-youtube.tsx`): un riquadro locale con «Guarda il video» (nessuna richiesta a Google prima del tocco); al tocco carica `https://www.youtube.com/iframe_api` e incorpora `https://www.youtube-nocookie.com/embed/<id>?enablejsapi=1&rel=0&origin=<APP_URL>`; ogni secondo, mentre il video va, segna il secondo se il tempo è avanzato di al massimo 2 secondi dall'ultimo campione (un salto in avanti non conta); sotto, «Visto al 64%» e, al 90%, «Video visto». Se il video non si carica: «Il video non si apre. Riprova o aprilo su YouTube.» con il link.
- **Step 2**: le regole come caselle grandi, poi il consenso sulla salute con il testo intero (non un link), la versione e la casella; «Accetto e vado avanti» attivo solo con tutto spuntato.
- **Questionario**: 4 schermate con l'indicatore «2 di 4», «Avanti» e «Indietro»; salvataggio automatico 1 secondo dopo l'ultima modifica e al cambio di schermata («Salvato alle 18:42»); `cambiato` da un altro dispositivo: «Il questionario è cambiato da un altro dispositivo: ricarico le tue risposte.» e rilettura; errori sotto ogni campo con icona e parole; allegati con «Aggiungi una foto o un PDF», l'elenco dei file e la X; «Invia il questionario» nell'ultima schermata, con «Mancano delle risposte» che porta alla prima.
- **Attesa del team** (B2): «Tocca a noi» con il nome di battesimo e la foto di chi lavora, cosa sta facendo e «Nel frattempo puoi rileggere…» con i link ai nodi completati. Nessun pulsante.
- **Dopo il lancio** (B2): «Il tuo percorso è iniziato», il prossimo checkpoint con giorno e ora, i link rapidi dal CMS (Coach Plus, Yazio, community, gruppo privato).
- **Sospeso**: una pagina sola, «Il tuo accesso è sospeso. Scrivi nel tuo gruppo Telegram.» ed «Esci».
- **I tuoi consensi**: tipo, versione, data; «Per revocarlo scrivi al tuo coach o a <email del titolare>: cancelliamo le risposte del questionario e i file.».
- Stati: scheletro con la forma della timeline e del pannello, errore con «Riprova», toast brevi («Salvato», «Passo completato»). Il vuoto non esiste per il cliente: c'è sempre un passo o l'attesa.

## Sezione 15 di `CLAUDE.md` riscritta (B1)

Il punto **GDPR** diventa: dati dei clienti ridotti al minimo; regione EU. **Dati sulla salute** (dal 1.78.0, decisione 1 del piano): solo le risposte del questionario dell'onboarding (`onboarding_questionari`) e i file caricati con lui (bucket privato `onboarding-allegati`), con il consenso esplicito del cliente in una versione registrata (`clienti_consensi`); li leggono l'admin e il coach incaricato (dalla 1.79.0); mai nel backup via email, in un'email, una notifica, il registro, i log, Alfire, Claude collegato, Groq o Anthropic; conservati 12 mesi dopo la fine dell'ultimo percorso del cliente e cancellati con lui o alla revoca del consenso; un backup di questi dati c'è solo con Supabase Pro. Le foto del fisico restano su Coach Plus. Il resto (le call) resta com'è. Più: la riga del backup che dice le tabelle escluse, `onboarding-pulizia` tra i job di `pg_cron`, la pulizia dei file e degli utenti orfani nel cron della sera.

## `/privacy` (B1)

Sezione nuova «Clienti del percorso»: l'account (email, codice via email, Resend come fornitore), il questionario e cosa contiene (anche dati sulla salute, con il consenso, base giuridica art. 9.2.a GDPR), i file, i video guardati (secondi visti, con YouTube che riceve l'indirizzo IP quando il video parte, da `youtube-nocookie.com`), i consensi e come revocarli, chi legge (admin e coach incaricato), la conservazione (12 mesi dopo la fine del percorso), dove stanno (Supabase, UE), che niente va a un'intelligenza artificiale; i minori (consenso del genitore registrato dall'admin, sotto i 14 anni nessun percorso). `ULTIMO_AGGIORNAMENTO` cambia. Da far vedere a chi segue la parte legale prima dell'apertura (piano 8.7).

## Test

**B1.**
- pgTAP `111_clienti_account.sql`: il ramo del cliente del trigger (passa solo con registrazione verificata da meno di 10 minuti, invito attivo, area aperta o invito di prova, email uguale a quella del codice; ogni condizione mancante 42501; un id riservato con una registrazione non valida non scende mai al ramo del team; nessuna riga in `profiles`); il ramo del team identico a prima; `clienti_account`, invito `usato` con il token cancellato, percorso `in_corso`, primi step `disponibile`, email della scheda aggiornata con l'evento, notifiche; `invites_non_cliente`; revoca e riattivazione che sospendono e riattivano l'account; `onboarding_join_*` (stati, scadenza, limiti di invii, indirizzi e errori, email non ammesse) e `cliente_accesso_*` solo per `service_role`; `onboarding_segna_prova` solo admin.
- pgTAP `112_cliente_isolamento.sql`: come cliente attivo, come cliente sospeso e come utente senza profilo né account, per ogni tabella e view di `public` (contate leggendo il catalogo, come `101_business_coach.sql`): zero righe, tranne la propria riga di `clienti_account`; ogni scrittura rifiutata; ogni funzione `security definer` eseguibile da `authenticated` dell'elenco di `00` chiamata con argomenti nulli o finti: errore, null o vuoto, mai una riga di un altro; Storage: nessuna lettura o scrittura in `avatari` e in `onboarding-allegati`; nessuna tabella dell'onboarding o dei clienti nella pubblicazione `supabase_realtime`; un token OAuth di un cliente (se esistesse): `cliente_corrente()` null.
- pgTAP `113_percorso_cliente.sql`: `percorso_cliente` (i blocchi solo degli step non bloccati, mai di un altro cliente, il team senza email, la stima con le regole della specifica e mai negativa); `percorso_avanza` (ordine, video al 90%, regole tutte, versione del consenso); questionario (consenso, versione, `cambiato`, invio completo, sotto 14 anni, età da verificare, `onboarding_risposte_valide` con gli esempi condivisi); allegati (limiti, conferma senza oggetto, togli dopo l'invio rifiutato); video (unione, percentuale, intervalli fuori durata); CMS (solo l'admin scrive); questionario e allegati letti solo dall'admin; revoca del consenso; backup senza le quattro tabelle; `anteprima_eliminazione`; `onboarding_pulizia`.
- Aggiornati: `00_schema.sql` (elenco delle definer, tabelle nuove con `_mai_da_oauth`), `66_ruolo_marketing.sql`, `75_mcp_oauth.sql` (le funzioni nuove con 42501 per il token di Claude), `91_notifiche.sql`, `101_business_coach.sql`, `109`, `110` (prova, scadenza, token cancellato all'uso).
- Vitest: `destinazioneUtente` (ogni esito), `tests/proxy-accesso.test.ts` (cliente fuori da `/percorso`, `/login` ed `/entra` con sessione, pubblici nuovi), `separaJoin` e il segmento, schemi di registrazione e questionario (gli stessi esempi del pgTAP), unione degli intervalli e campionamento del player, testi del cliente (accenti, nessun trattino lungo, nessuna emoji, nessun link nelle email del codice), sha256 del consenso uguale al seme, `lib/email/mailpit.ts` ignorata in produzione e fuori dal loopback, nodi e stima in parole, `tests/changelog.test.ts`, `tests/i18n-chiavi.test.ts`.
- e2e (con `E2E_EMAIL_MAILPIT`, codici letti da Mailpit come `e2e/accesso-codice.spec.ts`): `percorso-registrazione.spec.ts` (l'admin crea un cliente inventato, lo segna di prova, conferma il pagamento e copia il link; in un altro contesto `/join` → «Continua» → email → codice → `/percorso`; il link riaperto dice «Hai già il tuo accesso»; rientro da un terzo contesto con `/entra`; un invito non di prova con l'area chiusa non si apre; il cliente che apre `/`, `/onboarding`, `/settings`, `/api/alfire` e `/oauth/consent` torna a `/percorso` o riceve 401/403; `/login` con l'email del cliente manda la mail del cliente; nessun ciclo di redirect), `percorso-passi.spec.ts` (step 1 con il player di YouTube finto: `page.route` serve un `iframe_api` che simula la riproduzione; step 2; questionario con salvataggio, ripresa da un altro contesto, allegato caricato nello Storage locale, invio; l'admin legge risposte e file; 390 px senza scroll di lato; riduzione movimento). `e2e/utenti.ts`: un cliente di prova del seed per `npm run shots` (`percorso`, `percorso-questionario`).
- Seed `supabase/seeds/61_percorso.sql`: un cliente inventato registrato (utente `cliente@alpha.test`, `app_metadata.tipo = 'cliente'`, account attivo, step 1 e 2 fatti, questionario a metà), uno sospeso; blocchi del CMS già nella migration; idempotente.

**B2.**
- pgTAP `114_percorso_team.sql`: step 4 manuale e conferma, esiti della call, community e code, task → step e step → task, scadenze dei task, test e programma, consegne e video obbligatori, completamento, sblocca e riavvia, apertura dell'area con i controlli; letture degli incaricati (coach: questionario, file, video, call, consegne; revisore e responsabile mai il questionario; nessuno l'invito o il pagamento); funzioni del team rifiutate a setter, closer, coach non incaricato, marketing, business coach e token di Claude.
- Aggiornati `00`, `75`, `109`, `112`.
- Vitest: stati della lista per gli incaricati, code, nav con la voce per chi ha un incarico, email «Tocca a te», animazioni ferme con riduzione movimento.
- e2e: `percorso-team.spec.ts` (il cliente di prova prenota, il coach conferma con il Meet, segna la call svolta, spunta l'obiettivo, il cliente conferma, spunta i test, il coach conferma e consegna il programma, il cliente guarda il video e vede «Il tuo percorso è iniziato»; il coach non vede mai il pagamento; il revisore vede «Test da rivedere» e non il questionario), `percorso-apertura.spec.ts` (l'admin non apre l'area con un segnaposto, poi apre e un invito normale funziona).
- Tutto verde: `npm run typecheck`, `npm run lint`, `npm run test`, `npx supabase test db`.

## `CLAUDE.md` da aggiornare

B1: sezioni 3 (l'area cliente), 5 (`E2E_EMAIL_MAILPIT`), 6 (il cliente nella tabella dei permessi e un paragrafo «Clienti del percorso»), 7 (accesso dei clienti: `/join`, `/entra`, `destinazioneUtente`, trigger), 8 (tabelle nuove), 10 (area cliente e riquadri dell'admin), 13 (seed), 15 (riscritta, sopra), 17 (niente di nuovo sulle persone: i video visti e il questionario sono del cliente, mai del team), 19, 20 e 28 (Alfire e Claude non leggono niente del cliente), 22 (privacy), 23, 32 (eccezione: area cliente solo in italiano), 34. B2: 4 (`motion`), 6, 8, 10, 11 (animazioni dell'area cliente come momento di brand), 18 (task e step, scadenze), 34.

## Decisioni prese in questo contratto, da confermare con Dany

1. Il cliente legge e scrive solo da funzioni dedicate; nessuna policy di lettura per lui oltre al suo account (più stretto del piano 5.1, che diceva «il cliente» tra chi legge).
2. Codice di registrazione: 8 cifre, 15 minuti, 5 invii l'ora, al massimo 3 indirizzi diversi per invito, 5 errori poi un codice nuovo; la pagina di registrazione vale 30 minuti. Rientro: codice di Supabase da 60 minuti, 5 invii e 5 errori l'ora per indirizzo, 200 invii l'ora in tutto.
3. «Cliente di prova» come interruttore sull'invito, al posto di un'area aperta solo all'admin.
4. L'area si apre con un interruttore dell'admin in B2, con i controlli (nessun segnaposto, link della community e della prenotazione), invece che con una migration. Si richiude senza spegnere gli account.
5. Le opzioni del questionario (giorni, attrezzatura, livello di attività, conoscenza dell'alimentazione, cattive abitudini, minuti) sono scritte nel codice dal Google Form come lo descrive la specifica: da controllare con Ivan.
6. Si chiede la data di nascita (come la specifica); sotto 14 anni l'invio si ferma, sotto 18 con un invito non segnato minorenne l'admin riceve «Età da verificare».
7. La revoca del consenso sulla salute la registra l'admin su richiesta del cliente, e cancella risposte e file; nessun pulsante nell'area cliente.
8. Avviso al cliente quando tocca a lui (decisione 14, senza una scelta consigliata): email automatica con un interruttore in Impostazioni, acceso di base, e «Copia il messaggio per Telegram» quando non parte.
9. Le voci della settimana test sono blocchi del CMS: 2 sessioni o 3 giorni (decisione 12) si decide scrivendole, senza codice. Il lancio è alla consegna del programma; il modello alimentare arriva dopo, come consegna.
10. Le consegne del coach sono link (video YouTube, PDF condiviso), non file caricati.
11. In B2 il razzo sale senza scia né particelle; quelle restano a v2.
12. La conservazione (decisione 8: 12 mesi, 30 giorni, 24 mesi) parte già con B1, perché i dati sulla salute entrano con B1.
13. In B1 le notifiche dei clienti vanno solo agli admin; dalla B2 anche agli incaricati, ognuno le sue.
14. La vista degli incaricati è la stessa pagina `/onboarding`, con la voce del menu per chi ha almeno un incarico su un cliente registrato.
15. Un cliente può cambiare la propria email da Supabase Auth (con la conferma su tutte e due le caselle): non lo si blocca; la scheda si riallinea solo alla registrazione.
16. La pagina di prenotazione è la stessa dei checkpoint, un indirizzo in Impostazioni (decisione 13).

## Passi per Dany

**Prima di B1 (in produzione).**
1. Supabase › Authentication › Sign In / Providers › Email: dimmi se «Confirm email» è acceso (piano, sezione 2) e lascia acceso il provider Email (serve ai codici del team e dei clienti); Secure email change acceso, manual linking spento.
2. Resend: dominio di `EMAIL_MITTENTE` verificato. Senza, nessun cliente riceve il codice.
3. Applica in ordine `20261109090000_clienti_account.sql`, `20261109090100_percorso_dati.sql`, `20261109090200_percorso_funzioni.sql`, poi il deploy. Controllo: `select jobname from cron.job` mostra `onboarding-pulizia`; Storage ha il bucket privato `onboarding-allegati`.
4. Impostazioni › Onboarding › Contenuti: sostituisci ogni «[Da scrivere: …]» e l'id del video di benvenuto (YouTube, «Non in elenco»).
5. Prova con un cliente inventato: «Nuovo cliente», «Cliente di prova», «Conferma pagamento», «Copia link». Da un telefono, con un'email tua diversa da quella del team: apri il link, registrati, guarda il video, accetta regole e consenso, compila e invia il questionario con una foto dell'attrezzatura. Nella scheda leggi risposte e foto. Esci e rientra da `/entra`. Poi elimina il cliente da Clienti: la domanda dice accesso e questionario.
6. Fai vedere il testo del consenso sulla salute e la nuova `/privacy` a chi segue la parte legale.

**Prima di aprire l'area (fine B2).**
7. Supabase Pro (backup dei questionari) e Vercel Pro (uso commerciale): piano, decisione 8.
8. Impostazioni › Onboarding: link della community, indirizzo della pagina di prenotazione, incarichi predefiniti; i contenuti di prenotazione, community, obiettivo, test, programma e dopo il lancio.
9. Applica `20261110090000_percorso_call_consegne.sql` e `20261110090100_percorso_team.sql`, poi il deploy.
10. Prova tutto il flusso con il cliente di prova, Ivan come coach e Lorenzo come revisore: Ivan vede il cliente in Onboarding, conferma la call, la segna svolta, spunta l'obiettivo, conferma i test, consegna il programma; Lorenzo vede «Test da rivedere».
11. Impostazioni › Onboarding › «Area clienti» › «Apri ai clienti». Da qui «Copia link» c'è per tutti e i 14 giorni partono.
